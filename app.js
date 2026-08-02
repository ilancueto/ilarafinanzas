import {
  addMonths,
  buildProjection as calculateProjection,
  formatMonthKey,
  getMonthTotals as calculateMonthTotals,
  isEndMonthValid,
  isValidMonthKey,
  parseMonthKey,
} from "./finance-core.js";
import {
  loadStoredState,
  migrateLegacySnapshot,
  saveStoredState,
} from "./src/storage.ts";

const APP_VERSION = "3.2.0-alpha.1";
const STORAGE_KEY = "ilara-finanzas-v3";
const EMERGENCY_STORAGE_KEY = "ilara-finanzas-v3-emergency";
const BACKUP_FORMAT = "ilara-finanzas-backup";
const BACKUP_VERSION = 1;
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const LEGACY_KEYS = ["trama-finanzas-v3", "finanzas-personales-app-v2", "finanzas-personales-app-v1"];
const DEFAULT_CATEGORIES = [
  "Hogar", "Servicios", "Supermercado", "Transporte", "Salud", "Educaci\u00f3n",
  "Ocio", "Sueldo", "Trabajo extra", "Ahorro", "Otros",
];

const dom = {
  activeMonthInput: document.querySelector("#activeMonthInput"),
  activeMonthDisplay: document.querySelector("#activeMonthDisplay"),
  prevMonthBtn: document.querySelector("#prevMonthBtn"),
  nextMonthBtn: document.querySelector("#nextMonthBtn"),
  dashboardTitle: document.querySelector("#dashboardTitle"),
  dashboardSubtitle: document.querySelector("#dashboardSubtitle"),
  monthHealth: document.querySelector("#monthHealth"),
  summaryGrid: document.querySelector("#summaryGrid"),
  actualSummary: document.querySelector("#actualSummary"),
  commitmentRate: document.querySelector("#commitmentRate"),
  cashFlowVisual: document.querySelector("#cashFlowVisual"),
  categoryBreakdown: document.querySelector("#categoryBreakdown"),
  dashboardMovements: document.querySelector("#dashboardMovements"),
  miniForecast: document.querySelector("#miniForecast"),
  movementSearch: document.querySelector("#movementSearch"),
  movementTypeFilter: document.querySelector("#movementTypeFilter"),
  movementStatusFilter: document.querySelector("#movementStatusFilter"),
  movementTotals: document.querySelector("#movementTotals"),
  movementList: document.querySelector("#movementList"),
  projectionMonthsSelect: document.querySelector("#projectionMonthsSelect"),
  projectionSummary: document.querySelector("#projectionSummary"),
  projectionChart: document.querySelector("#projectionChart"),
  projectionList: document.querySelector("#projectionList"),
  personForm: document.querySelector("#personForm"),
  peopleList: document.querySelector("#peopleList"),
  preferencesForm: document.querySelector("#preferencesForm"),
  appVersion: document.querySelector("#appVersion"),
  exportBtn: document.querySelector("#exportBtn"),
  importBtn: document.querySelector("#importBtn"),
  importFileInput: document.querySelector("#importFileInput"),
  movementDialog: document.querySelector("#movementDialog"),
  movementForm: document.querySelector("#movementForm"),
  movementDialogTitle: document.querySelector("#movementDialogTitle"),
  closeDialogBtn: document.querySelector("#closeDialogBtn"),
  deleteMovementBtn: document.querySelector("#deleteMovementBtn"),
  cancelDialogBtn: document.querySelector("#cancelDialogBtn"),
  installmentsField: document.querySelector("#installmentsField"),
  endMonthField: document.querySelector("#endMonthField"),
  amountLabel: document.querySelector("#amountLabel"),
  formHint: document.querySelector("#formHint"),
  peopleOptions: document.querySelector("#peopleOptions"),
  categoryOptions: document.querySelector("#categoryOptions"),
  confirmationDialog: document.querySelector("#confirmationDialog"),
  confirmationTitle: document.querySelector("#confirmationTitle"),
  confirmationCopy: document.querySelector("#confirmationCopy"),
  confirmationDetails: document.querySelector("#confirmationDetails"),
  confirmationAcceptBtn: document.querySelector("#confirmationAcceptBtn"),
  toast: document.querySelector("#toast"),
  toastMessage: document.querySelector("#toastMessage"),
  toastAction: document.querySelector("#toastAction"),
};

let state = createDefaultState();
let toastTimer;
let storageErrorShown = false;
let initializationWarning = "";

function createDefaultState() {
  return {
    version: 3,
    activeMonth: formatMonthKey(new Date()),
    activeView: "dashboard",
    settings: { currency: "ARS", locale: "es-AR", openingBalance: 0, projectionMonths: 12 },
    people: [
      { id: "person-shared", name: "Compartido" },
      { id: "person-you", name: "Vos" },
      { id: "person-partner", name: "Pareja" },
    ],
    transactions: [],
    occurrenceStatus: {},
  };
}

