const STORAGE_KEY = "nutritionPwaState.v1";
const CARD_CODE_PREFIX = "NUTRI:";
const TZ = "Asia/Taipei";
const MACROS = [
  { key: "carbs", label: "碳水", color: "#356fa8" },
  { key: "protein", label: "蛋白質", color: "#2f7d63" },
  { key: "fat", label: "脂肪", color: "#b7791f" }
];

const defaultState = {
  settings: {
    theme: "light",
    targetCarbs: 50,
    targetProtein: 25,
    targetFat: 25,
    bmr: "",
    apiKey: "",
    model: "gpt-5.4-mini"
  },
  cards: [],
  logs: [],
  selectedDate: taiwanYmd(new Date())
};

let state = loadState();
let macroView = "daily";
let activeTaiwanDate = taiwanYmd(new Date());
if (state.selectedDate !== activeTaiwanDate) {
  state.selectedDate = activeTaiwanDate;
  saveState();
}
let calendarCursor = firstOfMonth(parseYmd(state.selectedDate));

const els = {};

document.addEventListener("DOMContentLoaded", () => {
  bindElements();
  initApp();
});

function bindElements() {
  [
    "taiwanClock", "weekRange", "themeToggle", "emptyWeekNotice",
    "macroChart", "macroStats", "targetCarbs", "targetProtein", "targetFat",
    "bmrInput", "macroCaloriesTitle", "macroCalories", "calorieDiff", "macroSodiumTitle", "macroSodium", "sodiumStatus",
    "macroDailyButton", "macroWeeklyButton",
    "aiSettingsToggle", "aiSettings", "apiKeyInput", "modelInput", "aiAdvice",
    "askAiButton", "selectedDateLabel", "datePickerButton", "dailySummary",
    "logList", "addLogButton", "importCardButton", "addCardButton", "foodCardList", "modalLayer"
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });
}

function initApp() {
  document.documentElement.dataset.theme = state.settings.theme;
  fillSettings();
  bindEvents();
  tickClock();
  setInterval(tickClock, 1000);
  render();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").then((registration) => {
      registration.update().catch(() => {});
    }).catch(() => {});
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "CACHE_UPDATED") {
        window.location.reload();
      }
    });
  }
}

function bindEvents() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => setTab(button.dataset.tab));
  });
  document.querySelectorAll("[data-macro-view]").forEach((button) => {
    button.addEventListener("click", () => {
      macroView = button.dataset.macroView;
      renderOverview();
    });
  });

  els.themeToggle.addEventListener("click", () => {
    state.settings.theme = state.settings.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = state.settings.theme;
    saveState();
  });

  ["targetCarbs", "targetProtein", "targetFat", "bmrInput", "apiKeyInput", "modelInput"].forEach((id) => {
    els[id].addEventListener("input", () => {
      state.settings[idToSetting(id)] = els[id].value;
      saveState();
      renderOverview();
    });
  });

  els.aiSettingsToggle.addEventListener("click", () => {
    els.aiSettings.classList.toggle("is-hidden");
  });
  els.askAiButton.addEventListener("click", askAiAdvice);
  els.datePickerButton.addEventListener("click", openCalendarModal);
  els.addLogButton.addEventListener("click", openAddLogModal);
  els.importCardButton.addEventListener("click", () => openImportCardModal());
  els.addCardButton.addEventListener("click", () => openCardForm());
}

function idToSetting(id) {
  return {
    targetCarbs: "targetCarbs",
    targetProtein: "targetProtein",
    targetFat: "targetFat",
    bmrInput: "bmr",
    apiKeyInput: "apiKey",
    modelInput: "model"
  }[id];
}

function fillSettings() {
  els.targetCarbs.value = state.settings.targetCarbs;
  els.targetProtein.value = state.settings.targetProtein;
  els.targetFat.value = state.settings.targetFat;
  els.bmrInput.value = state.settings.bmr;
  els.apiKeyInput.value = state.settings.apiKey;
  els.modelInput.value = state.settings.model || "gpt-5.4-mini";
}

function setTab(tab) {
  document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("is-active"));
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("is-active"));
  document.getElementById(`tab-${tab}`).classList.add("is-active");
  document.querySelector(`[data-tab="${tab}"]`).classList.add("is-active");
}

