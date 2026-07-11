const questions = window.EEF_QUESTIONS || [];

const $ = (id) => document.getElementById(id);
const els = {
  category: $("category"),
  emptyState: $("emptyState"),
  interviewState: $("interviewState"),
  feedbackState: $("feedbackState"),
  questionMask: $("questionMask"),
  questionText: $("questionText"),
  questionFr: $("questionFr"),
  questionZh: $("questionZh"),
  replayBtn: $("replayBtn"),
  toggleTextBtn: $("toggleTextBtn"),
  recordBtn: $("recordBtn"),
  recordLabel: $("recordLabel"),
  timer: $("timer"),
  answerBox: $("answerBox"),
  clearBtn: $("clearBtn"),
  sendBtn: $("sendBtn"),
  startBtn: $("startBtn"),
  finishBtn: $("finishBtn"),
  newRoundBtn: $("newRoundBtn"),
  status: $("status"),
  questionCount: $("questionCount"),
  turnCounter: $("turnCounter"),
};

let currentQuestion = null;
let currentFrenchQuestion = "";
let currentChineseQuestion = "";
let previousResponseId = null;
let turnCount = 0;
let mediaRecorder = null;
let audioChunks = [];
let recordingStartedAt = 0;
let timerInterval = null;
let activeAudio = null;
let textVisible = false;
let busy = false;

els.questionCount.textContent = questions.length;

function setStatus(text) {
  els.status.textContent = text;
}

function setBusy(value) {
  busy = value;
  [els.startBtn, els.sendBtn, els.finishBtn, els.replayBtn, els.toggleTextBtn, els.recordBtn]
    .forEach(btn => { if (btn) btn.disabled = value; });
}

function updateCounter() {
  els.turnCounter.textContent = `${turnCount} / 8`;
}

function showInterview() {
  els.emptyState.classList.add("hidden");
  els.feedbackState.classList.add("hidden");
  els.interviewState.classList.remove("hidden");
  els.startBtn.classList.add("hidden");
  els.finishBtn.classList.remove("hidden");
}

function showFeedback() {
  els.emptyState.classList.add("hidden");
  els.interviewState.classList.add("hidden");
  els.feedbackState.classList.remove("hidden");
  els.startBtn.classList.add("hidden");
  els.finishBtn.classList.add("hidden");
}

function showQuestion(fr, zh = "") {
  currentFrenchQuestion = fr;
  currentChineseQuestion = zh;
  els.questionFr.textContent = fr;
  els.questionZh.textContent = zh || "AI 追问：中文翻译不预先显示。";
  textVisible = false;
  els.questionMask.classList.remove("hidden");
  els.questionText.classList.add("hidden");
  els.toggleTextBtn.textContent = "文本";
}

function toggleText() {
  textVisible = !textVisible;
  els.questionMask.classList.toggle("hidden", textVisible);
  els.questionText.classList.toggle("hidden", !textVisible);
  els.toggleTextBtn.textContent = textVisible ? "隐藏文本" : "文本";
}

async function speak(text) {
  if (!text) return;
  if (activeAudio) {
    activeAudio.pause();
    activeAudio = null;
  }
  setStatus("正在生成并播放面签官语音…");
  try {
    const res = await fetch("/api/speech", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ text })
    });
    if (!res.ok) throw new Error(await res.text());
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    activeAudio = new Audio(url);
    activeAudio.onended = () => {
      URL.revokeObjectURL(url);
      setStatus("请用法语回答");
    };
    await activeAudio.play();
  } catch (err) {
    console.error(err);
    setStatus("AI 音频失败，已切换设备法语朗读");
    if ("speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "fr-FR";
      utterance.rate = 0.88;
      speechSynthesis.cancel();
      speechSynthesis.speak(utterance);
    }
  }
}

async function startInterview() {
  if (!questions.length || busy) return;
  setBusy(true);
  try {
    previousResponseId = null;
    turnCount = 1;
    updateCounter();
    els.answerBox.value = "";
    currentQuestion = questions[Math.floor(Math.random() * questions.length)];
    els.category.textContent = currentQuestion.section;

    const res = await fetch("/api/interview", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        mode: "start",
        question: currentQuestion.fr,
        category: currentQuestion.section
      })
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();

    previousResponseId = data.responseId;
    showInterview();
    showQuestion(data.text || currentQuestion.fr, currentQuestion.zh);
    await speak(data.text || currentQuestion.fr);
  } catch (err) {
    console.error(err);
    setStatus("启动失败：" + friendlyError(err));
  } finally {
    setBusy(false);
  }
}

