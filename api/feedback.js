const FEEDBACK_MODEL = process.env.OPENAI_FEEDBACK_MODEL || process.env.OPENAI_MODEL || "gpt-5.6";

function extractText(data) {
  if (typeof data.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
  const parts = [];
  for (const item of data.output || []) {
    if (item.type !== "message") continue;
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}

export const config = {
  api: {
    bodyParser: { sizeLimit: "1mb" }
  }
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY is not configured");

    const { transcript = [], questions = [] } = req.body || {};
    if (!Array.isArray(transcript) || transcript.length === 0) {
      return res.status(400).json({ error: "Missing transcript" });
    }

    const userTurns = transcript
      .filter((item) => item.role === "user")
      .map((item, index) => `${index + 1}. 问题：${item.question || "未知"}\n回答：${item.text || ""}`)
      .join("\n\n");

    const questionList = questions
      .slice(0, 180)
      .map((q) => `- [${q.section}] ${q.fr}`)
      .join("\n");

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: FEEDBACK_MODEL,
        instructions: [
          "你是 Campus France / EEF 面签复盘教练。",
          "只使用本轮 transcript 中学生实际回答过的内容进行分析，禁止凭空制造风险、错误或事实。",
          "正式面签过程中没有纠错；现在面签结束后，用简体中文复盘。",
          "法语建议只能给 B1 级自然口语，不要改成 C1 书面法语。",
          "引用用户短句时必须短，只引用必要片段。",
          "结构必须严格使用：一、整体判断；二、听懂与应答；三、法语表达问题；四、可能引发不利追问的回答；五、本轮最危险的3个回答；六、本轮表现最好的3个回答；七、下一轮最该练的3个问题。",
          "第七部分必须从给定 questions.js 题库中选择 3 个法语问题。"
        ].join("\n"),
        input: [
          {
            role: "user",
            content:
              "本轮学生回答如下：\n\n" +
              userTurns +
              "\n\n可选题库如下，请从中选择下一轮最该练的3题：\n" +
              questionList
          }
        ]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data?.error?.message || "Feedback request failed" });
    }

    return res.status(200).json({ text: extractText(data) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || "Server error" });
  }
}
