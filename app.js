const REALTIME_MODEL = "gpt-realtime-mini";
const TOTAL_TARGET = 20;
const MIN_QUESTIONS = 18;
const MAX_QUESTIONS = 22;
const questions = window.EEF_QUESTIONS || [];

const TOPIC_ORDER = [
  "一、开场和环境确认",
  "二、自我介绍与个人情况",
  "三、教育经历",
  "四、毕业后的经历、工作与实践",
  "五、法语学习与语言水平",
  "六、为什么选择法国",
  "七、学校、城市与录取项目",
  "八、学习计划",
  "九、艺术专业与个人实践",
  "十、职业规划与回国计划",
  "十一、家庭与资金",
  "十二、追问与结尾反问"
];

const TOPIC_LABELS = {
  "一、开场和环境确认": "ouverture et vérification de l'environnement",
  "二、自我介绍与个人情况": "présentation personnelle",
  "三、教育经历": "parcours éducatif",
  "四、毕业后的经历、工作与实践": "expériences après le diplôme",
  "五、法语学习与语言水平": "apprentissage du français",
  "六、为什么选择法国": "choix de la France",
  "七、学校、城市与录取项目": "école, ville et programme admis",
  "八、学习计划": "projet d'études",
  "九、艺术专业与个人实践": "pratique artistique",
  "十、职业规划与回国计划": "projet professionnel et retour",
  "十一、家庭与资金": "famille et financement",
  "十二、追问与结尾反问": "question finale"
};

const ART_BANNED_ANGLES = [
  "la symbolique du matériau",
  "la signification des couleurs",
  "la disposition spatiale détaillée",
  "une analyse de jury artistique",
  "une longue interprétation esthétique"
];

const $ = (id) => document.getElementById(id);
const els = {
  interviewView: $("interviewView"),
  feedbackView: $("feedbackView"),
  officer: $("officerAvatar"),
  mouth: $("mouth"),
  questionCount: $("questionCount"),
  statusText: $("statusText"),
  startBtn: $("startBtn"),
  endBtn: $("endBtn"),
  toggleTextBtn: $("toggleTextBtn"),
  questionText: $("questionText"),
  feedbackContent: $("feedbackContent"),
  restartBtn: $("restartBtn"),
  remoteAudio: $("remoteAudio"),
  meters: [$("meterA"), $("meterB"), $("meterC")]
};

const state = {
  pc: null,
  dc: null,
  localStream: null,
  remoteStream: null,
  audioContext: null,
  analyser: null,
  animationFrame: null,
  currentTopicIndex: 0,
  followUpCount: 0,
  topicQuestionCount: 0,
  questionCount: 0,
  targetQuestionCount: TOTAL_TARGET + Math.floor(Math.random() * 5) - 2,
  askedQuestions: new Set(),
  transcript: [],
  currentQuestion: "",
  currentMode: "idle",
  userWasHeard: false,
  awaitingResponse: false,
  interviewEnded: false,
  textVisible: false
};

updateCounter();

function setStatus(text, mode = state.currentMode) {
  state.currentMode = mode;
  els.statusText.textContent = text;
  els.officer.classList.toggle("speaking", mode === "assistant");
  els.officer.classList.toggle("listening", mode === "user");
  els.officer.classList.toggle("thinking", mode === "thinking");
  window.avatarController?.setSpeakingLevel?.(0, mode);
}

function updateCounter() {
  els.questionCount.textContent = `${String(state.questionCount).padStart(2, "0")} / ${state.targetQuestionCount}`;
}

function setQuestionText(text) {
  state.currentQuestion = text || "";
  els.questionText.textContent = state.currentQuestion;
  els.toggleTextBtn.classList.toggle("hidden", !state.currentQuestion);
}

function toggleQuestionText() {
  state.textVisible = !state.textVisible;
  els.questionText.classList.toggle("hidden", !state.textVisible);
  els.toggleTextBtn.textContent = state.textVisible ? "Masquer le texte" : "Afficher le texte";
}

function topicQuestions(topic) {
  return questions.filter((q) => q.section === topic);
}

function pickQuestion(topic) {
  const pool = topicQuestions(topic);
  const unused = pool.filter((q) => !state.askedQuestions.has(q.fr));
  const source = unused.length ? unused : pool;
  if (!source.length) return "Pouvez-vous m'expliquer votre projet d'études ?";
  const selected = source[Math.floor(Math.random() * source.length)].fr;
  state.askedQuestions.add(selected);
  return selected;
}