function render() {
  renderOverview();
  renderLog();
  renderCards();
}

function renderOverview() {
  const week = getWeekRange(new Date());
  const weekLogs = state.logs.filter((log) => log.date >= week.start && log.date <= week.end);
  const todayLogs = state.logs.filter((log) => log.date === taiwanYmd(new Date()));
  els.weekRange.textContent = `${formatDateShort(week.start)} - ${formatDateShort(week.end)}`;
  const viewData = getMacroViewData(todayLogs, weekLogs);
  els.emptyWeekNotice.classList.toggle("is-hidden", viewData.hasData);
  document.querySelectorAll("#tab-overview .panel").forEach((panel) => {
    panel.classList.toggle("is-muted", !viewData.hasData);
  });
  els.macroDailyButton.classList.toggle("is-active", macroView === "daily");
  els.macroWeeklyButton.classList.toggle("is-active", macroView === "weekly");

  drawMacroChart(viewData.totals, viewData.hasData, viewData.totals.calories);
  renderMacroStats(viewData.totals, viewData.hasData);

  els.macroCaloriesTitle.textContent = viewData.calorieTitle;
  els.macroCalories.textContent = `${round(viewData.totals.calories, 0)} kcal`;
  els.macroSodiumTitle.textContent = viewData.sodiumTitle;
  els.macroSodium.textContent = `${round(viewData.totals.sodium, 0)} mg`;

  const bmr = Number(state.settings.bmr || 0);
  const diff = viewData.totals.calories - bmr;
  els.calorieDiff.textContent = bmr ? `差值 ${signed(round(diff, 0))} kcal` : "輸入基礎代謝率後計算差值";
  els.calorieDiff.classList.toggle("over", bmr > 0 && diff > 0);
  els.calorieDiff.classList.toggle("under", bmr > 0 && diff < 0);

  els.sodiumStatus.textContent = viewData.totals.sodium > 2000 ? "超過 2000 mg，建議攝取量 2400/日" : "建議攝取量 2400/日";
  els.sodiumStatus.classList.toggle("over", viewData.totals.sodium > 2000);
}

function getMacroViewData(todayLogs, weekLogs) {
  if (macroView === "weekly") {
    const totals = totalLogs(weekLogs);
    const recordedDays = Math.max(new Set(weekLogs.map((log) => log.date)).size, 1);
    return {
      hasData: weekLogs.length > 0,
      totals: divideTotals(totals, recordedDays),
      calorieTitle: "本週平均熱量",
      sodiumTitle: "本週平均鈉攝取"
    };
  }

  return {
    hasData: todayLogs.length > 0,
    totals: totalLogs(todayLogs),
    calorieTitle: "本日攝取熱量",
    sodiumTitle: "本日鈉攝取"
  };
}

function divideTotals(totals, divisor) {
  return Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, value / divisor]));
}

function renderMacroStats(totals, hasData) {
  const totalMacroGrams = MACROS.reduce((sum, macro) => sum + totals[macro.key], 0);
  const targets = {
    carbs: Number(state.settings.targetCarbs || 0),
    protein: Number(state.settings.targetProtein || 0),
    fat: Number(state.settings.targetFat || 0)
  };

  els.macroStats.innerHTML = "";
  MACROS.forEach((macro) => {
    const pct = hasData && totalMacroGrams ? (totals[macro.key] / totalMacroGrams) * 100 : 0;
    const target = targets[macro.key];
    const stateText = !hasData ? "" : pct > target ? "超過" : pct < target ? "少於" : "等於";
    const stateClass = !hasData ? "" : pct > target ? "over" : pct < target ? "under" : "";
    const row = document.createElement("div");
    row.className = "macro-line";
    row.innerHTML = `
      <span>${macro.label}</span>
      <div class="bar"><span class="${macro.key}" style="width:${clamp(pct, 0, 100)}%"></span></div>
      <span class="${stateClass}">${round(pct, 1)}% / ${target}% ${stateText}</span>
    `;
    els.macroStats.append(row);
  });
}

