const STORAGE_KEY = "tangoAppData_v1";
const DAY_MS = 24 * 60 * 60 * 1000;

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    const data = JSON.parse(raw);
    data.cards.forEach((c) => {
      if (c.known === undefined) c.known = (c.box || 1) >= 5;
      delete c.box;
    });
    // 読み上げ言語は以前デッキ単位で持っていなかったため、既存デッキには
    // カード内容から一度だけ推測して補完する（英単語が1つでもあれば英語、
    // なければオフ＝古典単語デッキなどを誤って読み上げないようにする）。
    data.decks.forEach((deck) => {
      if (deck.lang === undefined) {
        const deckCards = data.cards.filter((c) => c.deckId === deck.id);
        deck.lang = deckCards.some((c) => isEnglishText(c.front)) ? "en" : "off";
      }
    });
    return data;
  }
  const data = {
    decks: [
      { id: uid(), name: "英単語", lang: "en" },
    ],
    cards: [],
    stats: { streak: 0, lastReviewDate: null, dailyLearnedCounts: {}, stampedDates: [] },
  };
  saveData(data);
  return data;
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function isEnglishText(text) {
  return /[a-zA-Z]/.test(text) && !/[぀-ヿ㐀-鿿＀-￯]/.test(text);
}

// 日本語の文字（ひらがな・カタカナ・漢字・全角記号）を取り除き、
// 残った英語部分だけを返す（例文に日本語訳が混ざっている場合に使用）
function extractEnglish(text) {
  return text.replace(/[　-〿぀-ヿ㐀-鿿＀-￯]+/g, " ").replace(/\s+/g, " ").trim();
}

// デッキの読み上げ言語（deckLang）に対応する文字がtextに含まれているか。
// 「英語」設定でも英字がなければ読み上げボタンを出さない、
// 「中国語」設定でも漢字がなければ出さない、という判定に使う。
// 中国語と日本語の漢字は区別できないため、ここでは「その言語で読める
// 文字が入っているか」だけを見る（デッキの言語自体は自動判定しない）。
function hasSpeechText(text, deckLang) {
  if (!text || deckLang === "off") return false;
  if (deckLang === "zh") return /[㐀-鿿]/.test(text);
  return /[a-zA-Z]/.test(text);
}

// ---------- モーダルダイアログ ----------
const modalOverlay = document.getElementById("modalOverlay");
const modalMessage = document.getElementById("modalMessage");
const modalInput = document.getElementById("modalInput");
const modalCancelBtn = document.getElementById("modalCancelBtn");
const modalOkBtn = document.getElementById("modalOkBtn");

function showModal({ message, type = "alert", defaultValue = "" }) {
  return new Promise((resolve) => {
    modalMessage.textContent = message;
    modalInput.classList.toggle("hidden", type !== "prompt");
    modalInput.value = defaultValue;
    modalCancelBtn.classList.toggle("hidden", type === "alert");
    modalOverlay.classList.remove("hidden");
    if (type === "prompt") setTimeout(() => modalInput.focus(), 50);

    function cleanup(result) {
      modalOverlay.classList.add("hidden");
      modalOkBtn.removeEventListener("click", onOk);
      modalCancelBtn.removeEventListener("click", onCancel);
      modalInput.removeEventListener("keydown", onKeydown);
      resolve(result);
    }
    function onOk() {
      cleanup(type === "prompt" ? modalInput.value.trim() || null : true);
    }
    function onCancel() {
      cleanup(type === "prompt" ? null : false);
    }
    function onKeydown(e) {
      if (e.key === "Enter") onOk();
    }

    modalOkBtn.addEventListener("click", onOk);
    modalCancelBtn.addEventListener("click", onCancel);
    modalInput.addEventListener("keydown", onKeydown);
  });
}

function showAlert(message) {
  return showModal({ message, type: "alert" });
}
function showConfirm(message) {
  return showModal({ message, type: "confirm" });
}
function showPrompt(message, defaultValue) {
  return showModal({ message, type: "prompt", defaultValue });
}

let state = loadData();
backfillStampedDatesForStreak();
stampToday();
let ui = {
  currentDeckId: null,
  reviewQueue: [],
  reviewIndex: 0,
  flipped: false,
  editingCardId: null,
  reviewMode: "due",
  listSearch: "",
  listFilter: "all",
  listSort: "added",
  photoTarget: "front",
  quizMode: "card",
  blankUnavailable: false,
  calendarYear: null,
  calendarMonth: null,
};

// ---------- ナビゲーション ----------
const screens = document.querySelectorAll(".screen");
const backBtn = document.getElementById("backBtn");
const topTitle = document.getElementById("topTitle");
const bottombar = document.querySelector(".bottombar");
let navStack = [];

function showScreen(name, opts = {}) {
  screens.forEach((s) => s.classList.remove("active", "fade-in"));
  const target = document.getElementById("screen-" + name);
  target.classList.add("active");
  void target.offsetWidth;
  target.classList.add("fade-in");
  topTitle.textContent = opts.title || "単語帳";
  backBtn.classList.toggle("hidden", !opts.back);
  bottombar.classList.toggle("hidden", name === "review");
  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.nav === name);
  });
  if (!opts.silent) navStack.push({ name, opts });
}

function goBack() {
  // 単語追加フォームからの写真読み取り中に中断した場合、フォームの未保存入力を
  // 消さずに戻す（通常の navigate("add", ...) は renderAddForm でフォームをリセットしてしまう）
  if (document.getElementById("screen-photo").classList.contains("active")) {
    resetPhotoState();
    returnToAddScreen();
    return;
  }
  navStack.pop();
  const prev = navStack.pop();
  if (prev) navigate(prev.name, prev.opts);
  else navigate("home");
}

function navigate(name, opts = {}) {
  const leavingPhoto = document.getElementById("screen-photo").classList.contains("active");
  if (leavingPhoto && name !== "photo") resetPhotoState();
  if (name === "home") renderHome();
  if (name === "deck") renderDeck();
  if (name === "review") startReview();
  if (name === "list") renderList();
  if (name === "add") renderAddForm();
  if (name === "photo") showPhotoStep("pick");
  if (name === "stats") renderStats();
  if (name === "settings") updateThemeToggleUI();
  showScreen(name, opts);
}

