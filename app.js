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

const MAIN_DOC_PARTS = [
  { id: "part-1", label: "第 1 部分", shortLabel: "第1部分", match: /^Première partie/i },
  { id: "part-2", label: "第 2 部分", shortLabel: "第2部分", match: /^Deuxième partie/i },
  { id: "part-3", label: "第 3 部分", shortLabel: "第3部分", match: /^Troisième partie/i },
  { id: "part-4", label: "第 4 部分", shortLabel: "第4部分", match: /^Quatrième partie/i },
  { id: "part-5", label: "第 5 部分", shortLabel: "第5部分", match: /^Cinquième partie/i }
];

const PRACTICE_MODES = [
  ...MAIN_DOC_PARTS.map((part) => ({
    id: part.id,
    label: `${part.shortLabel}顺序`,
    description: `${part.label}顺序提问`
  })),
  { id: "random-5", label: "五部分随机", description: "五部分随机抽选" }
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
  modePicker: $("modePicker"),
  practiceModeLabel: $("practiceModeLabel"),
  practiceModeOptions: $("practiceModeOptions"),
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
  docQuestionIndex: 0,
  randomPartIndex: 0,
  randomPartPlan: [],
  practiceMode: "random-5",
  targetQuestionCount: TOTAL_TARGET + Math.floor(Math.random() * 5) - 2,
  askedQuestions: new Set(),
  transcript: [],
  currentQuestion: "",
  currentQuestionZh: "",
  currentQuestionItem: null,
  currentMode: "idle",
  userWasHeard: false,
  awaitingResponse: false,
  canAcceptUserAnswer: false,
  answerReadyTimer: null,
  interviewEnded: false,
  textVisible: false,
  mediaRecorder: null,
  isCapturingUserAudio: false,
  currentAudioChunks: [],
  lastUserAudioUrl: "",
  lastUserAudioMime: "",
  audioObjectUrls: []
};

state.targetQuestionCount = calculateTargetQuestionCount();
state.randomPartPlan = buildRandomPartPlan();
updateCounter();
updatePracticeModeUi();

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

function updatePracticeModeUi() {
  const mode = PRACTICE_MODES.find((item) => item.id === state.practiceMode) || PRACTICE_MODES[PRACTICE_MODES.length - 1];
  els.practiceModeLabel.textContent = mode.label;
  [...els.practiceModeOptions.querySelectorAll("button")].forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === state.practiceMode);
  });
}

function setPracticeMode(modeId) {
  if (state.localStream || state.pc || state.awaitingResponse) {
    els.modePicker.open = false;
    return;
  }
  if (!PRACTICE_MODES.some((item) => item.id === modeId)) return;
  state.practiceMode = modeId;
  state.targetQuestionCount = calculateTargetQuestionCount();
  state.docQuestionIndex = 0;
  state.randomPartIndex = 0;
  state.randomPartPlan = buildRandomPartPlan();
  state.askedQuestions = new Set();
  updatePracticeModeUi();
  updateCounter();
  els.modePicker.open = false;
}

function isMainDocPart(question) {
  return MAIN_DOC_PARTS.some((part) => part.match.test(question.docSection || ""));
}

function selectedDocPart() {
  return MAIN_DOC_PARTS.find((part) => part.id === state.practiceMode) || null;
}

function getModeQuestionPool() {
  const source = questions.filter((q) => q.fr && !/quelque chose à ajouter/i.test(q.fr));
  const part = selectedDocPart();
  if (part) return source.filter((q) => part.match.test(q.docSection || ""));
  return source.filter(isMainDocPart);
}

function calculateTargetQuestionCount() {
  const pool = getModeQuestionPool();
  if (selectedDocPart()) return Math.max(1, pool.length);
  const naturalTarget = TOTAL_TARGET + Math.floor(Math.random() * 5) - 2;
  return Math.max(1, Math.min(pool.length || naturalTarget, naturalTarget));
}

function questionsForDocPart(part) {
  return questions.filter((q) => (
    q.fr &&
    !/quelque chose à ajouter/i.test(q.fr) &&
    part.match.test(q.docSection || "")
  ));
}

