const MODEL = process.env.OPENAI_MODEL || "gpt-5.6";

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

async function createResponse(payload) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not configured");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || "OpenAI Responses API request failed");
  }
  return data;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { mode, question, category, answer, previousResponseId } = req.body || {};

    if (mode === "start") {
      if (!question) return res.status(400).json({ error: "Missing question" });

      const data = await createResponse({
        model: MODEL,
        instructions:
          "You are a Campus France EEF student interview officer conducting a realistic French interview. " +
          "Speak only French during the interview. Be neutral, concise, and professional. " +
          "Ask exactly one question at a time. Do not teach, correct, praise, score, or explain. " +
          "Do not mention that you are an AI. The student is a Chinese art applicant. " +
          "Keep questions at natural A2-B1 spoken French unless a precise academic term is necessary. " +
          "Use the student's answer to choose the next follow-up question. " +
          "Avoid inventing facts about the student.",
        input:
          `Begin the interview with this exact or minimally naturalized question: "${question}". ` +
          `Question category: ${category || "EEF interview"}. Output only the French question.`
      });

      return res.status(200).json({ text: extractText(data), responseId: data.id });
    }

    if (mode === "reply") {
      if (!answer || !previousResponseId) {
        return res.status(400).json({ error: "Missing answer or previousResponseId" });
      }

      const data = await createResponse({
        model: MODEL,
        previous_response_id: previousResponseId,
        instructions:
          "Continue acting as a Campus France EEF student interview officer. " +
          "Speak only French. Ask exactly one concise follow-up question based on the student's latest answer and the existing interview context. " +
          "Do not correct French, do not give feedback, do not praise, do not summarize, do not answer for the student, and do not explain. " +
          "If the answer contains a useful detail, probe it. Otherwise move to another relevant EEF topic: studies, French level, school, program, study plan, art practice, work experience, finances, or career plan. " +
          "Output only the next French question.",
        input: [{ role: "user", content: answer }]
      });

      return res.status(200).json({ text: extractText(data), responseId: data.id });
    }

    if (mode === "feedback") {
      if (!previousResponseId) {
        return res.status(400).json({ error: "Missing previousResponseId" });
      }

      const data = await createResponse({
        model: MODEL,
        previous_response_id: previousResponseId,
        instructions:
          "The mock interview is over. Switch to Simplified Chinese. Analyze only the student's actual answers from this interview context. " +
          "Be concrete and concise. Do not invent errors or facts. Structure the feedback with these exact headings: " +
          "一、整体判断; 二、听懂与应答; 三、法语表达问题; 四、可能引发不利追问的回答; 五、建议替换成的B1表达; 六、下一轮最该练的3个问题. " +
          "For French corrections, quote only short fragments from the student's answers and give a natural B1 alternative. " +
          "Evaluate interview strategy as a student-visa study-plan interview, not as an art-school jury interview.",
        input: "请结束本轮模拟面签，并根据整段对话生成中文复盘。"
      });

      return res.status(200).json({ text: extractText(data), responseId: data.id });
    }

    return res.status(400).json({ error: "Unknown mode" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || "Server error" });
  }
}