backBtn.addEventListener("click", goBack);
document.querySelectorAll(".nav-btn").forEach((b) => {
  b.addEventListener("click", () => {
    navStack = [];
    navigate(b.dataset.nav);
  });
});

// ---------- ホーム ----------
function pendingCount(deckId) {
  return state.cards.filter((c) => c.deckId === deckId && !c.known).length;
}

let deckReorderMode = false;
const deckReorderBtn = document.getElementById("deckReorderBtn");

function renderHome() {
  renderGoalBlock();
  const list = document.getElementById("deckList");
  list.innerHTML = "";
  deckReorderBtn.classList.toggle("hidden", state.decks.length < 2);
  if (state.decks.length === 0) {
    list.innerHTML = '<p class="empty-msg">デッキがありません。<br>「＋ 新しいデッキ」から作成しましょう。</p>';
    return;
  }
  state.decks.forEach((deck, index) => {
    const total = state.cards.filter((c) => c.deckId === deck.id).length;
    const pending = pendingCount(deck.id);
    const row = document.createElement("div");
    row.className = "deck-row" + (deckReorderMode ? " reorder-mode" : "");
    if (deckReorderMode) {
      row.innerHTML = `
        <div class="deck-row-info">
          <span class="deck-name">${escapeHtml(deck.name)}</span>
          <span class="deck-count ${pending > 0 ? "due" : ""}">${total}語 ${pending > 0 ? `/ 未習得${pending}件` : ""}</span>
        </div>
        <div class="deck-reorder-btns">
          <button type="button" class="deck-reorder-btn" data-dir="up" ${index === 0 ? "disabled" : ""} aria-label="上へ移動">▲</button>
          <button type="button" class="deck-reorder-btn" data-dir="down" ${index === state.decks.length - 1 ? "disabled" : ""} aria-label="下へ移動">▼</button>
        </div>
      `;
      row.querySelectorAll(".deck-reorder-btn").forEach((btn) => {
        btn.addEventListener("click", () => moveDeck(deck.id, btn.dataset.dir));
      });
    } else {
      row.innerHTML = `
        <span class="deck-name">${escapeHtml(deck.name)}</span>
        <span class="deck-count ${pending > 0 ? "due" : ""}">${total}語 ${pending > 0 ? `/ 未習得${pending}件` : ""}</span>
      `;
      row.addEventListener("click", () => {
        ui.currentDeckId = deck.id;
        navigate("deck", { back: true });
      });
    }
    list.appendChild(row);
  });
}

function moveDeck(deckId, dir) {
  const idx = state.decks.findIndex((d) => d.id === deckId);
  if (idx === -1) return;
  const swapWith = dir === "up" ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= state.decks.length) return;
  [state.decks[idx], state.decks[swapWith]] = [state.decks[swapWith], state.decks[idx]];
  saveData(state);
  renderHome();
}

deckReorderBtn.addEventListener("click", () => {
  deckReorderMode = !deckReorderMode;
  deckReorderBtn.textContent = deckReorderMode ? "完了" : "並び替え";
  renderHome();
});

document.getElementById("newDeckBtn").addEventListener("click", async () => {
  const name = await showPrompt("デッキ名を入力してください");
  if (!name) return;
  state.decks.push({ id: uid(), name, lang: "en" });
  saveData(state);
  renderHome();
});

// ---------- 今日の目標 ----------
function currentDailyGoal() {
  return localStorage.getItem("dailyGoal") || "10";
}

// 指定した日（jstDateString形式）に新しく覚えた語数を返す
function learnedCountOn(dateStr) {
  return (state.stats.dailyLearnedCounts && state.stats.dailyLearnedCounts[dateStr]) || 0;
}

function todayReviewCount() {
  return learnedCountOn(jstDateString(Date.now()));
}

function renderGoalBlock() {
  const goalBlock = document.getElementById("goalBlock");
  const goal = currentDailyGoal();
  if (goal === "off") {
    goalBlock.classList.add("hidden");
    return;
  }
  const goalNum = parseInt(goal, 10);
  const count = todayReviewCount();
  const percent = goalNum > 0 ? Math.min(100, Math.round((count / goalNum) * 100)) : 0;
  document.getElementById("goalFill").style.width = percent + "%";
  document.getElementById("goalCount").textContent =
    count >= goalNum ? `${count} / ${goalNum}語 達成` : `${count} / ${goalNum}語`;
  goalBlock.classList.remove("hidden");
}

const dailyGoalBtns = document.querySelectorAll("[data-goal]");

function updateDailyGoalUI() {
  const goal = currentDailyGoal();
  dailyGoalBtns.forEach((btn) => btn.classList.toggle("active", btn.dataset.goal === goal));
}

dailyGoalBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    localStorage.setItem("dailyGoal", btn.dataset.goal);
    updateDailyGoalUI();
    renderGoalBlock();
  });
});

updateDailyGoalUI();

// ---------- デッキ画面 ----------
function currentDeck() {
  return state.decks.find((d) => d.id === ui.currentDeckId);
}

function renderDeck() {
  const deck = currentDeck();
  document.getElementById("deckTitle").textContent = deck.name;
  const total = state.cards.filter((c) => c.deckId === deck.id).length;
  const pending = pendingCount(deck.id);
  document.getElementById("deckDue").textContent = `全${total}語 ・ 未習得 ${pending}件`;
  topTitle.textContent = deck.name;
  updateLangSelectUI();
}

const quizModeBtns = document.querySelectorAll(".quiz-mode-btn");
quizModeBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    ui.quizMode = btn.dataset.mode;
    quizModeBtns.forEach((b) => b.classList.toggle("active", b === btn));
  });
});

// 読み上げ言語（デッキ単位で明示的に指定する。自動判定はしない）
const langSelectBtns = document.querySelectorAll(".lang-select-btn");

function updateLangSelectUI() {
  const deck = currentDeck();
  langSelectBtns.forEach((btn) => btn.classList.toggle("active", btn.dataset.lang === deck.lang));
}

langSelectBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const deck = currentDeck();
    deck.lang = btn.dataset.lang;
    saveData(state);
    updateLangSelectUI();
  });
});

// deck.lang（"en" | "zh"）をWeb Speech APIのlangコードに変換
function ttsLangCode(deckLang) {
  return deckLang === "zh" ? "zh-CN" : "en-US";
}

document.getElementById("startReviewBtn").addEventListener("click", () => {
  ui.reviewMode = "due";
  navigate("review", { back: true, title: currentDeck().name });
});
document.getElementById("reviewAllBtn").addEventListener("click", () => {
  ui.reviewMode = "all";
  navigate("review", { back: true, title: currentDeck().name });
});
document.getElementById("viewListBtn").addEventListener("click", () => navigate("list", { back: true, title: "単語一覧" }));
document.getElementById("renameDeckBtn").addEventListener("click", async () => {
  const deck = currentDeck();
  const name = await showPrompt("新しいデッキ名を入力してください", deck.name);
  if (!name) return;
  deck.name = name;
  saveData(state);
  renderDeck();
});
document.getElementById("deleteDeckBtn").addEventListener("click", async () => {
  const deck = currentDeck();
  const ok = await showConfirm(`「${deck.name}」を削除しますか？\n中の単語もすべて削除されます。`);
  if (!ok) return;
  state.decks = state.decks.filter((d) => d.id !== deck.id);
  state.cards = state.cards.filter((c) => c.deckId !== deck.id);
  saveData(state);
  navStack = [];
  navigate("home");
});

// ---------- 復習画面 ----------
const cardStage = document.getElementById("reviewCard");
const cardInner = document.getElementById("cardInner");
const cardFront = document.getElementById("cardFront");
const cardBackMeaning = document.getElementById("cardBackMeaning");
const cardBackExample = document.getElementById("cardBackExample");
const speakBtn = document.getElementById("speakBtn");
const exampleSpeakBtn = document.getElementById("exampleSpeakBtn");
const reviewButtons = document.getElementById("reviewButtons");
const reviewDone = document.getElementById("reviewDone");
const reviewProgress = document.getElementById("reviewProgress");
const reviewHint = document.getElementById("reviewHint");

function updateReviewHint() {
  reviewHint.textContent = ui.flipped ? "タップで裏返す / 左右にスワイプ" : "タップで裏返す";
}

// 例文中の単語部分を空欄にする（見つからなければ null）
function makeBlank(example, front) {
  const idx = example.toLowerCase().indexOf(front.toLowerCase());
  if (idx === -1) return null;
  return example.slice(0, idx) + "_____" + example.slice(idx + front.length);
}

function startReview() {
  const deckId = ui.currentDeckId;
  const base = state.cards.filter((c) => c.deckId === deckId && (ui.reviewMode === "all" || !c.known));
  let pool = base;
  ui.blankUnavailable = false;
  ui.listeningUnavailable = false;
  if (ui.quizMode === "blank") {
    pool = base.filter((c) => c.example && makeBlank(c.example, c.front));
    ui.blankUnavailable = base.length > 0 && pool.length === 0;
  }
  if (ui.quizMode === "listening") {
    const deckLang = currentDeck().lang;
    pool = base.filter((c) => hasSpeechText(c.front, deckLang));
    ui.listeningUnavailable = base.length > 0 && pool.length === 0;
  }
  ui.reviewQueue = [...pool].sort(() => Math.random() - 0.5);
  ui.reviewIndex = 0;
  reviewDone.classList.add("hidden");
  showCurrentCard();
}

function showCurrentCard() {
  const isQuiz = ui.quizMode === "typing" || ui.quizMode === "blank" || ui.quizMode === "listening";
  const cardStageEl = document.getElementById("cardStage");
  const quizStageEl = document.getElementById("quizStage");

  cardStage.style.transform = "";
  cardStage.style.transition = "";
  ui.flipped = false;
  cardInner.style.transition = "none";
  cardInner.classList.remove("flipped");
  void cardInner.offsetHeight;
  cardInner.style.transition = "";
  reviewButtons.classList.add("answer-hidden");

  if (ui.reviewIndex >= ui.reviewQueue.length) {
    cardStageEl.classList.add("hidden");
    reviewHint.classList.add("hidden");
    reviewButtons.classList.add("hidden");
    quizStageEl.classList.add("hidden");
    reviewProgress.textContent = "";
    document.getElementById("reviewDoneText").textContent = ui.blankUnavailable
      ? "穴埋めに使える例文の単語がありません。他の出題形式をお試しください。"
      : ui.listeningUnavailable
      ? currentDeck().lang === "off"
        ? "このデッキには読み上げ言語が設定されていません。デッキ画面で読み上げ言語を選んでください。"
        : "リスニングに使える単語がありません。デッキの読み上げ言語と単語の表記が合っているか確認してください。"
      : ui.reviewMode === "all"
      ? "デッキに単語がありません。"
      : "覚えていない単語はありません。";
    reviewDone.classList.remove("hidden");
    return;
  }

  const card = ui.reviewQueue[ui.reviewIndex];
  reviewProgress.textContent = `${ui.reviewIndex + 1} / ${ui.reviewQueue.length}`;

  if (isQuiz) {
    cardStageEl.classList.add("hidden");
    reviewHint.classList.add("hidden");
    reviewButtons.classList.add("hidden");
    quizStageEl.classList.remove("hidden");
    setupQuizCard(card);
    return;
  }

  quizStageEl.classList.add("hidden");
  cardStageEl.classList.remove("hidden");
  reviewHint.classList.remove("hidden");
  reviewButtons.classList.remove("hidden");
  updateReviewHint();

  cardFront.textContent = card.front;
  cardBackMeaning.textContent = card.back;
  cardBackExample.textContent = card.example || "";
  cardBackExample.classList.toggle("hidden", !card.example);
  const deckLang = currentDeck().lang;
  speakBtn.classList.toggle("hidden", !hasSpeechText(card.front, deckLang));
  exampleSpeakBtn.classList.toggle("hidden", !hasSpeechText(exampleSpeechText(card, deckLang), deckLang));
}