function drawMacroChart(totals, hasData, averageCalories) {
  const canvas = els.macroChart;
  const ctx = canvas.getContext("2d");
  const size = canvas.width;
  ctx.clearRect(0, 0, size, size);
  const center = size / 2;
  const radius = size * 0.38;
  const values = MACROS.map((macro) => totals[macro.key]);
  const total = values.reduce((sum, value) => sum + value, 0);

  if (!hasData || !total) {
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.fillStyle = getCss("--surface-soft");
    ctx.fill();
    ctx.fillStyle = getCss("--muted");
    ctx.font = "600 18px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("沒有資料", center, center);
    return;
  }

  let start = -Math.PI / 2;
  values.forEach((value, index) => {
    const angle = (value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.arc(center, center, radius, start, start + angle);
    ctx.closePath();
    ctx.fillStyle = MACROS[index].color;
    ctx.fill();
    start += angle;
  });

  ctx.beginPath();
  ctx.arc(center, center, radius * 0.58, 0, Math.PI * 2);
  ctx.fillStyle = getCss("--surface");
  ctx.fill();
  ctx.fillStyle = getCss("--text");
  ctx.font = "800 18px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${round(averageCalories, 0)} kcal`, center, center);
}

function renderLog() {
  const selected = state.selectedDate;
  const logs = state.logs.filter((log) => log.date === selected).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  els.selectedDateLabel.textContent = formatDateLong(selected);
  renderDailySummary(logs);
  els.logList.innerHTML = "";

  if (!logs.length) {
    els.logList.innerHTML = `<div class="empty-state">這一天尚未新增食物</div>`;
    return;
  }

  logs.forEach((log) => {
    const totals = scaledSnapshot(log);
    const row = document.createElement("div");
    row.className = "log-row";
    row.innerHTML = `
      <button class="row-copy" type="button">複製</button>
      <button class="row-delete" type="button">刪除</button>
      <button class="row-surface" type="button">
        <div class="row-title">
          <strong>${escapeHtml(log.snapshot.name)}</strong>
          <span class="pill">${formatServings(log.servings)}</span>
        </div>
        ${nutriGrid(totals)}
      </button>
    `;
    row.querySelector(".row-copy").addEventListener("click", () => copyCardCode(log.snapshot));
    row.querySelector(".row-delete").addEventListener("click", () => confirmDeleteLog(log.id));
    row.querySelector(".row-surface").addEventListener("click", () => openLogDetail(log.id));
    attachSwipe(row);
    els.logList.append(row);
  });
}

function renderDailySummary(logs) {
  const totals = totalLogs(logs);
  els.dailySummary.innerHTML = `
    <span>熱量 ${round(totals.calories, 0)} kcal</span>
    <span>鈉 ${round(totals.sodium, 0)} mg</span>
    <span>碳水 ${round(totals.carbs, 1)} g</span>
    <span>蛋白質 ${round(totals.protein, 1)} g</span>
  `;
}

function renderCards() {
  els.foodCardList.innerHTML = "";
  if (!state.cards.length) {
    els.foodCardList.innerHTML = `<div class="empty-state">先新增常吃品項，紀錄時就能直接選</div>`;
    return;
  }

  [...state.cards].sort((a, b) => a.name.localeCompare(b.name, "zh-Hant")).forEach((card) => {
    const item = document.createElement("article");
    item.className = "food-card";
    item.innerHTML = `
      <div class="food-card-title">
        <strong>${escapeHtml(card.name)}</strong>
        <span class="pill">${round(card.calories, 0)} kcal</span>
      </div>
      ${nutriGrid(card)}
      ${card.note ? `<p class="empty-copy">${escapeHtml(card.note)}</p>` : ""}
      <div class="food-card-actions">
        <button class="secondary-button" type="button" data-edit>編輯</button>
        <button class="secondary-button" type="button" data-copy>複製代碼</button>
        <button class="danger-button" type="button" data-delete>刪除</button>
      </div>
    `;
    item.querySelector("[data-edit]").addEventListener("click", () => openCardForm(card.id));
    item.querySelector("[data-copy]").addEventListener("click", () => copyCardCode(card));
    item.querySelector("[data-delete]").addEventListener("click", () => confirmDeleteCard(card.id));
    els.foodCardList.append(item);
  });
}

function openCardForm(cardId, afterSave) {
  const card = state.cards.find((item) => item.id === cardId);
  const node = document.getElementById("cardFormTemplate").content.firstElementChild.cloneNode(true);
  node.querySelector("[data-modal-title]").textContent = card ? "編輯卡片" : "新增卡片";
  if (card) {
    ["name", "calories", "sodium", "carbs", "protein", "fat", "note"].forEach((key) => {
      node.elements[key].value = card[key] ?? "";
    });
  }

  node.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(node);
    const next = {
      id: card?.id || crypto.randomUUID(),
      name: String(data.get("name")).trim(),
      calories: Number(data.get("calories") || 0),
      sodium: Number(data.get("sodium") || 0),
      carbs: Number(data.get("carbs") || 0),
      protein: Number(data.get("protein") || 0),
      fat: Number(data.get("fat") || 0),
      note: String(data.get("note") || "").trim()
    };
    if (!next.name) return;
    if (card) {
      state.cards = state.cards.map((item) => item.id === card.id ? next : item);
    } else {
      state.cards.push(next);
    }
    saveState();
    closeModal();
    render();
    if (afterSave) afterSave(next);
  });

  openModal(node);
}