async function loadState() {
  const emergencyState = localStorage.getItem(EMERGENCY_STORAGE_KEY);
  if (emergencyState) {
    try {
      const parsed = JSON.parse(emergencyState);
      const normalized = parsed?.version === 3 ? normalizeState(parsed) : migrateLegacyState(parsed);
      try {
        await migrateLegacySnapshot(EMERGENCY_STORAGE_KEY, emergencyState, normalized);
        localStorage.removeItem(EMERGENCY_STORAGE_KEY);
      } catch (error) {
        initializationWarning = "La copia de emergencia sigue activa hasta recuperar SQLite.";
        console.warn("No se pudo consolidar la copia de emergencia en SQLite.", error);
      }
      return normalized;
    } catch (error) {
      initializationWarning = "La copia de emergencia está dañada y no fue reemplazada.";
      console.warn("No se pudo interpretar la copia de emergencia.", error);
    }
  }

  try {
    const storedState = await loadStoredState();
    if (storedState) return normalizeState(storedState);
  } catch (error) {
    initializationWarning = "No pudimos abrir la base local. Los datos anteriores siguen intactos.";
    console.warn("No se pudo abrir el almacenamiento SQLite.", error);
  }

  for (const key of [STORAGE_KEY, ...LEGACY_KEYS]) {
    const rawState = localStorage.getItem(key);
    if (!rawState) continue;
    try {
      const parsed = JSON.parse(rawState);
      const normalized = parsed?.version === 3 ? normalizeState(parsed) : migrateLegacyState(parsed);
      try {
        await migrateLegacySnapshot(key, rawState, normalized);
        initializationWarning = "";
      } catch (error) {
        initializationWarning = "La migración a SQLite quedó pendiente. Tus datos V3.1 siguen intactos.";
        console.warn("No se pudo migrar el estado anterior a SQLite.", error);
      }
      return normalized;
    } catch (error) {
      initializationWarning = "Encontramos datos anteriores dañados y no los reemplazamos.";
      console.warn(`No se pudo interpretar el estado guardado en ${key}.`, error);
    }
  }

  const fallback = createDefaultState();
  try {
    await saveStoredState(fallback);
  } catch (error) {
    initializationWarning ||= "No pudimos crear la base local.";
    console.warn("No se pudo crear el estado inicial en SQLite.", error);
  }
  return fallback;
}

function normalizeState(input) {
  const fallback = createDefaultState();
  const openingBalance = Number(input?.settings?.openingBalance);
  const people = Array.isArray(input?.people)
    ? input.people
        .map((person) => ({ id: sanitizeText(person?.id, createId()), name: sanitizeText(person?.name, "Sin nombre") }))
        .filter((person, index, list) =>
          list.findIndex((item) => item.name.toLocaleLowerCase("es") === person.name.toLocaleLowerCase("es")) === index,
        )
    : fallback.people;

  return {
    version: 3,
    activeMonth: isValidMonthKey(input?.activeMonth) ? input.activeMonth : fallback.activeMonth,
    activeView: ["dashboard", "movements", "projection", "settings"].includes(input?.activeView)
      ? input.activeView : "dashboard",
    settings: {
      currency: "ARS",
      locale: "es-AR",
      openingBalance: Number.isFinite(openingBalance) ? openingBalance : 0,
      projectionMonths: [6, 12, 18, 24].includes(Number(input?.settings?.projectionMonths))
        ? Number(input.settings.projectionMonths) : 12,
    },
    people: people.length ? people : fallback.people,
    transactions: Array.isArray(input?.transactions)
      ? input.transactions.map(normalizeTransaction).filter(Boolean) : [],
    occurrenceStatus: input?.occurrenceStatus && typeof input.occurrenceStatus === "object"
      ? { ...input.occurrenceStatus } : {},
  };
}

function normalizeTransaction(transaction) {
  const kind = transaction?.kind === "income" ? "income" : "expense";
  const parsedAmount = Number(transaction?.amount);
  const amount = Number.isFinite(parsedAmount) && parsedAmount > 0
    ? Math.round(parsedAmount * 100) / 100
    : 0;
  const rawType = transaction?.schedule?.type || transaction?.scheduleType;
  const scheduleType = ["one-time", "monthly", "installment"].includes(rawType) ? rawType : "one-time";
  const rawStartMonth = transaction?.schedule?.startMonth || transaction?.startMonth;
  const startMonth = isValidMonthKey(rawStartMonth) ? rawStartMonth : formatMonthKey(new Date());
  const rawEndMonth = transaction?.schedule?.endMonth || transaction?.endMonth;
  const installments = Math.min(
    Math.max(Math.trunc(Number(transaction?.schedule?.installments || transaction?.installments) || 2), 2), 120,
  );
  if (!amount) return null;

  return {
    id: sanitizeText(transaction?.id, createId()),
    kind,
    name: sanitizeText(transaction?.name, kind === "income" ? "Ingreso" : "Gasto"),
    category: sanitizeText(transaction?.category, "Otros"),
    person: sanitizeText(transaction?.person, "Compartido"),
    amount,
    schedule: {
      type: scheduleType,
      startMonth,
      endMonth: scheduleType === "monthly" && isValidMonthKey(rawEndMonth) && isEndMonthValid(startMonth, rawEndMonth)
        ? rawEndMonth : "",
      installments: scheduleType === "installment" ? installments : 1,
    },
    dueDay: Math.min(Math.max(Math.trunc(Number(transaction?.dueDay) || 0), 0), 31),
    note: sanitizeText(transaction?.note),
    createdAt: transaction?.createdAt || new Date().toISOString(),
  };
}

function migrateLegacyState(legacy) {
  const migrated = createDefaultState();
  migrated.activeMonth = isValidMonthKey(legacy?.activeMonth) ? legacy.activeMonth : migrated.activeMonth;

  Object.entries(legacy?.incomesByMonth || {}).forEach(([monthKey, incomes]) => {
    if (!isValidMonthKey(monthKey)) return;
    const normalizedIncomes = Array.isArray(incomes) ? incomes : [
      Number(incomes?.you) > 0 && { name: "Tu ingreso", category: "Sueldo", amount: Number(incomes.you), person: "Vos" },
      Number(incomes?.partner) > 0 && { name: "Ingreso de tu pareja", category: "Sueldo", amount: Number(incomes.partner), person: "Pareja" },
    ].filter(Boolean);

    normalizedIncomes.forEach((income, index) => {
      const transaction = normalizeTransaction({
        id: income.id, kind: "income", name: income.name || `Ingreso ${index + 1}`,
        category: income.category || "General", person: income.person || "Compartido",
        amount: income.amount, scheduleType: "one-time", startMonth: monthKey,
      });
      if (transaction) migrated.transactions.push(transaction);
    });
  });

  (Array.isArray(legacy?.entries) ? legacy.entries : []).forEach((entry) => {
    const personMap = { shared: "Compartido", you: "Vos", partner: "Pareja" };
    const typeMap = { fixed: "monthly", installment: "installment", "one-time": "one-time" };
    const transaction = normalizeTransaction({
      id: entry.id, kind: "expense", name: entry.name, category: entry.category,
      person: personMap[entry.paidBy] || "Compartido", amount: entry.amount,
      scheduleType: typeMap[entry.type] || "one-time", startMonth: entry.startMonth,
      installments: entry.installmentCount,
    });
    if (transaction) migrated.transactions.push(transaction);
  });
  return migrated;
}

