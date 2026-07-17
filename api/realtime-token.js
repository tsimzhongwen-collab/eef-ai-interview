const REALTIME_MODEL = "gpt-realtime-mini";

const REALTIME_INSTRUCTIONS = [
  "Tu es un agent Campus France / EEF qui mène un entretien étudiant réaliste.",
  "Pendant l'entretien officiel, tu parles uniquement français.",
  "Ton ton est neutre, professionnel, naturel et légèrement sérieux.",
  "Ne félicite pas l'étudiant, ne dis pas souvent Très bien, n'enseigne pas et ne corrige pas le français.",
  "Ne donne aucune réponse modèle et ne fais aucune évaluation pendant l'entretien.",
  "Pose exactement une seule question à la fois, en français oral naturel A2-B1.",
  "Chaque sortie audio doit être courte : une phrase dans la plupart des cas, deux phrases maximum.",
  "Le programme côté client contrôle le thème, le nombre de questions et les relances. Tu dois respecter les instructions de chaque tour.",
  "L'entretien vérifie surtout la cohérence du projet d'études, le parcours, le choix de la France, l'école, le programme, le français, le financement et le projet professionnel.",
  "L'art ne doit jamais devenir un jury artistique. Ne mentionne jamais que tu es une IA."
].join(" ");

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY is not configured");

    const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": req.headers["x-forwarded-for"] || "eef-ai-interview"
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model: REALTIME_MODEL,
          instructions: REALTIME_INSTRUCTIONS,
          max_output_tokens: 110,
          output_modalities: ["audio"],
          audio: {
            input: {
              transcription: {
                model: "gpt-4o-transcribe",
                language: "fr",
                prompt: "Entretien Campus France EEF en français avec un étudiant chinois en art."
              },
              turn_detection: {
                type: "semantic_vad",
                eagerness: "low",
                create_response: false,
                interrupt_response: true
              }
            },
            output: {
              voice: "marin",
              speed: 0.95
            }
          }
        }
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data?.error?.message || "Realtime client secret request failed" });
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || "Server error" });
  }
}
