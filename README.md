# EEF AI 实时模拟面签

这是一个可部署到 Vercel 的 Campus France / EEF 实时语音模拟面签网页。

新版已改为 OpenAI Realtime API + WebRTC 架构：

- 浏览器只点击一次 `Commencer l'entretien`
- Vercel 后端用 `OPENAI_API_KEY` 创建 Realtime 临时 client secret
- 浏览器使用临时 client secret 通过 WebRTC 连接 OpenAI Realtime API
- 实时模型固定为 `gpt-realtime-mini`
- 使用 Realtime 语音输入输出，不再使用旧的“录音上传、单独转写、文本追问、TTS播放”流程
- 使用程序状态机控制主题顺序、追问次数和约 20 题结束逻辑
- 面签结束后关闭 WebRTC、麦克风和音频连接，再根据本轮 transcript 生成中文复盘

## 部署到 Vercel

1. 把项目上传到 GitHub。
2. 在 Vercel 导入 GitHub 仓库。
3. 在 Vercel 项目 Settings → Environment Variables 添加：

   `OPENAI_API_KEY = 你的 OpenAI API Key`

4. 重新部署。

可选环境变量：

- `OPENAI_FEEDBACK_MODEL`：中文复盘使用的模型
- `OPENAI_MODEL`：如果没有设置 `OPENAI_FEEDBACK_MODEL`，中文复盘会使用这个模型

实时面签模型在代码中锁定为：

`gpt-realtime-mini`

不要改成 `gpt-realtime`，也不要自动 fallback 到更贵的 Realtime 模型。

## 文件结构

```text
api/
  feedback.js
  realtime-token.js
app.js
index.html
package.json
questions.js
README.md
style.css
vercel.json
```

## 状态机规则

`app.js` 维护以下状态：

- `currentTopicIndex`
- `followUpCount`
- `topicQuestionCount`
- `questionCount`
- `askedQuestions`
- `interviewEnded`

主题覆盖：

1. 开场和环境确认
2. 自我介绍与个人情况
3. 教育经历
4. 毕业后的经历 / 工作 / 实践
5. 法语学习与语言水平
6. 为什么法国
7. 学校、城市与录取项目
8. 学习计划
9. 艺术实践
10. 职业规划与回国计划
11. 家庭与资金
12. 结束反问

每个主题最多 1 个主问题 + 2 个追问。一般 1 个主问题 + 1 个追问后切换主题。艺术实践模块最多连续 3 题，避免变成作品集 jury。

## 重要安全说明

不要把 API Key 写进 `index.html` 或 `app.js`。

浏览器端只请求 `/api/realtime-token` 获取临时 client secret。`OPENAI_API_KEY` 只存在于 Vercel 后端函数中。

## 使用方式

1. 打开部署后的网页。
2. 点击 `Commencer l'entretien`。
3. 允许浏览器使用麦克风。
4. AI 面签官开始用法语提问。
5. 用户直接用法语回答，不需要点击录音或提交。
6. Realtime VAD 检测用户说话结束后，程序状态机自动触发下一题或追问。
7. 约 18-22 题后自动进入结束反问。
8. 面签结束后自动关闭连接并生成中文复盘。