function openAddLogModal() {
  const wrapper = document.createElement("div");
  wrapper.className = "modal-card";
  wrapper.innerHTML = `
    <div class="modal-head">
      <h2>新增已吃食物</h2>
      <button class="icon-button" type="button" data-close-modal aria-label="關閉" title="關閉">×</button>
    </div>
    <div class="servings-row">
      <label>份數
        <input id="servingsInput" type="number" inputmode="decimal" min="0.1" step="0.1" value="1">
      </label>
      <div class="modal-actions">
        <button id="importCardInLog" class="text-button" type="button">輸入代碼</button>
        <button id="quickAddCard" class="text-button" type="button">新增卡片</button>
      </div>
    </div>
    <div class="choice-list" id="choiceList"></div>
  `;

  const choiceList = wrapper.querySelector("#choiceList");
  const renderChoices = () => {
    choiceList.innerHTML = "";
    if (!state.cards.length) {
      choiceList.innerHTML = `<div class="empty-state">目前沒有卡片，請先新增</div>`;
      return;
    }
    state.cards.forEach((card) => {
      const button = document.createElement("button");
      button.className = "choice-card";
      button.type = "button";
      button.innerHTML = `<strong>${escapeHtml(card.name)}</strong>${nutriGrid(card)}`;
      button.addEventListener("click", () => {
        const servings = Math.max(0.1, Number(wrapper.querySelector("#servingsInput").value || 1));
        addLogFromCard(card, servings);
        closeModal();
      });
      choiceList.append(button);
    });
  };

  wrapper.querySelector("#quickAddCard").addEventListener("click", () => {
    openCardForm(null, (card) => {
      addLogFromCard(card, 1);
    });
  });
  wrapper.querySelector("#importCardInLog").addEventListener("click", () => {
    openImportCardModal((card) => {
      const servings = Math.max(0.1, Number(wrapper.querySelector("#servingsInput")?.value || 1));
      addLogFromCard(card, servings);
    });
  });

  renderChoices();
  openModal(wrapper);
}

function addLogFromCard(card, servings) {
  state.logs.push({
    id: crypto.randomUUID(),
    date: state.selectedDate,
    cardId: card.id,
    servings,
    snapshot: { ...card },
    createdAt: new Date().toISOString()
  });
  saveState();
  render();
}

function openLogDetail(logId) {
  const log = state.logs.find((item) => item.id === logId);
  if (!log) return;
  const totals = scaledSnapshot(log);
  const wrapper = document.createElement("div");
  wrapper.className = "modal-card form-stack";
  wrapper.innerHTML = `
    <div class="modal-head">
      <h2>${escapeHtml(log.snapshot.name)}</h2>
      <button class="icon-button" type="button" data-close-modal aria-label="關閉" title="關閉">×</button>
    </div>
    ${nutriGrid(totals)}
    <label>份數
      <input id="editServings" type="number" inputmode="decimal" min="0.1" step="0.1" value="${log.servings}">
    </label>
    ${log.snapshot.note ? `<p class="empty-copy">${escapeHtml(log.snapshot.note)}</p>` : ""}
    <button id="saveLogEdit" class="primary-button" type="button">儲存</button>
  `;
  wrapper.querySelector("#saveLogEdit").addEventListener("click", () => {
    log.servings = Math.max(0.1, Number(wrapper.querySelector("#editServings").value || 1));
    saveState();
    closeModal();
    render();
  });
  openModal(wrapper);
}

