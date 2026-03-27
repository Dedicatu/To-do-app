# 🧠 AI Todo List Web App

一个支持 **任务管理 + 看板视图 + AI 智能拆解** 的全栈 Todo 应用。  
支持在手机和电脑上访问，并已部署到公网 🌐。

👉 在线体验（手机可直接访问）  
https://dedicatu.github.io/To-do-app/

## ✨ 特征

### 📝 基础任务管理
- 新增 / 编辑 / 删除任务
- 标记完成 / 未完成
- 支持任务备注
- 支持上传图片附件

### 🎯 任务管理增强
- 优先级设置（高 / 中 / 低）
- 预定时间 + 提醒
- 搜索任务
- 按状态筛选
- 按优先级筛选
- 按时间排序

### 📊 任务看板（Kanban）
- 待开始 / 进行中 / 已完成
- 支持任务拖动（按钮切换）
- 不同状态颜色区分

### 🔥 今日重点
- 自动筛选当天任务
- 按优先级排序

### 🤖 AI 助理
- AI 任务拆解（如：准备期末考试 → 多个子任务）
- AI 智能分类
- 对话式任务添加
- 加载动画 + 错误处理
- AI 不可用自动降级为手动模式

### 📱 移动端适配
- 响应式布局
- 手机浏览体验良好

---

## 🛠️ 技术栈

### 前端
- HTML / CSS / JavaScript
- GitHub Pages（部署）

### 后端
- Node.js + Express
- SQLite（本地数据库）

### AI
- Kimi API（Moonshot）

### Deployment
- Render（后端）
- GitHub Pages（前端）

---

## ⚙️ 项目结构

```text
.
├── index.html
├── style.css
├── server.js
├── package.json
├── todo.db
