function extensionForMime(mimeType = "") {
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

export const config = {
  api: {
    bodyParser: { sizeLimit: "12mb" }
  }
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY is not configured");

    const { audioBase64, mimeType = "audio/webm" } = req.body || {};
    if (!audioBase64) return res.status(400).json({ error: "Missing audioBase64" });

    const bytes = Buffer.from(audioBase64, "base64");
    const form = new FormData();
    form.append(
      "file",
      new Blob([bytes], { type: mimeType }),
      `answer.${extensionForMime(mimeType)}`
    );
    form.append("model", process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe");
    form.append("response_format", "text");
    form.append("language", "fr");
    form.append(
      "prompt",
      "Campus France EEF interview in French. The speaker is a Chinese art student discussing studies, art practice, French level, school, program and career plan."
    );

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}` },
      body: form
    });

    const text = await response.text();
    if (!response.ok) throw new Error(text || "Transcription request failed");

    return res.status(200).json({ text: text.trim() });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || "Server error" });
  }
}