function confirmDeleteLog(logId) {
  if (!confirm("確認刪除這筆飲食紀錄？")) return;
  state.logs = state.logs.filter((log) => log.id !== logId);
  saveState();
  render();
}

function confirmDeleteCard(cardId) {
  const used = state.logs.some((log) => log.cardId === cardId);
  const message = used ? "這張卡片已被過去紀錄使用。刪除後過去紀錄仍保留當時的營養快照，確認刪除？" : "確認刪除這張卡片？";
  if (!confirm(message)) return;
  state.cards = state.cards.filter((card) => card.id !== cardId);
  saveState();
  render();
}

function openImportCardModal(afterImport) {
  const wrapper = document.createElement("div");
  wrapper.className = "modal-card form-stack";
  wrapper.innerHTML = `
    <div class="modal-head">
      <h2>輸入卡片代碼</h2>
      <button class="icon-button" type="button" data-close-modal aria-label="關閉" title="關閉">×</button>
    </div>
    <label>卡片代碼
      <textarea id="cardCodeInput" rows="5" placeholder="貼上 NUTRI: 開頭的代碼"></textarea>
    </label>
    <div id="cardCodePreview" class="import-preview empty-state">貼上代碼後先按檢查</div>
    <div class="modal-button-row">
      <button id="previewCardCode" class="secondary-button" type="button">檢查</button>
      <button id="saveImportedCard" class="primary-button compact" type="button" disabled>新增卡片</button>
    </div>
  `;

  let parsedCard = null;
  const input = wrapper.querySelector("#cardCodeInput");
  const preview = wrapper.querySelector("#cardCodePreview");
  const saveButton = wrapper.querySelector("#saveImportedCard");

  const previewCode = () => {
    try {
      parsedCard = parseCardCode(input.value);
      preview.className = "import-preview";
      preview.innerHTML = `
        <strong>${escapeHtml(parsedCard.name)}</strong>
        ${nutriGrid(parsedCard)}
        ${parsedCard.note ? `<p class="empty-copy">${escapeHtml(parsedCard.note)}</p>` : ""}
      `;
      saveButton.disabled = false;
    } catch (error) {
      parsedCard = null;
      preview.className = "import-preview empty-state";
      preview.textContent = error.message;
      saveButton.disabled = true;
    }
  };

  wrapper.querySelector("#previewCardCode").addEventListener("click", previewCode);
  input.addEventListener("input", () => {
    parsedCard = null;
    saveButton.disabled = true;
  });
  saveButton.addEventListener("click", () => {
    if (!parsedCard) previewCode();
    if (!parsedCard) return;
    const card = { ...parsedCard, id: crypto.randomUUID() };
    state.cards.push(card);
    saveState();
    closeModal();
    render();
    if (afterImport) afterImport(card);
  });

  openModal(wrapper);
}

async function copyCardCode(card) {
  const code = createCardCode(card);
  try {
    await navigator.clipboard.writeText(code);
    alert("已複製卡片代碼");
  } catch {
    prompt("請複製這段卡片代碼", code);
  }
}

function createCardCode(card) {
  const payload = {
    v: 1,
    name: String(card.name || "").trim(),
    calories: Number(card.calories || 0),
    carbs: Number(card.carbs || 0),
    protein: Number(card.protein || 0),
    fat: Number(card.fat || 0),
    sodium: Number(card.sodium || 0),
    note: String(card.note || "").trim()
  };
  return `${CARD_CODE_PREFIX}${encodeBase64Url(JSON.stringify(payload))}`;
}