async function saveState() {
  try {
    await saveStoredState(cloneState(state));
    try {
      localStorage.removeItem(EMERGENCY_STORAGE_KEY);
    } catch (error) {
      console.warn("No se pudo limpiar la copia de emergencia anterior.", error);
    }
    storageErrorShown = false;
    return true;
  } catch (error) {
    console.warn("No se pudieron guardar los datos en SQLite.", error);
    try {
      localStorage.setItem(EMERGENCY_STORAGE_KEY, JSON.stringify(state));
      if (!storageErrorShown) {
        storageErrorShown = true;
        showToast("SQLite no respondió. El cambio quedó en una copia local de emergencia.");
      }
      return true;
    } catch (fallbackError) {
      console.warn("Tampoco se pudo crear la copia de emergencia.", fallbackError);
    }
    if (!storageErrorShown) {
      storageErrorShown = true;
      showToast("No pudimos confirmar el guardado. El cambio fue revertido.");
    }
    return false;
  }
}

function sanitizeText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function createId() {
  return globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function cloneState(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildBackupEnvelope(snapshot) {
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_VERSION,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    data: snapshot,
  };
}

function downloadBackup(snapshot = state, label = "respaldo") {
  const content = JSON.stringify(buildBackupEnvelope(snapshot), null, 2);
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ilara-${label}-${formatMonthKey(new Date())}.json`;
  link.hidden = true;
  document.body.append(link);
  link.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    link.remove();
  }, 0);
}

function parseBackup(parsed) {
  let payload = parsed;
  if (parsed?.format === BACKUP_FORMAT) {
    if (parsed.formatVersion !== BACKUP_VERSION || !parsed.data || typeof parsed.data !== "object") {
      throw new Error("Versión de respaldo incompatible");
    }
    payload = parsed.data;
  } else if (parsed?.format) {
    throw new Error("Formato de respaldo desconocido");
  }

  if (!Array.isArray(payload?.transactions) && !payload?.incomesByMonth && !payload?.entries) {
    throw new Error("Estructura de respaldo desconocida");
  }
  return payload?.version === 3 ? normalizeState(payload) : migrateLegacyState(payload);
}

function summarizeBackup(snapshot) {
  const months = snapshot.transactions
    .map((transaction) => transaction.schedule.startMonth)
    .filter(isValidMonthKey)
    .sort();
  const monthCopy = months.length
    ? `Desde ${formatMonthLabel(months[0])}`
    : "Sin movimientos fechados";
  return [
    `${snapshot.people.length} persona${snapshot.people.length === 1 ? "" : "s"}`,
    `${snapshot.transactions.length} movimiento${snapshot.transactions.length === 1 ? "" : "s"}`,
    monthCopy,
  ];
}

function confirmAction({ title, copy, details = [], confirmLabel = "Confirmar", danger = false }) {
  dom.confirmationTitle.textContent = title;
  dom.confirmationCopy.textContent = copy;
  dom.confirmationDetails.replaceChildren();
  dom.confirmationDetails.hidden = !details.length;
  if (details.length) {
    const list = element("ul", "confirmation-list");
    details.forEach((detail) => list.append(element("li", "", detail)));
    dom.confirmationDetails.append(list);
  }
  dom.confirmationAcceptBtn.textContent = confirmLabel;
  dom.confirmationAcceptBtn.className = danger ? "danger-btn" : "primary-btn";
  dom.confirmationDialog.returnValue = "";

  return new Promise((resolve) => {
    dom.confirmationDialog.addEventListener("close", () => {
      resolve(dom.confirmationDialog.returnValue === "confirm");
    }, { once: true });
    dom.confirmationDialog.showModal();
  });
}

function formatMonthLabel(monthKey, short = false) {
  const value = new Intl.DateTimeFormat("es-AR", {
    month: short ? "short" : "long",
    year: short ? undefined : "numeric",
  }).format(parseMonthKey(monthKey));
  return value.charAt(0).toUpperCase() + value.slice(1).replace(".", "");
}

function formatCurrency(value, compact = false) {
  return new Intl.NumberFormat(state.settings.locale, {
    style: "currency",
    currency: state.settings.currency,
    maximumFractionDigits: compact ? 0 : 2,
    notation: compact ? "compact" : "standard",
  }).format(Number(value) || 0);
}

function getMonthTotals(monthKey) {
  return calculateMonthTotals(state.transactions, state.occurrenceStatus, monthKey);
}

function buildProjection(monthCount = state.settings.projectionMonths) {
  return calculateProjection({
    transactions: state.transactions,
    occurrenceStatus: state.occurrenceStatus,
    activeMonth: state.activeMonth,
    monthCount,
    openingBalance: state.settings.openingBalance,
  });
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function emptyState(title, copy, allowAdd = false) {
  const wrapper = element("div", "empty-state");
  wrapper.append(element("strong", "", title), element("p", "", copy));
  if (allowAdd) {
    const button = element("button", "secondary-btn", "+ Agregar movimiento");
    button.type = "button";
    button.addEventListener("click", () => openMovementDialog());
    wrapper.append(button);
  }
  return wrapper;
}

function renderDashboard() {
  const totals = getMonthTotals(state.activeMonth);
  dom.dashboardTitle.textContent = formatMonthLabel(state.activeMonth);
  dom.dashboardSubtitle.textContent = totals.occurrences.length
    ? `${totals.occurrences.length} movimiento${totals.occurrences.length === 1 ? "" : "s"} previsto${totals.occurrences.length === 1 ? "" : "s"} para organizar.`
    : "Todav\u00eda no hay movimientos para este mes.";

  const health = !totals.occurrences.length
    ? { label: "Sin datos todavía", tone: "neutral" }
    : totals.balance >= 0
      ? { label: "Mes en equilibrio", tone: "positive" }
      : { label: "Revisar gastos", tone: "negative" };
  dom.monthHealth.textContent = health.label;
  dom.monthHealth.dataset.tone = health.tone;

  dom.summaryGrid.replaceChildren();
  const cards = [
    ["Ingresos previstos", formatCurrency(totals.totalIncome), `${totals.incomes.length} fuente${totals.incomes.length === 1 ? "" : "s"}`, "income"],
    ["Gastos previstos", formatCurrency(totals.totalExpense), `${totals.expenses.length} compromiso${totals.expenses.length === 1 ? "" : "s"}`, "expense"],
    ["Disponible estimado", formatCurrency(totals.balance), totals.balance >= 0 ? "Despu\u00e9s de todos los gastos" : "Faltante para cubrir el mes", totals.balance >= 0 ? "balance" : "danger"],
    ["Pendiente de pagar", formatCurrency(totals.pendingExpense), `${formatCurrency(totals.paidExpense)} ya pagado`, "pending"],
  ];
  cards.forEach(([label, value, copy, tone]) => {
    const card = element("article", "summary-card");
    card.dataset.tone = tone;
    card.append(element("p", "summary-label", label), element("strong", "summary-value", value), element("span", "summary-copy", copy));
    dom.summaryGrid.append(card);
  });

  dom.actualSummary.replaceChildren();
  const pendingCount = totals.occurrences.filter((item) => item.status === "pending").length;
  const actualCards = [
    ["Cobrado", formatCurrency(totals.receivedIncome), `${formatCurrency(totals.pendingIncome)} por cobrar`, "income"],
    ["Pagado", formatCurrency(totals.paidExpense), `${formatCurrency(totals.pendingExpense)} por pagar`, "expense"],
    ["Flujo realizado", formatCurrency(totals.actualBalance), "Cobrado menos pagado", totals.actualBalance >= 0 ? "balance" : "danger"],
    ["Por resolver", `${pendingCount} pendiente${pendingCount === 1 ? "" : "s"}`, "Movimientos todavía abiertos", "pending"],
  ];
  actualCards.forEach(([label, value, copy, tone]) => {
    const item = element("div", "actual-stat");
    item.dataset.tone = tone;
    item.append(element("span", "", label), element("strong", "", value), element("small", "", copy));
    dom.actualSummary.append(item);
  });

  const percentage = Math.round(totals.commitmentRate * 100);
  dom.commitmentRate.textContent = totals.totalIncome ? `${percentage}%` : "-";
  dom.cashFlowVisual.replaceChildren();
  const track = element("div", "flow-track");
  track.setAttribute("role", "progressbar");
  track.setAttribute("aria-label", "Porcentaje de ingresos comprometido en gastos");
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", "100");
  track.setAttribute("aria-valuenow", String(Math.min(percentage, 100)));
  const fill = element("span", "flow-fill");
  fill.setAttribute("aria-hidden", "true");
  fill.style.width = `${Math.min(percentage, 100)}%`;
  if (percentage > 85) fill.dataset.alert = "true";
  track.append(fill);
  const labels = element("div", "flow-labels");
  const balanceLabel = totals.balance >= 0
    ? `${formatCurrency(totals.balance)} libre`
    : `${formatCurrency(Math.abs(totals.balance))} faltante`;
  labels.append(element("span", "", `${formatCurrency(totals.totalExpense)} comprometido`), element("strong", "", balanceLabel));
  dom.cashFlowVisual.append(track, labels);

  renderCategoryBreakdown(totals.expenses);
  renderMovementCollection(dom.dashboardMovements, totals.occurrences.slice(0, 5), true);
  renderMiniForecast();
}

function renderCategoryBreakdown(expenses) {
  dom.categoryBreakdown.replaceChildren();
  if (!expenses.length) {
    dom.categoryBreakdown.append(emptyState("Sin gastos todav\u00eda", "Cuando carguen uno, ac\u00e1 ver\u00e1n c\u00f3mo se distribuye."));
    return;
  }
  const categories = new Map();
  expenses.forEach((item) => categories.set(item.category, (categories.get(item.category) || 0) + item.amountThisMonth));
  const sorted = [...categories.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const max = sorted[0][1];
  sorted.forEach(([category, amount]) => {
    const row = element("div", "category-row");
    const head = element("div", "category-head");
    head.append(element("span", "", category), element("strong", "", formatCurrency(amount)));
    const bar = element("div", "category-track");
    const categoryFill = element("span", "category-fill");
    categoryFill.setAttribute("aria-hidden", "true");
    categoryFill.style.width = `${(amount / max) * 100}%`;
    bar.append(categoryFill);
    row.append(head, bar);
    dom.categoryBreakdown.append(row);
  });
}

function renderMiniForecast() {
  dom.miniForecast.replaceChildren();
  buildProjection(4).forEach((month, index) => {
    const card = element("button", "forecast-card");
    card.type = "button";
    if (month.balance < 0) card.dataset.tone = "negative";
    if (index === 0) card.classList.add("is-current");
    card.append(
      element("span", "forecast-month", formatMonthLabel(month.monthKey, true)),
      element("strong", "", formatCurrency(month.balance, true)),
      element("small", "", month.balance >= 0 ? "queda" : "faltar\u00eda"),
    );
    card.addEventListener("click", () => {
      state.activeMonth = month.monthKey;
      switchView("projection");
      render();
    });
    dom.miniForecast.append(card);
  });
}

function scheduleLabel(item) {
  if (item.schedule.type === "installment") return `Cuota ${item.installmentIndex} de ${item.schedule.installments}`;
  if (item.schedule.type === "monthly") {
    return item.schedule.endMonth ? `Mensual hasta ${formatMonthLabel(item.schedule.endMonth, true)}` : "Todos los meses";
  }
  return "Una sola vez";
}

function renderMovementCollection(container, occurrences, compact = false) {
  container.replaceChildren();
  if (!occurrences.length) {
    container.append(emptyState("Nada por ac\u00e1", "Agreg\u00e1 un ingreso o gasto para empezar.", !compact));
    return;
  }

  occurrences.forEach((item) => {
    const row = element("article", `movement-row${compact ? " is-compact" : ""}`);
    row.dataset.kind = item.kind;
    const statusButton = element("button", `status-check${item.status === "paid" ? " is-paid" : ""}`);
    statusButton.type = "button";
    const completeLabel = item.kind === "income" ? "Marcar como cobrado" : "Marcar como pagado";
    const reopenLabel = item.kind === "income"
      ? "Marcar ingreso como pendiente"
      : "Marcar gasto como pendiente";
    statusButton.setAttribute("aria-label", item.status === "paid" ? reopenLabel : completeLabel);
    statusButton.textContent = item.status === "paid" ? "\u2713" : "";
    statusButton.addEventListener("click", () => toggleOccurrenceStatus(item));

    const body = element("div", "movement-body");
    const titleLine = element("div", "movement-title-line");
    titleLine.append(element("strong", "movement-name", item.name), element("span", "kind-badge", item.kind === "income" ? "Ingreso" : "Gasto"));
    const meta = element("p", "movement-meta", `${item.category} \u00b7 ${item.person} \u00b7 ${scheduleLabel(item)}`);
    if (item.note && !compact) meta.append(document.createTextNode(` \u00b7 ${item.note}`));
    body.append(titleLine, meta);

    const amount = element("div", "movement-amount");
    amount.append(
      element("strong", "", `${item.kind === "income" ? "+" : "-"}${formatCurrency(item.amountThisMonth)}`),
      element("small", "", item.status === "paid" ? (item.kind === "income" ? "Cobrado" : "Pagado") : "Pendiente"),
    );

    const editButton = element("button", "row-menu", "Editar");
    editButton.type = "button";
    editButton.setAttribute("aria-label", `Editar ${item.name}`);
    editButton.addEventListener("click", () => openMovementDialog(item.id));
    row.append(statusButton, body, amount, editButton);
    container.append(row);
  });
}

function renderMovements() {
  const totals = getMonthTotals(state.activeMonth);
  const search = dom.movementSearch.value.trim().toLocaleLowerCase("es");
  const type = dom.movementTypeFilter.value;
  const status = dom.movementStatusFilter.value;
  const filtered = totals.occurrences.filter((item) => {
    const haystack = `${item.name} ${item.category} ${item.person} ${item.note}`.toLocaleLowerCase("es");
    return (!search || haystack.includes(search)) &&
      (type === "all" || item.kind === type) && (status === "all" || item.status === status);
  });

  dom.movementTotals.replaceChildren();
  [
    ["Ingresos", totals.totalIncome, "income"],
    ["Gastos", totals.totalExpense, "expense"],
    ["Balance", totals.balance, totals.balance >= 0 ? "balance" : "danger"],
  ].forEach(([label, value, tone]) => {
    const item = element("div", "list-total");
    item.dataset.tone = tone;
    item.append(element("span", "", label), element("strong", "", formatCurrency(value)));
    dom.movementTotals.append(item);
  });
  renderMovementCollection(dom.movementList, filtered);
}

function renderProjection() {
  const projection = buildProjection();
  const final = projection.at(-1);
  const negativeMonths = projection.filter((month) => month.balance < 0).length;
  const totalIncome = projection.reduce((sum, month) => sum + month.totalIncome, 0);
  const totalExpense = projection.reduce((sum, month) => sum + month.totalExpense, 0);

  dom.projectionSummary.replaceChildren();
  [
    ["Saldo al final", formatCurrency(final?.cumulative ?? state.settings.openingBalance), `${projection.length} meses desde ${formatMonthLabel(state.activeMonth, true)}`],
    ["Ingresos del per\u00edodo", formatCurrency(totalIncome), "Todo lo previsto"],
    ["Gastos del per\u00edodo", formatCurrency(totalExpense), `${negativeMonths} mes${negativeMonths === 1 ? "" : "es"} con resultado negativo`],
  ].forEach(([label, value, copy], index) => {
    const card = element("article", "projection-stat");
    if (index === 0 && (final?.cumulative ?? 0) < 0) card.dataset.tone = "negative";
    card.append(element("span", "", label), element("strong", "", value), element("small", "", copy));
    dom.projectionSummary.append(card);
  });

  const maxValue = Math.max(1, ...projection.flatMap((month) => [month.totalIncome, month.totalExpense]));
  dom.projectionChart.replaceChildren();
  dom.projectionChart.setAttribute("role", "img");
  dom.projectionChart.setAttribute("aria-label", `Gráfico de ingresos y gastos para ${projection.length} meses. El detalle completo está debajo.`);
  projection.forEach((month) => {
    const group = element("div", "chart-month");
    const bars = element("div", "chart-bars");
    const incomeBar = element("span", "chart-bar income-bar");
    const expenseBar = element("span", "chart-bar expense-bar");
    incomeBar.style.height = `${Math.max((month.totalIncome / maxValue) * 100, month.totalIncome ? 3 : 0)}%`;
    expenseBar.style.height = `${Math.max((month.totalExpense / maxValue) * 100, month.totalExpense ? 3 : 0)}%`;
    incomeBar.title = `Ingresos: ${formatCurrency(month.totalIncome)}`;
    expenseBar.title = `Gastos: ${formatCurrency(month.totalExpense)}`;
    incomeBar.setAttribute("aria-hidden", "true");
    expenseBar.setAttribute("aria-hidden", "true");
    bars.append(incomeBar, expenseBar);
    group.append(bars, element("small", "", formatMonthLabel(month.monthKey, true)));
    dom.projectionChart.append(group);
  });

  dom.projectionList.replaceChildren();
  projection.forEach((month) => {
    const row = element("button", "projection-row");
    row.type = "button";
    if (month.balance < 0) row.dataset.tone = "negative";
    const main = element("div", "projection-row-main");
    main.append(element("strong", "", formatMonthLabel(month.monthKey)), element("span", "", `${month.occurrences.length} movimiento${month.occurrences.length === 1 ? "" : "s"}`));
    const figures = element("div", "projection-figures");
    figures.append(
      element("span", "income-text", `+ ${formatCurrency(month.totalIncome)}`),
      element("span", "expense-text", `- ${formatCurrency(month.totalExpense)}`),
    );
    const result = element("div", "projection-result");
    result.append(element("strong", "", formatCurrency(month.balance)), element("small", "", `Acumulado ${formatCurrency(month.cumulative)}`));
    row.append(main, figures, result);
    row.addEventListener("click", () => {
      state.activeMonth = month.monthKey;
      switchView("movements");
      render();
    });
    dom.projectionList.append(row);
  });
}

function renderSettings() {
  dom.peopleList.replaceChildren();
  state.people.forEach((person) => {
    const chip = element("span", "person-chip");
    chip.append(element("span", "", person.name));
    if (state.people.length > 1) {
      const remove = element("button", "", "\u00d7");
      remove.type = "button";
      remove.setAttribute("aria-label", `Eliminar ${person.name}`);
      remove.addEventListener("click", () => removePerson(person.id));
      chip.append(remove);
    }
    dom.peopleList.append(chip);
  });
  dom.preferencesForm.elements.openingBalance.value = state.settings.openingBalance;
  dom.preferencesForm.elements.projectionMonths.value = String(state.settings.projectionMonths);
  dom.appVersion.textContent = `Versión ${APP_VERSION}.`;
}

function renderDatalists() {
  dom.peopleOptions.replaceChildren();
  state.people.forEach((person) => {
    const option = document.createElement("option");
    option.value = person.name;
    dom.peopleOptions.append(option);
  });

  const categories = [...new Set([...DEFAULT_CATEGORIES, ...state.transactions.map((item) => item.category)])]
    .sort((a, b) => a.localeCompare(b, "es"));
  dom.categoryOptions.replaceChildren();
  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    dom.categoryOptions.append(option);
  });
}

function render() {
  dom.activeMonthInput.value = state.activeMonth;
  dom.activeMonthDisplay.textContent = formatMonthLabel(state.activeMonth).toLocaleLowerCase("es");
  dom.projectionMonthsSelect.value = String(state.settings.projectionMonths);
  renderDatalists();
  renderDashboard();
  renderMovements();
  renderProjection();
  renderSettings();
}

function switchView(view) {
  if (!["dashboard", "movements", "projection", "settings"].includes(view)) return;
  state.activeView = view;
  document.querySelectorAll("[data-view-panel]").forEach((panel) => {
    const active = panel.dataset.viewPanel === view;
    panel.classList.toggle("is-active", active);
    panel.hidden = !active;
  });
  document.querySelectorAll("[data-view]").forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  history.replaceState(null, "", `#${view}`);
  window.scrollTo({ top: 0, behavior: "smooth" });
  void saveState();
}

async function toggleOccurrenceStatus(item) {
  const previousState = cloneState(state);
  if (item.status === "paid") delete state.occurrenceStatus[item.statusKey];
  else state.occurrenceStatus[item.statusKey] = "paid";
  if (!await saveState()) {
    state = previousState;
    render();
    return;
  }
  render();
  showToast(item.status === "paid" ? "Marcado como pendiente" : item.kind === "income" ? "Ingreso marcado como cobrado" : "Gasto marcado como pagado");
}

function validateScheduleRange({ report = false } = {}) {
  const form = dom.movementForm.elements;
  const isMonthly = form.scheduleType.value === "monthly";
  const startMonth = form.startMonth.value;
  const endMonth = form.endMonth.value;
  form.endMonth.min = startMonth;
  const valid = !isMonthly || isEndMonthValid(startMonth, endMonth);
  form.endMonth.setCustomValidity(valid ? "" : "El mes final no puede ser anterior al mes de inicio.");
  if (!valid && report) form.endMonth.reportValidity();
  return valid;
}

function updateScheduleFields() {
  const type = dom.movementForm.elements.scheduleType.value;
  const isInstallment = type === "installment";
  const isMonthly = type === "monthly";
  dom.installmentsField.hidden = !isInstallment;
  dom.endMonthField.hidden = !isMonthly;
  dom.movementForm.elements.installments.required = isInstallment;
  dom.amountLabel.textContent = isInstallment ? "Monto total" : "Monto";

  if (isInstallment) {
    const total = Number(dom.movementForm.elements.amount.value) || 0;
    const count = Number(dom.movementForm.elements.installments.value) || 2;
    dom.formHint.textContent = total > 0
      ? `${count} cuotas de aproximadamente ${formatCurrency(total / count)}. La \u00faltima se ajusta si hace falta.`
      : "Ingres\u00e1 el total de la compra, no el valor de cada cuota.";
  } else if (isMonthly) {
    dom.formHint.textContent = "Se repetir\u00e1 cada mes hasta la fecha final, o sin l\u00edmite si la dej\u00e1s vac\u00eda.";
  } else {
    dom.formHint.textContent = "Aparecer\u00e1 \u00fanicamente en el mes de inicio.";
  }
  validateScheduleRange();
}

function openMovementDialog(transactionId = "") {
  const transaction = state.transactions.find((item) => item.id === transactionId);
  dom.movementForm.reset();
  dom.movementForm.elements.id.value = transaction?.id || "";
  dom.movementForm.elements.kind.value = transaction?.kind || "expense";
  dom.movementForm.elements.name.value = transaction?.name || "";
  dom.movementForm.elements.category.value = transaction?.category || "";
  dom.movementForm.elements.person.value = transaction?.person || state.people[0]?.name || "Compartido";
  dom.movementForm.elements.amount.value = transaction?.amount || "";
  dom.movementForm.elements.startMonth.value = transaction?.schedule.startMonth || state.activeMonth;
  dom.movementForm.elements.scheduleType.value = transaction?.schedule.type || "one-time";
  dom.movementForm.elements.installments.value = transaction?.schedule.installments || 2;
  dom.movementForm.elements.endMonth.value = transaction?.schedule.endMonth || "";
  dom.movementForm.elements.dueDay.value = transaction?.dueDay || "";
  dom.movementForm.elements.note.value = transaction?.note || "";
  dom.movementDialogTitle.textContent = transaction ? "Editar movimiento" : "Agregar movimiento";
  dom.deleteMovementBtn.hidden = !transaction;
  updateScheduleFields();
  dom.movementDialog.showModal();
  window.setTimeout(() => dom.movementForm.elements.name.focus(), 40);
}

function closeMovementDialog() {
  dom.movementDialog.close();
}

async function saveMovement(event) {
  event.preventDefault();
  const formData = new FormData(dom.movementForm);
  if (!validateScheduleRange({ report: true })) return;
  const existingId = sanitizeText(formData.get("id"));
  const transaction = normalizeTransaction({
    id: existingId || createId(),
    kind: formData.get("kind"),
    name: formData.get("name"),
    category: formData.get("category"),
    person: formData.get("person"),
    amount: formData.get("amount"),
    scheduleType: formData.get("scheduleType"),
    startMonth: formData.get("startMonth"),
    installments: formData.get("installments"),
    endMonth: formData.get("endMonth"),
    dueDay: formData.get("dueDay"),
    note: formData.get("note"),
    createdAt: state.transactions.find((item) => item.id === existingId)?.createdAt,
  });
  if (!transaction) return;

  const previousState = cloneState(state);
  const index = state.transactions.findIndex((item) => item.id === existingId);
  if (index >= 0) state.transactions[index] = transaction;
  else state.transactions.push(transaction);

  const personName = transaction.person;
  if (!state.people.some((person) => person.name.toLocaleLowerCase("es") === personName.toLocaleLowerCase("es"))) {
    state.people.push({ id: createId(), name: personName });
  }

  if (!await saveState()) {
    state = previousState;
    render();
    return;
  }
  closeMovementDialog();
  render();
  showToast(index >= 0 ? "Movimiento actualizado" : "Movimiento agregado");
}

async function deleteMovement() {
  const id = dom.movementForm.elements.id.value;
  if (!id) return;
  const index = state.transactions.findIndex((item) => item.id === id);
  const transaction = state.transactions[index];
  if (!transaction) return;
  const savedStatuses = Object.fromEntries(
    Object.entries(state.occurrenceStatus).filter(([key]) => key.startsWith(`${id}:`)),
  );

  closeMovementDialog();
  const confirmed = await confirmAction({
    title: "Eliminar movimiento",
    copy: `¿Querés eliminar “${transaction.name}”? Sus ocurrencias y estados mensuales también se quitarán.`,
    confirmLabel: "Eliminar",
    danger: true,
  });
  if (!confirmed) {
    openMovementDialog(id);
    return;
  }

  const previousState = cloneState(state);
  state.transactions = state.transactions.filter((item) => item.id !== id);
  Object.keys(state.occurrenceStatus).forEach((key) => {
    if (key.startsWith(`${id}:`)) delete state.occurrenceStatus[key];
  });
  if (!await saveState()) {
    state = previousState;
    render();
    return;
  }
  render();
  showToast("Movimiento eliminado", {
    label: "Deshacer",
    handler: async () => {
      const beforeRestore = cloneState(state);
      state.transactions.splice(index, 0, transaction);
      Object.assign(state.occurrenceStatus, savedStatuses);
      if (!await saveState()) {
        state = beforeRestore;
        render();
        return;
      }
      render();
      showToast("Movimiento restaurado");
    },
  });
}

async function removePerson(personId) {
  const person = state.people.find((item) => item.id === personId);
  if (!person) return;
  if (state.transactions.some((transaction) =>
    transaction.person.localeCompare(person.name, "es", { sensitivity: "base" }) === 0
  )) {
    showToast("Esa persona tiene movimientos asignados");
    return;
  }
  const previousState = cloneState(state);
  state.people = state.people.filter((item) => item.id !== personId);
  if (!await saveState()) {
    state = previousState;
    render();
    return;
  }
  render();
  showToast("Persona eliminada");
}

function exportData() {
  downloadBackup(state);
  showToast("Copia exportada");
}

async function importData(file) {
  if (!file) return;
  try {
    if (file.size > MAX_IMPORT_BYTES) throw new Error("Archivo demasiado grande");
    const parsed = JSON.parse(await file.text());
    const importedState = parseBackup(parsed);
    const confirmed = await confirmAction({
      title: "Importar esta copia",
      copy: "Los datos actuales serán reemplazados. Antes de hacerlo descargaremos una copia automática para que puedas recuperarlos.",
      details: summarizeBackup(importedState),
      confirmLabel: "Importar copia",
    });
    if (!confirmed) return;

    const previousState = cloneState(state);
    downloadBackup(previousState, "antes-de-importar");
    state = importedState;
    if (!await saveState()) {
      state = previousState;
      switchView(state.activeView);
      render();
      return;
    }
    switchView(state.activeView);
    render();
    showToast("Copia importada correctamente", {
      label: "Restaurar anterior",
      handler: async () => {
        const importedSnapshot = cloneState(state);
        state = previousState;
        if (!await saveState()) {
          state = importedSnapshot;
          switchView(state.activeView);
          render();
          return;
        }
        switchView(state.activeView);
        render();
        showToast("Se restauraron los datos anteriores");
      },
    });
  } catch (error) {
    console.warn("No se pudo importar el respaldo.", error);
    const message = file.size > MAX_IMPORT_BYTES
      ? "El archivo supera el límite de 5 MB"
      : "No pudimos importar ese archivo. Tus datos no cambiaron.";
    showToast(message);
  } finally {
    dom.importFileInput.value = "";
  }
}

function hideToast() {
  window.clearTimeout(toastTimer);
  dom.toast.classList.remove("is-visible");
  dom.toastAction.hidden = true;
  dom.toastAction.onclick = null;
}

function showToast(message, action = null) {
  hideToast();
  dom.toastMessage.textContent = message;
  dom.toastAction.onclick = null;
  dom.toastAction.hidden = !action;
  if (action) {
    dom.toastAction.textContent = action.label;
    dom.toastAction.onclick = () => {
      hideToast();
      action.handler();
    };
  }
  dom.toast.classList.add("is-visible");
  toastTimer = window.setTimeout(hideToast, action ? 12000 : 3000);
}

document.querySelectorAll("[data-view]").forEach((button) =>
  button.addEventListener("click", () => switchView(button.dataset.view)),
);
document.querySelectorAll("[data-go-view]").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    switchView(button.dataset.goView);
  });
});
document.querySelectorAll("[data-add-movement]").forEach((button) =>
  button.addEventListener("click", () => openMovementDialog()),
);
[
  document.querySelector("#sidebarAddBtn"),
  document.querySelector("#topAddBtn"),
  document.querySelector("#floatingAddBtn"),
].forEach((button) => button?.addEventListener("click", () => openMovementDialog()));

