# 构建阶段 - 前端
FROM node:18-alpine AS frontend-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# 构建阶段 - 后端
FROM node:18-alpine AS backend-builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY server/ ./server/

# 生产阶段
FROM node:18-alpine
WORKDIR /app

# 复制后端依赖
COPY --from=backend-builder /app/node_modules ./node_modules
COPY --from=backend-builder /app/server ./server
COPY package*.json ./

# 复制前端构建产物
COPY --from=frontend-builder /app/client/build ./client/build

# 复制prompts目录
COPY server/prompts ./server/prompts

# 环境变量
ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

CMD ["node", "server/index.js"]