function parseCardCode(code) {
  const normalized = String(code || "").trim();
  if (!normalized.startsWith(CARD_CODE_PREFIX)) {
    throw new Error("代碼格式不正確");
  }
  let payload;
  try {
    payload = JSON.parse(decodeBase64Url(normalized.slice(CARD_CODE_PREFIX.length)));
  } catch {
    throw new Error("代碼內容無法讀取");
  }
  const card = {
    name: String(payload.name || "").trim(),
    calories: Number(payload.calories || 0),
    carbs: Number(payload.carbs || 0),
    protein: Number(payload.protein || 0),
    fat: Number(payload.fat || 0),
    sodium: Number(payload.sodium || 0),
    note: String(payload.note || "").trim()
  };
  if (!card.name) throw new Error("代碼缺少品項名稱");
  if ([card.calories, card.carbs, card.protein, card.fat, card.sodium].some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error("代碼內的營養數值不正確");
  }
  return card;
}

function openCalendarModal() {
  calendarCursor = firstOfMonth(parseYmd(state.selectedDate));
  const wrapper = document.createElement("div");
  wrapper.className = "modal-card";
  wrapper.innerHTML = `
    <div class="calendar-head">
      <button class="icon-button" type="button" id="prevMonth" aria-label="上個月" title="上個月">‹</button>
      <h2 id="calendarTitle"></h2>
      <button class="icon-button" type="button" id="nextMonth" aria-label="下個月" title="下個月">›</button>
    </div>
    <div class="calendar-grid" id="calendarGrid"></div>
  `;
  const paint = () => renderCalendar(wrapper);
  wrapper.querySelector("#prevMonth").addEventListener("click", () => {
    calendarCursor = addMonths(calendarCursor, -1);
    paint();
  });
  wrapper.querySelector("#nextMonth").addEventListener("click", () => {
    calendarCursor = addMonths(calendarCursor, 1);
    paint();
  });
  openModal(wrapper);
  paint();
}

function renderCalendar(wrapper) {
  const title = wrapper.querySelector("#calendarTitle");
  const grid = wrapper.querySelector("#calendarGrid");
  const recordDates = new Set(state.logs.map((log) => log.date));
  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  title.textContent = `${year} 年 ${month + 1} 月`;
  grid.innerHTML = "";
  ["日", "一", "二", "三", "四", "五", "六"].forEach((day) => {
    const cell = document.createElement("div");
    cell.className = "weekday";
    cell.textContent = day;
    grid.append(cell);
  });

  const start = new Date(year, month, 1);
  const startOffset = start.getDay();
  const firstCell = new Date(year, month, 1 - startOffset);

  for (let i = 0; i < 42; i += 1) {
    const date = new Date(firstCell);
    date.setDate(firstCell.getDate() + i);
    const ymd = formatLocalYmd(date);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "day-cell";
    button.textContent = String(date.getDate());
    button.classList.toggle("is-outside", date.getMonth() !== month);
    button.classList.toggle("is-selected", ymd === state.selectedDate);
    button.classList.toggle("has-record", recordDates.has(ymd));
    button.addEventListener("click", () => {
      state.selectedDate = ymd;
      saveState();
      closeModal();
      render();
    });
    grid.append(button);
  }
}