dom.prevMonthBtn.addEventListener("click", () => {
  state.activeMonth = addMonths(state.activeMonth, -1);
  render();
  void saveState();
});
dom.nextMonthBtn.addEventListener("click", () => {
  state.activeMonth = addMonths(state.activeMonth, 1);
  render();
  void saveState();
});
dom.activeMonthInput.addEventListener("change", (event) => {
  if (isValidMonthKey(event.target.value)) {
    state.activeMonth = event.target.value;
    render();
    void saveState();
  }
});

[dom.movementSearch, dom.movementTypeFilter, dom.movementStatusFilter].forEach((control) =>
  control.addEventListener("input", renderMovements),
);
dom.projectionMonthsSelect.addEventListener("change", (event) => {
  state.settings.projectionMonths = Number(event.target.value);
  renderProjection();
  renderSettings();
  void saveState();
});

dom.movementForm.addEventListener("submit", saveMovement);
dom.movementForm.elements.scheduleType.addEventListener("change", updateScheduleFields);
dom.movementForm.elements.amount.addEventListener("input", updateScheduleFields);
dom.movementForm.elements.installments.addEventListener("input", updateScheduleFields);
dom.movementForm.elements.startMonth.addEventListener("change", updateScheduleFields);
dom.movementForm.elements.endMonth.addEventListener("change", () => validateScheduleRange());
dom.closeDialogBtn.addEventListener("click", closeMovementDialog);
dom.cancelDialogBtn.addEventListener("click", closeMovementDialog);
dom.deleteMovementBtn.addEventListener("click", deleteMovement);
dom.movementDialog.addEventListener("click", (event) => {
  if (event.target === dom.movementDialog) closeMovementDialog();
});

