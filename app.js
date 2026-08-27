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
    return data;
  }
  const data = {
    decks: [
      { id: uid(), name: "英単語" },
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

function isEnglishText(text) {
  return /[a-zA-Z]/.test(text) && !/[぀-ヿ㐀-鿿＀-￯]/.test(text);
}

// 日本語の文字（ひらがな・カタカナ・漢字・全角記号）を取り除き、
// 残った英語部分だけを返す（例文に日本語訳が混ざっている場合に使用）
function extractEnglish(text) {
  return text.replace(/[　-〿぀-ヿ㐀-鿿＀-￯]+/g, " ").replace(/\s+/g, " ").trim();
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
let ui = {
  currentDeckId: null,
  reviewQueue: [],
  reviewIndex: 0,
  flipped: false,
  editingCardId: null,
  reviewMode: "due",
  prefillFront: null,
  listSearch: "",
  listFilter: "all",
  photoTarget: "front",
};

// ---------- ナビゲーション ----------
const screens = document.querySelectorAll(".screen");
const backBtn = document.getElementById("backBtn");
const topTitle = document.getElementById("topTitle");
let navStack = [];

function showScreen(name, opts = {}) {
  screens.forEach((s) => s.classList.remove("active", "fade-in"));
  const target = document.getElementById("screen-" + name);
  target.classList.add("active");
  void target.offsetWidth;
  target.classList.add("fade-in");
  topTitle.textContent = opts.title || "単語帳";
  backBtn.classList.toggle("hidden", !opts.back);
  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.nav === name);
  });
  if (!opts.silent) navStack.push({ name, opts });
}