// 例文のうち読み上げる部分を取り出す。英語デッキは日本語訳が混ざっている
// ことがあるため英語部分だけを抽出し、それ以外の言語は例文全体をそのまま読む。
function exampleSpeechText(card, deckLang) {
  if (!card.example) return "";
  return deckLang === "en" ? extractEnglish(card.example) : card.example;
}

function setupQuizCard(card) {
  const quizPrompt = document.getElementById("quizPrompt");
  const quizPlayBtn = document.getElementById("quizPlayBtn");
  const quizInput = document.getElementById("quizInput");
  const quizChoices = document.getElementById("quizChoices");
  const quizFeedback = document.getElementById("quizFeedback");
  const quizCheckBtn = document.getElementById("quizCheckBtn");
  const quizNextBtn = document.getElementById("quizNextBtn");

  quizFeedback.classList.add("hidden");
  quizNextBtn.classList.add("hidden");

  const isListening = ui.quizMode === "listening";
  quizPrompt.classList.toggle("hidden", isListening);
  quizPlayBtn.classList.toggle("hidden", !isListening);
  quizInput.classList.toggle("hidden", isListening);
  quizChoices.classList.toggle("hidden", !isListening);
  quizCheckBtn.classList.toggle("hidden", isListening);

  if (isListening) {
    setupListeningChoices(card);
    speakText(card.front, ttsLangCode(currentDeck().lang));
    return;
  }

  quizPrompt.textContent = ui.quizMode === "blank" ? makeBlank(card.example, card.front) : card.back;
  quizInput.value = "";
  quizInput.disabled = false;
  quizCheckBtn.classList.remove("hidden");
  setTimeout(() => quizInput.focus(), 50);
}

function setupListeningChoices(card) {
  const quizChoices = document.getElementById("quizChoices");
  quizChoices.classList.remove("answered");
  quizChoices.innerHTML = "";

  const others = state.cards.filter((c) => c.deckId === card.deckId && c.id !== card.id);
  const distractorPool = [...new Set(others.map((c) => c.back))].filter((b) => b !== card.back);
  const distractors = distractorPool.sort(() => Math.random() - 0.5).slice(0, 3);
  const choices = [card.back, ...distractors].sort(() => Math.random() - 0.5);

  choices.forEach((choiceText) => {
    const btn = document.createElement("button");
    btn.className = "quiz-choice-btn";
    btn.textContent = choiceText;
    btn.addEventListener("click", () => selectListeningChoice(btn, choiceText, card));
    quizChoices.appendChild(btn);
  });
}

function selectListeningChoice(btn, choiceText, card) {
  const quizChoices = document.getElementById("quizChoices");
  if (quizChoices.classList.contains("answered")) return;
  quizChoices.classList.add("answered");

  const correct = choiceText === card.back;
  const wasKnown = card.known;
  card.known = correct;
  recordReviewToday(goalDelta(wasKnown, card.known));
  saveData(state);

  Array.from(quizChoices.children).forEach((b) => {
    b.disabled = true;
    if (b.textContent === card.back) b.classList.add("correct");
  });
  if (!correct) btn.classList.add("incorrect");

  const quizFeedback = document.getElementById("quizFeedback");
  quizFeedback.textContent = correct ? "○ 正解" : `× 正しくは: ${card.back}`;
  quizFeedback.classList.remove("hidden");
  document.getElementById("quizNextBtn").classList.remove("hidden");
}

function checkQuizAnswer() {
  const card = ui.reviewQueue[ui.reviewIndex];
  if (!card) return;
  const quizInput = document.getElementById("quizInput");
  const quizFeedback = document.getElementById("quizFeedback");
  const answer = quizInput.value.trim();
  const correct = answer.length > 0 && answer.toLowerCase() === card.front.toLowerCase();
  const wasKnown = card.known;
  card.known = correct;
  recordReviewToday(goalDelta(wasKnown, card.known));
  saveData(state);

  quizFeedback.textContent = correct ? "○ 正解" : `× 正しくは: ${card.front}`;
  quizFeedback.classList.remove("hidden");
  quizInput.disabled = true;
  document.getElementById("quizCheckBtn").classList.add("hidden");
  document.getElementById("quizNextBtn").classList.remove("hidden");
}

document.getElementById("quizCheckBtn").addEventListener("click", checkQuizAnswer);
document.getElementById("quizNextBtn").addEventListener("click", () => {
  ui.reviewIndex++;
  showCurrentCard();
});
document.getElementById("quizInput").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const checkBtn = document.getElementById("quizCheckBtn");
  if (!checkBtn.classList.contains("hidden")) checkBtn.click();
  else document.getElementById("quizNextBtn").click();
});

document.getElementById("reviewDoneBackBtn").addEventListener("click", () => goBack());

cardStage.addEventListener("click", (e) => {
  if (speakBtn.contains(e.target) || exampleSpeakBtn.contains(e.target)) return;
  ui.flipped = !ui.flipped;
  cardInner.classList.toggle("flipped", ui.flipped);
  reviewButtons.classList.toggle("answer-hidden", !ui.flipped);
  updateReviewHint();
});

function speakText(text, lang) {
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang;
  utter.rate = currentSpeechRate();
  speechSynthesis.cancel();
  speechSynthesis.speak(utter);
}

speakBtn.addEventListener("click", () => {
  const card = ui.reviewQueue[ui.reviewIndex];
  if (!card) return;
  speakText(card.front, ttsLangCode(currentDeck().lang));
});

exampleSpeakBtn.addEventListener("click", () => {
  const card = ui.reviewQueue[ui.reviewIndex];
  if (!card || !card.example) return;
  const deckLang = currentDeck().lang;
  const text = exampleSpeechText(card, deckLang);
  if (!text) return;
  speakText(text, ttsLangCode(deckLang));
});

document.getElementById("quizPlayBtn").addEventListener("click", () => {
  const card = ui.reviewQueue[ui.reviewIndex];
  if (!card) return;
  speakText(card.front, ttsLangCode(currentDeck().lang));
});

function answerCard(correct) {
  const card = ui.reviewQueue[ui.reviewIndex];
  const wasKnown = card.known;
  card.known = correct;
  recordReviewToday(goalDelta(wasKnown, card.known));
  saveData(state);
  ui.reviewIndex++;
  showCurrentCard();
}