async function askAiAdvice() {
  const apiKey = state.settings.apiKey.trim();
  if (!apiKey) {
    els.aiAdvice.value = "請先在 API 設定填入 OpenAI API key。";
    els.aiSettings.classList.remove("is-hidden");
    return;
  }

  const analysisDate = taiwanYmd(new Date());
  const todayLogs = state.logs.filter((log) => log.date === analysisDate);
  if (!todayLogs.length) {
    els.aiAdvice.value = "本日還沒有飲食紀錄。";
    return;
  }

  const week = getWeekRange(new Date());
  const weekLogs = state.logs.filter((log) => log.date >= week.start && log.date <= week.end);
  const weekTotals = totalLogs(weekLogs);
  const todayTotals = totalLogs(todayLogs);
  const targetRatio = {
    carbs: Number(state.settings.targetCarbs || 0),
    protein: Number(state.settings.targetProtein || 0),
    fat: Number(state.settings.targetFat || 0)
  };
  const context = {
    targetRatio,
    bmr: Number(state.settings.bmr || 0),
    weekRange: week,
    overview: buildNutritionOverview(weekTotals, weekLogs, targetRatio),
    today: {
      date: analysisDate,
      totals: todayTotals,
      macroRatio: macroRatio(todayTotals),
      macroStatus: macroStatus(macroRatio(todayTotals), targetRatio),
      calorieStatus: calorieStatus(todayTotals.calories, Number(state.settings.bmr || 0)),
      foods: todayLogs.map((log) => ({
        name: log.snapshot.name,
        servings: log.servings,
        nutrition: scaledSnapshot(log)
      }))
    },
    userFoodCards: state.cards.map((card) => ({
      name: card.name,
      calories: Number(card.calories || 0),
      carbs: Number(card.carbs || 0),
      protein: Number(card.protein || 0),
      fat: Number(card.fat || 0),
      sodium: Number(card.sodium || 0)
    }))
  };

  els.askAiButton.disabled = true;
  els.askAiButton.textContent = "分析中...";
  els.aiAdvice.value = "正在產生建議...";

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: state.settings.model || "gpt-5.4-mini",
        reasoning: { effort: "low" },
        input: [
          {
            role: "developer",
            content: "你是飲食紀錄分析助手。只根據使用者提供的本日飲食與卡片資料回答。用繁體中文，150字內，語氣理性。先判讀 today 的熱量、三大營養比例與鈉，再給具體建議。若 today.calorieStatus.status 是 low，請依 userFoodCards 中使用者常吃項目，建議適量補足；若沒有合適卡片，再給一般食物方向。鈉只可引用 today.totals.sodium。不要給醫療診斷。"
          },
          {
            role: "user",
            content: `請根據以下本日資料產生飲控建議：${JSON.stringify(context)}`
          }
        ]
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(detail || `HTTP ${response.status}`);
    }

    const data = await response.json();
    els.aiAdvice.value = extractOutputText(data) || "沒有取得文字回覆。";
  } catch (error) {
    els.aiAdvice.value = `AI 建言失敗：${error.message}`;
  } finally {
    els.askAiButton.disabled = false;
    els.askAiButton.textContent = "AI 建言";
  }
}

function buildNutritionOverview(totals, logs, targetRatio) {
  const datesWithLogs = new Set(logs.map((log) => log.date));
  const averageCalories = logs.length ? totals.calories / Math.max(datesWithLogs.size, 1) : 0;
  const bmr = Number(state.settings.bmr || 0);
  const calorieDiff = bmr ? averageCalories - bmr : null;
  const todayLogs = state.logs.filter((log) => log.date === taiwanYmd(new Date()));
  const sodiumToday = totalLogs(todayLogs).sodium;
  const ratio = macroRatio(totals);
  return {
    macroTotals: {
      calories: totals.calories,
      carbs: totals.carbs,
      protein: totals.protein,
      fat: totals.fat
    },
    macroRatio: ratio,
    macroStatus: macroStatus(ratio, targetRatio),
    averageCalories,
    calorieDiff,
    sodiumToday,
    sodiumStatus: sodiumToday > 2000 ? "high" : "ok"
  };
}

function calorieStatus(calories, bmr) {
  if (!bmr) return { status: "unknown", calories, target: null, diff: null };
  const diff = calories - bmr;
  return {
    status: diff < 0 ? "low" : diff > 0 ? "high" : "met",
    calories,
    target: bmr,
    diff
  };
}

function macroRatio(totals) {
  const total = MACROS.reduce((sum, macro) => sum + Number(totals[macro.key] || 0), 0);
  if (!total) return { carbs: 0, protein: 0, fat: 0 };
  return {
    carbs: round((Number(totals.carbs || 0) / total) * 100, 1),
    protein: round((Number(totals.protein || 0) / total) * 100, 1),
    fat: round((Number(totals.fat || 0) / total) * 100, 1)
  };
}

function macroStatus(ratio, targetRatio) {
  return Object.fromEntries(MACROS.map((macro) => {
    const actual = Number(ratio[macro.key] || 0);
    const target = Number(targetRatio[macro.key] || 0);
    const status = actual > target ? "high" : actual < target ? "low" : "met";
    return [macro.key, { actual, target, status }];
  }));
}

function extractOutputText(data) {
  if (data.output_text) return data.output_text;
  return (data.output || [])
    .flatMap((item) => item.content || [])
    .filter((part) => part.type === "output_text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function openModal(content) {
  els.modalLayer.innerHTML = "";
  els.modalLayer.append(content);
  els.modalLayer.classList.remove("is-hidden");
  els.modalLayer.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", closeModal);
  });
  els.modalLayer.addEventListener("click", modalBackdropClose);
}