function shouldAskSecondFollowUp(answer) {
  const text = (answer || "").toLowerCase();
  const vague = text.length < 45 || /je ne sais pas|pas beaucoup|c'est tout|aucune idée/.test(text);
  const contradiction = /mais|par contre|cependant|en fait|pas vraiment/.test(text);
  const relevantNewInfo = /master|licence|école|programme|stage|travail|français|budget|parents|retour|chine|france|portfolio/.test(text);
  return vague || contradiction || relevantNewInfo;
}

function shouldMoveTopic(lastUserAnswer = "") {
  if (state.currentTopicIndex >= TOPIC_ORDER.length - 1) return false;
  if (state.topicQuestionCount >= 3) return true;
  if (currentTopic() === "九、艺术专业与个人实践" && state.topicQuestionCount >= 3) return true;
  if (state.followUpCount >= 2) return true;
  if (state.followUpCount >= 1 && !shouldAskSecondFollowUp(lastUserAnswer)) return true;
  return false;
}

function currentTopic() {
  return TOPIC_ORDER[state.currentTopicIndex] || TOPIC_ORDER[TOPIC_ORDER.length - 1];
}

function advanceTopicIfNeeded(lastUserAnswer = "") {
  if (state.questionCount >= MIN_QUESTIONS && state.currentTopicIndex < TOPIC_ORDER.length - 1) {
    state.currentTopicIndex = TOPIC_ORDER.length - 1;
    state.followUpCount = 0;
    state.topicQuestionCount = 0;
    return;
  }

  if (shouldMoveTopic(lastUserAnswer)) {
    state.currentTopicIndex = Math.min(state.currentTopicIndex + 1, TOPIC_ORDER.length - 1);
    state.followUpCount = 0;
    state.topicQuestionCount = 0;
  }
}

function buildBaseInstruction() {
  return [
    "Tu es un agent Campus France / EEF qui mène un entretien étudiant réaliste.",
    "Pendant l'entretien officiel, tu parles uniquement français.",
    "Ton ton est neutre, professionnel, naturel et légèrement sérieux.",
    "Ne sois pas trop chaleureux. Ne félicite pas l'étudiant. N'enseigne pas. Ne corrige pas le français.",
    "Ne donne pas de réponse modèle et ne fais pas d'évaluation pendant l'entretien.",
    "Pose exactement une seule question à la fois, en français oral naturel A2-B1.",
    "Chaque réponse doit contenir au maximum deux phrases; dans la plupart des cas une seule question.",
    "L'entretien vérifie surtout la cohérence du projet d'études, le parcours, le choix de la France, l'école, le programme, le français, le financement et le projet professionnel.",
    "L'art ne doit pas devenir un jury artistique; utilise l'art seulement pour vérifier que l'étudiant connaît son parcours.",
    "Ne mentionne jamais que tu es une IA."
  ].join(" ");
}

function buildTurnInstruction(lastUserAnswer = "") {
  const topic = currentTopic();
  const label = TOPIC_LABELS[topic] || topic;
  const mustEnd = state.currentTopicIndex === TOPIC_ORDER.length - 1 || state.questionCount >= state.targetQuestionCount - 1;
  const mainQuestion = pickQuestion(topic);
  const turnNumber = state.questionCount + 1;

  if (mustEnd) {
    return {
      displayText: "Avez-vous une question à me poser ?",
      instructions: [
        buildBaseInstruction(),
        "C'est la fin de l'entretien.",
        "Pose exactement cette question finale et rien d'autre : Avez-vous une question à me poser ?"
      ].join(" ")
    };
  }

  const isMain = state.topicQuestionCount === 0;
  const followupLine = isMain
    ? `Pose cette question principale, ou une version très légèrement naturalisée : "${mainQuestion}".`
    : "Pose une seule question de relance courte, strictement liée à la dernière réponse de l'étudiant et au thème actuel.";

  const artLimit = topic === "九、艺术专业与个人实践"
    ? `Dans le module artistique, évite ces angles : ${ART_BANNED_ANGLES.join(", ")}. Après trois questions artistiques maximum, il faut changer de thème.`
    : "";

  return {
    displayText: isMain ? mainQuestion : "",
    instructions: [
      buildBaseInstruction(),
      `Question ${turnNumber} sur environ ${state.targetQuestionCount}.`,
      `Thème contrôlé par le programme : ${label}.`,
      `Nombre de questions déjà posées dans ce thème : ${state.topicQuestionCount}. Nombre de relances déjà posées dans ce thème : ${state.followUpCount}.`,
      followupLine,
      artLimit,
      lastUserAnswer ? `Dernière réponse de l'étudiant, à utiliser seulement pour choisir la relance : ${lastUserAnswer}` : "",
      "Ne change pas toi-même de thème si le thème contrôlé est indiqué.",
      "Réponds uniquement par la prochaine question française."
    ].filter(Boolean).join(" ")
  };
}

