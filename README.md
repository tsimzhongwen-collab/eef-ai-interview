# EEF AI 模拟面签

这是一个可直接部署到 Vercel 的网页项目。

功能：
- 从 145 道 EEF 面签问题中随机抽题
- OpenAI 法语语音播放
- 浏览器录音
- 法语语音转文字
- AI 依据你的回答连续追问
- 中途不纠错
- 结束后生成中文复盘
- 可显示/隐藏中法问题文本

## 部署到 Vercel

1. 把整个项目上传到 GitHub。
2. 在 Vercel 导入这个 GitHub 仓库。
3. 在 Vercel 项目 Settings → Environment Variables 添加：

   OPENAI_API_KEY = 你的 OpenAI API Key

4. 重新 Deploy。

可选环境变量：

- OPENAI_MODEL（默认 `gpt-5.6`）
- OPENAI_TRANSCRIBE_MODEL（默认 `gpt-4o-mini-transcribe`）
- OPENAI_TTS_MODEL（默认 `gpt-4o-mini-tts`）
- OPENAI_TTS_VOICE（默认 `coral`）

## 重要

不要把 API Key 写进 `index.html` 或 `app.js`。
本项目只在 Vercel 后端函数中读取 `OPENAI_API_KEY`。

网页必须通过 HTTPS 或 localhost 使用麦克风。Vercel 部署后默认是 HTTPS。

## 使用方式

1. 点击“随机抽题并开始面签”。
2. 听面签官问题。
3. 点击“开始录音”，用法语回答。
4. 停止录音后等待转写。
5. 可以手动修改转写文本。
6. 点击“提交回答并追问”。
7. AI 会根据你的回答只问一个追问。
8. 完成 5–8 轮后点击“结束面签并生成中文复盘”。

## 题库

题库来自 `EEF面签常见问题汇总.docx`，已去重并整理为 145 道问题。