dom.personForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = sanitizeText(new FormData(dom.personForm).get("name"));
  if (!name) return;
  if (state.people.some((person) => person.name.toLocaleLowerCase("es") === name.toLocaleLowerCase("es"))) {
    showToast("Esa persona ya est\u00e1 agregada");
    return;
  }
  const previousState = cloneState(state);
  state.people.push({ id: createId(), name });
  if (!await saveState()) {
    state = previousState;
    render();
    return;
  }
  dom.personForm.reset();
  render();
  showToast("Persona agregada");
});

dom.preferencesForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(dom.preferencesForm);
  const openingBalance = Number(formData.get("openingBalance"));
  const projectionMonths = Number(formData.get("projectionMonths"));
  const previousState = cloneState(state);
  state.settings.openingBalance = Number.isFinite(openingBalance) ? openingBalance : 0;
  state.settings.projectionMonths = [6, 12, 18, 24].includes(projectionMonths)
    ? projectionMonths
    : 12;
  if (!await saveState()) {
    state = previousState;
    render();
    return;
  }
  render();
  showToast("Ajustes guardados");
});

dom.exportBtn.addEventListener("click", exportData);
dom.importBtn.addEventListener("click", () => dom.importFileInput.click());
dom.importFileInput.addEventListener("change", () => importData(dom.importFileInput.files[0]));

async function initializeApp() {
  state = await loadState();
  const initialView = window.location.hash.slice(1);
  if (["dashboard", "movements", "projection", "settings"].includes(initialView)) {
    state.activeView = initialView;
  }
  switchView(state.activeView);
  render();
  if (initializationWarning) showToast(initializationWarning);
}

await initializeApp();