function sendEvent(event) {
  if (!state.dc || state.dc.readyState !== "open") return false;
  state.dc.send(JSON.stringify(event));
  return true;
}

function createResponse(instructions) {
  state.awaitingResponse = true;
  return sendEvent({
    type: "response.create",
    response: {
      output_modalities: ["audio"],
      max_output_tokens: 110,
      instructions
    }
  });
}

function isRepeatRequest(text = "") {
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return [
    /repetez|repeter|pouvez-vous repeter|encore une fois|une autre fois/,
    /je n'ai pas compris|je ne comprends pas|pas compris|pas entendu|je n'ai pas entendu/,
    /repeat|again|one more time/,
    /再说|重复|再问一遍|听不清|没听清|没有听清|没听懂|没有听懂/
  ].some((pattern) => pattern.test(normalized));
}

function repeatCurrentQuestion() {
  const question = state.currentQuestion || "Pouvez-vous répéter votre question ?";
  setQuestionText(question);
  setStatus("Le jury répète la question...", "thinking");
  createResponse([
    buildBaseInstruction(),
    "L'étudiant demande de répéter la question.",
    "Répète exactement la même question, sans la reformuler, sans ajouter d'autre question et sans commentaire :",
    question
  ].join(" "));
}

function askNextQuestion(lastUserAnswer = "") {
  if (state.interviewEnded || state.awaitingResponse) return;
  advanceTopicIfNeeded(lastUserAnswer);
  const turn = buildTurnInstruction(lastUserAnswer);
  setQuestionText(turn.displayText);
  state.questionCount += 1;
  state.topicQuestionCount += 1;
  if (state.topicQuestionCount > 1) state.followUpCount += 1;
  updateCounter();
  setStatus("Le jury pose une question...", "thinking");
  createResponse(turn.instructions);
}

function finishAfterFinalAnswer() {
  if (state.interviewEnded || state.awaitingResponse) return;
  state.interviewEnded = true;
  setQuestionText("Merci. L'entretien est terminé. Bonne journée.");
  setStatus("Fin de l'entretien...", "thinking");
  createResponse([
    buildBaseInstruction(),
    "L'étudiant a répondu à la question finale.",
    "Dis exactement une phrase naturelle pour terminer : Merci. L'entretien est terminé. Bonne journée."
  ].join(" "));
}

async function startInterview() {
  resetInterviewState();
  els.startBtn.disabled = true;
  setStatus("Demande d'accès au microphone...", "thinking");

  try {
    state.localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    const tokenResponse = await fetch("/api/realtime-token", { method: "POST" });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok) throw new Error(tokenData.error || "Impossible de créer la session Realtime");

    const clientSecret = tokenData?.client_secret?.value || tokenData?.value;
    if (!clientSecret) throw new Error("Realtime client secret manquant");

    await connectRealtime(clientSecret);
    els.startBtn.classList.add("hidden");
    els.endBtn.classList.remove("hidden");
    setStatus("Connexion établie. L'entretien commence.", "thinking");
    askNextQuestion();
  } catch (error) {
    console.error(error);
    await closeRealtime();
    els.startBtn.disabled = false;
    setStatus(friendlyError(error), "idle");
  }
}

async function connectRealtime(clientSecret) {
  state.pc = new RTCPeerConnection();
  state.remoteStream = new MediaStream();
  els.remoteAudio.srcObject = state.remoteStream;

  state.pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => state.remoteStream.addTrack(track));
    setupAudioAnalyser(state.remoteStream);
  };

  state.localStream.getAudioTracks().forEach((track) => state.pc.addTrack(track, state.localStream));
  state.dc = state.pc.createDataChannel("oai-events");
  state.dc.addEventListener("message", handleRealtimeEvent);

  const offer = await state.pc.createOffer();
  await state.pc.setLocalDescription(offer);

  const sdpResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
    method: "POST",
    body: offer.sdp,
    headers: {
      Authorization: `Bearer ${clientSecret}`,
      "Content-Type": "application/sdp"
    }
  });

  if (!sdpResponse.ok) {
    throw new Error(await sdpResponse.text());
  }

  await state.pc.setRemoteDescription({
    type: "answer",
    sdp: await sdpResponse.text()
  });

  await waitForDataChannel();
}

