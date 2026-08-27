const STORAGE_KEY = "tangoAppData_v1";
const DAY_MS = 24 * 60 * 60 * 1000;

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) return JSON.parse(raw);
  const data = {
    decks: [
      { id: uid(), name: "英単語", type: "english" },
      { id: uid(), name: "古典単語", type: "classical" },
    ],
    cards: [],
    stats: { streak: 0, lastReviewDate: null },
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

let state = loadData();
let ui = {
  currentDeckId: null,
  reviewQueue: [],
  reviewIndex: 0,
  flipped: false,
  editingCardId: null,
  reviewMode: "due",
};

// ---------- ナビゲーション ----------
const screens = document.querySelectorAll(".screen");
const backBtn = document.getElementById("backBtn");
const topTitle = document.getElementById("topTitle");
let navStack = [];

function showScreen(name, opts = {}) {
  screens.forEach((s) => s.classList.remove("active"));
  document.getElementById("screen-" + name).classList.add("active");
  topTitle.textContent = opts.title || "単語帳";
  backBtn.classList.toggle("hidden", !opts.back);
  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.nav === name);
  });
  if (!opts.silent) navStack.push({ name, opts });
}

function goBack() {
  navStack.pop();
  const prev = navStack.pop();
  if (prev) navigate(prev.name, prev.opts);
  else navigate("home");
}

function navigate(name, opts = {}) {
  if (name === "home") renderHome();
  if (name === "deck") renderDeck();
  if (name === "review") startReview();
  if (name === "list") renderList();
  if (name === "add") renderAddForm();
  if (name === "stats") renderStats();
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
  return state.cards.filter((c) => c.deckId === deckId && (c.box || 1) < 5).length;
}

function renderHome() {
  const list = document.getElementById("deckList");
  list.innerHTML = "";
  state.decks.forEach((deck) => {
    const total = state.cards.filter((c) => c.deckId === deck.id).length;
    const pending = pendingCount(deck.id);
    const row = document.createElement("div");
    row.className = "deck-row";
    row.innerHTML = `
      <span class="deck-name">${escapeHtml(deck.name)}</span>
      <span class="deck-count ${pending > 0 ? "due" : ""}">${total}語 ${pending > 0 ? `/ 未習得${pending}件` : ""}</span>
    `;
    row.addEventListener("click", () => {
      ui.currentDeckId = deck.id;
      navigate("deck", { back: true });
    });
    list.appendChild(row);
  });
}

document.getElementById("newDeckBtn").addEventListener("click", () => {
  const name = prompt("デッキ名を入力してください");
  if (!name) return;
  const type = confirm("英単語デッキですか？（OK=英単語／キャンセル=その他）") ? "english" : "classical";
  state.decks.push({ id: uid(), name, type });
  saveData(state);
  renderHome();
});

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
}