function buildRandomPartPlan() {
  if (selectedDocPart()) return [];
  const activeParts = MAIN_DOC_PARTS.filter((part) => questionsForDocPart(part).length > 0);
  if (!activeParts.length) return [];

  const plannedQuestionCount = Math.max(1, state.targetQuestionCount - 1);
  const baseCount = Math.floor(plannedQuestionCount / activeParts.length);
  let remaining = plannedQuestionCount % activeParts.length;
  const plan = [];

  activeParts.forEach((part) => {
    const poolSize = questionsForDocPart(part).length;
    const count = Math.min(poolSize, baseCount + (remaining > 0 ? 1 : 0));
    if (remaining > 0) remaining -= 1;
    for (let index = 0; index < count; index += 1) {
      plan.push(part.id);
    }
  });

  return plan;
}

function setQuestionText(text, questionItem = null) {
  state.currentQuestion = text || "";
  state.currentQuestionZh = questionItem?.zh || findQuestionTranslation(state.currentQuestion);
  els.questionText.innerHTML = state.currentQuestion
    ? `<span class="question-fr">${escapeHtml(state.currentQuestion)}</span>${state.currentQuestionZh ? `<span class="question-zh">${escapeHtml(state.currentQuestionZh)}</span>` : ""}`
    : "";
  els.toggleTextBtn.classList.toggle("hidden", !state.currentQuestion);
}

function findQuestionTranslation(text) {
  const item = questions.find((q) => q.fr === text);
  return item?.zh || "";
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

function pickDocumentQuestion() {
  const source = getModeQuestionPool();
  if (!source.length) {
    return { section: currentTopic(), fr: "Pouvez-vous m'expliquer votre projet d'études ?" };
  }

  if (!selectedDocPart()) {
    const plannedPartId = state.randomPartPlan[state.randomPartIndex];
    const plannedPart = MAIN_DOC_PARTS.find((part) => part.id === plannedPartId) || MAIN_DOC_PARTS[0];
    const plannedPool = questionsForDocPart(plannedPart);
    const unused = plannedPool.filter((q) => !state.askedQuestions.has(q.fr));
    const pool = unused.length ? unused : plannedPool.length ? plannedPool : source;
    const selected = pool[Math.floor(Math.random() * pool.length)];
    state.randomPartIndex += 1;
    state.askedQuestions.add(selected.fr);
    return selected;
  }

  for (let offset = 0; offset < source.length; offset += 1) {
    const index = (state.docQuestionIndex + offset) % source.length;
    const candidate = source[index];
    if (!state.askedQuestions.has(candidate.fr)) {
      state.docQuestionIndex = index + 1;
      state.askedQuestions.add(candidate.fr);
      return candidate;
    }
  }

  const fallback = source[state.docQuestionIndex % source.length];
  state.docQuestionIndex += 1;
  return fallback;
}

function pickDocumentFinalQuestion() {
  return questions.find((q) => /quelque chose à ajouter/i.test(q.fr)) || {
    section: "十二、追问与结尾反问",
    fr: "Avez-vous quelque chose à ajouter ?"
  };
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
  if (state.currentQuestionItem?.section) return state.currentQuestionItem.section;
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
    "Ne crée jamais de question de relance libre. Le programme fournit la question exacte à poser.",
    "Tu dois lire la question fournie sans l'étendre et sans ajouter de nouvelle question.",
    "L'entretien vérifie surtout la cohérence du projet d'études, le parcours, le choix de la France, l'école, le programme, le français, le financement et le projet professionnel.",
    "L'art ne doit pas devenir un jury artistique; utilise l'art seulement pour vérifier que l'étudiant connaît son parcours.",
    "Ne mentionne jamais que tu es une IA."
  ].join(" ");
}