function waitForDataChannel() {
  if (state.dc.readyState === "open") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Realtime data channel timeout")), 10000);
    state.dc.addEventListener("open", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

function handleRealtimeEvent(message) {
  const event = JSON.parse(message.data);

  if (event.type === "error") {
    console.error(event);
    setStatus(event.error?.message || "Erreur Realtime", "idle");
    return;
  }

  if (event.type === "input_audio_buffer.speech_started") {
    state.userWasHeard = true;
    setStatus("Vous parlez...", "user");
    return;
  }

  if (event.type === "input_audio_buffer.speech_stopped") {
    setStatus("Réponse reçue, préparation de la suite...", "thinking");
    return;
  }

  if (event.type === "conversation.item.input_audio_transcription.completed") {
    const text = (event.transcript || "").trim();
    if (text) {
      state.transcript.push({ role: "user", text, topic: currentTopic(), question: state.currentQuestion });
    }
    if (isRepeatRequest(text)) {
      repeatCurrentQuestion();
      return;
    }
    if (state.questionCount >= state.targetQuestionCount || state.currentTopicIndex === TOPIC_ORDER.length - 1) {
      finishAfterFinalAnswer();
    } else {
      askNextQuestion(text);
    }
    return;
  }

  if (event.type === "conversation.item.input_audio_transcription.failed") {
    state.transcript.push({ role: "user", text: "[Transcription non disponible]", topic: currentTopic(), question: state.currentQuestion });
    askNextQuestion("");
    return;
  }

  if (event.type === "response.audio_transcript.done" || event.type === "response.output_audio_transcript.done") {
    const text = (event.transcript || "").trim();
    if (text) {
      state.transcript.push({ role: "assistant", text, topic: currentTopic() });
      setQuestionText(text);
    }
    return;
  }

  if (event.type === "response.created") {
    setStatus("Le jury parle...", "assistant");
    return;
  }

  if (event.type === "response.done") {
    state.awaitingResponse = false;
    if (state.interviewEnded) {
      setTimeout(endInterviewAndReview, 900);
    } else {
      setStatus("À vous de répondre.", "idle");
    }
  }
}

function setupAudioAnalyser(stream) {
  if (state.audioContext) return;
  state.audioContext = new AudioContext();
  const source = state.audioContext.createMediaStreamSource(stream);
  state.analyser = state.audioContext.createAnalyser();
  state.analyser.fftSize = 256;
  source.connect(state.analyser);
  animateAvatar();
}

function animateAvatar() {
  const data = new Uint8Array(state.analyser.frequencyBinCount);
  let smoothed = 0;

  function tick() {
    state.analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const value of data) {
      const normalized = (value - 128) / 128;
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / data.length);
    const target = state.currentMode === "assistant" ? Math.min(1, Math.max(0, (rms - .015) * 9)) : 0;
    smoothed += (target - smoothed) * .22;
    const level = Math.max(.12, smoothed);
    els.mouth.style.setProperty("--mouth-open", smoothed.toFixed(3));
    window.avatarController?.setSpeakingLevel?.(smoothed, state.currentMode);
    els.meters.forEach((meter, index) => {
      const offset = index === 1 ? .18 : index === 2 ? -.08 : 0;
      meter.style.setProperty("--meter-level", Math.max(.18, Math.min(1, level + offset)).toFixed(2));
    });
    state.animationFrame = requestAnimationFrame(tick);
  }

  tick();
}

async function endInterviewAndReview() {
  await closeRealtime();
  els.interviewView.classList.add("hidden");
  els.feedbackView.classList.remove("hidden");
  renderFeedbackLoading();

  try {
    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript: state.transcript,
        questions: questions.map((q) => ({ section: q.section, fr: q.fr }))
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "复盘生成失败");
    renderFeedback(data.feedback, data.text);
  } catch (error) {
    console.error(error);
    renderFeedbackError(`复盘生成失败：${friendlyError(error)}\n\n本轮对话记录已保留在浏览器内存中，但没有继续消耗 Realtime 连接。`);
  }
}