function modalBackdropClose(event) {
  if (event.target === els.modalLayer) closeModal();
}

function closeModal() {
  els.modalLayer.classList.add("is-hidden");
  els.modalLayer.innerHTML = "";
  els.modalLayer.removeEventListener("click", modalBackdropClose);
}

function attachSwipe(row) {
  let startX = 0;
  let currentX = 0;
  let tracking = false;
  const surface = row.querySelector(".row-surface");

  surface.addEventListener("pointerdown", (event) => {
    tracking = true;
    startX = event.clientX;
    currentX = 0;
    surface.setPointerCapture(event.pointerId);
  });

  surface.addEventListener("pointermove", (event) => {
    if (!tracking) return;
    currentX = event.clientX - startX;
    if (Math.abs(currentX) > 8) {
      surface.style.transform = `translateX(${clamp(currentX, -92, 92)}px)`;
    }
  });

  const end = () => {
    if (!tracking) return;
    tracking = false;
    surface.style.transform = "";
    row.classList.toggle("is-delete-open", currentX < -44);
    row.classList.toggle("is-copy-open", currentX > 44);
  };
  surface.addEventListener("pointerup", end);
  surface.addEventListener("pointercancel", end);
}

function totalLogs(logs) {
  return logs.reduce((totals, log) => {
    const scaled = scaledSnapshot(log);
    ["calories", "carbs", "protein", "fat", "sodium"].forEach((key) => {
      totals[key] += scaled[key];
    });
    return totals;
  }, { calories: 0, carbs: 0, protein: 0, fat: 0, sodium: 0 });
}

function scaledSnapshot(log) {
  const servings = Number(log.servings || 1);
  return {
    calories: Number(log.snapshot.calories || 0) * servings,
    carbs: Number(log.snapshot.carbs || 0) * servings,
    protein: Number(log.snapshot.protein || 0) * servings,
    fat: Number(log.snapshot.fat || 0) * servings,
    sodium: Number(log.snapshot.sodium || 0) * servings
  };
}

function nutriGrid(item) {
  return `
    <div class="nutri-grid">
      <span>${round(item.carbs, 1)}g 碳水</span>
      <span>${round(item.protein, 1)}g 蛋白</span>
      <span>${round(item.fat, 1)}g 脂肪</span>
      <span>${round(item.sodium, 0)}mg 鈉</span>
    </div>
  `;
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return {
      ...structuredClone(defaultState),
      ...saved,
      settings: { ...defaultState.settings, ...(saved?.settings || {}) },
      selectedDate: saved?.selectedDate || defaultState.selectedDate,
      cards: Array.isArray(saved?.cards) ? saved.cards : [],
      logs: Array.isArray(saved?.logs) ? saved.logs : []
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function tickClock() {
  const today = taiwanYmd(new Date());
  if (today !== activeTaiwanDate) {
    activeTaiwanDate = today;
    state.selectedDate = today;
    calendarCursor = firstOfMonth(parseYmd(today));
    saveState();
    render();
  }

  els.taiwanClock.textContent = new Intl.DateTimeFormat("zh-TW", {
    timeZone: TZ,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date());
}

function taiwanYmd(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function getWeekRange(date) {
  const taiwanDate = parseYmd(taiwanYmd(date));
  const day = taiwanDate.getDay();
  const start = addDays(taiwanDate, -day);
  const end = addDays(start, 6);
  return { start: formatLocalYmd(start), end: formatLocalYmd(end) };
}

function parseYmd(ymd) {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatLocalYmd(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateShort(ymd) {
  const date = parseYmd(ymd);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatDateLong(ymd) {
  const date = parseYmd(ymd);
  const weekday = ["日", "一", "二", "三", "四", "五", "六"][date.getDay()];
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}（${weekday}）`;
}

function firstOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, count) {
  return new Date(date.getFullYear(), date.getMonth() + count, 1);
}

function addDays(date, count) {
  const next = new Date(date);
  next.setDate(next.getDate() + count);
  return next;
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function signed(value) {
  return value > 0 ? `+${value}` : String(value);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getCss(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function formatServings(servings) {
  return `${round(servings, 1)} 份`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function encodeBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