document.getElementById("startReviewBtn").addEventListener("click", () => {
  ui.reviewMode = "due";
  navigate("review", { back: true, title: currentDeck().name });
});
document.getElementById("reviewAllBtn").addEventListener("click", () => {
  ui.reviewMode = "all";
  navigate("review", { back: true, title: currentDeck().name });
});
document.getElementById("addCardBtn").addEventListener("click", () => {
  ui.editingCardId = null;
  navigate("add", { back: true, title: "単語を追加" });
});
document.getElementById("viewListBtn").addEventListener("click", () => navigate("list", { back: true, title: "単語一覧" }));
document.getElementById("deleteDeckBtn").addEventListener("click", () => {
  const deck = currentDeck();
  if (!confirm(`「${deck.name}」を削除しますか？中の単語もすべて削除されます。`)) return;
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
const cardBack = document.getElementById("cardBack");
const speakBtn = document.getElementById("speakBtn");
const reviewButtons = document.getElementById("reviewButtons");
const reviewDone = document.getElementById("reviewDone");
const reviewProgress = document.getElementById("reviewProgress");

function startReview() {
  const deckId = ui.currentDeckId;
  ui.reviewQueue = state.cards
    .filter((c) => c.deckId === deckId && (ui.reviewMode === "all" || (c.box || 1) < 5))
    .sort(() => Math.random() - 0.5);
  ui.reviewIndex = 0;
  reviewDone.classList.add("hidden");
  showCurrentCard();
}

function showCurrentCard() {
  const deck = currentDeck();
  cardStage.style.transform = "";
  cardStage.style.transition = "";
  ui.flipped = false;
  cardInner.style.transition = "none";
  cardInner.classList.remove("flipped");
  void cardInner.offsetHeight;
  cardInner.style.transition = "";
  reviewButtons.classList.add("answer-hidden");

  if (ui.reviewIndex >= ui.reviewQueue.length) {
    document.getElementById("cardStage").classList.add("hidden");
    document.querySelector(".hint").classList.add("hidden");
    reviewButtons.classList.add("hidden");
    reviewProgress.textContent = "";
    document.getElementById("reviewDoneText").textContent =
      ui.reviewMode === "all" ? "デッキに単語がありません。" : "覚えていない単語はありません。";
    reviewDone.classList.remove("hidden");
    return;
  }
  document.getElementById("cardStage").classList.remove("hidden");
  document.querySelector(".hint").classList.remove("hidden");
  reviewButtons.classList.remove("hidden");

  const card = ui.reviewQueue[ui.reviewIndex];
  cardFront.textContent = card.front;
  cardBack.textContent = card.back + (card.example ? "\n\n例文: " + card.example : "");
  cardBack.style.whiteSpace = "pre-line";
  reviewProgress.textContent = `${ui.reviewIndex + 1} / ${ui.reviewQueue.length}`;
  speakBtn.classList.toggle("hidden", deck.type !== "english");
}

document.getElementById("reviewDoneBackBtn").addEventListener("click", () => goBack());

cardStage.addEventListener("click", (e) => {
  if (speakBtn.contains(e.target)) return;
  ui.flipped = !ui.flipped;
  cardInner.classList.toggle("flipped", ui.flipped);
  reviewButtons.classList.toggle("answer-hidden", !ui.flipped);
});

speakBtn.addEventListener("click", () => {
  const card = ui.reviewQueue[ui.reviewIndex];
  if (!card) return;
  const utter = new SpeechSynthesisUtterance(card.front);
  utter.lang = "en-US";
  speechSynthesis.cancel();
  speechSynthesis.speak(utter);
});

function answerCard(correct) {
  const card = ui.reviewQueue[ui.reviewIndex];
  if (correct) {
    card.box = Math.min((card.box || 1) + 1, 5);
  } else {
    card.box = 1;
  }
  recordReviewToday();
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

function recordReviewToday() {
  const today = new Date().toDateString();
  if (state.stats.lastReviewDate === today) return;
  const yesterday = new Date(Date.now() - DAY_MS).toDateString();
  if (state.stats.lastReviewDate === yesterday) {
    state.stats.streak++;
  } else {
    state.stats.streak = 1;
  }
  state.stats.lastReviewDate = today;
}

// ---------- 単語一覧 ----------
function renderList() {
  const deck = currentDeck();
  const container = document.getElementById("cardTable");
  const cards = state.cards.filter((c) => c.deckId === deck.id);
  container.innerHTML = "";
  if (cards.length === 0) {
    container.innerHTML = '<p class="empty-msg">まだ単語がありません</p>';
    return;
  }
  cards.forEach((card) => {
    const row = document.createElement("div");
    row.className = "card-item";
    row.innerHTML = `
      <div class="card-info">
        <div class="card-front-text">${escapeHtml(card.front)}</div>
        <div class="card-back-text">${escapeHtml(card.back)}</div>
      </div>
      <div class="card-ops">
        <button class="edit">編集</button>
        <button class="del">削除</button>
      </div>
    `;
    row.querySelector(".edit").addEventListener("click", () => {
      ui.editingCardId = card.id;
      navigate("add", { back: true, title: "単語を編集" });
    });
    row.querySelector(".del").addEventListener("click", () => {
      if (!confirm(`「${card.front}」を削除しますか？`)) return;
      state.cards = state.cards.filter((c) => c.id !== card.id);
      saveData(state);
      renderList();
    });
    container.appendChild(row);
  });
}

// ---------- 追加/編集フォーム ----------
const cardForm = document.getElementById("cardForm");
const fieldFront = document.getElementById("fieldFront");
const fieldBack = document.getElementById("fieldBack");
const fieldExample = document.getElementById("fieldExample");
const statusToggleWrap = document.getElementById("statusToggleWrap");
const statusNotYetBtn = document.getElementById("statusNotYetBtn");
const statusKnownBtn = document.getElementById("statusKnownBtn");

function updateStatusToggleUI(card) {
  const known = (card.box || 1) >= 5;
  statusNotYetBtn.classList.toggle("active", !known);
  statusKnownBtn.classList.toggle("active", known);
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
  card.box = 1;
  saveData(state);
  updateStatusToggleUI(card);
});

statusKnownBtn.addEventListener("click", () => {
  const card = state.cards.find((c) => c.id === ui.editingCardId);
  card.box = 5;
  saveData(state);
  updateStatusToggleUI(card);
});

cardForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const front = fieldFront.value.trim();
  const back = fieldBack.value.trim();
  const example = fieldExample.value.trim();
  if (!front || !back) return;

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
      box: 1,
      createdAt: Date.now(),
    });
  }
  saveData(state);
  ui.editingCardId = null;
  goBack();
});

// ---------- 統計 ----------
function renderStats() {
  const body = document.getElementById("statsBody");
  const totalCards = state.cards.length;
  const mastered = state.cards.filter((c) => (c.box || 1) >= 5).length;
  const percent = totalCards > 0 ? Math.round((mastered / totalCards) * 100) : 0;
  document.getElementById("gaugeFill").style.width = percent + "%";
  document.getElementById("gaugePercent").textContent = percent + "%";
  document.getElementById("gaugeSub").textContent = `${mastered} / ${totalCards} 語 習得済み`;
  const rows = [
    ["現在の連続日数", `${state.stats.streak}日`],
    ["総単語数", `${totalCards}語`],
    ["完全に覚えた語", `${mastered}語`],
  ];
  body.innerHTML = rows
    .map(([label, value]) => `<div class="stat-row"><span>${label}</span><span class="stat-value">${value}</span></div>`)
    .join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------- ダークモード切り替え ----------
const themeToggle = document.getElementById("themeToggle");

function currentTheme() {
  const stored = localStorage.getItem("theme");
  if (stored) return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function updateThemeToggleUI() {
  themeToggle.classList.toggle("on", currentTheme() === "dark");
}

const storedTheme = localStorage.getItem("theme");
if (storedTheme) document.documentElement.setAttribute("data-theme", storedTheme);
updateThemeToggleUI();

themeToggle.addEventListener("click", () => {
  const next = currentTheme() === "dark" ? "light" : "dark";
  localStorage.setItem("theme", next);
  document.documentElement.setAttribute("data-theme", next);
  updateThemeToggleUI();
});

// ---------- 初期化 ----------
navigate("home");

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}
