const STORAGE_KEY = "tangoAppData_v1";
const DAY_MS = 24 * 60 * 60 * 1000;

// 読み上げ言語は以前デッキ単位で持っていなかったため、既存デッキには
// カード内容から一度だけ推測して補完する（英単語が1つでもあれば英語、
// なければオフ＝古典単語デッキなどを誤って読み上げないようにする）。
// バックアップ復元時にも、古い形式のファイルに備えて同じ処理をかける。
function migrateDeckLangs(data) {
  data.decks.forEach((deck) => {
    if (deck.lang === undefined) {
      const deckCards = data.cards.filter((c) => c.deckId === deck.id);
      deck.lang = deckCards.some((c) => isEnglishText(c.front)) ? "en" : "off";
    }
  });
}

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    const data = JSON.parse(raw);
    data.cards.forEach((c) => {
      if (c.known === undefined) c.known = (c.box || 1) >= 5;
      delete c.box;
    });
    migrateDeckLangs(data);
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

// ---------- 表示言語（UI言語。デッキの読み上げ言語とは別設定） ----------
// 英語の単数/複数を切り替える（日本語・中国語には単複の区別がないため未使用）
function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

const translations = {
  ja: {
    appTitle: "単語帳",
    back: "戻る",
    nav_home: "ホーム",
    nav_stats: "統計",
    nav_settings: "設定",
    goal_label: "今日の目標",
    goal_text: (count, goal) => (count >= goal ? `${count} / ${goal}語 達成` : `${count} / ${goal}語`),
    deck_new: "＋ 新しいデッキ",
    deck_import: "デッキを読み込む",
    deck_reorder: "並び替え",
    deck_reorder_done: "完了",
    deck_empty_html: "デッキがありません。<br>「＋ 新しいデッキ」から作成しましょう。",
    deck_count: (total, pending) => `${total}語${pending > 0 ? ` / 未習得${pending}件` : ""}`,
    deck_move_up_aria: "上へ移動",
    deck_move_down_aria: "下へ移動",
    prompt_deck_name: "デッキ名を入力してください",
    prompt_rename_deck: "新しいデッキ名を入力してください",
    quiz_mode_label: "出題形式",
    quiz_mode_card: "カード",
    quiz_mode_typing: "タイピング",
    quiz_mode_blank: "穴埋め",
    quiz_mode_listening: "リスニング",
    tts_lang_label: "読み上げ言語",
    tts_lang_off: "オフ",
    tts_lang_en: "英語",
    tts_lang_zh: "中国語",
    btn_start_review: "復習する",
    btn_review_all: "総復習",
    btn_word_list: "単語一覧",
    btn_export_deck: "このデッキを書き出す",
    btn_rename_deck: "デッキ名を変更",
    btn_delete_deck: "このデッキを削除",
    deck_due: (total, pending) => `全${total}語 ・ 未習得 ${pending}件`,
    confirm_delete_deck: (name) => `「${name}」を削除しますか？\n中の単語もすべて削除されます。`,
    alert_deck_file_invalid: "デッキのファイルとして読み込めませんでした。",
    default_imported_deck_name: "読み込んだデッキ",
    alert_file_read_failed: "ファイルを読み込めませんでした。破損しているか、対応していない形式です。",
    alert_deck_added: (name) => `「${name}」を追加しました。`,
    alert_backup_invalid: "バックアップファイルとして読み込めませんでした。",
    confirm_backup_restore: "現在のデータはすべて上書きされます。復元してよろしいですか？",
    alert_backup_restored: "バックアップを復元しました。",
    speak_aria: "発音を聞く",
    example_speak_aria: "例文の発音を聞く",
    hint_tap: "タップで裏返す",
    hint_tap_swipe: "タップで裏返す / 左右にスワイプ",
    btn_still: "まだ",
    btn_know: "覚えた",
    quiz_play_aria: "音声を再生",
    quiz_input_placeholder: "単語を入力",
    btn_check_answer: "答え合わせ",
    btn_next: "次へ",
    btn_back_to_deck: "デッキ画面に戻る",
    quiz_correct: "○ 正解",
    quiz_incorrect: (answer) => `× 正しくは: ${answer}`,
    review_done_blank_unavailable: "穴埋めに使える例文の単語がありません。他の出題形式をお試しください。",
    review_done_listening_off: "このデッキには読み上げ言語が設定されていません。デッキ画面で読み上げ言語を選んでください。",
    review_done_listening_unavailable: "リスニングに使える単語がありません。デッキの読み上げ言語と単語の表記が合っているか確認してください。",
    review_done_no_cards: "デッキに単語がありません。",
    review_done_all_known: "覚えていない単語はありません。",
    photo_hint_shoot: "単語1つが収まるように撮影してください（英語のみ対応）",
    btn_shoot: "撮影する",
    photo_hint_crop: "単語を囲むようにドラッグして範囲を選択",
    btn_retake: "撮り直す",
    btn_recognize: "この範囲を読み取る",
    label_ocr_result: "読み取り結果（編集可）",
    btn_reselect: "範囲を選び直す",
    btn_retake2: "新しく撮影",
    btn_use_result: "この内容を使う",
    photo_loading: "読み取り中…",
    alert_select_range: "範囲を選択してください",
    alert_ocr_failed: "文字の読み取りに失敗しました。もう一度お試しください。",
    btn_add_card: "＋ 単語を追加",
    search_placeholder: "検索",
    filter_all: "すべて",
    filter_unknown: "まだ",
    filter_known: "覚えた",
    sort_added: "追加順",
    sort_alpha: "アルファベット順",
    btn_delete: "削除",
    edit_aria: "編集",
    list_empty_html: "まだ単語がありません。<br>「＋ 単語を追加」で登録しましょう。",
    list_no_match: "該当する単語が見つかりません。",
    confirm_delete_card: (front) => `「${front}」を削除しますか？`,
    label_front: "表（単語）",
    btn_photo_input: "写真から入力",
    label_back: "裏（意味）",
    label_example: "例文（任意）",
    label_status: "覚えた状態",
    btn_save: "保存",
    title_add_word: "単語を追加",
    title_edit_word: "単語を編集",
    title_photo_front: "写真から単語を読み取る",
    title_photo_example: "写真から例文を読み取る",
    confirm_duplicate: (front) => `「${front}」は既にこのデッキに登録されています。\nこのまま追加しますか？`,
    label_progress: "習得の進捗",
    label_mastered_sub: (mastered, total) => `${mastered} / ${total} 語 習得済み`,
    stat_total_days: "総学習日数",
    stat_streak: "現在の連続日数",
    stat_total_words: "総単語数",
    stat_known_words: "覚えた語",
    unit_days: (n) => `${n}日`,
    unit_words: (n) => `${n}語`,
    calendar_weekdays: ["日", "月", "火", "水", "木", "金", "土"],
    calendar_prev_aria: "前の月",
    calendar_next_aria: "次の月",
    calendar_month_label: (year, month) => `${year}年${month}月`,
    calendar_day_detail: (year, month, day, count) => `${year}年${month}月${day}日：${count}語覚えました`,
    label_theme: "表示モード",
    theme_light: "ライト",
    theme_dark: "ダーク",
    theme_system: "自動",
    label_speech_rate: "読み上げ速度",
    rate_normal: "通常",
    rate_slow: "ゆっくり",
    label_daily_goal: "今日の目標",
    goal_off: "オフ",
    label_ui_lang: "言語",
    ui_lang_ja: "日本語",
    ui_lang_en: "English",
    ui_lang_zh: "繁體中文",
    label_backup: "バックアップ（全データ）",
    word_backup: "バックアップ",
    btn_backup_export: "書き出す",
    btn_backup_import: "読み込む",
    btn_help: "使い方を見る",
    title_help: "使い方",
    help_quiz_mode_title: "出題形式",
    help_quiz_mode_card: "<strong>カード</strong>：タップして裏返し、答え合わせをします。左右にスワイプしても「まだ」「覚えた」を選べます。",
    help_quiz_mode_typing: "<strong>タイピング</strong>：意味を見て単語を入力します。",
    help_quiz_mode_blank: "<strong>穴埋め</strong>：例文中の単語部分が空欄になり、文脈から思い出して入力します（例文が登録されている単語のみ対象）。",
    help_quiz_mode_listening: "<strong>リスニング</strong>：単語の発音を聞いて、意味を4択から選びます（デッキの読み上げ言語が「オフ」以外のときのみ対象）。",
    help_tts_lang_title: "読み上げ言語",
    help_tts_lang_body: "デッキ画面の「読み上げ言語」で、そのデッキの単語をどの言語で読み上げるか（オフ／英語／中国語）を選べます。日本語の漢字だけの単語は中国語と見分けがつかないため、自動判定はせずデッキごとに指定する仕様です。古典単語など読み上げが不要なデッキは「オフ」にしてください。設定した言語に対応する文字（英語なら英字、中国語なら漢字）が単語に含まれていない場合、その単語では発音ボタンは表示されません。",
    help_review_title: "復習する／総復習",
    help_review_body: "「復習する」はまだ覚えていない単語だけ、「総復習」はデッキ内すべての単語が対象です。",
    help_photo_title: "写真から入力",
    help_photo_body: "単語一覧の「＋ 単語を追加」を開くと、「表」「例文」それぞれの横にカメラボタンがあります。撮影して範囲を選ぶと、その部分の文字を読み取って入力できます（英語のみ対応）。",
    help_list_title: "単語一覧",
    help_list_body: "検索・絞り込み・並び替えができます。単語を左にスワイプすると削除ボタンが出ます。",
    help_goal_title: "今日の目標",
    help_goal_body: "設定画面で1日に新しく覚える単語数の目標を設定できます。ホーム画面に今日の達成状況が表示されます（すでに覚えている単語を復習しただけではカウントされません。「覚えた」から「まだ」に戻すと達成数からも減ります。「オフ」で非表示にできます）。",
    help_reorder_title: "デッキの並び替え",
    help_reorder_body: "ホーム画面の「並び替え」から、デッキの表示順を▲▼ボタンで変更できます（デッキが2つ以上のときに表示されます）。",
    help_calendar_title: "カレンダー",
    help_calendar_body: "その日はじめてアプリを開くと、統計画面のカレンダーにハンコが押されます。「‹」「›」で月を切り替えて確認できます。ハンコが押された日をタップすると、その日に新しく覚えた単語数を確認できます。",
    help_share_title: "デッキを配布する",
    help_share_body: "デッキ画面の「このデッキを書き出す」で、そのデッキの単語だけをファイルに保存できます（覚えた状態や統計は含みません）。そのファイルを相手に送り、相手がホーム画面の「デッキを読み込む」で開くと、新しいデッキとして追加されます。",
    help_backup_title: "バックアップ",
    help_backup_body: "設定画面の「バックアップ」では、全デッキ・単語・統計をまとめてファイルに書き出せます。機種変更などの際に「読み込む」で復元してください（読み込むと現在のデータはすべて上書きされます）。",
    btn_cancel: "キャンセル",
    btn_ok: "OK",
  },
  en: {
    appTitle: "Word Cards",
    back: "Back",
    nav_home: "Home",
    nav_stats: "Stats",
    nav_settings: "Settings",
    goal_label: "Today's Goal",
    goal_text: (count, goal) => (count >= goal ? `${count} / ${goal} words — done!` : `${count} / ${goal} words`),
    deck_new: "＋ New Deck",
    deck_import: "Import Deck",
    deck_reorder: "Reorder",
    deck_reorder_done: "Done",
    deck_empty_html: "No decks yet.<br>Tap “＋ New Deck” to create one.",
    deck_count: (total, pending) => `${plural(total, "word")}${pending > 0 ? ` / ${pending} to learn` : ""}`,
    deck_move_up_aria: "Move up",
    deck_move_down_aria: "Move down",
    prompt_deck_name: "Enter a deck name",
    prompt_rename_deck: "Enter a new deck name",
    quiz_mode_label: "Quiz Mode",
    quiz_mode_card: "Cards",
    quiz_mode_typing: "Typing",
    quiz_mode_blank: "Fill-in-blank",
    quiz_mode_listening: "Listening",
    tts_lang_label: "Speech Language",
    tts_lang_off: "Off",
    tts_lang_en: "English",
    tts_lang_zh: "Chinese",
    btn_start_review: "Review",
    btn_review_all: "Review All",
    btn_word_list: "Word List",
    btn_export_deck: "Export This Deck",
    btn_rename_deck: "Rename Deck",
    btn_delete_deck: "Delete This Deck",
    deck_due: (total, pending) => `${plural(total, "word")} total · ${pending} to learn`,
    confirm_delete_deck: (name) => `Delete "${name}"?\nAll words in it will also be deleted.`,
    alert_deck_file_invalid: "This file couldn't be read as a deck.",
    default_imported_deck_name: "Imported Deck",
    alert_file_read_failed: "Couldn't read the file. It may be damaged or in an unsupported format.",
    alert_deck_added: (name) => `Added "${name}".`,
    alert_backup_invalid: "This file couldn't be read as a backup.",
    confirm_backup_restore: "This will overwrite all current data. Restore anyway?",
    alert_backup_restored: "Backup restored.",
    speak_aria: "Play pronunciation",
    example_speak_aria: "Play example sentence",
    hint_tap: "Tap to flip",
    hint_tap_swipe: "Tap to flip / swipe left or right",
    btn_still: "Still learning",
    btn_know: "Got it",
    quiz_play_aria: "Play audio",
    quiz_input_placeholder: "Type the word",
    btn_check_answer: "Check",
    btn_next: "Next",
    btn_back_to_deck: "Back to Deck",
    quiz_correct: "○ Correct",
    quiz_incorrect: (answer) => `× Correct answer: ${answer}`,
    review_done_blank_unavailable: "No words have example sentences to use for fill-in-the-blank. Try another quiz mode.",
    review_done_listening_off: "This deck has no speech language set. Choose one on the deck screen.",
    review_done_listening_unavailable: "No words are available for listening mode. Check that the deck's speech language matches how the words are written.",
    review_done_no_cards: "This deck has no words yet.",
    review_done_all_known: "There are no words left to learn.",
    photo_hint_shoot: "Frame a single word in the shot (English only).",
    btn_shoot: "Take Photo",
    photo_hint_crop: "Drag to select the area around the word.",
    btn_retake: "Retake",
    btn_recognize: "Scan This Area",
    label_ocr_result: "Scanned Text (editable)",
    btn_reselect: "Reselect Area",
    btn_retake2: "Take New Photo",
    btn_use_result: "Use This Text",
    photo_loading: "Scanning…",
    alert_select_range: "Please select an area first.",
    alert_ocr_failed: "Couldn't read the text. Please try again.",
    btn_add_card: "＋ Add Word",
    search_placeholder: "Search",
    filter_all: "All",
    filter_unknown: "Learning",
    filter_known: "Known",
    sort_added: "Date Added",
    sort_alpha: "Alphabetical",
    btn_delete: "Delete",
    edit_aria: "Edit",
    list_empty_html: "No words yet.<br>Tap “＋ Add Word” to add one.",
    list_no_match: "No matching words found.",
    confirm_delete_card: (front) => `Delete "${front}"?`,
    label_front: "Front (Word)",
    btn_photo_input: "From Photo",
    label_back: "Back (Meaning)",
    label_example: "Example (optional)",
    label_status: "Learned Status",
    btn_save: "Save",
    title_add_word: "Add Word",
    title_edit_word: "Edit Word",
    title_photo_front: "Scan a Word from a Photo",
    title_photo_example: "Scan an Example from a Photo",
    confirm_duplicate: (front) => `"${front}" is already in this deck.\nAdd it anyway?`,
    label_progress: "Progress",
    label_mastered_sub: (mastered, total) => `${mastered} / ${total} words mastered`,
    stat_total_days: "Total Study Days",
    stat_streak: "Current Streak",
    stat_total_words: "Total Words",
    stat_known_words: "Words Learned",
    unit_days: (n) => plural(n, "day"),
    unit_words: (n) => plural(n, "word"),
    calendar_weekdays: ["S", "M", "T", "W", "T", "F", "S"],
    calendar_prev_aria: "Previous month",
    calendar_next_aria: "Next month",
    calendar_month_label: (year, month) => new Date(year, month - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" }),
    calendar_day_detail: (year, month, day, count) =>
      `${new Date(year, month - 1, day).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}: ${count} word${count === 1 ? "" : "s"} learned`,
    label_theme: "Appearance",
    theme_light: "Light",
    theme_dark: "Dark",
    theme_system: "Auto",
    label_speech_rate: "Speech Speed",
    rate_normal: "Normal",
    rate_slow: "Slow",
    label_daily_goal: "Today's Goal",
    goal_off: "Off",
    label_ui_lang: "Language",
    ui_lang_ja: "日本語",
    ui_lang_en: "English",
    ui_lang_zh: "繁體中文",
    label_backup: "Backup (All Data)",
    word_backup: "Backup",
    btn_backup_export: "Export",
    btn_backup_import: "Import",
    btn_help: "How to Use",
    title_help: "How to Use",
    help_quiz_mode_title: "Quiz Modes",
    help_quiz_mode_card: "<strong>Cards</strong>: Tap to flip, then check yourself. You can also swipe left/right to mark “Still learning” / “Got it”.",
    help_quiz_mode_typing: "<strong>Typing</strong>: See the meaning and type the word.",
    help_quiz_mode_blank: "<strong>Fill-in-blank</strong>: The word is blanked out in an example sentence — recall it from context (only for words with an example sentence).",
    help_quiz_mode_listening: "<strong>Listening</strong>: Listen to the pronunciation and choose the meaning from 4 options (only available when the deck's speech language isn't “Off”).",
    help_tts_lang_title: "Speech Language",
    help_tts_lang_body: "On the deck screen, “Speech Language” lets you choose which language (Off / English / Chinese) a deck's words are read aloud in. Since a word written only in kanji can't be reliably told apart from Chinese, this is never auto-detected — you set it per deck. Set decks that don't need speech (e.g. classical Japanese vocabulary) to “Off”. If a word doesn't contain any characters matching the deck's language (Latin letters for English, Chinese characters for Chinese), its speaker button won't be shown.",
    help_review_title: "Review / Review All",
    help_review_body: "“Review” only covers words you haven't learned yet; “Review All” covers every word in the deck.",
    help_photo_title: "Add from a Photo",
    help_photo_body: "Open “＋ Add Word” from the word list — there's a camera button next to both the Front and Example fields. Take a photo and select an area to read the text in it (English only).",
    help_list_title: "Word List",
    help_list_body: "You can search, filter, and sort. Swipe a word left to reveal the delete button.",
    help_goal_title: "Today's Goal",
    help_goal_body: "In Settings, you can set a daily goal for how many new words to learn. Today's progress shows on the Home screen (reviewing words you already know doesn't count; moving a word back from “Got it” to “Still learning” lowers the count too). Set it to “Off” to hide it.",
    help_reorder_title: "Reordering Decks",
    help_reorder_body: "From “Reorder” on the Home screen, use the ▲▼ buttons to change the order decks are shown in (shown once you have 2 or more decks).",
    help_calendar_title: "Calendar",
    help_calendar_body: "The first time you open the app each day, a stamp is added to the calendar on the Stats screen. Use “‹” / “›” to switch months. Tap a stamped day to see how many new words you learned that day.",
    help_share_title: "Sharing a Deck",
    help_share_body: "“Export This Deck” on the deck screen saves just that deck's words to a file (no learned status or stats included). Send the file to someone else — when they open it with “Import Deck” on their Home screen, it's added as a new deck.",
    help_backup_title: "Backup",
    help_backup_body: "“Backup” in Settings lets you export all your decks, words, and stats to one file. Use “Import” to restore it — handy when switching devices (importing overwrites all current data).",
    btn_cancel: "Cancel",
    btn_ok: "OK",
  },
  zh: {
    appTitle: "單字本",
    back: "返回",
    nav_home: "首頁",
    nav_stats: "統計",
    nav_settings: "設定",
    goal_label: "今日目標",
    goal_text: (count, goal) => (count >= goal ? `${count} / ${goal} 個 達成` : `${count} / ${goal} 個`),
    deck_new: "＋ 新增卡組",
    deck_import: "匯入卡組",
    deck_reorder: "排序",
    deck_reorder_done: "完成",
    deck_empty_html: "目前沒有卡組。<br>點選「＋ 新增卡組」開始建立。",
    deck_count: (total, pending) => `${total}個單字${pending > 0 ? ` / 未學會${pending}個` : ""}`,
    deck_move_up_aria: "上移",
    deck_move_down_aria: "下移",
    prompt_deck_name: "請輸入卡組名稱",
    prompt_rename_deck: "請輸入新的卡組名稱",
    quiz_mode_label: "出題方式",
    quiz_mode_card: "卡片",
    quiz_mode_typing: "拼寫",
    quiz_mode_blank: "填空",
    quiz_mode_listening: "聽力",
    tts_lang_label: "朗讀語言",
    tts_lang_off: "關閉",
    tts_lang_en: "英文",
    tts_lang_zh: "中文",
    btn_start_review: "開始複習",
    btn_review_all: "全部複習",
    btn_word_list: "單字列表",
    btn_export_deck: "匯出此卡組",
    btn_rename_deck: "重新命名卡組",
    btn_delete_deck: "刪除此卡組",
    deck_due: (total, pending) => `共${total}個單字・未學會 ${pending}個`,
    confirm_delete_deck: (name) => `確定要刪除「${name}」嗎？\n其中的單字也會一併刪除。`,
    alert_deck_file_invalid: "無法作為卡組檔案讀取。",
    default_imported_deck_name: "匯入的卡組",
    alert_file_read_failed: "無法讀取檔案，檔案可能已損毀或格式不支援。",
    alert_deck_added: (name) => `已新增「${name}」。`,
    alert_backup_invalid: "無法作為備份檔案讀取。",
    confirm_backup_restore: "目前的資料將會全部被覆蓋，確定要還原嗎？",
    alert_backup_restored: "已還原備份。",
    speak_aria: "播放發音",
    example_speak_aria: "播放例句發音",
    hint_tap: "點一下翻面",
    hint_tap_swipe: "點一下翻面／左右滑動",
    btn_still: "還沒會",
    btn_know: "已學會",
    quiz_play_aria: "播放語音",
    quiz_input_placeholder: "請輸入單字",
    btn_check_answer: "對答案",
    btn_next: "下一題",
    btn_back_to_deck: "回到卡組畫面",
    quiz_correct: "○ 答對了",
    quiz_incorrect: (answer) => `× 正確答案：${answer}`,
    review_done_blank_unavailable: "沒有可用於填空的例句單字，請嘗試其他出題方式。",
    review_done_listening_off: "此卡組尚未設定朗讀語言，請在卡組畫面選擇朗讀語言。",
    review_done_listening_unavailable: "沒有可用於聽力模式的單字，請確認卡組的朗讀語言與單字的書寫是否一致。",
    review_done_no_cards: "此卡組還沒有單字。",
    review_done_all_known: "沒有尚未學會的單字。",
    photo_hint_shoot: "請拍攝一個單字，使其完整入鏡（僅支援英文）。",
    btn_shoot: "拍照",
    photo_hint_crop: "請拖曳選取單字所在的範圍",
    btn_retake: "重新拍攝",
    btn_recognize: "辨識此範圍",
    label_ocr_result: "辨識結果（可編輯）",
    btn_reselect: "重新選取範圍",
    btn_retake2: "重新拍照",
    btn_use_result: "使用此內容",
    photo_loading: "辨識中…",
    alert_select_range: "請先選取範圍",
    alert_ocr_failed: "文字辨識失敗，請再試一次。",
    btn_add_card: "＋ 新增單字",
    search_placeholder: "搜尋",
    filter_all: "全部",
    filter_unknown: "還沒會",
    filter_known: "已學會",
    sort_added: "新增順序",
    sort_alpha: "字母順序",
    btn_delete: "刪除",
    edit_aria: "編輯",
    list_empty_html: "還沒有單字。<br>點選「＋ 新增單字」開始新增。",
    list_no_match: "找不到符合的單字。",
    confirm_delete_card: (front) => `確定要刪除「${front}」嗎？`,
    label_front: "正面（單字）",
    btn_photo_input: "從照片輸入",
    label_back: "背面（意思）",
    label_example: "例句（選填）",
    label_status: "學習狀態",
    btn_save: "儲存",
    title_add_word: "新增單字",
    title_edit_word: "編輯單字",
    title_photo_front: "從照片辨識單字",
    title_photo_example: "從照片辨識例句",
    confirm_duplicate: (front) => `「${front}」已經存在於此卡組中。\n仍要繼續新增嗎？`,
    label_progress: "學習進度",
    label_mastered_sub: (mastered, total) => `已學會 ${mastered} / ${total} 個單字`,
    stat_total_days: "累計學習天數",
    stat_streak: "目前連續天數",
    stat_total_words: "單字總數",
    stat_known_words: "已學會單字",
    unit_days: (n) => `${n}天`,
    unit_words: (n) => `${n}個`,
    calendar_weekdays: ["日", "一", "二", "三", "四", "五", "六"],
    calendar_prev_aria: "上個月",
    calendar_next_aria: "下個月",
    calendar_month_label: (year, month) => `${year}年${month}月`,
    calendar_day_detail: (year, month, day, count) => `${year}年${month}月${day}日：學會了${count}個單字`,
    label_theme: "顯示模式",
    theme_light: "淺色",
    theme_dark: "深色",
    theme_system: "自動",
    label_speech_rate: "朗讀速度",
    rate_normal: "正常",
    rate_slow: "較慢",
    label_daily_goal: "今日目標",
    goal_off: "關閉",
    label_ui_lang: "語言",
    ui_lang_ja: "日本語",
    ui_lang_en: "English",
    ui_lang_zh: "繁體中文",
    label_backup: "備份（全部資料）",
    word_backup: "備份",
    btn_backup_export: "匯出",
    btn_backup_import: "匯入",
    btn_help: "使用說明",
    title_help: "使用說明",
    help_quiz_mode_title: "出題方式",
    help_quiz_mode_card: "<strong>卡片</strong>：點一下翻面，自行對答案。左右滑動也可以選擇「還沒會」／「已學會」。",
    help_quiz_mode_typing: "<strong>拼寫</strong>：看意思輸入單字。",
    help_quiz_mode_blank: "<strong>填空</strong>：例句中的單字部分會變成空格，請從前後文回想並輸入（僅限已登錄例句的單字）。",
    help_quiz_mode_listening: "<strong>聽力</strong>：聆聽單字發音，從4個選項中選出正確意思（僅限卡組的朗讀語言不是「關閉」時可用）。",
    help_tts_lang_title: "朗讀語言",
    help_tts_lang_body: "在卡組畫面的「朗讀語言」中，可以選擇該卡組的單字要用哪種語言朗讀（關閉／英文／中文）。由於只有漢字的日文單字無法與中文區分，因此不會自動判斷，而是需要依卡組個別指定。像古文單字這類不需要朗讀的卡組，請設為「關閉」。若單字中不包含所設定語言對應的文字（英文需要英文字母、中文需要漢字），該單字就不會顯示發音按鈕。",
    help_review_title: "開始複習／全部複習",
    help_review_body: "「開始複習」只會出還沒學會的單字，「全部複習」則會出卡組內所有單字。",
    help_photo_title: "從照片輸入",
    help_photo_body: "在單字列表點選「＋ 新增單字」後，「正面」「例句」旁邊都有相機按鈕。拍照並選取範圍後，可以將該範圍的文字辨識並輸入（僅支援英文）。",
    help_list_title: "單字列表",
    help_list_body: "可以搜尋、篩選、排序。將單字向左滑動即可顯示刪除按鈕。",
    help_goal_title: "今日目標",
    help_goal_body: "可在設定畫面設定每天要新學會的單字數目標，首頁會顯示今天的達成狀況（單純複習已經學會的單字不會被計入；把「已學會」改回「還沒會」，達成數也會跟著減少）。設為「關閉」即可隱藏。",
    help_reorder_title: "卡組排序",
    help_reorder_body: "在首頁點選「排序」後，可用▲▼按鈕調整卡組的顯示順序（當卡組有2個以上時才會顯示）。",
    help_calendar_title: "日曆",
    help_calendar_body: "每天第一次開啟應用程式時，統計畫面的日曆就會蓋上一個章。可用「‹」「›」切換月份。點選蓋章的日期，可以確認當天新學會了幾個單字。",
    help_share_title: "分享卡組",
    help_share_body: "在卡組畫面點選「匯出此卡組」，可以只將該卡組的單字儲存成檔案（不含學習狀態與統計資料）。將檔案傳給對方，對方在首頁點選「匯入卡組」開啟後，就會以新卡組的形式新增進去。",
    help_backup_title: "備份",
    help_backup_body: "設定畫面的「備份」可以將所有卡組、單字、統計資料一併匯出成檔案。更換裝置時，可用「匯入」還原（匯入後目前的資料會全部被覆蓋）。",
    btn_cancel: "取消",
    btn_ok: "確定",
  },
};

function currentUiLang() {
  return localStorage.getItem("uiLang") || "ja";
}

function t(key, ...args) {
  const dict = translations[currentUiLang()] || translations.ja;
  const entry = dict[key] !== undefined ? dict[key] : translations.ja[key];
  return typeof entry === "function" ? entry(...args) : entry;
}

// data-i18n系の属性を持つ静的なDOM要素すべてに現在の表示言語を適用する
function applyStaticTranslations() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-html]").forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml);
  });
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPh);
  });
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    el.setAttribute("aria-label", t(el.dataset.i18nAria));
  });
  document.title = t("appTitle");
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
  topTitle.textContent = opts.title || t("appTitle");
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
    list.innerHTML = `<p class="empty-msg">${t("deck_empty_html")}</p>`;
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
          <span class="deck-count ${pending > 0 ? "due" : ""}">${t("deck_count", total, pending)}</span>
        </div>
        <div class="deck-reorder-btns">
          <button type="button" class="deck-reorder-btn" data-dir="up" ${index === 0 ? "disabled" : ""} aria-label="${t("deck_move_up_aria")}">▲</button>
          <button type="button" class="deck-reorder-btn" data-dir="down" ${index === state.decks.length - 1 ? "disabled" : ""} aria-label="${t("deck_move_down_aria")}">▼</button>
        </div>
      `;
      row.querySelectorAll(".deck-reorder-btn").forEach((btn) => {
        btn.addEventListener("click", () => moveDeck(deck.id, btn.dataset.dir));
      });
    } else {
      row.innerHTML = `
        <span class="deck-name">${escapeHtml(deck.name)}</span>
        <span class="deck-count ${pending > 0 ? "due" : ""}">${t("deck_count", total, pending)}</span>
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
  deckReorderBtn.textContent = deckReorderMode ? t("deck_reorder_done") : t("deck_reorder");
  renderHome();
});