function renderFeedbackLoading() {
  els.feedbackContent.className = "feedback-dashboard feedback-loading";
  els.feedbackContent.innerHTML = `
    <div class="loading-card">
      <div class="loading-title">正在生成中文复盘...</div>
      <div class="loading-subtitle">正在整理听懂程度、表达风险和下一轮重点。</div>
    </div>
  `;
}

function renderFeedbackError(message) {
  els.feedbackContent.className = "feedback-content";
  els.feedbackContent.textContent = message;
}

function renderFeedback(feedback, fallbackText = "") {
  if (!feedback || typeof feedback !== "object") {
    els.feedbackContent.className = "feedback-content";
    els.feedbackContent.textContent = fallbackText || "复盘生成完成，但格式无法解析。";
    return;
  }

  els.feedbackContent.className = "feedback-dashboard";
  const score = clampScore(feedback.overallScore);
  const risk = normalizeStatus(feedback.riskLevel);
  const scoreCards = Array.isArray(feedback.scoreCards) ? feedback.scoreCards : [];
  const findings = Array.isArray(feedback.keyFindings) ? feedback.keyFindings : [];
  const languageIssues = Array.isArray(feedback.languageIssues) ? feedback.languageIssues : [];
  const riskyAnswers = Array.isArray(feedback.riskyAnswers) ? feedback.riskyAnswers : [];
  const bestAnswers = Array.isArray(feedback.bestAnswers) ? feedback.bestAnswers : [];
  const practiceQuestions = Array.isArray(feedback.practiceQuestions) ? feedback.practiceQuestions : [];

  els.feedbackContent.innerHTML = `
    <section class="feedback-hero ${risk}">
      <div>
        <div class="feedback-kicker">总评分</div>
        <div class="feedback-score">${score}<span>/100</span></div>
      </div>
      <div class="feedback-headline">
        <span class="risk-pill ${risk}">${riskLabel(risk)}</span>
        <h3>${escapeHtml(feedback.headline || "本轮表现复盘")}</h3>
        <p>${escapeHtml(feedback.summary || "请优先查看分项评分和高风险回答。")}</p>
      </div>
    </section>

    <section class="score-grid">
      ${scoreCards.map(renderScoreCard).join("")}
    </section>

    <section class="feedback-section">
      <h3>一眼结论</h3>
      <div class="finding-list">
        ${findings.map(renderFinding).join("") || "<p class=\"empty-note\">暂无关键结论。</p>"}
      </div>
    </section>

    <section class="feedback-columns">
      <div class="feedback-section">
        <h3>法语表达问题</h3>
        ${languageIssues.map(renderLanguageIssue).join("") || "<p class=\"empty-note\">本轮没有明显需要单独列出的法语问题。</p>"}
      </div>
      <div class="feedback-section">
        <h3>高风险回答</h3>
        ${riskyAnswers.map(renderRiskyAnswer).join("") || "<p class=\"empty-note\">没有发现明显高风险回答。</p>"}
      </div>
    </section>

    <section class="feedback-columns">
      <div class="feedback-section">
        <h3>表现最好的回答</h3>
        ${bestAnswers.map(renderBestAnswer).join("") || "<p class=\"empty-note\">本轮可继续积累更完整的亮点回答。</p>"}
      </div>
      <div class="feedback-section">
        <h3>下一轮最该练</h3>
        ${practiceQuestions.map(renderPracticeQuestion).join("") || "<p class=\"empty-note\">暂无推荐题目。</p>"}
      </div>
    </section>
  `;
}

function renderScoreCard(card) {
  const status = normalizeStatus(card.status);
  const score = clampScore(card.score);
  return `
    <article class="score-card ${status}">
      <div class="score-card-top">
        <strong>${escapeHtml(card.label || "分项")}</strong>
        <span>${score}</span>
      </div>
      <div class="score-bar"><i style="width:${score}%"></i></div>
      <p>${escapeHtml(card.note || "")}</p>
    </article>
  `;
}

function renderFinding(item) {
  const status = normalizeStatus(item.status);
  return `
    <article class="finding-item ${status}">
      <span></span>
      <div>
        <strong>${escapeHtml(item.title || "结论")}</strong>
        <p>${escapeHtml(item.detail || "")}</p>
      </div>
    </article>
  `;
}