function buildTurnInstruction() {
  const mustEnd = !selectedDocPart() && state.questionCount >= state.targetQuestionCount - 1;
  const questionItem = mustEnd ? pickDocumentFinalQuestion() : pickDocumentQuestion();
  state.currentQuestionItem = questionItem;
  const topicIndex = TOPIC_ORDER.indexOf(questionItem.section);
  if (topicIndex >= 0) state.currentTopicIndex = topicIndex;
  const turnNumber = state.questionCount + 1;

  if (mustEnd) {
    return {
      displayText: questionItem.fr,
      instructions: [
        buildBaseInstruction(),
        "C'est la fin de l'entretien.",
        `Pose exactement cette question finale issue du document, sans rien ajouter : ${questionItem.fr}`
      ].join(" ")
    };
  }

  return {
    displayText: questionItem.fr,
    instructions: [
      buildBaseInstruction(),
      `Question ${turnNumber} sur environ ${state.targetQuestionCount}.`,
      "La question suivante vient du document 法签.docx.",
      `Pose exactement cette question, sans reformulation et sans relance : ${questionItem.fr}`,
      "Ignore le contenu de la dernière réponse pour inventer une nouvelle question.",
      "Réponds uniquement par cette question française."
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
  closeAnswerWindow();
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

function isMeaningfulUserAnswer(text = "") {
  const trimmed = text.trim();
  if (!trimmed) return false;

  const normalized = trimmed
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const words = normalized.match(/[a-z]+|[\u4e00-\u9fff]+/g) || [];
  if (!words.length) return false;

  const fillerWords = new Set(["euh", "heu", "hum", "hmm", "ah", "oh", "bah", "ben"]);
  if (words.every((word) => fillerWords.has(word))) return false;
  if (/^(euh|heu|hum|hmm|ah|oh|bah|ben)[.!?。！？\s]*$/.test(normalized)) return false;

  const shortValidAnswers = /^(oui|non|si|pardon|d'accord|daccord|bonjour|merci)$/i;
  if (words.length === 1 && normalized.length < 4 && !shortValidAnswers.test(normalized)) return false;

  return true;
}

function normalizeForCompare(text = "") {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyQuestionEcho(text = "") {
  const answer = normalizeForCompare(text);
  const question = normalizeForCompare(state.currentQuestion);
  if (!answer || !question) return false;
  if (question.includes(answer) && answer.length > 18) return true;
  if (answer.includes(question) && question.length > 18) return true;

  const answerWords = new Set(answer.split(" ").filter((word) => word.length > 2));
  const questionWords = question.split(" ").filter((word) => word.length > 2);
  if (answerWords.size < 3 || questionWords.length < 3) return false;
  const overlap = questionWords.filter((word) => answerWords.has(word)).length;
  return overlap / questionWords.length >= 0.72;
}

function closeAnswerWindow() {
  state.canAcceptUserAnswer = false;
  if (state.answerReadyTimer) {
    clearTimeout(state.answerReadyTimer);
    state.answerReadyTimer = null;
  }
}

function openAnswerWindowSoon() {
  closeAnswerWindow();
  state.answerReadyTimer = window.setTimeout(() => {
    state.canAcceptUserAnswer = true;
    state.answerReadyTimer = null;
    if (!state.interviewEnded && !state.awaitingResponse) {
      setStatus("À vous de répondre.", "idle");
    }
  }, 900);
}

function repeatCurrentQuestion() {
  const question = state.currentQuestion || "Pouvez-vous répéter votre question ?";
  setQuestionText(question, state.currentQuestionItem);
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
  const turn = buildTurnInstruction(lastUserAnswer);
  setQuestionText(turn.displayText, state.currentQuestionItem);
  state.questionCount += 1;
  state.topicQuestionCount = 1;
  state.followUpCount = 0;
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
  els.modePicker.classList.add("is-locked");
  setStatus("Demande d'accès au microphone...", "thinking");

  try {
    state.localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    setupUserRecorder();

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
    els.modePicker.classList.remove("is-locked");
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
    if (!state.canAcceptUserAnswer) {
      discardLastUserAudioSegment();
      return;
    }
    state.userWasHeard = true;
    beginUserAudioSegment();
    setStatus("Vous parlez...", "user");
    return;
  }

  if (event.type === "input_audio_buffer.speech_stopped") {
    if (!state.canAcceptUserAnswer) {
      discardLastUserAudioSegment();
      return;
    }
    finishUserAudioSegmentSoon();
    setStatus("Réponse reçue, préparation de la suite...", "thinking");
    return;
  }

  if (event.type === "conversation.item.input_audio_transcription.completed") {
    const text = (event.transcript || "").trim();
    if (!state.canAcceptUserAnswer) {
      discardLastUserAudioSegment();
      return;
    }

    if (isLikelyQuestionEcho(text)) {
      discardLastUserAudioSegment();
      setStatus("Je vous écoute. Vous pouvez répondre quand vous êtes prêt.", "idle");
      return;
    }

    if (isRepeatRequest(text)) {
      discardLastUserAudioSegment();
      repeatCurrentQuestion();
      return;
    }

    if (!isMeaningfulUserAnswer(text)) {
      discardLastUserAudioSegment();
      setStatus("Je vous écoute. Vous pouvez répondre quand vous êtes prêt.", "idle");
      return;
    }

    const audioUrl = consumeLastUserAudioUrl();
    closeAnswerWindow();
    if (text) {
      state.transcript.push({
        role: "user",
        text,
        topic: currentTopic(),
        question: state.currentQuestion,
        questionZh: state.currentQuestionZh,
        audioUrl,
        audioMime: state.lastUserAudioMime
      });
    }
    if (state.questionCount >= state.targetQuestionCount || state.currentTopicIndex === TOPIC_ORDER.length - 1) {
      finishAfterFinalAnswer();
    } else {
      askNextQuestion(text);
    }
    return;
  }

  if (event.type === "conversation.item.input_audio_transcription.failed") {
    discardLastUserAudioSegment();
    if (state.canAcceptUserAnswer) {
      setStatus("Je n'ai pas bien entendu. Vous pouvez répondre encore une fois.", "idle");
    }
    return;
  }

  if (event.type === "response.audio_transcript.done" || event.type === "response.output_audio_transcript.done") {
    const text = (event.transcript || "").trim();
    if (text) {
      state.transcript.push({ role: "assistant", text, topic: currentTopic() });
    }
    return;
  }

  if (event.type === "response.created") {
    closeAnswerWindow();
    setStatus("Le jury parle...", "assistant");
    return;
  }

  if (event.type === "response.done") {
    state.awaitingResponse = false;
    if (state.interviewEnded) {
      setTimeout(endInterviewAndReview, 900);
    } else {
      setStatus("Préparez votre réponse...", "thinking");
      openAnswerWindowSoon();
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
        transcript: state.transcript.map(({ audioUrl, audioMime, ...item }) => item),
        questions: questions.map((q) => ({ section: q.section, fr: q.fr, zh: q.zh }))
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "复盘生成失败");
    renderFeedback(data.feedback, data.text);
  } catch (error) {
    console.error(error);
    renderFeedback(buildFallbackFeedback(error), "");
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
  const qaPairs = buildQaPairs(feedback.qaPairs);

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

    <section class="feedback-section qa-section">
      <h3>本次抽取的问题和我的回答</h3>
      <div class="qa-list">
        ${qaPairs.map(renderQaPair).join("") || "<p class=\"empty-note\">本轮没有可显示的问答记录。</p>"}
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

function buildFallbackFeedback(error) {
  return {
    overallScore: 0,
    riskLevel: "medium",
    headline: "AI 总结暂时没有生成",
    summary: `原因：${friendlyError(error)}。本轮问答和录音已经保留，可以先检查逐题记录。`,
    scoreCards: [
      { label: "听懂与应答", score: 0, status: "warning", note: "总结接口失败，暂时无法评分。" },
      { label: "学习计划连贯性", score: 0, status: "warning", note: "请稍后重新生成或再开始一轮。" },
      { label: "法语表达", score: 0, status: "warning", note: "逐题回答仍可在下方查看。" },
      { label: "风险控制", score: 0, status: "warning", note: "本地已停止 Realtime，不会继续消耗实时连接。" }
    ],
    keyFindings: [
      {
        title: "复盘接口请求失败",
        detail: "这通常是模型名不可用、网络中断、接口超时或 Vercel 函数返回异常造成的。",
        status: "warning"
      }
    ],
    qaPairs: [],
    languageIssues: [],
    riskyAnswers: [],
    bestAnswers: [],
    practiceQuestions: []
  };
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

function buildQaPairs(modelPairs) {
  const pairs = Array.isArray(modelPairs) ? modelPairs : [];
  const userTurns = state.transcript.filter((item) => item.role === "user");
  return userTurns.map((turn, index) => {
    const model = pairs.find((item) => Number(item.index) === index + 1) || pairs[index] || {};
    return {
      index: index + 1,
      questionFr: model.questionFr || turn.question || "",
      questionZh: model.questionZh || turn.questionZh || findQuestionTranslation(turn.question || ""),
      answerFr: model.answerFr || turn.text || "",
      answerZh: model.answerZh || "",
      audioUrl: turn.audioUrl || ""
    };
  });
}

function renderQaPair(item) {
  return `
    <article class="qa-card">
      <div class="qa-card-top">
        <strong>第 ${item.index} 题</strong>
        ${item.audioUrl ? `<audio controls preload="metadata" src="${escapeHtml(item.audioUrl)}"></audio>` : "<span class=\"qa-no-audio\">没有录到音频</span>"}
      </div>
      <div class="qa-block">
        <div class="qa-label">面签官问题</div>
        <p class="qa-text-fr">${escapeHtml(item.questionFr || "未记录")}</p>
        <p class="qa-text-zh">${escapeHtml(item.questionZh || "暂无中文翻译")}</p>
      </div>
      <div class="qa-block answer">
        <div class="qa-label">我的回答</div>
        <p class="qa-text-fr">${escapeHtml(item.answerFr || "未转写")}</p>
        <p class="qa-text-zh">${escapeHtml(item.answerZh || "暂无中文翻译")}</p>
      </div>
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
  closeAnswerWindow();

  finalizeUserAudioSegment();

  if (state.mediaRecorder && state.mediaRecorder.state !== "inactive") {
    state.mediaRecorder.stop();
  }
  state.mediaRecorder = null;
  state.isCapturingUserAudio = false;

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
  revokeAnswerAudioUrls();
  state.currentTopicIndex = 0;
  state.followUpCount = 0;
  state.topicQuestionCount = 0;
  state.questionCount = 0;
  state.docQuestionIndex = 0;
  state.randomPartIndex = 0;
  state.targetQuestionCount = calculateTargetQuestionCount();
  state.randomPartPlan = buildRandomPartPlan();
  state.askedQuestions = new Set();
  state.transcript = [];
  state.currentQuestion = "";
  state.currentQuestionZh = "";
  state.currentQuestionItem = null;
  state.currentMode = "idle";
  state.userWasHeard = false;
  state.awaitingResponse = false;
  state.canAcceptUserAnswer = false;
  closeAnswerWindow();
  state.interviewEnded = false;
  state.textVisible = false;
  state.currentAudioChunks = [];
  state.lastUserAudioUrl = "";
  state.lastUserAudioMime = "";
  updatePracticeModeUi();
  els.questionText.classList.add("hidden");
  els.toggleTextBtn.classList.add("hidden");
  els.toggleTextBtn.textContent = "Afficher le texte";
  els.modePicker.classList.remove("is-locked");
  updateCounter();
}

function setupUserRecorder() {
  if (!window.MediaRecorder || !state.localStream) return;
  const preferredTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  const mimeType = preferredTypes.find((type) => MediaRecorder.isTypeSupported(type));
  try {
    state.mediaRecorder = new MediaRecorder(state.localStream, mimeType ? { mimeType } : undefined);
    state.lastUserAudioMime = state.mediaRecorder.mimeType || mimeType || "audio/webm";
    state.mediaRecorder.addEventListener("dataavailable", (event) => {
      if (state.isCapturingUserAudio && event.data?.size) {
        state.currentAudioChunks.push(event.data);
      }
    });
    state.mediaRecorder.start(250);
  } catch (error) {
    console.warn("Answer audio recording is not available.", error);
    state.mediaRecorder = null;
  }
}

function beginUserAudioSegment() {
  state.currentAudioChunks = [];
  state.lastUserAudioUrl = "";
  state.lastUserAudioMime = state.mediaRecorder?.mimeType || state.lastUserAudioMime || "audio/webm";
  state.isCapturingUserAudio = true;
}

function finishUserAudioSegmentSoon() {
  if (!state.mediaRecorder || state.mediaRecorder.state === "inactive") return;
  state.mediaRecorder.requestData?.();
  window.setTimeout(() => {
    finalizeUserAudioSegment();
  }, 260);
}

function finalizeUserAudioSegment() {
  state.isCapturingUserAudio = false;
  if (state.lastUserAudioUrl || !state.currentAudioChunks.length) return state.lastUserAudioUrl;
  const blob = new Blob(state.currentAudioChunks, { type: state.lastUserAudioMime || "audio/webm" });
  if (!blob.size) return "";
  state.lastUserAudioUrl = URL.createObjectURL(blob);
  state.audioObjectUrls.push(state.lastUserAudioUrl);
  return state.lastUserAudioUrl;
}

function consumeLastUserAudioUrl() {
  return finalizeUserAudioSegment();
}

function discardLastUserAudioSegment() {
  state.isCapturingUserAudio = false;
  if (state.lastUserAudioUrl) {
    URL.revokeObjectURL(state.lastUserAudioUrl);
    state.audioObjectUrls = state.audioObjectUrls.filter((url) => url !== state.lastUserAudioUrl);
  }
  state.currentAudioChunks = [];
  state.lastUserAudioUrl = "";
}

function revokeAnswerAudioUrls() {
  state.audioObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  state.audioObjectUrls = [];
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
els.practiceModeOptions.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-mode]");
  if (!button) return;
  setPracticeMode(button.dataset.mode);
});
els.restartBtn.addEventListener("click", () => {
  els.feedbackView.classList.add("hidden");
  els.interviewView.classList.remove("hidden");
  els.startBtn.disabled = false;
  els.startBtn.classList.remove("hidden");
  els.endBtn.classList.add("hidden");
  resetInterviewState();
  setStatus("Prêt pour l'entretien", "idle");
});