document.getElementById("newDeckBtn").addEventListener("click", async () => {
  const name = await showPrompt(t("prompt_deck_name"));
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
  document.getElementById("goalCount").textContent = t("goal_text", count, goalNum);
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
  document.getElementById("deckDue").textContent = t("deck_due", total, pending);
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
document.getElementById("viewListBtn").addEventListener("click", () => navigate("list", { back: true, title: t("btn_word_list") }));
document.getElementById("renameDeckBtn").addEventListener("click", async () => {
  const deck = currentDeck();
  const name = await showPrompt(t("prompt_rename_deck"), deck.name);
  if (!name) return;
  deck.name = name;
  saveData(state);
  renderDeck();
});
document.getElementById("deleteDeckBtn").addEventListener("click", async () => {
  const deck = currentDeck();
  const ok = await showConfirm(t("confirm_delete_deck", deck.name));
  if (!ok) return;
  state.decks = state.decks.filter((d) => d.id !== deck.id);
  state.cards = state.cards.filter((c) => c.deckId !== deck.id);
  saveData(state);
  navStack = [];
  navigate("home");
});

// JSONをファイルとしてダウンロードさせる（デッキの書き出し／バックアップ共通）
function downloadJson(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------- デッキの書き出し／読み込み（配布用：単語のみ、進捗・統計は含めない） ----------
document.getElementById("exportDeckBtn").addEventListener("click", () => {
  const deck = currentDeck();
  const deckCards = state.cards.filter((c) => c.deckId === deck.id);
  const payload = {
    type: "tango-deck",
    version: 1,
    name: deck.name,
    lang: deck.lang,
    cards: deckCards.map((c) => ({ front: c.front, back: c.back, example: c.example || "" })),
  };
  downloadJson(payload, `${t("appTitle")}_${deck.name}.json`);
});

const importDeckInput = document.getElementById("importDeckInput");
document.getElementById("importDeckBtn").addEventListener("click", () => importDeckInput.click());
importDeckInput.addEventListener("change", async () => {
  const file = importDeckInput.files[0];
  importDeckInput.value = "";
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    if (payload.type !== "tango-deck" || !Array.isArray(payload.cards)) {
      await showAlert(t("alert_deck_file_invalid"));
      return;
    }
    const name = payload.name ? String(payload.name) : t("default_imported_deck_name");
    const lang = payload.lang === "zh" || payload.lang === "en" ? payload.lang : "en";
    const newDeckId = uid();
    state.decks.push({ id: newDeckId, name, lang });
    payload.cards.forEach((c) => {
      if (!c || !c.front || !c.back) return;
      state.cards.push({
        id: uid(),
        deckId: newDeckId,
        front: String(c.front),
        back: String(c.back),
        example: c.example ? String(c.example) : "",
        known: false,
        createdAt: Date.now(),
      });
    });
    saveData(state);
    renderHome();
    await showAlert(t("alert_deck_added", name));
  } catch (e) {
    await showAlert(t("alert_file_read_failed"));
  }
});

// ---------- 全データのバックアップ（自分用：機種変更などで丸ごと復元） ----------
document.getElementById("backupExportBtn").addEventListener("click", () => {
  const payload = { type: "tango-backup", version: 1, decks: state.decks, cards: state.cards, stats: state.stats };
  downloadJson(payload, `${t("appTitle")}_${t("word_backup")}_${jstDateString(Date.now())}.json`);
});

const backupImportInput = document.getElementById("backupImportInput");
document.getElementById("backupImportBtn").addEventListener("click", () => backupImportInput.click());
backupImportInput.addEventListener("change", async () => {
  const file = backupImportInput.files[0];
  backupImportInput.value = "";
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    if (payload.type !== "tango-backup" || !Array.isArray(payload.decks) || !Array.isArray(payload.cards)) {
      await showAlert(t("alert_backup_invalid"));
      return;
    }
    const ok = await showConfirm(t("confirm_backup_restore"));
    if (!ok) return;
    state = {
      decks: payload.decks,
      cards: payload.cards,
      stats: payload.stats || { streak: 0, lastReviewDate: null, dailyLearnedCounts: {}, stampedDates: [] },
    };
    state.cards.forEach((c) => {
      if (c.known === undefined) c.known = (c.box || 1) >= 5;
      delete c.box;
    });
    migrateDeckLangs(state);
    saveData(state);
    backfillStampedDatesForStreak();
    stampToday();
    navStack = [];
    navigate("home");
    await showAlert(t("alert_backup_restored"));
  } catch (e) {
    await showAlert(t("alert_file_read_failed"));
  }
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
  reviewHint.textContent = ui.flipped ? t("hint_tap_swipe") : t("hint_tap");
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
      ? t("review_done_blank_unavailable")
      : ui.listeningUnavailable
      ? currentDeck().lang === "off"
        ? t("review_done_listening_off")
        : t("review_done_listening_unavailable")
      : ui.reviewMode === "all"
      ? t("review_done_no_cards")
      : t("review_done_all_known");
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
// （）／()で囲まれた部分（訳注などの補足）を読み上げ対象から取り除く
function stripParens(text) {
  return text.replace(/（[^（）]*）|\([^()]*\)/g, " ").replace(/\s+/g, " ").trim();
}

function exampleSpeechText(card, deckLang) {
  if (!card.example) return "";
  const text = stripParens(card.example);
  return deckLang === "en" ? extractEnglish(text) : text;
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
  quizFeedback.textContent = correct ? t("quiz_correct") : t("quiz_incorrect", card.back);
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

  quizFeedback.textContent = correct ? t("quiz_correct") : t("quiz_incorrect", card.front);
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
  navigate("add", { back: true, title: t("title_add_word") });
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
        ? `<p class="empty-msg">${t("list_empty_html")}</p>`
        : `<p class="empty-msg">${t("list_no_match")}</p>`;
    return;
  }
  cards.forEach((card) => {
    const row = document.createElement("div");
    row.className = "card-item";
    row.innerHTML = `
      <div class="card-item-delete-bg">
        <button class="card-item-delete-btn">${t("btn_delete")}</button>
      </div>
      <div class="card-item-inner">
        <div class="card-info">
          <div class="card-front-text">${escapeHtml(card.front)}</div>
          <div class="card-back-text">${escapeHtml(card.back)}</div>
        </div>
        <button class="edit-icon-btn" aria-label="${t("edit_aria")}">
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
      navigate("add", { back: true, title: t("title_edit_word") });
    });
    row.querySelector(".card-item-delete-btn").addEventListener("click", async () => {
      const ok = await showConfirm(t("confirm_delete_card", card.front));
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
  navigate("photo", { back: true, title: t("title_photo_front") });
});
document.getElementById("exampleCameraBtn").addEventListener("click", () => {
  ui.photoTarget = "example";
  navigate("photo", { back: true, title: t("title_photo_example") });
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
      const ok = await showConfirm(t("confirm_duplicate", front));
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
    await showAlert(t("alert_select_range"));
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
    await showAlert(t("alert_ocr_failed"));
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
  const opts = addEntry ? addEntry.opts : { back: true, title: t("title_add_word") };
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
  document.getElementById("gaugeSub").textContent = t("label_mastered_sub", mastered, totalCards);
  const totalDays = (state.stats.stampedDates || []).length;
  const rows = [
    [t("stat_total_days"), t("unit_days", totalDays)],
    [t("stat_streak"), t("unit_days", state.stats.streak)],
    [t("stat_total_words"), t("unit_words", totalCards)],
    [t("stat_known_words"), t("unit_words", mastered)],
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
  document.getElementById("calendarLabel").textContent = t("calendar_month_label", year, month + 1);
  document.getElementById("calendarWeekdays").innerHTML = t("calendar_weekdays")
    .map((w) => `<span>${w}</span>`)
    .join("");

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
        showAlert(t("calendar_day_detail", year, month + 1, d, count));
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

// ---------- 表示言語切り替え（デフォルトは日本語） ----------
const uiLangBtns = document.querySelectorAll("[data-ui-lang]");

function updateUiLangToggleUI() {
  const lang = currentUiLang();
  uiLangBtns.forEach((btn) => btn.classList.toggle("active", btn.dataset.uiLang === lang));
}

function setUiLang(lang) {
  localStorage.setItem("uiLang", lang);
  updateUiLangToggleUI();
  applyStaticTranslations();
  // 現在表示中の画面の動的な文言（ボタンの状態やメッセージなど）も
  // 選んだ言語で再構築する。データを参照して再描画するだけなので副作用はない。
  const activeScreen = document.querySelector(".screen.active");
  const activeName = activeScreen ? activeScreen.id.replace("screen-", "") : "home";
  if (activeName === "home") renderHome();
  if (activeName === "deck") renderDeck();
  if (activeName === "list") renderList();
  if (activeName === "stats") renderStats();
  // ヘッダーのタイトルも画面に応じて翻訳し直す
  if (activeName === "deck" && ui.currentDeckId) topTitle.textContent = currentDeck().name;
  else if (activeName === "list") topTitle.textContent = t("btn_word_list");
  else if (activeName === "help") topTitle.textContent = t("title_help");
  else if (activeName === "add") topTitle.textContent = ui.editingCardId ? t("title_edit_word") : t("title_add_word");
  else topTitle.textContent = t("appTitle");
}

updateUiLangToggleUI();
applyStaticTranslations();

uiLangBtns.forEach((btn) => {
  btn.addEventListener("click", () => setUiLang(btn.dataset.uiLang));
});

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
  navigate("help", { back: true, title: t("title_help") });
});

// ---------- 初期化 ----------
navigate("home");

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}
