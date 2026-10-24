const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');

const app = express();

const isProduction = process.env.NODE_ENV === 'production';
const clientOrigin = isProduction ? false : "http://localhost:3000";

app.use(cors({
  origin: clientOrigin,
  methods: ["GET", "POST", "PUT", "DELETE"]
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: clientOrigin || "*",
    methods: ["GET", "POST", "PUT", "DELETE"]
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling']
});

const users = new Map();
const MAX_USERS = 10;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const chatHistory = [];
const SILENCE_THRESHOLD = 10000; // 缩短为10秒，快速响应
let lastMessageTime = Date.now();
let silenceTimer = null;
const userSettings = new Map();
const wordCache = new Map(); // 单词信息缓存
let aiEnabled = true;
const aiConversationMode = new Set(); // 跟踪正在与AI对话的用户

// 提示词管理
const PROMPTS_DIR = path.join(__dirname, 'prompts');
const PROMPT_FILE = path.join(PROMPTS_DIR, 'system-prompt.json');
const VERSIONS_FILE = path.join(PROMPTS_DIR, 'versions.json');
const AUDIT_FILE = path.join(PROMPTS_DIR, 'audit.json');

// 确保提示词目录存在
if (!fs.existsSync(PROMPTS_DIR)) {
  fs.mkdirSync(PROMPTS_DIR, { recursive: true });
}

// 初始化默认提示词
const DEFAULT_SYSTEM_PROMPT = "你是一位拥有10年教学经验的美国本土英语外教，专门教授非英语母语者。你的教学风格友好、耐心且专业，能够根据学生的英语水平提供个性化指导。你擅长纠正发音、解释语法规则、扩展词汇量，并能提供实用的日常对话练习。在教学过程中，你会使用简单明了的语言，避免复杂术语，确保学生能够轻松理解。";

// 初始化提示词文件
if (!fs.existsSync(PROMPT_FILE)) {
  const initialPrompt = {
    content: DEFAULT_SYSTEM_PROMPT,
    updatedAt: new Date().toISOString(),
    updatedBy: 'system'
  };
  fs.writeFileSync(PROMPT_FILE, JSON.stringify(initialPrompt, null, 2));
}

// 初始化版本文件
if (!fs.existsSync(VERSIONS_FILE)) {
  const initialVersion = {
    versions: [
      {
        id: 1,
        content: DEFAULT_SYSTEM_PROMPT,
        createdAt: new Date().toISOString(),
        createdBy: 'system'
      }
    ],
    currentVersion: 1
  };
  fs.writeFileSync(VERSIONS_FILE, JSON.stringify(initialVersion, null, 2));
}

// 初始化审计日志文件
if (!fs.existsSync(AUDIT_FILE)) {
  const initialAudit = {
    logs: [
      {
        action: 'initialization',
        message: 'System prompt initialized with default content',
        timestamp: new Date().toISOString(),
        user: 'system'
      }
    ]
  };
  fs.writeFileSync(AUDIT_FILE, JSON.stringify(initialAudit, null, 2));
}

// 读取当前提示词
function getCurrentPrompt() {
  try {
    const data = fs.readFileSync(PROMPT_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading prompt file:', error);
    return { content: DEFAULT_SYSTEM_PROMPT };
  }
}

// 读取版本历史
function getVersions() {
  try {
    const data = fs.readFileSync(VERSIONS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading versions file:', error);
    return { versions: [], currentVersion: 0 };
  }
}

// 读取审计日志
function getAuditLogs() {
  try {
    const data = fs.readFileSync(AUDIT_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading audit file:', error);
    return { logs: [] };
  }
}

// 添加审计日志
function addAuditLog(action, message, user = 'system') {
  try {
    const audit = getAuditLogs();
    audit.logs.push({
      action,
      message,
      timestamp: new Date().toISOString(),
      user
    });
    fs.writeFileSync(AUDIT_FILE, JSON.stringify(audit, null, 2));
  } catch (error) {
    console.error('Error writing audit log:', error);
  }
}

async function callDeepSeek(messages, maxTokens = 500) {
  try {
    const response = await axios.post(
      'https://api.deepseek.com/v1/chat/completions',
      {
        model: 'deepseek-chat',
        messages: messages,
        max_tokens: maxTokens
      },
      {
        headers: {
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 8000
      }
    );
    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('DeepSeek API Error:', error.response?.data || error.message);
    return null;
  }
}

async function correctGrammar(text) {
  if (text.length < 5) return null;
  
  const prompt = `Correct this English sentence to be more natural. Only return the corrected sentence, nothing else. If already correct, return "PERFECT".

Original: "${text}"

Corrected:`;

  const result = await callDeepSeek([{ role: 'user', content: prompt }], 100);
  
  if (!result) return null;
  
  const cleaned = result.trim();
  
  if (cleaned.toUpperCase() === 'PERFECT' || cleaned.toLowerCase() === text.toLowerCase()) {
    return null;
  }
  
  return cleaned;
}

async function getWordTranslation(word, socket) {
  const lowerWord = word.toLowerCase();
  
  if (wordCache.has(lowerWord)) {
    console.log('使用缓存的单词信息:', lowerWord);
    return wordCache.get(lowerWord);
  }
  
  const wordInfo = {
    word: word,
    phonetic: '',
    commonMeaning: null,
    polysemy: null,
    englishExplanation: '',
    derivatives: [],
    confusingWords: [],
    relatedWords: [],
    examples: []
  };
  
  try {
    console.log('生成新的单词信息:', lowerWord);
    
    // 第一步：快速生成基本信息（中文意思、英文解释）
    const basicPrompt = `For English word "${word}", provide in JSON format:
{
  "phonetic": "IPA phonetic with slashes, e.g., /həˈloʊ/",
  "commonMeaning": {"pos": "part of speech", "cn": "常用中文意思"},
  "polysemy": {"pos": "part of speech", "cn": "一词多义的中文意思"},
  "englishExplanation": "English definition in simple words"
}
Return only JSON, no markdown.`;

    const basicResult = await callDeepSeek([{ role: 'user', content: basicPrompt }], 200);
    
    if (basicResult) {
      try {
        let cleanResult = basicResult.trim().replace(/```json?/g, '').replace(/```/g, '').trim();
        const basicInfo = JSON.parse(cleanResult);
        wordInfo.phonetic = basicInfo.phonetic || '';
        wordInfo.commonMeaning = basicInfo.commonMeaning || null;
        wordInfo.polysemy = basicInfo.polysemy || null;
        wordInfo.englishExplanation = basicInfo.englishExplanation || '';
        
        // 先返回基本信息
        if (socket) {
          socket.emit('wordTranslationPartial', { ...wordInfo, partial: true });
        }
      } catch (e) {
        console.log('基本信息解析失败');
      }
    }
    
    // 第二步：生成派生词和易混词
    const advancedPrompt = `For English word "${word}", provide in JSON format:
{
  "derivatives": ["derivative1", "derivative2", "derivative3"],
  "confusingWords": [{"word": "similar_word", "diff": "区别说明"}],
  "relatedWords": ["容易联想到的词1", "容易联想到的词2"]
}
Return only JSON, no markdown.`;

    const advancedResult = await callDeepSeek([{ role: 'user', content: advancedPrompt }], 200);
    
    if (advancedResult) {
      try {
        let cleanResult = advancedResult.trim().replace(/```json?/g, '').replace(/```/g, '').trim();
        const advancedInfo = JSON.parse(cleanResult);
        wordInfo.derivatives = advancedInfo.derivatives || [];
        wordInfo.confusingWords = advancedInfo.confusingWords || [];
        wordInfo.relatedWords = advancedInfo.relatedWords || [];
        
        // 返回中间信息
        if (socket) {
          socket.emit('wordTranslationPartial', { ...wordInfo, partial: true });
        }
      } catch (e) {
        console.log('派生词解析失败');
      }
    }
    
    // 第三步：生成例句
    const examplePrompt = `Give 3 example sentences for English word "${word}". Return as JSON array: ["sentence1", "sentence2", "sentence3"]. No markdown.`;

    const exampleResult = await callDeepSeek([{ role: 'user', content: examplePrompt }], 150);
    
    if (exampleResult) {
      try {
        let cleanResult = exampleResult.trim().replace(/```json?/g, '').replace(/```/g, '').trim();
        wordInfo.examples = JSON.parse(cleanResult);
      } catch (e) {
        console.log('例句解析失败');
      }
    }
    
    wordCache.set(lowerWord, wordInfo);
    return wordInfo;
    
  } catch (error) {
    console.error('获取单词信息错误:', error);
    wordCache.set(lowerWord, wordInfo);
    return wordInfo;
  }
}

async function suggestEnglishWords(chineseText) {
  const text = chineseText.trim();
  const wordCount = text.split(/\s+/).length;
  
  let prompt;
  if (wordCount <= 2) {
    prompt = `Given the Chinese input "${text}", suggest 3-5 related English words or short phrases. Return only the English translations separated by |, nothing else.

English:`;
  } else {
    prompt = `Translate the Chinese text to English. If it's a sentence, give 1-2 natural English translations. If it's a phrase, give 2-3 equivalent English phrases. Separate multiple translations with |. Return only the English translations, nothing else.

Chinese: "${text}"

English:`;
  }

  const result = await callDeepSeek([{ role: 'user', content: prompt }], 150);
  if (result) {
    return result.split('|').map(w => w.trim()).filter(w => w);
  }
  return [];
}

async function translateSentence(text) {
  if (!text || text.trim().length < 2) return null;
  
  const prompt = `Translate the following English text to Chinese. Only return the translation, nothing else.

English: "${text}"

Chinese translation:`;

  const result = await callDeepSeek([{ role: 'user', content: prompt }], 200);
  return result ? result.trim() : null;
}

async function generateAIResponse(newMessage, userName, isMentioned = false) {
  const currentPrompt = getCurrentPrompt();
  const systemPrompt = `${currentPrompt.content}\n\nCurrent chat has ${users.size} users. Respond naturally to the conversation.\n\nIMPORTANT: 
1. Always respond in English only. Do not use any Chinese in your response.
2. Do NOT start your response with "AI Teacher:" or your name. Just respond directly with your message.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...chatHistory.slice(-10).map(msg => ({
      role: msg.userName === 'AI Teacher' ? 'assistant' : 'user',
      content: `${msg.userName}: ${msg.text}`
    })),
    { role: 'user', content: `${userName}: ${newMessage}` }
  ];

  const result = await callDeepSeek(messages);
  
  // 移除可能的开头"AI Teacher:"
  let cleanedResult = result || "I'm here to help you learn English!";
  cleanedResult = cleanedResult.replace(/^(AI Teacher|AI teacher|ai teacher)[:\s]*/i, '').trim();
  
  return cleanedResult;
}

async function generateTopicStarter() {
  // 不同类型的话题模板
  const topicTypes = [
    "Ask about the user's hobbies or interests",
    "Discuss a recent event or news topic",
    "Talk about travel experiences",
    "Ask about the user's favorite movies or music",
    "Discuss food and cooking",
    "Talk about learning English challenges",
    "Ask about future plans or goals",
    "Discuss technology and gadgets",
    "Talk about books or reading",
    "Ask about daily routines"
  ];
  
  // 随机选择一个话题类型
  const randomTopicType = topicTypes[Math.floor(Math.random() * topicTypes.length)];
  
  const prompt = `The conversation has been silent for a while. Generate an interesting topic or question to start a new conversation in English. Keep it short (1-2 sentences) and engaging for English learners. The topic should be about: ${randomTopicType}.

Topic starter:`;

  const result = await callDeepSeek([{ role: 'user', content: prompt }]);
  return result || "Hey everyone! What's everyone been up to today?";
}

function checkSilence() {
  // 禁用自动话题生成，AI只在被@时才响应
  resetSilenceTimer();
}

function resetSilenceTimer() {
  if (silenceTimer) clearTimeout(silenceTimer);
  silenceTimer = setTimeout(checkSilence, SILENCE_THRESHOLD);
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join', (userName) => {
    if (users.size >= MAX_USERS) {
      socket.emit('joinError', '聊天室已满，最多支持10人同时在线');
      return;
    }

    if (Array.from(users.values()).some(u => u.name === userName)) {
      socket.emit('joinError', '该昵称已被使用');
      return;
    }

    users.set(socket.id, { name: userName, id: socket.id, isOnline: true });
    socket.userName = userName;
    
    socket.emit('joinSuccess', { 
      userName, 
      users: Array.from(users.values()),
      message: `欢迎 ${userName} 加入聊天室！`
    });
    
    socket.broadcast.emit('userJoined', { 
      userName, 
      users: Array.from(users.values())
    });

    io.emit('userList', Array.from(users.values()));
    
    if (users.size === 1) {
      resetSilenceTimer();
    }
  });

  socket.on('sendMessage', async (text) => {
    const user = users.get(socket.id);
    if (!user) return;

    // 检测是否@了某个用户
    const mentionMatch = text.match(/@([^@\s]+)/);
    const mentionedUserName = mentionMatch ? mentionMatch[1] : null;
    
    // 先创建消息对象，不等待语法纠正
    const message = {
      id: Date.now(),
      userName: user.name,
      text: text,
      correctedText: null, // 先设为 null，稍后更新
      timestamp: new Date().toISOString(),
      isAI: false,
      mentionedUser: mentionedUserName
    };

    chatHistory.push(message);
    lastMessageTime = Date.now();
    if (aiEnabled) {
      resetSilenceTimer();
    }
    
    // 立即发送消息给所有客户端
    io.emit('newMessage', message);

    // 如果有@用户，发送通知
    if (mentionedUserName) {
      io.emit('mentionNotification', {
        from: user.name,
        to: mentionedUserName,
        message: text
      });
    }

    if (!aiEnabled) return;

    const isMentioned = text.toLowerCase().includes('@ai teacher');
    const lowerText = text.toLowerCase();
    const stopKeywords = ['stop', '结束', '停止', 'bye', '再见', '暂停', 'pause', 'quit', '退出'];
    const shouldStop = stopKeywords.some(keyword => lowerText.includes(keyword));
    
    // 检查用户是否在AI对话模式中
    const isInConversation = aiConversationMode.has(socket.id);
    
    // 如果用户说停止关键词，退出对话模式
    if (isInConversation && shouldStop) {
      aiConversationMode.delete(socket.id);
      const stopMessage = {
        id: Date.now() + 1,
        userName: 'AI Teacher',
        text: `好的，随时叫我！👋`,
        correctedText: null,
        timestamp: new Date().toISOString(),
        isAI: true
      };
      chatHistory.push(stopMessage);
      io.emit('newMessage', stopMessage);
      return;
    }
    
    // 如果@AI Teacher，开启对话模式
    if (isMentioned) {
      aiConversationMode.add(socket.id);
    }
    
    // 在对话模式中或被@时，并行执行语法纠正和AI响应
    if (isInConversation || isMentioned) {
      // 语法纠正任务
      const grammarTask = correctGrammar(text).then(correctedText => {
        if (correctedText) {
          message.correctedText = correctedText;
          io.emit('updateMessage', message);
        }
      }).catch(error => {
        console.error('Error correcting grammar:', error);
      });

      // AI响应任务
      const aiTask = generateAIResponse(text, user.name, isMentioned).then(aiResponse => {
        const aiMessage = {
          id: Date.now() + 1,
          userName: 'AI Teacher',
          text: aiResponse,
          correctedText: null,
          timestamp: new Date().toISOString(),
          isAI: true
        };
        chatHistory.push(aiMessage);
        io.emit('newMessage', aiMessage);
      }).catch(error => {
        console.error('Error generating AI response:', error);
      });

      // 并行执行两个任务
      Promise.all([grammarTask, aiTask]).catch(error => {
        console.error('Error in parallel tasks:', error);
      });
    } else {
      // 不需要AI响应时，只执行语法纠正
      correctGrammar(text).then(correctedText => {
        if (correctedText) {
          message.correctedText = correctedText;
          io.emit('updateMessage', message);
        }
      }).catch(error => {
        console.error('Error correcting grammar:', error);
      });
    }
  });

  socket.on('getWordTranslation', async (word) => {
    const result = await getWordTranslation(word, socket);
    socket.emit('wordTranslation', result);
  });

  socket.on('translateSentence', async (text) => {
    const translation = await translateSentence(text);
    socket.emit('sentenceTranslation', { original: text, translation });
  });

  socket.on('suggestWords', async (chineseText) => {
    const suggestions = await suggestEnglishWords(chineseText);
    socket.emit('wordSuggestions', suggestions);
  });

  socket.on('setAISpeed', (speed) => {
    userSettings.set(socket.id, { ...userSettings.get(socket.id), aiSpeed: speed });
    socket.emit('aiSpeedSet', speed);
  });

  socket.on('toggleAI', (enabled) => {
    aiEnabled = enabled;
    io.emit('aiStatusChanged', { aiEnabled });
  });

  socket.on('disconnect', () => {
    if (socket.userName) {
      users.delete(socket.id);
      socket.broadcast.emit('userLeft', { 
        userName: socket.userName,
        users: Array.from(users.values())
      });
      io.emit('userList', Array.from(users.values()));
    }
    aiConversationMode.delete(socket.id);
    console.log('User disconnected:', socket.id);
  });
});

// 公开API - 获取AI提示词（不需要管理员权限）
app.get('/api/prompt', (req, res) => {
  try {
    const prompt = getCurrentPrompt();
    res.json({ prompt: prompt.content, updatedAt: prompt.updatedAt, updatedBy: prompt.updatedBy });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get prompt' });
  }
});

// 公开API - 更新AI提示词（不需要管理员权限）
app.put('/api/prompt', (req, res) => {
  try {
    const { prompt } = req.body;
    
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt content is required' });
    }
    
    if (prompt.length > 5000) {
      return res.status(400).json({ error: 'Prompt content too long (max 5000 characters)' });
    }
    
    const versions = getVersions();
    const newVersionId = versions.versions.length + 1;
    
    versions.versions.push({
      id: newVersionId,
      content: prompt,
      createdAt: new Date().toISOString(),
      createdBy: 'user'
    });
    versions.currentVersion = newVersionId;
    fs.writeFileSync(VERSIONS_FILE, JSON.stringify(versions, null, 2));
    
    const updatedPrompt = {
      content: prompt,
      updatedAt: new Date().toISOString(),
      updatedBy: 'user'
    };
    fs.writeFileSync(PROMPT_FILE, JSON.stringify(updatedPrompt, null, 2));
    
    addAuditLog('update_prompt', 'Prompt updated via public API', 'user');
    
    res.json({ 
      success: true, 
      prompt: updatedPrompt.content,
      message: 'AI personality updated!'
    });
  } catch (error) {
    console.error('Error updating prompt:', error);
    res.status(500).json({ error: 'Failed to update prompt' });
  }
});

// 管理员API接口
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'fan';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '123456';

// 验证管理员权限
function validateAdmin(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const [, token] = auth.split(' ');
  if (token !== ADMIN_PASSWORD) {
    return res.status(403).json({ error: 'Invalid admin token' });
  }
  next();
}

// 管理员登录
app.post('/api/admin/login', (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      // 简单返回密码作为token（实际生产环境应使用JWT）
      res.json({ token: ADMIN_PASSWORD, success: true });
      addAuditLog('login', 'Admin logged in', username);
    } else {
      res.status(401).json({ error: 'Invalid username or password' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// 获取当前提示词
app.get('/api/admin/prompt', validateAdmin, (req, res) => {
  try {
    const prompt = getCurrentPrompt();
    res.json({ prompt: prompt.content, updatedAt: prompt.updatedAt, updatedBy: prompt.updatedBy });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get prompt' });
  }
});

// 更新提示词
app.put('/api/admin/prompt', validateAdmin, (req, res) => {
  try {
    const { prompt, user } = req.body;
    
    // 输入验证
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt content is required' });
    }
    
    if (prompt.length > 2000) {
      return res.status(400).json({ error: 'Prompt content too long (max 2000 characters)' });
    }
    
    // 读取版本信息
    const versions = getVersions();
    const newVersionId = versions.versions.length + 1;
    
    // 保存新版本
    versions.versions.push({
      id: newVersionId,
      content: prompt,
      createdAt: new Date().toISOString(),
      createdBy: user || 'admin'
    });
    versions.currentVersion = newVersionId;
    fs.writeFileSync(VERSIONS_FILE, JSON.stringify(versions, null, 2));
    
    // 更新当前提示词
    const updatedPrompt = {
      content: prompt,
      updatedAt: new Date().toISOString(),
      updatedBy: user || 'admin'
    };
    fs.writeFileSync(PROMPT_FILE, JSON.stringify(updatedPrompt, null, 2));
    
    // 添加审计日志
    addAuditLog('update', `Prompt updated to version ${newVersionId}`, user || 'admin');
    
    res.json({ 
      success: true, 
      prompt: updatedPrompt.content
    });
  } catch (error) {
    console.error('Error updating prompt:', error);
    res.status(500).json({ error: 'Failed to update prompt' });
  }
});

// 获取版本历史
app.get('/api/admin/versions', validateAdmin, (req, res) => {
  try {
    const versions = getVersions();
    res.json(versions.versions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get versions' });
  }
});

// 恢复版本
app.post('/api/admin/restore-version', validateAdmin, (req, res) => {
  try {
    const { versionId, user } = req.body;
    
    // 读取版本信息
    const versions = getVersions();
    const version = versions.versions.find(v => v.id === versionId);
    
    if (!version) {
      return res.status(404).json({ error: 'Version not found' });
    }
    
    // 更新当前提示词
    const updatedPrompt = {
      content: version.content,
      updatedAt: new Date().toISOString(),
      updatedBy: user || 'admin'
    };
    fs.writeFileSync(PROMPT_FILE, JSON.stringify(updatedPrompt, null, 2));
    
    // 添加审计日志
    addAuditLog('restore', `Restored version ${versionId}`, user || 'admin');
    
    res.json({ 
      success: true, 
      prompt: updatedPrompt.content
    });
  } catch (error) {
    console.error('Error restoring version:', error);
    res.status(500).json({ error: 'Failed to restore version' });
  }
});

// 获取审计日志
app.get('/api/admin/audit', validateAdmin, (req, res) => {
  try {
    const audit = getAuditLogs();
    res.json(audit.logs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get audit logs' });
  }
});

// 生产环境静态文件服务
if (isProduction) {
  const clientBuildPath = path.join(__dirname, '../client/build');
  app.use(express.static(clientBuildPath));
  
  // SPA路由支持 - 所有非API请求返回index.html
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