document.getElementById("stillBtn").addEventListener("click", () => answerCard(false));
document.getElementById("knowBtn").addEventListener("click", () => answerCard(true));

// スワイプ操作
let dragStartX = null;
cardStage.addEventListener("touchstart", (e) => {
  if (!ui.flipped) return;
  dragStartX = e.touches[0].clientX;
}, { passive: true });

cardStage.addEventListener("touchmove", (e) => {
  if (dragStartX === null) return;
  const dx = e.touches[0].clientX - dragStartX;
  cardStage.style.transition = "none";
  cardStage.style.transform = `translateX(${dx}px) rotate(${dx / 20}deg)`;
}, { passive: true });

cardStage.addEventListener("touchend", (e) => {
  if (dragStartX === null) return;
  const dx = e.changedTouches[0].clientX - dragStartX;
  dragStartX = null;
  cardStage.style.transition = "transform 0.2s";
  if (dx > 80) {
    cardStage.style.transform = "translateX(400px) rotate(20deg)";
    setTimeout(() => answerCard(true), 150);
  } else if (dx < -80) {
    cardStage.style.transform = "translateX(-400px) rotate(-20deg)";
    setTimeout(() => answerCard(false), 150);
  } else {
    cardStage.style.transform = "";
  }
});

function jstDateString(timestamp) {
  const jst = new Date(timestamp + 9 * 60 * 60 * 1000);
  return `${jst.getUTCFullYear()}-${jst.getUTCMonth() + 1}-${jst.getUTCDate()}`;
}

// その日はじめてアプリを開いたときに、統計カレンダーへハンコを押す
function stampToday() {
  const today = jstDateString(Date.now());
  if (!state.stats.stampedDates) state.stats.stampedDates = [];
  if (!state.stats.stampedDates.includes(today)) {
    state.stats.stampedDates.push(today);
    saveData(state);
  }
}

// カレンダーのハンコ機能より前から連続日数（streak）を積み上げていたユーザーは、
// stampedDatesにその期間の記録がなく「総学習日数 < 連続日数」という不自然な状態になる。
// streak分の日付をlastReviewDateから遡って補完し、矛盾しないようにする。
function backfillStampedDatesForStreak() {
  const { streak, lastReviewDate } = state.stats;
  if (!streak || !lastReviewDate) return;
  if (!state.stats.stampedDates) state.stats.stampedDates = [];
  const stamped = new Set(state.stats.stampedDates);
  const parts = lastReviewDate.split("-").map(Number);
  let cursor = Date.UTC(parts[0], parts[1] - 1, parts[2]);
  let changed = false;
  for (let i = 0; i < streak; i++) {
    const d = new Date(cursor);
    const dateStr = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
    if (!stamped.has(dateStr)) {
      stamped.add(dateStr);
      changed = true;
    }
    cursor -= DAY_MS;
  }
  if (changed) {
    state.stats.stampedDates = Array.from(stamped);
    saveData(state);
  }
}

// wasKnown/nowKnown: 回答前後の「覚えた」状態から今日の目標への増減を求める。
// 未習得→覚えた で+1、覚えた→未習得（元に戻した）で-1、それ以外は0。
function goalDelta(wasKnown, nowKnown) {
  if (!wasKnown && nowKnown) return 1;
  if (wasKnown && !nowKnown) return -1;
  return 0;
}

// 今日の学習語数を増減する（0未満にはしない）。日付ごとに記録しておき、
// 「今日の目標」とカレンダーの日別詳細の両方から参照する。
// 復習画面だけでなく、単語編集画面でステータスを直接切り替えた場合にも呼ぶ。
function applyGoalDelta(delta) {
  if (!delta) return;
  const today = jstDateString(Date.now());
  if (!state.stats.dailyLearnedCounts) state.stats.dailyLearnedCounts = {};
  const current = state.stats.dailyLearnedCounts[today] || 0;
  state.stats.dailyLearnedCounts[today] = Math.max(0, current + delta);
}

// 今日の目標は「今日新しく覚えた語数」を数えるためのもの。
// 総復習ですでに覚えている単語を再確認しただけの場合は増減しないが、
// 「覚えた」から「まだ」に戻した場合は達成数からも減らす。
// あわせて復習した日として連続日数（ストリーク）も更新する。
function recordReviewToday(delta) {
  applyGoalDelta(delta);

  const today = jstDateString(Date.now());
  if (state.stats.lastReviewDate === today) return;
  const yesterday = jstDateString(Date.now() - DAY_MS);
  if (state.stats.lastReviewDate === yesterday) {
    state.stats.streak++;
  } else {
    state.stats.streak = 1;
  }
  state.stats.lastReviewDate = today;
}

// ---------- 単語一覧 ----------
document.getElementById("addCardBtn").addEventListener("click", () => {
  ui.editingCardId = null;
  navigate("add", { back: true, title: "単語を追加" });
});
const listSearchInput = document.getElementById("listSearch");
const filterBtns = document.querySelectorAll(".filter-btn");
const sortBtns = document.querySelectorAll(".sort-btn");

listSearchInput.addEventListener("input", () => {
  ui.listSearch = listSearchInput.value;
  renderList();
});

filterBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    ui.listFilter = btn.dataset.filter;
    filterBtns.forEach((b) => b.classList.toggle("active", b === btn));
    renderList();
  });
});

sortBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    ui.listSort = btn.dataset.sort;
    sortBtns.forEach((b) => b.classList.toggle("active", b === btn));
    renderList();
  });
});

