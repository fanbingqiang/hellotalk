import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { io } from 'socket.io-client';
import AdminPanel from './AdminPanel';
import './AdminPanel.css';

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000';

function App() {
  const [socket, setSocket] = useState(null);
  const [userName, setUserName] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [wordSuggestions, setWordSuggestions] = useState([]);
  const [tooltip, setTooltip] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [aiSpeed, setAiSpeed] = useState(1);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [voice, setVoice] = useState(null);
  const [availableVoices, setAvailableVoices] = useState([]);
  const [wordDetails, setWordDetails] = useState(null);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [mentionNotification, setMentionNotification] = useState(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [sidebarTab, setSidebarTab] = useState('word'); // 'word' or 'notes'
  const [showSettings, setShowSettings] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [sentenceTranslation, setSentenceTranslation] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const mentionRef = useRef(null);

  useEffect(() => {
    const savedNotes = localStorage.getItem('hellotalk_notes');
    if (savedNotes) {
      setNotes(savedNotes);
    }
  }, []);

  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      setAvailableVoices(voices);
      // 选择一个更自然的英语语音
      const preferredVoice = voices.find(v => 
        (v.lang === 'en-US' || v.lang === 'en-GB') && 
        v.name.includes('Microsoft')
      ) || voices.find(v => v.lang === 'en-US');
      if (preferredVoice) {
        setVoice(preferredVoice);
      }
    };

    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('hellotalk_notes', notes);
  }, [notes]);

  useEffect(() => {
    const newSocket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000
    });
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Connected to server');
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from server');
    });

    newSocket.on('connect_error', (error) => {
      console.error('Connection error:', error);
    });

    newSocket.on('joinSuccess', (data) => {
      setIsLoggedIn(true);
      setUsers(data.users);
      setError('');
    });

    newSocket.on('joinError', (msg) => {
      setError(msg);
    });

    newSocket.on('userJoined', (data) => {
      setUsers(data.users);
      setMessages(prev => [...prev, {
        id: Date.now(),
        userName: 'System',
        text: `${data.userName} 加入了聊天室`,
        isSystem: true
      }]);
    });

    newSocket.on('userLeft', (data) => {
      setUsers(data.users);
      setMessages(prev => [...prev, {
        id: Date.now(),
        userName: 'System',
        text: `${data.userName} 离开了聊天室`,
        isSystem: true
      }]);
    });

    newSocket.on('userList', (userList) => {
      setUsers(userList);
    });

    newSocket.on('updateMessage', (updatedMessage) => {
      setMessages(prevMessages => 
        prevMessages.map(msg => 
          msg.id === updatedMessage.id ? updatedMessage : msg
        )
      );
    });

    newSocket.on('newMessage', (message) => {
      setMessages(prev => [...prev, message]);
      setIsTyping(false);
    });

    newSocket.on('wordSuggestions', (suggestions) => {
      setWordSuggestions(suggestions);
    });

    newSocket.on('wordTranslationPartial', (data) => {
      if (data && data.word) {
        setWordDetails(prev => {
          const prevData = prev || {};
          return {
            word: data.word,
            phonetic: data.phonetic || prevData.phonetic || '',
            commonMeaning: data.commonMeaning || prevData.commonMeaning || null,
            polysemy: data.polysemy || prevData.polysemy || null,
            englishExplanation: data.englishExplanation || prevData.englishExplanation || '',
            derivatives: data.derivatives?.length ? data.derivatives : prevData.derivatives || [],
            confusingWords: data.confusingWords?.length ? data.confusingWords : prevData.confusingWords || [],
            relatedWords: data.relatedWords?.length ? data.relatedWords : prevData.relatedWords || [],
            examples: data.examples?.length ? data.examples : prevData.examples || []
          };
        });
      }
    });

    newSocket.on('wordTranslation', (data) => {
      if (data && data.word) {
        setWordDetails({
          word: data.word,
          phonetic: data.phonetic || '',
          commonMeaning: data.commonMeaning || null,
          polysemy: data.polysemy || null,
          englishExplanation: data.englishExplanation || '',
          derivatives: data.derivatives || [],
          confusingWords: data.confusingWords || [],
          relatedWords: data.relatedWords || [],
          examples: data.examples || []
        });
      }
    });

    newSocket.on('mentionNotification', (data) => {
      // 如果当前用户被@了，显示通知
      if (data.to === userName || data.to === 'AI Teacher') {
        setMentionNotification(data);
        // 3 秒后自动消失
        setTimeout(() => {
          setMentionNotification(null);
        }, 3000);
      }
    });

    newSocket.on('aiStatusChanged', (data) => {
      setAiEnabled(data.aiEnabled);
    });

    newSocket.on('sentenceTranslation', (data) => {
      if (data && data.translation) {
        setSentenceTranslation(data);
      }
    });

    return () => {
      newSocket.close();
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleJoin = (e) => {
    e.preventDefault();
    if (!userName.trim()) {
      setError('请输入昵称');
      return;
    }
    socket.emit('join', userName.trim());
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputText.trim()) {
      setError('请输入消息内容');
      setTimeout(() => setError(''), 2000);
      return;
    }
    
    socket.emit('sendMessage', inputText.trim());
    setInputText('');
    setWordSuggestions([]);
    setShowMentionMenu(false);
    setMentionFilter('');
  };

  const handleInputChange = (e) => {
    const text = e.target.value;
    setInputText(text);
    
    // 自动调整高度
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';

    const lastSegment = text.split(/[\s\n]+/).pop();
    
    if (lastSegment.startsWith('@')) {
      if (lastSegment === '@') {
        setMentionFilter('');
        setShowMentionMenu(true);
      } else {
        const filter = lastSegment.slice(1).toLowerCase();
        setMentionFilter(filter);
        setShowMentionMenu(true);
      }
    } else {
      setShowMentionMenu(false);
      setMentionFilter('');
    }

    if (socket && text.trim()) {
      const chineseMatch = text.match(/[\u4e00-\u9fa5]+/g);
      if (chineseMatch && chineseMatch.length > 0) {
        const chineseText = chineseMatch.join('');
        if (chineseText.length >= 2) {
          socket.emit('suggestWords', chineseText);
        }
      } else {
        setWordSuggestions([]);
      }
    } else {
      setWordSuggestions([]);
    }
  };

  const handleMentionSelect = (userName) => {
    const words = inputText.split(/[\s\n]+/);
    words.pop();
    words.push(`@${userName}`);
    setInputText(words.join(' ') + ' ');
    setShowMentionMenu(false);
    setMentionFilter('');
    inputRef.current?.focus();
  };

  const handleSuggestionClick = (suggestion) => {
    const words = inputText.split(/[\s\n]+/);
    words.pop();
    words.push(suggestion);
    setInputText(words.join(' ') + ' ');
    setWordSuggestions([]);
    inputRef.current?.focus();
  };

  const handleWordClick = useCallback((e, word) => {
    e.stopPropagation();
    
    // 打开侧边栏并切换到单词标签页
    setShowSidebar(true);
    setSidebarTab('word');
    
    // 发送获取单词信息的请求
    if (socket) {
      socket.emit('getWordTranslation', word);
    }
    
    // 先显示加载状态
    setWordDetails({
      word: word,
      phonetic: '加载中...',
      commonMeaning: null,
      polysemy: null,
      englishExplanation: '',
      derivatives: [],
      confusingWords: [],
      relatedWords: [],
      examples: []
    });
  }, [socket]);

  const handleDoubleClickTranslate = useCallback((e) => {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    
    if (selectedText && selectedText.length > 1) {
      setSentenceTranslation({ original: selectedText, translation: '翻译中...' });
      if (socket) {
        socket.emit('translateSentence', selectedText);
      }
    }
  }, [socket]);

  const speakText = (text, audioUrl = null, retryCount = 0) => {
    console.log('speakText called:', { text, audioUrl, retryCount });
    
    if (audioUrl && audioUrl.length > 0) {
      console.log('尝试播放音频URL:', audioUrl);
      try {
        const audio = new Audio(audioUrl);
        
        audio.oncanplaythrough = () => {
          console.log('音频已加载，开始播放');
          audio.play().catch(error => {
            console.error('音频播放失败:', error);
          });
        };
        
        audio.onerror = (error) => {
          console.error('音频加载失败:', error);
        };
        
        audio.load();
        return;
      } catch (error) {
        console.error('音频播放异常:', error);
      }
    }
    
    if (!('speechSynthesis' in window)) {
      console.error('浏览器不支持语音合成');
      return;
    }

    try {
      window.speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = aiSpeed;
      utterance.pitch = 1;
      utterance.volume = 1;
      
      if (voice) {
        utterance.voice = voice;
      }
      
      utterance.onstart = () => {
        console.log('开始播放语音:', text);
      };
      
      utterance.onerror = (event) => {
        console.error('语音播放错误:', event.error);
        if (event.error !== 'canceled' && retryCount < 2) {
          console.log('重试播放，第', retryCount + 1, '次');
          setTimeout(() => speakText(text, null, retryCount + 1), 500);
        }
      };
      
      utterance.onend = () => {
        console.log('语音播放完成');
      };
      
      window.speechSynthesis.speak(utterance);
      
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    } catch (error) {
      console.error('语音播放异常:', error);
      if (retryCount < 2) {
        console.log('重试播放，第', retryCount + 1, '次');
        setTimeout(() => speakText(text, null, retryCount + 1), 500);
      }
    }
  };

  const handleAISpeedChange = (e) => {
    const speed = parseFloat(e.target.value);
    setAiSpeed(speed);
    if (socket) {
      socket.emit('setAISpeed', speed);
    }
  };

  const handleAIToggle = () => {
    const newState = !aiEnabled;
    setAiEnabled(newState);
    if (socket) {
      socket.emit('toggleAI', newState);
    }
  };

  // 语音输入功能
  const handleVoiceInput = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('您的浏览器不支持语音识别功能');
      return;
    }

    // 如果正在录音，停止录音
    if (isListening) {
      if (window.currentRecognition) {
        window.currentRecognition.stop();
      }
      setIsListening(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = true;
    recognition.interimResults = true;

    window.currentRecognition = recognition;
    setIsListening(true);

    recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }
      
      if (finalTranscript) {
        setInputText(prevText => prevText + ' ' + finalTranscript);
      }
    };

    recognition.onerror = (event) => {
      console.error('语音识别错误:', event.error);
      setIsListening(false);
      
      if (event.error === 'no-speech') {
        console.log('未检测到语音，请对着麦克风说话');
      } else if (event.error === 'not-allowed') {
        alert('请允许浏览器使用麦克风权限');
      } else if (event.error === 'network') {
        alert('网络错误，请检查网络连接');
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      window.currentRecognition = null;
    };

    try {
      recognition.start();
    } catch (error) {
      console.error('语音识别启动失败:', error);
      setIsListening(false);
      alert('语音识别启动失败，请检查浏览器权限');
    }
  };

  // 获取AI提示词
  const fetchAIPrompt = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/prompt');
      const data = await response.json();
      setAiPrompt(data.prompt);
    } catch (error) {
      console.error('获取AI提示词失败:', error);
    }
  };

  // 更新AI提示词
  const updateAIPrompt = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/prompt', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt })
      });
      const data = await response.json();
      if (data.success) {
        alert('AI性格更新成功！');
        setShowSettings(false);
      }
    } catch (error) {
      console.error('更新AI提示词失败:', error);
      alert('更新失败，请重试');
    }
  };

  // 打开设置时获取当前提示词
  useEffect(() => {
    if (showSettings) {
      fetchAIPrompt();
    }
  }, [showSettings]);

  // 优化renderMessageText，避免每次渲染都重新创建函数
  const renderMessageText = useCallback((text, isAI = false) => {
    // 如果是AI消息，过滤掉@ai teacher
    let displayText = text;
    if (isAI) {
      displayText = text.replace(/@ai\s*teacher/gi, '').trim();
    }
    
    // 先处理@提及，将被@的用户名标红
    const parts = displayText.split(/(@\S+)/);
    
    return parts.map((part, index) => {
      // 检查是否是@提及
      if (part.startsWith('@')) {
        const mentionedName = part.slice(1); // 去掉@符号
        // 检查是否是有效的用户名
        const isValidMention = users.some(u => 
          u.name.toLowerCase() === mentionedName.toLowerCase() || 
          mentionedName.toLowerCase() === 'ai teacher'
        );
        
        if (isValidMention) {
          return (
            <span key={index} className="mention-highlight">
              {part}
            </span>
          );
        }
      }
      
      // 处理普通文本中的单词
      const words = part.split(/(\s+)/);
      return words.map((word, wordIndex) => {
        const cleanWord = word.replace(/[.,!?;:'"()]/g, '');
        if (cleanWord.length > 1 && /^[a-zA-Z]+$/.test(cleanWord)) {
          return (
            <span
              key={`${index}-${wordIndex}`}
              className="word"
              onClick={(e) => handleWordClick(e, cleanWord)}
            >
              {word}
            </span>
          );
        }
        return word;
      });
    });
  }, [handleWordClick, users]);

  const getUserColorIndex = (name) => {
    if (name === 'AI Teacher') return 'ai';
    const userIndex = users.findIndex(u => u.name === name);
    return `user-${userIndex % 3}`;
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // 优化filteredUsers，避免重复过滤
  const filteredUsers = useMemo(() => {
    return [
      { id: 'ai', name: 'AI Teacher' },
      ...users.filter(user => 
        user.name.toLowerCase().includes(mentionFilter.toLowerCase())
      )
    ];
  }, [users, mentionFilter]);

  useEffect(() => {
    const handleClick = () => {
      setTooltip(null);
      setShowMentionMenu(false);
      // 只有在侧边栏关闭时才清空单词详情
      if (!showSidebar) {
        setWordDetails(null);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [showSidebar]);

  if (showAdminPanel) {
    return <AdminPanel />;
  }

  if (!isLoggedIn) {
    return (
      <div className="app">
        <div className="header">
          <h1>HelloTalk</h1>
          <p>英语学习聊天室 - 和AI一起练习英语</p>
        </div>
        <div className="login-container">
          <h2>加入聊天室</h2>
          <form className="login-form" onSubmit={handleJoin}>
            <input
              type="text"
              className="login-input"
              placeholder="输入你的昵称"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              maxLength={20}
              autoFocus
            />
            {error && <div className="error-message">{error}</div>}
            <button type="submit" className="login-button">
              进入聊天室
            </button>
          </form>
          <p style={{ marginTop: 20, textAlign: 'center', color: '#666', fontSize: '0.9rem' }}>
            最多支持10人同时在线
          </p>
        </div>
      </div>
    );
  };

  // 渲染@通知
  const renderMentionNotification = () => {
    if (!mentionNotification) return null;
    
    return (
      <div className="mention-notification">
        🔔 {mentionNotification.from} 提到了你
      </div>
    );
  };

  return (
    <div className="app">
      {renderMentionNotification()}
      <div className="header">
        <h1>HelloTalk</h1>
        <p>英语学习聊天室</p>
      </div>
      
      <div className="main-container">
        <div className="chat-container">
          <div className="chat-header">
            <h2>聊天室</h2>
            <div className="users-list">
              {users.map((user, index) => (
                <span key={user.id} className={`user-badge ${user.isOnline ? 'online' : 'offline'}`}>
                  {user.name}
                  <span className="status-dot"></span>
                </span>
              ))}
              <span className="user-badge ai online">
                AI Teacher
                <span className="status-dot"></span>
              </span>
            </div>
            <div className="speed-control">
              <label>语速:</label>
              <select value={aiSpeed} onChange={handleAISpeedChange}>
                <option value="0.5">0.5x</option>
                <option value="0.75">0.75x</option>
                <option value="1">1x</option>
                <option value="1.25">1.25x</option>
                <option value="1.5">1.5x</option>
              </select>
            </div>
            <div className="speed-control">
              <label>语音:</label>
              <select 
                value={voice?.name || ''} 
                onChange={(e) => {
                  const selectedVoice = availableVoices.find(v => v.name === e.target.value);
                  if (selectedVoice) {
                    setVoice(selectedVoice);
                  }
                }}
              >
                {availableVoices
                  .filter(v => v.lang.startsWith('en-'))
                  .map((v, index) => (
                    <option key={index} value={v.name}>
                      {v.name} ({v.lang})
                    </option>
                  ))
                }
              </select>
            </div>
            <button
              className={`ai-toggle ${!aiEnabled ? 'off' : ''}`}
              onClick={handleAIToggle}
              title={aiEnabled ? '关闭AI' : '开启AI'}
            >
              AI {aiEnabled ? 'ON' : 'OFF'}
            </button>
            <button
              className="admin-toggle"
              onClick={() => setShowSettings(true)}
              title="AI设置"
            >
              🎭
            </button>
            <button 
              className="sidebar-toggle" 
              onClick={() => setShowSidebar(!showSidebar)}
              title="学习助手"
            >
              �
            </button>
          </div>

          <div className="messages-container" onDoubleClick={handleDoubleClickTranslate}>
            {messages.length === 0 && (
              <div className="empty-state">
                <h3>欢迎来到聊天室！</h3>
                <p>开始用英语聊天吧，AI老师会帮助你学习</p>
                <p style={{ marginTop: 10, fontSize: '0.9rem', color: '#666' }}>
                  💡 输入 @ 可以艾特其他用户
                </p>
              </div>
            )}
            
            {sentenceTranslation && (
              <div className="sentence-translation">
                <div className="translation-header">
                  <span>📝 翻译结果</span>
                  <button onClick={() => setSentenceTranslation(null)}>✕</button>
                </div>
                <div className="translation-content">
                  <div className="translation-original">{sentenceTranslation.original}</div>
                  <div className="translation-result">{sentenceTranslation.translation}</div>
                </div>
              </div>
            )}
            
            {messages.map((msg) => {
              const isCurrentUser = msg.userName === userName && !msg.isSystem && !msg.isAI;
              return (
                <div key={msg.id} className={`message ${isCurrentUser ? 'current-user' : ''}`}>
                  {!msg.isSystem ? (
                    <>
                      {!isCurrentUser && (
                        <div className="message-header">
                          <div className={`message-avatar ${getUserColorIndex(msg.userName)}`}>
                            {msg.isAI ? 'AI' : msg.userName.charAt(0).toUpperCase()}
                          </div>
                          <span className="message-user">{msg.userName}</span>
                          <span className="message-time">{formatTime(msg.timestamp)}</span>
                        </div>
                      )}
                      <div className={`message-bubble ${msg.isAI ? 'ai' : ''} ${isCurrentUser ? 'current-user' : ''}`}>
                        {isCurrentUser && (
                          <div className="message-header-inline">
                            <span className="message-time">{formatTime(msg.timestamp)}</span>
                          </div>
                        )}
                        <div className="message-text">
                          {renderMessageText(msg.text, msg.isAI)}
                        </div>
                        <div className="message-actions">
                          <button 
                            className="play-button" 
                            onClick={() => speakText(msg.text)}
                            title="播放语音"
                          >
                            🔊
                          </button>
                        </div>
                        {msg.correctedText && (
                          <div className="corrected-text">
                            <span className="corrected-label">💡 地道表达:</span>
                            {renderMessageText(msg.correctedText)}
                            <button 
                              className="play-button" 
                              onClick={() => speakText(msg.correctedText)}
                              title="播放语音"
                            >
                              🔊
                            </button>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div style={{ textAlign: 'center', color: '#999', fontSize: '0.9rem', padding: '10px 0' }}>
                      {msg.text}
                    </div>
                  )}
                </div>
              );
            })}
            
            {isTyping && (
              <div className="typing-indicator">
                <div className="typing-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
                <span>AI Teacher 正在输入...</span>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          <div className="input-container" style={{ position: 'relative' }}>
            {wordSuggestions.length > 0 && (
              <div className="word-suggestions">
                {wordSuggestions.map((word, index) => (
                  <button
                    key={index}
                    className="word-suggestion"
                    onClick={() => handleSuggestionClick(word)}
                  >
                    {word}
                  </button>
                ))}
              </div>
            )}
            
            {showMentionMenu && filteredUsers.length > 0 && (
              <div className="mention-menu" ref={mentionRef}>
                {filteredUsers.map((user, index) => (
                  <div
                    key={user.id}
                    className="mention-item"
                    onClick={() => handleMentionSelect(user.name)}
                  >
                    {user.name}
                  </div>
                ))}
              </div>
            )}
            
            <form className="input-row" onSubmit={handleSendMessage}>
              <button 
                type="button" 
                className="emoji-button"
                title="表情"
              >
                😊
              </button>
              <textarea
                ref={inputRef}
                className="message-input"
                placeholder="输入英语消息... (输入中文可获取英文单词建议，@可艾特用户)"
                value={inputText}
                onChange={handleInputChange}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage(e);
                  }
                }}
                rows={1}
                autoFocus
              />
              <button 
                type="button" 
                className="voice-input-button"
                onClick={handleVoiceInput}
                title={isListening ? "点击停止录音" : "语音输入"}
              >
                {isListening ? '⏹️停止' : '🎤'}
              </button>
              <button type="submit" className="send-button" disabled={!inputText.trim()}>
                发送
              </button>
            </form>
          </div>
        </div>

        {/* 侧边栏 */}
        {showSidebar && (
          <div className="sidebar">
            <div className="sidebar-header">
              <div className="sidebar-tabs">
                <button 
                  className={`sidebar-tab ${sidebarTab === 'word' ? 'active' : ''}`}
                  onClick={() => setSidebarTab('word')}
                >
                  📖 单词
                </button>
                <button 
                  className={`sidebar-tab ${sidebarTab === 'notes' ? 'active' : ''}`}
                  onClick={() => setSidebarTab('notes')}
                >
                  � 笔记
                </button>
              </div>
              <button 
                className="close-sidebar"
                onClick={() => setShowSidebar(false)}
                title="关闭"
              >
                ✕
              </button>
            </div>
            
            <div className="sidebar-content">
              {sidebarTab === 'word' && (
                <div className="word-panel">
                  {wordDetails ? (
                    <>
                      <div className="word-details-header">
                        <h3>{wordDetails.word}</h3>
                        <div className="pronunciation">
                          {wordDetails.phonetic}
                          <button 
                            className="play-audio-button"
                            onClick={(e) => {
                              e.stopPropagation();
                              speakText(wordDetails.word);
                            }}
                            title="播放发音"
                          >
                            🔊
                          </button>
                        </div>
                      </div>
                      
                      {wordDetails.commonMeaning && (
                        <div className="word-details-section">
                          <h4>📖 常用意思</h4>
                          <div className="meaning-item">
                            <span className="part-of-speech">{wordDetails.commonMeaning.pos}</span>
                            <span className="meaning-text">{wordDetails.commonMeaning.cn}</span>
                          </div>
                        </div>
                      )}
                      
                      {wordDetails.polysemy && (
                        <div className="word-details-section rare-meaning">
                          <h4>💎 一词多义</h4>
                          <div className="meaning-item">
                            <span className="part-of-speech">{wordDetails.polysemy.pos}</span>
                            <span className="meaning-text">{wordDetails.polysemy.cn}</span>
                          </div>
                        </div>
                      )}
                      
                      {wordDetails.englishExplanation && (
                        <div className="word-details-section">
                          <h4>� 英文解释</h4>
                          <p className="word-list">{wordDetails.englishExplanation}</p>
                        </div>
                      )}
                      
                      {wordDetails.derivatives && wordDetails.derivatives.length > 0 && (
                        <div className="word-details-section">
                          <h4>🔄 派生词</h4>
                          <p className="word-list">{wordDetails.derivatives.join(', ')}</p>
                        </div>
                      )}
                      
                      {wordDetails.confusingWords && wordDetails.confusingWords.length > 0 && (
                        <div className="word-details-section">
                          <h4>🔍 易混词</h4>
                          {wordDetails.confusingWords.map((item, index) => (
                            <div key={index} className="confusing-word-item">
                              <span className="confusing-word">{item.word}</span>
                              <span className="word-difference">{item.diff}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {wordDetails.relatedWords && wordDetails.relatedWords.length > 0 && (
                        <div className="word-details-section">
                          <h4>🔗 联想词</h4>
                          <p className="word-list">{wordDetails.relatedWords.join(', ')}</p>
                        </div>
                      )}
                      
                      {wordDetails.examples && wordDetails.examples.length > 0 && (
                        <div className="word-details-section">
                          <h4>📝 例句</h4>
                          {wordDetails.examples.map((example, index) => (
                            <div key={index} className="example-item">
                              {index + 1}. {example}
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="empty-state">
                      <p>点击消息中的单词查看详细信息</p>
                    </div>
                  )}
                </div>
              )}
              
              {sidebarTab === 'notes' && (
                <div className="notes-panel">
                  <textarea
                    className="notes-textarea"
                    placeholder="在这里记录你的学习笔记...（自动保存）"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                  <div className="notes-footer">
                    <span className="notes-info">
                      💾 笔记已自动保存到本地
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {tooltip && tooltip.translation && (
        <div 
          className="word-tooltip"
          style={{
            left: '50%',
            top: '80%',
            transform: 'translateX(-50%)'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <strong>{tooltip.word}</strong>: {tooltip.translation}
        </div>
      )}

      {/* AI设置弹窗 */}
      {showSettings && (
        <div className="settings-modal" onClick={() => setShowSettings(false)}>
          <div className="settings-content" onClick={(e) => e.stopPropagation()}>
            <div className="settings-header">
              <h3>🎭 AI性格设置</h3>
              <button className="close-button" onClick={() => setShowSettings(false)}>×</button>
            </div>
            <div className="settings-body">
              <p style={{ marginBottom: 10, color: '#666', fontSize: '0.9rem' }}>
                自定义AI的性格和说话风格，让它更符合你的喜好
              </p>
              <textarea
                className="settings-textarea"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="输入AI的性格描述..."
                rows={12}
              />
            </div>
            <div className="settings-footer">
              <button className="cancel-button" onClick={() => setShowSettings(false)}>取消</button>
              <button className="save-button" onClick={updateAIPrompt}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