async function sendAnswer() {
  const answer = els.answerBox.value.trim();
  if (!answer || busy) {
    if (!answer) setStatus("请先录音或输入法语回答");
    return;
  }

  setBusy(true);
  setStatus("面签官正在根据你的回答继续追问…");
  try {
    const res = await fetch("/api/interview", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        mode: "reply",
        answer,
        previousResponseId
      })
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();

    previousResponseId = data.responseId;
    turnCount += 1;
    updateCounter();
    els.answerBox.value = "";
    showQuestion(data.text, "");
    await speak(data.text);

    if (turnCount >= 8) {
      setStatus("已完成 8 轮。可以继续回答，也可以结束并生成复盘。");
    }
  } catch (err) {
    console.error(err);
    setStatus("追问失败：" + friendlyError(err));
  } finally {
    setBusy(false);
  }
}

async function finishInterview() {
  if (!previousResponseId || busy) return;
  setBusy(true);
  setStatus("正在生成本轮中文复盘…");
  try {
    const res = await fetch("/api/interview", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        mode: "feedback",
        previousResponseId
      })
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();

    els.feedbackContent.textContent = data.text;
    showFeedback();
    setStatus("复盘完成");
  } catch (err) {
    console.error(err);
    setStatus("复盘失败：" + friendlyError(err));
  } finally {
    setBusy(false);
  }
}

function friendlyError(err) {
  const t = String(err?.message || err || "未知错误");
  if (t.includes("OPENAI_API_KEY")) return "Vercel 尚未配置 OPENAI_API_KEY";
  return t.slice(0, 180);
}

async function startRecording() {
  if (busy) return;
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    setStatus("当前浏览器不支持网页录音，请直接输入法语回答");
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    const preferred = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "";
    mediaRecorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) audioChunks.push(event.data);
    };

    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(track => track.stop());
      clearInterval(timerInterval);
      els.recordBtn.classList.remove("recording");
      els.recordLabel.textContent = "开始录音";
      els.timer.textContent = "00:00";

      const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType || "audio/webm" });
      await transcribe(blob);
    };

    mediaRecorder.start();
    recordingStartedAt = Date.now();
    els.recordBtn.classList.add("recording");
    els.recordLabel.textContent = "停止并转写";
    setStatus("正在录音…");

    timerInterval = setInterval(() => {
      const seconds = Math.floor((Date.now() - recordingStartedAt) / 1000);
      const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
      const ss = String(seconds % 60).padStart(2, "0");
      els.timer.textContent = `${mm}:${ss}`;
    }, 250);
  } catch (err) {
    console.error(err);
    setStatus("无法使用麦克风。请检查浏览器权限，或直接输入回答。");
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
  }
}

async function transcribe(blob) {
  setBusy(true);
  setStatus("正在识别你的法语回答…");
  try {
    const base64 = await blobToBase64(blob);
    const res = await fetch("/api/transcribe", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        audioBase64: base64,
        mimeType: blob.type || "audio/webm"
      })
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    els.answerBox.value = data.text || "";
    setStatus("转写完成。可修改文本后提交。");
  } catch (err) {
    console.error(err);
    setStatus("语音转写失败：" + friendlyError(err));
  } finally {
    setBusy(false);
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onloadend = () => {
      const result = String(reader.result);
      resolve(result.split(",")[1]);
    };
    reader.readAsDataURL(blob);
  });
}

els.startBtn.addEventListener("click", startInterview);
els.replayBtn.addEventListener("click", () => speak(currentFrenchQuestion));
els.toggleTextBtn.addEventListener("click", toggleText);
els.recordBtn.addEventListener("click", () => {
  if (mediaRecorder?.state === "recording") stopRecording();
  else startRecording();
});
els.clearBtn.addEventListener("click", () => { els.answerBox.value = ""; });
els.sendBtn.addEventListener("click", sendAnswer);
els.finishBtn.addEventListener("click", finishInterview);
els.newRoundBtn.addEventListener("click", () => {
  els.feedbackContent.textContent = "";
  els.feedbackState.classList.add("hidden");
  els.emptyState.classList.remove("hidden");
  els.startBtn.classList.remove("hidden");
  els.finishBtn.classList.add("hidden");
  els.category.textContent = "等待开始";
  previousResponseId = null;
  turnCount = 0;
  updateCounter();
  setStatus(`题库共 ${questions.length} 题`);
});
