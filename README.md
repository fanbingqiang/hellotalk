# HelloTalk - 英语学习聊天室

一个支持多人实时聊天的英语学习应用，集成AI辅助学习功能。

## 功能特性

### 核心功能
- **多人实时聊天**：最多支持3人同时在线
- **AI参与聊天**：DeepSeek AI作为英语老师参与对话
- **语法纠正**：每条消息下方显示地道表达建议
- **语音播放**：点击🔊按钮播放英语发音（浏览器原生TTS）

### 学习辅助功能
- **中文输入提示**：输入中文时自动联想英文单词
- **单词翻译**：点击消息中的单词显示中文翻译
- **艾特功能**：输入@可以艾特其他用户
- **在线状态**：显示所有用户的在线状态（绿色圆点）
- **AI主动找话题**：30秒无人说话时AI会主动开启新话题
- **学习笔记**：侧边笔记面板，自动保存到本地存储

## 技术栈

### 后端
- Node.js + Express
- Socket.io（实时通信）
- DeepSeek API（AI服务）

### 前端
- React 18
- Socket.io-client
- Web Speech API（语音播放）
- LocalStorage（笔记存储）

## 快速开始

### 1. 安装依赖

```bash
npm install
cd client
npm install
```

### 2. 配置环境变量

根目录的`.env`文件已配置好DeepSeek API密钥。

### 3. 启动应用

同时启动前后端：

```bash
npm run dev
```

或分别启动：

```bash
# 启动后端（端口5000）
npm run server

# 启动前端（端口3000）
npm run client
```

### 4. 访问应用

打开浏览器访问：http://localhost:3000

## 使用说明

### 加入聊天室
1. 输入昵称
2. 点击"进入聊天室"
3. 最多支持3人同时在线

### 聊天功能
- 输入英语消息发送
- 输入中文可获取英文单词建议
- 输入@可艾特其他用户
- 点击消息中的单词查看中文翻译
- 点击🔊按钮播放语音

### AI功能
- AI会自动回复每条消息
- 30秒无人说话时AI会主动找话题
- AI会纠正语法错误并显示地道表达

### 学习笔记
- 点击右上角📝按钮打开笔记面板
- 记录学习笔记会自动保存到本地
- 刷新页面笔记不会丢失

## 项目结构

```
hellotalk/
├── client/                 # 前端React应用
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── App.js         # 主应用组件
│   │   ├── index.js       # 入口文件
│   │   └── index.css      # 样式文件
│   └── package.json
├── server/                # 后端服务
│   └── index.js          # 服务器入口
├── .env                 # 环境变量
├── package.json           # 根依赖
└── README.md            # 项目说明
```

## API说明

### Socket事件

#### 客户端发送
- `join` - 加入聊天室
- `sendMessage` - 发送消息
- `getWordTranslation` - 获取单词翻译
- `suggestWords` - 获取英文单词建议

#### 服务端发送
- `joinSuccess` - 加入成功
- `joinError` - 加入失败
- `userJoined` - 用户加入
- `userLeft` - 用户离开
- `userList` - 用户列表
- `newMessage` - 新消息
- `wordTranslation` - 单词翻译
- `wordSuggestions` - 单词建议

## 注意事项

1. DeepSeek API密钥已配置在`.env`文件中，请勿泄露
2. 语音播放功能依赖浏览器支持，建议使用Chrome、Edge等现代浏览器
3. 笔记保存在浏览器LocalStorage中，清除浏览器数据会丢失
4. AI响应时间取决于网络和API服务状态

## 开发建议

如需修改AI行为，编辑`server/index.js`中的以下函数：
- `generateAIResponse` - AI对话生成
- `generateTopicStarter` - AI找话题
- `correctGrammar` - 语法纠正

## 许可证

MIT