function renderLanguageIssue(item) {
  return `
    <article class="detail-card">
      <div class="quote-label">你的表达</div>
      <p class="quote-text">「${escapeHtml(item.original || "")}」</p>
      <div class="quote-label">建议</div>
      <p class="suggestion-text">「${escapeHtml(item.suggestion || "")}」</p>
      <p>${escapeHtml(item.explanation || "")}</p>
    </article>
  `;
}

function renderRiskyAnswer(item) {
  return `
    <article class="detail-card danger">
      <strong>${escapeHtml(item.risk || "可能引发追问")}</strong>
      <p>「${escapeHtml(item.answer || "")}」</p>
      <p class="fix-text">${escapeHtml(item.fix || "")}</p>
    </article>
  `;
}

function renderBestAnswer(item) {
  return `
    <article class="detail-card good">
      <p>「${escapeHtml(item.answer || "")}」</p>
      <p>${escapeHtml(item.why || "")}</p>
    </article>
  `;
}

function renderPracticeQuestion(item) {
  return `
    <article class="practice-card">
      <strong>${escapeHtml(item.fr || "")}</strong>
      <p>${escapeHtml(item.reason || "")}</p>
    </article>
  `;
}

function clampScore(value) {
  const score = Number.parseInt(value, 10);
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, score));
}

function normalizeStatus(status) {
  if (status === "high" || status === "danger") return "danger";
  if (status === "medium" || status === "warning") return "warning";
  return "good";
}

function riskLabel(status) {
  if (status === "danger") return "风险较高";
  if (status === "warning") return "需要注意";
  return "状态稳定";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function closeRealtime() {
  if (state.animationFrame) cancelAnimationFrame(state.animationFrame);
  state.animationFrame = null;

  if (state.dc && state.dc.readyState !== "closed") state.dc.close();
  state.dc = null;

  if (state.pc) {
    state.pc.getSenders().forEach((sender) => sender.track?.stop());
    state.pc.getReceivers().forEach((receiver) => receiver.track?.stop());
    state.pc.close();
  }
  state.pc = null;

  if (state.localStream) {
    state.localStream.getTracks().forEach((track) => track.stop());
  }
  state.localStream = null;

  if (state.remoteStream) {
    state.remoteStream.getTracks().forEach((track) => track.stop());
  }
  state.remoteStream = null;
  els.remoteAudio.srcObject = null;

  if (state.audioContext) {
    await state.audioContext.close().catch(() => {});
  }
  state.audioContext = null;
  state.analyser = null;
  els.mouth.style.setProperty("--mouth-open", "0");
  window.avatarController?.setSpeakingLevel?.(0, "idle");
}

function resetInterviewState() {
  state.currentTopicIndex = 0;
  state.followUpCount = 0;
  state.topicQuestionCount = 0;
  state.questionCount = 0;
  state.targetQuestionCount = TOTAL_TARGET + Math.floor(Math.random() * 5) - 2;
  state.askedQuestions = new Set();
  state.transcript = [];
  state.currentQuestion = "";
  state.currentMode = "idle";
  state.userWasHeard = false;
  state.awaitingResponse = false;
  state.interviewEnded = false;
  state.textVisible = false;
  els.questionText.classList.add("hidden");
  els.toggleTextBtn.classList.add("hidden");
  els.toggleTextBtn.textContent = "Afficher le texte";
  updateCounter();
}

function friendlyError(error) {
  const message = String(error?.message || error || "Erreur inconnue");
  if (message.includes("OPENAI_API_KEY")) return "Vercel 没有配置 OPENAI_API_KEY。";
  if (message.includes("gpt-realtime-mini")) return "gpt-realtime-mini 调用失败；请确认 API 账户已开通 Realtime。";
  if (message.includes("Permission denied") || message.includes("NotAllowedError")) return "麦克风权限被拒绝，请允许浏览器使用麦克风。";
  return message.slice(0, 220);
}

els.startBtn.addEventListener("click", startInterview);
els.endBtn.addEventListener("click", () => {
  state.interviewEnded = true;
  endInterviewAndReview();
});
els.toggleTextBtn.addEventListener("click", toggleQuestionText);
els.restartBtn.addEventListener("click", () => {
  els.feedbackView.classList.add("hidden");
  els.interviewView.classList.remove("hidden");
  els.startBtn.disabled = false;
  els.startBtn.classList.remove("hidden");
  els.endBtn.classList.add("hidden");
  resetInterviewState();
  setStatus("Prêt pour l'entretien", "idle");
});