function goBack() {
  // 例文の写真読み取り中に中断した場合、単語追加フォームの未保存入力を
  // 消さずに戻す（通常の navigate("add", ...) は renderAddForm でフォームをリセットしてしまう）
  if (document.getElementById("screen-photo").classList.contains("active") && ui.photoTarget === "example") {
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

function renderHome() {
  const list = document.getElementById("deckList");
  list.innerHTML = "";
  if (state.decks.length === 0) {
    list.innerHTML = '<p class="empty-msg">デッキがありません。<br>「＋ 新しいデッキ」から作成しましょう。</p>';
    return;
  }
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

document.getElementById("newDeckBtn").addEventListener("click", async () => {
  const name = await showPrompt("デッキ名を入力してください");
  if (!name) return;
  state.decks.push({ id: uid(), name });
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
document.getElementById("addPhotoBtn").addEventListener("click", () => {
  ui.photoTarget = "front";
  navigate("photo", { back: true, title: "写真から追加" });
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

function startReview() {
  const deckId = ui.currentDeckId;
  ui.reviewQueue = state.cards
    .filter((c) => c.deckId === deckId && (ui.reviewMode === "all" || !c.known))
    .sort(() => Math.random() - 0.5);
  ui.reviewIndex = 0;
  reviewDone.classList.add("hidden");
  showCurrentCard();
}

function showCurrentCard() {
  cardStage.style.transform = "";
  cardStage.style.transition = "";
  ui.flipped = false;
  cardInner.style.transition = "none";
  cardInner.classList.remove("flipped");
  void cardInner.offsetHeight;
  cardInner.style.transition = "";
  reviewButtons.classList.add("answer-hidden");

  updateReviewHint();

  if (ui.reviewIndex >= ui.reviewQueue.length) {
    document.getElementById("cardStage").classList.add("hidden");
    reviewHint.classList.add("hidden");
    reviewButtons.classList.add("hidden");
    reviewProgress.textContent = "";
    document.getElementById("reviewDoneText").textContent =
      ui.reviewMode === "all" ? "デッキに単語がありません。" : "覚えていない単語はありません。";
    reviewDone.classList.remove("hidden");
    return;
  }
  document.getElementById("cardStage").classList.remove("hidden");
  reviewHint.classList.remove("hidden");
  reviewButtons.classList.remove("hidden");

  const card = ui.reviewQueue[ui.reviewIndex];
  cardFront.textContent = card.front;
  cardBackMeaning.textContent = card.back;
  cardBackExample.textContent = card.example || "";
  cardBackExample.classList.toggle("hidden", !card.example);
  reviewProgress.textContent = `${ui.reviewIndex + 1} / ${ui.reviewQueue.length}`;
  speakBtn.classList.toggle("hidden", !isEnglishText(card.front));
  exampleSpeakBtn.classList.toggle("hidden", !extractEnglish(card.example || ""));
}

document.getElementById("reviewDoneBackBtn").addEventListener("click", () => goBack());

cardStage.addEventListener("click", (e) => {
  if (speakBtn.contains(e.target) || exampleSpeakBtn.contains(e.target)) return;
  ui.flipped = !ui.flipped;
  cardInner.classList.toggle("flipped", ui.flipped);
  reviewButtons.classList.toggle("answer-hidden", !ui.flipped);
  updateReviewHint();
});

speakBtn.addEventListener("click", () => {
  const card = ui.reviewQueue[ui.reviewIndex];
  if (!card) return;
  const utter = new SpeechSynthesisUtterance(card.front);
  utter.lang = "en-US";
  speechSynthesis.cancel();
  speechSynthesis.speak(utter);
});

exampleSpeakBtn.addEventListener("click", () => {
  const card = ui.reviewQueue[ui.reviewIndex];
  if (!card || !card.example) return;
  const englishOnly = extractEnglish(card.example);
  if (!englishOnly) return;
  const utter = new SpeechSynthesisUtterance(englishOnly);
  utter.lang = "en-US";
  speechSynthesis.cancel();
  speechSynthesis.speak(utter);
});

function answerCard(correct) {
  const card = ui.reviewQueue[ui.reviewIndex];
  card.known = correct;
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

function jstDateString(timestamp) {
  const jst = new Date(timestamp + 9 * 60 * 60 * 1000);
  return `${jst.getUTCFullYear()}-${jst.getUTCMonth() + 1}-${jst.getUTCDate()}`;
}

function recordReviewToday() {
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
const listSearchInput = document.getElementById("listSearch");
const filterBtns = document.querySelectorAll(".filter-btn");

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

function renderList() {
  const deck = currentDeck();
  const container = document.getElementById("cardTable");
  listSearchInput.value = ui.listSearch;
  filterBtns.forEach((b) => b.classList.toggle("active", b.dataset.filter === ui.listFilter));

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

  container.innerHTML = "";
  if (cards.length === 0) {
    container.innerHTML =
      allCards.length === 0
        ? '<p class="empty-msg">まだ単語がありません。<br>「単語を追加」または「写真から追加」で登録しましょう。</p>'
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
  let startX = null;
  let dragging = false;

  inner.addEventListener("pointerdown", (e) => {
    startX = e.clientX;
    dragging = true;
    inner.style.transition = "none";
    inner.setPointerCapture(e.pointerId);
  });
  inner.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const base = inner.classList.contains("swiped") ? -REVEAL : 0;
    const dx = Math.max(-REVEAL, Math.min(0, base + (e.clientX - startX)));
    inner.style.transform = `translateX(${dx}px)`;
  });
  function end(e) {
    if (!dragging) return;
    dragging = false;
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
    if (ui.prefillFront) {
      fieldFront.value = ui.prefillFront;
      ui.prefillFront = null;
    }
  }
}

statusNotYetBtn.addEventListener("click", () => {
  const card = state.cards.find((c) => c.id === ui.editingCardId);
  card.known = false;
  saveData(state);
  updateStatusToggleUI(card);
});

statusKnownBtn.addEventListener("click", () => {
  const card = state.cards.find((c) => c.id === ui.editingCardId);
  card.known = true;
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

let tesseractLoadPromise = null;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve();
  if (tesseractLoadPromise) return tesseractLoadPromise;
  tesseractLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5.0.4/dist/tesseract.min.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("load failed"));
    document.head.appendChild(script);
  });
  return tesseractLoadPromise;
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
    await loadTesseract();
    const { data } = await Tesseract.recognize(canvas, "eng");
    const raw = data.text.trim();
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
    returnToAddScreen();
  } else {
    ui.editingCardId = null;
    ui.prefillFront = text;
    navigate("add", { back: true, title: "単語を追加" });
  }
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
  const rows = [
    ["現在の連続日数", `${state.stats.streak}日`],
    ["総単語数", `${totalCards}語`],
    ["覚えた語", `${mastered}語`],
  ];
  body.innerHTML = rows
    .map(([label, value]) => `<div class="stat-row"><span>${label}</span><span class="stat-value">${value}</span></div>`)
    .join("");
}

// ---------- バックアップ ----------
document.getElementById("exportBtn").addEventListener("click", () => {
  const payload = { decks: state.decks, cards: state.cards, exportedAt: Date.now() };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const dateStr = new Date().toISOString().slice(0, 10);
  const a = document.createElement("a");
  a.href = url;
  a.download = `単語帳バックアップ_${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

const importInput = document.getElementById("importInput");
document.getElementById("importBtn").addEventListener("click", () => importInput.click());

importInput.addEventListener("change", () => {
  const file = importInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!Array.isArray(imported.decks) || !Array.isArray(imported.cards)) {
        throw new Error("invalid format");
      }
      const idMap = {};
      imported.decks.forEach((d) => {
        const newId = uid();
        idMap[d.id] = newId;
        state.decks.push({ id: newId, name: d.name || "デッキ" });
      });
      imported.cards.forEach((c) => {
        const newDeckId = idMap[c.deckId];
        if (!newDeckId || !c.front || !c.back) return;
        state.cards.push({
          id: uid(),
          deckId: newDeckId,
          front: c.front,
          back: c.back,
          example: c.example || "",
          known: !!c.known,
          createdAt: c.createdAt || Date.now(),
        });
      });
      saveData(state);
      renderStats();
      await showAlert(`${imported.decks.length}デッキ・${imported.cards.length}単語を読み込みました`);
    } catch (err) {
      await showAlert("読み込みに失敗しました。正しいバックアップファイルか確認してください。");
    }
    importInput.value = "";
  };
  reader.readAsText(file);
});

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------- 表示モード切り替え（デフォルトはライト） ----------
const themeLightBtn = document.getElementById("themeLightBtn");
const themeDarkBtn = document.getElementById("themeDarkBtn");

function currentTheme() {
  return localStorage.getItem("theme") || "light";
}

function updateThemeToggleUI() {
  const theme = currentTheme();
  themeLightBtn.classList.toggle("active", theme === "light");
  themeDarkBtn.classList.toggle("active", theme === "dark");
}

function setTheme(theme) {
  localStorage.setItem("theme", theme);
  document.documentElement.setAttribute("data-theme", theme);
  updateThemeToggleUI();
}

document.documentElement.setAttribute("data-theme", currentTheme());
updateThemeToggleUI();

themeLightBtn.addEventListener("click", () => setTheme("light"));
themeDarkBtn.addEventListener("click", () => setTheme("dark"));

// ---------- 初期化 ----------
navigate("home");

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}