function renderList() {
  const deck = currentDeck();
  const container = document.getElementById("cardTable");
  listSearchInput.value = ui.listSearch;
  filterBtns.forEach((b) => b.classList.toggle("active", b.dataset.filter === ui.listFilter));
  sortBtns.forEach((b) => b.classList.toggle("active", b.dataset.sort === ui.listSort));

  const allCards = state.cards.filter((c) => c.deckId === deck.id);
  let cards = allCards;
  if (ui.listFilter === "known") cards = cards.filter((c) => c.known);
  if (ui.listFilter === "unknown") cards = cards.filter((c) => !c.known);
  const query = ui.listSearch.trim().toLowerCase();
  if (query) {
    cards = cards.filter(
      (c) => c.front.toLowerCase().includes(query) || c.back.toLowerCase().includes(query)
    );
  }
  if (ui.listSort === "alpha") {
    cards = [...cards].sort((a, b) => a.front.localeCompare(b.front));
  }

  container.innerHTML = "";
  if (cards.length === 0) {
    container.innerHTML =
      allCards.length === 0
        ? '<p class="empty-msg">まだ単語がありません。<br>「＋ 単語を追加」で登録しましょう。</p>'
        : '<p class="empty-msg">該当する単語が見つかりません。</p>';
    return;
  }
  cards.forEach((card) => {
    const row = document.createElement("div");
    row.className = "card-item";
    row.innerHTML = `
      <div class="card-item-delete-bg">
        <button class="card-item-delete-btn">削除</button>
      </div>
      <div class="card-item-inner">
        <div class="card-info">
          <div class="card-front-text">${escapeHtml(card.front)}</div>
          <div class="card-back-text">${escapeHtml(card.back)}</div>
        </div>
        <button class="edit-icon-btn" aria-label="編集">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 16.5V20h3.5L18.5 9 15 5.5 4 16.5z" />
            <path d="M13.5 7 17 10.5" />
          </svg>
        </button>
      </div>
    `;
    const inner = row.querySelector(".card-item-inner");
    inner.querySelector(".edit-icon-btn").addEventListener("click", () => {
      ui.editingCardId = card.id;
      navigate("add", { back: true, title: "単語を編集" });
    });
    row.querySelector(".card-item-delete-btn").addEventListener("click", async () => {
      const ok = await showConfirm(`「${card.front}」を削除しますか？`);
      if (!ok) return;
      state.cards = state.cards.filter((c) => c.id !== card.id);
      saveData(state);
      renderList();
    });
    attachSwipeToDelete(inner);
    container.appendChild(row);
  });
}

function attachSwipeToDelete(inner) {
  const REVEAL = 84;
  const AXIS_LOCK = 8; // px of movement before deciding swipe vs scroll
  let startX = null;
  let startY = null;
  let dragging = false;
  let axis = null; // "x" (horizontal swipe) | "y" (vertical scroll) | null (undecided)

  inner.addEventListener("pointerdown", (e) => {
    startX = e.clientX;
    startY = e.clientY;
    dragging = true;
    axis = null;
    inner.style.transition = "none";
  });
  inner.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dxRaw = e.clientX - startX;
    const dyRaw = e.clientY - startY;

    if (axis === null) {
      if (Math.abs(dxRaw) < AXIS_LOCK && Math.abs(dyRaw) < AXIS_LOCK) return;
      axis = Math.abs(dxRaw) > Math.abs(dyRaw) ? "x" : "y";
      if (axis === "x") {
        inner.setPointerCapture(e.pointerId);
      } else {
        // 縦スクロールと判断。ブラウザの標準スクロールに任せる。
        dragging = false;
        inner.style.transition = "";
        return;
      }
    }
    if (axis !== "x") return;

    const base = inner.classList.contains("swiped") ? -REVEAL : 0;
    const dx = Math.max(-REVEAL, Math.min(0, base + dxRaw));
    inner.style.transform = `translateX(${dx}px)`;
  });
  function end(e) {
    if (!dragging || axis !== "x") {
      dragging = false;
      axis = null;
      return;
    }
    dragging = false;
    axis = null;
    inner.style.transition = "";
    inner.style.transform = "";
    const wasSwiped = inner.classList.contains("swiped");
    const dx = e.clientX - startX;
    const nowSwiped = wasSwiped ? dx <= -40 : dx < -40;
    if (nowSwiped) {
      document.querySelectorAll(".card-item-inner.swiped").forEach((el) => {
        if (el !== inner) el.classList.remove("swiped");
      });
    }
    inner.classList.toggle("swiped", nowSwiped);
  }
  inner.addEventListener("pointerup", end);
  inner.addEventListener("pointercancel", end);
}

// ---------- 追加/編集フォーム ----------
const cardForm = document.getElementById("cardForm");
const fieldFront = document.getElementById("fieldFront");
const fieldBack = document.getElementById("fieldBack");
const fieldExample = document.getElementById("fieldExample");
const statusToggleWrap = document.getElementById("statusToggleWrap");
const statusNotYetBtn = document.getElementById("statusNotYetBtn");
const statusKnownBtn = document.getElementById("statusKnownBtn");

document.getElementById("frontCameraBtn").addEventListener("click", () => {
  ui.photoTarget = "front";
  navigate("photo", { back: true, title: "写真から単語を読み取る" });
});
document.getElementById("exampleCameraBtn").addEventListener("click", () => {
  ui.photoTarget = "example";
  navigate("photo", { back: true, title: "写真から例文を読み取る" });
});

function updateStatusToggleUI(card) {
  statusNotYetBtn.classList.toggle("active", !card.known);
  statusKnownBtn.classList.toggle("active", card.known);
}

function renderAddForm() {
  if (ui.editingCardId) {
    const card = state.cards.find((c) => c.id === ui.editingCardId);
    fieldFront.value = card.front;
    fieldBack.value = card.back;
    fieldExample.value = card.example || "";
    statusToggleWrap.classList.remove("hidden");
    updateStatusToggleUI(card);
  } else {
    cardForm.reset();
    statusToggleWrap.classList.add("hidden");
  }
}

statusNotYetBtn.addEventListener("click", () => {
  const card = state.cards.find((c) => c.id === ui.editingCardId);
  const wasKnown = card.known;
  card.known = false;
  applyGoalDelta(goalDelta(wasKnown, card.known));
  saveData(state);
  updateStatusToggleUI(card);
});

statusKnownBtn.addEventListener("click", () => {
  const card = state.cards.find((c) => c.id === ui.editingCardId);
  const wasKnown = card.known;
  card.known = true;
  applyGoalDelta(goalDelta(wasKnown, card.known));
  saveData(state);
  updateStatusToggleUI(card);
});

cardForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const front = fieldFront.value.trim();
  const back = fieldBack.value.trim();
  const example = fieldExample.value.trim();
  if (!front || !back) return;

  if (!ui.editingCardId) {
    const dup = state.cards.find(
      (c) => c.deckId === ui.currentDeckId && c.front.toLowerCase() === front.toLowerCase()
    );
    if (dup) {
      const ok = await showConfirm(`「${front}」は既にこのデッキに登録されています。\nこのまま追加しますか？`);
      if (!ok) return;
    }
  }

  if (ui.editingCardId) {
    const card = state.cards.find((c) => c.id === ui.editingCardId);
    card.front = front;
    card.back = back;
    card.example = example;
  } else {
    state.cards.push({
      id: uid(),
      deckId: ui.currentDeckId,
      front,
      back,
      example,
      known: false,
      createdAt: Date.now(),
    });
  }
  saveData(state);
  ui.editingCardId = null;
  goBack();
});

// ---------- 写真から追加 ----------
const photoInput = document.getElementById("photoInput");
const photoImg = document.getElementById("photoImg");
const photoStage = document.getElementById("photoStage");
const selectionBox = document.getElementById("selectionBox");
const photoResultField = document.getElementById("photoResultField");
let currentPhotoUrl = null;
let photoDragStart = null;

function showPhotoStep(step) {
  document.getElementById("photoPick").classList.toggle("hidden", step !== "pick");
  document.getElementById("photoCrop").classList.toggle("hidden", step !== "crop");
  document.getElementById("photoResult").classList.toggle("hidden", step !== "result");
  document.getElementById("photoLoading").classList.toggle("hidden", step !== "loading");
}

function resetPhotoState() {
  if (currentPhotoUrl) {
    URL.revokeObjectURL(currentPhotoUrl);
    currentPhotoUrl = null;
  }
  photoImg.removeAttribute("src");
  photoInput.value = "";
  selectionBox.classList.add("hidden");
  photoResultField.value = "";
}

document.getElementById("photoTakeBtn").addEventListener("click", () => photoInput.click());

photoInput.addEventListener("change", () => {
  const file = photoInput.files[0];
  if (!file) return;
  if (currentPhotoUrl) URL.revokeObjectURL(currentPhotoUrl);
  currentPhotoUrl = URL.createObjectURL(file);
  photoImg.src = currentPhotoUrl;
  selectionBox.classList.add("hidden");
  showPhotoStep("crop");
});

function positionSelectionBox(left, top, width, height) {
  selectionBox.style.left = left + "px";
  selectionBox.style.top = top + "px";
  selectionBox.style.width = width + "px";
  selectionBox.style.height = height + "px";
}

photoStage.addEventListener("pointerdown", (e) => {
  const rect = photoStage.getBoundingClientRect();
  photoDragStart = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  selectionBox.classList.remove("hidden");
  positionSelectionBox(photoDragStart.x, photoDragStart.y, 0, 0);
  photoStage.setPointerCapture(e.pointerId);
});
photoStage.addEventListener("pointermove", (e) => {
  if (!photoDragStart) return;
  const rect = photoStage.getBoundingClientRect();
  const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
  const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
  positionSelectionBox(
    Math.min(photoDragStart.x, x),
    Math.min(photoDragStart.y, y),
    Math.abs(x - photoDragStart.x),
    Math.abs(y - photoDragStart.y)
  );
});
photoStage.addEventListener("pointerup", () => { photoDragStart = null; });
photoStage.addEventListener("pointercancel", () => { photoDragStart = null; });

document.getElementById("photoRetakeBtn").addEventListener("click", () => {
  resetPhotoState();
  showPhotoStep("pick");
});
document.getElementById("photoRetakeBtn2").addEventListener("click", () => {
  resetPhotoState();
  showPhotoStep("pick");
});
document.getElementById("photoReselectBtn").addEventListener("click", () => {
  selectionBox.classList.add("hidden");
  photoResultField.value = "";
  showPhotoStep("crop");
});

// OCRは同一オリジンに同梱したファイルのみを使う（CDN不要・オフラインでも動作）
// location.href を基準に解決するため、OCR機能を実際に使うタイミングまで計算を遅らせる
function ocrBase() {
  return new URL(".", location.href).href;
}

let tesseractLoadPromise = null;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve();
  if (tesseractLoadPromise) return tesseractLoadPromise;
  tesseractLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = ocrBase() + "vendor/tesseract/tesseract.min.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("load failed"));
    document.head.appendChild(script);
  });
  return tesseractLoadPromise;
}

async function recognizeEnglishText(canvas) {
  await loadTesseract();
  const base = ocrBase();
  const worker = await Tesseract.createWorker("eng", 1, {
    workerPath: base + "vendor/tesseract/worker.min.js",
    corePath: base + "vendor/tesseract-core",
    langPath: base + "vendor/tessdata",
  });
  try {
    const { data } = await worker.recognize(canvas);
    return data.text.trim();
  } finally {
    await worker.terminate();
  }
}

document.getElementById("photoRecognizeBtn").addEventListener("click", async () => {
  const selRect = selectionBox.getBoundingClientRect();
  if (selRect.width < 4 || selRect.height < 4) {
    await showAlert("範囲を選択してください");
    return;
  }
  const imgRect = photoImg.getBoundingClientRect();
  const scaleX = photoImg.naturalWidth / imgRect.width;
  const scaleY = photoImg.naturalHeight / imgRect.height;
  const sx = (selRect.left - imgRect.left) * scaleX;
  const sy = (selRect.top - imgRect.top) * scaleY;
  const sw = selRect.width * scaleX;
  const sh = selRect.height * scaleY;

  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  canvas.getContext("2d").drawImage(photoImg, sx, sy, sw, sh, 0, 0, sw, sh);

  showPhotoStep("loading");
  try {
    const raw = await recognizeEnglishText(canvas);
    const text = ui.photoTarget === "example" ? raw : raw.split(/\s+/)[0] || "";
    photoResultField.value = text;
    showPhotoStep("result");
  } catch (err) {
    await showAlert("文字の読み取りに失敗しました。もう一度お試しください。");
    showPhotoStep("crop");
  }
});

document.getElementById("photoUseBtn").addEventListener("click", () => {
  const text = photoResultField.value.trim();
  if (!text) return;
  resetPhotoState();
  if (ui.photoTarget === "example") {
    fieldExample.value = text;
  } else {
    fieldFront.value = text;
  }
  returnToAddScreen();
});

// 単語追加/編集フォームから写真入力に来た場合、フォームの未保存入力を
// 消さずに戻るため navigate()（renderAddForm を呼び直す）を経由しない
function returnToAddScreen() {
  navStack.pop();
  const addEntry = navStack[navStack.length - 1];
  const opts = addEntry ? addEntry.opts : { back: true, title: "単語を追加" };
  showScreen("add", { ...opts, silent: true });
}

// ---------- 統計 ----------
function renderStats() {
  const body = document.getElementById("statsBody");
  const totalCards = state.cards.length;
  const mastered = state.cards.filter((c) => c.known).length;
  const percent = totalCards > 0 ? Math.round((mastered / totalCards) * 100) : 0;
  document.getElementById("gaugeFill").style.width = percent + "%";
  document.getElementById("gaugePercent").textContent = percent + "%";
  document.getElementById("gaugeSub").textContent = `${mastered} / ${totalCards} 語 習得済み`;
  const totalDays = (state.stats.stampedDates || []).length;
  const rows = [
    ["総学習日数", `${totalDays}日`],
    ["現在の連続日数", `${state.stats.streak}日`],
    ["総単語数", `${totalCards}語`],
    ["覚えた語", `${mastered}語`],
  ];
  body.innerHTML = rows
    .map(([label, value]) => `<div class="stat-row"><span>${label}</span><span class="stat-value">${value}</span></div>`)
    .join("");

  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  ui.calendarYear = now.getUTCFullYear();
  ui.calendarMonth = now.getUTCMonth();
  renderCalendar();
}

function renderCalendar() {
  const year = ui.calendarYear;
  const month = ui.calendarMonth;
  document.getElementById("calendarLabel").textContent = `${year}年${month + 1}月`;

  const startWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const todayStr = jstDateString(Date.now());
  const stamped = new Set(state.stats.stampedDates || []);

  const grid = document.getElementById("calendarGrid");
  grid.innerHTML = "";
  for (let i = 0; i < startWeekday; i++) {
    const cell = document.createElement("div");
    cell.className = "calendar-day empty";
    grid.appendChild(cell);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${month + 1}-${d}`;
    const isStamped = stamped.has(dateStr);
    const cell = document.createElement("div");
    cell.className =
      "calendar-day" +
      (dateStr === todayStr ? " today" : "") +
      (isStamped ? " stamped" : "");
    cell.textContent = d;
    if (isStamped) {
      cell.addEventListener("click", () => {
        const count = learnedCountOn(dateStr);
        showAlert(`${year}年${month + 1}月${d}日：${count}語覚えました`);
      });
    }
    grid.appendChild(cell);
  }
}

document.getElementById("calendarPrevBtn").addEventListener("click", () => {
  ui.calendarMonth--;
  if (ui.calendarMonth < 0) {
    ui.calendarMonth = 11;
    ui.calendarYear--;
  }
  renderCalendar();
});

document.getElementById("calendarNextBtn").addEventListener("click", () => {
  ui.calendarMonth++;
  if (ui.calendarMonth > 11) {
    ui.calendarMonth = 0;
    ui.calendarYear++;
  }
  renderCalendar();
});

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------- 表示モード切り替え（デフォルトはライト） ----------
const themeLightBtn = document.getElementById("themeLightBtn");
const themeDarkBtn = document.getElementById("themeDarkBtn");
const themeSystemBtn = document.getElementById("themeSystemBtn");
const darkMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

function currentTheme() {
  return localStorage.getItem("theme") || "light";
}

// "system" のときは端末の設定（ライト/ダーク）に合わせた実際の表示を返す
function resolvedTheme() {
  const theme = currentTheme();
  if (theme === "system") return darkMediaQuery.matches ? "dark" : "light";
  return theme;
}

function applyTheme() {
  document.documentElement.setAttribute("data-theme", resolvedTheme());
}

function updateThemeToggleUI() {
  const theme = currentTheme();
  themeLightBtn.classList.toggle("active", theme === "light");
  themeDarkBtn.classList.toggle("active", theme === "dark");
  themeSystemBtn.classList.toggle("active", theme === "system");
}

function setTheme(theme) {
  localStorage.setItem("theme", theme);
  applyTheme();
  updateThemeToggleUI();
}

applyTheme();
updateThemeToggleUI();

themeLightBtn.addEventListener("click", () => setTheme("light"));
themeDarkBtn.addEventListener("click", () => setTheme("dark"));
themeSystemBtn.addEventListener("click", () => setTheme("system"));

// 「自動」選択中に端末側のライト/ダーク設定が変わったら追従する
darkMediaQuery.addEventListener("change", () => {
  if (currentTheme() === "system") applyTheme();
});

// ---------- 読み上げ速度（デフォルトは通常） ----------
const speechRateNormalBtn = document.getElementById("speechRateNormalBtn");
const speechRateSlowBtn = document.getElementById("speechRateSlowBtn");

function currentSpeechRate() {
  return localStorage.getItem("speechRate") === "slow" ? 0.7 : 1;
}

function updateSpeechRateUI() {
  const slow = localStorage.getItem("speechRate") === "slow";
  speechRateNormalBtn.classList.toggle("active", !slow);
  speechRateSlowBtn.classList.toggle("active", slow);
}

function setSpeechRate(rate) {
  localStorage.setItem("speechRate", rate);
  updateSpeechRateUI();
}

updateSpeechRateUI();
speechRateNormalBtn.addEventListener("click", () => setSpeechRate("normal"));
speechRateSlowBtn.addEventListener("click", () => setSpeechRate("slow"));

// ---------- 使い方 ----------
document.getElementById("helpBtn").addEventListener("click", () => {
  navigate("help", { back: true, title: "使い方" });
});

// ---------- 初期化 ----------
navigate("home");

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}
