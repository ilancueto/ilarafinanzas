import {
  addMonths,
  buildProjection as calculateProjection,
  dueStateForOccurrence,
  formatMonthKey,
  getMonthTotals as calculateMonthTotals,
  installmentProgress,
  isEndMonthValid,
  isValidMonthKey,
  monthDiff,
  occurrenceForMonth,
  parseMonthKey,
} from "./finance-core.js";
import {
  cleanOccurrenceStatus,
  escapeCsvCell,
  fromCents,
  normalizeUniqueIds,
  resolveStoredCents,
  toCents,
} from "./state-core.js";
import {
  loadStoredState,
  migrateLegacySnapshot,
  saveStoredState,
} from "./src/storage.ts";

const APP_VERSION = "3.2.0";
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
  monthCloseBtn: document.querySelector("#monthCloseBtn"),
  monthComparison: document.querySelector("#monthComparison"),
  budgetProgress: document.querySelector("#budgetProgress"),
  categoryForm: document.querySelector("#categoryForm"),
  categoriesList: document.querySelector("#categoriesList"),
  budgetForm: document.querySelector("#budgetForm"),
  budgetsList: document.querySelector("#budgetsList"),
  exportCsvBtn: document.querySelector("#exportCsvBtn"),
  editScopeField: document.querySelector("#editScopeField"),
  settlementDialog: document.querySelector("#settlementDialog"),
  settlementForm: document.querySelector("#settlementForm"),
  settlementTitle: document.querySelector("#settlementTitle"),
  toast: document.querySelector("#toast"),
  toastMessage: document.querySelector("#toastMessage"),
  toastAction: document.querySelector("#toastAction"),
};

let state = createDefaultState();
let toastTimer;
let storageErrorShown = false;
let initializationWarning = "";

function createDefaultState() {
  const currentMonth = formatMonthKey(new Date());
  return {
    version: 3,
    activeMonth: currentMonth,
    activeView: "dashboard",
    settings: {
      currency: "ARS",
      locale: "es-AR",
      openingBalanceCents: 0,
      openingBalanceMonth: currentMonth,
      projectionMonths: 12,
    },
    people: [
      { id: "person-shared", name: "Compartido" },
      { id: "person-you", name: "Vos" },
      { id: "person-partner", name: "Pareja" },
    ],
    transactions: [],
    occurrenceStatus: {},
    occurrences: {},
    closedMonths: {},
    budgets: [],
    categories: [...DEFAULT_CATEGORIES],
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
  const activeMonth = isValidMonthKey(input?.activeMonth) ? input.activeMonth : fallback.activeMonth;
  const openingBalanceCents = resolveStoredCents(
    input?.settings?.openingBalanceCents,
    input?.settings?.openingBalance,
  );
  const people = normalizeUniqueIds(Array.isArray(input?.people)
    ? input.people
        .map((person) => ({ id: sanitizeText(person?.id, createId()), name: sanitizeText(person?.name, "Sin nombre") }))
        .filter((person, index, list) =>
          list.findIndex((item) => item.name.toLocaleLowerCase("es") === person.name.toLocaleLowerCase("es")) === index,
        )
    : fallback.people, createId);

  const transactionIds = new Set();
  const transactions = (Array.isArray(input?.transactions)
    ? input.transactions.map(normalizeTransaction).filter(Boolean)
    : []
  ).filter((transaction) => {
    if (transactionIds.has(transaction.id)) return false;
    transactionIds.add(transaction.id);
    return true;
  });
  const occurrenceStatus = cleanOccurrenceStatus(input?.occurrenceStatus, transactionIds, isValidMonthKey);
  const occurrences = normalizeOccurrenceRecords(input?.occurrences, transactions);
  Object.entries(occurrenceStatus).forEach(([key, status]) => {
    if (occurrences[key] || status !== "paid") return;
    const separator = key.lastIndexOf(":");
    const transaction = transactions.find((item) => item.id === key.slice(0, separator));
    const monthKey = key.slice(separator + 1);
    const occurrence = transaction ? occurrenceForMonth(transaction, monthKey) : null;
    if (occurrence) {
      occurrences[key] = materializeOccurrence(occurrence, {
        status: "paid",
        actualAmountCents: occurrence.amountThisMonthCents,
      });
    }
  });
  const closedMonths = Object.fromEntries(Object.entries(input?.closedMonths || {})
    .filter(([monthKey, value]) => isValidMonthKey(monthKey) && value && typeof value === "object")
    .map(([monthKey, value]) => [monthKey, {
      closedAt: sanitizeText(value.closedAt, new Date().toISOString()),
    }]));
  const categoryCandidates = (Array.isArray(input?.categories) ? input.categories : [
    ...DEFAULT_CATEGORIES,
    ...transactions.map((item) => item.category),
  ]).map((category) => sanitizeText(category)).filter(Boolean);
  const categories = categoryCandidates
    .filter((category, index, list) => list.findIndex((item) =>
      item.localeCompare(category, "es", { sensitivity: "base" }) === 0) === index)
    .sort((a, b) => a.localeCompare(b, "es"));
  const budgets = (Array.isArray(input?.budgets) ? input.budgets : [])
    .map((budget) => ({
      id: sanitizeText(budget?.id, createId()),
      monthKey: isValidMonthKey(budget?.monthKey) ? budget.monthKey : "",
      category: sanitizeText(budget?.category),
      amountCents: resolveStoredCents(budget?.amountCents, budget?.amount, { positiveOnly: true }),
    }))
    .filter((budget, index, list) => budget.monthKey && budget.category && budget.amountCents > 0 &&
      list.findIndex((item) => item.monthKey === budget.monthKey &&
        item.category.localeCompare(budget.category, "es", { sensitivity: "base" }) === 0) === index);

  return {
    version: 3,
    activeMonth,
    activeView: ["dashboard", "movements", "projection", "settings"].includes(input?.activeView)
      ? input.activeView : "dashboard",
    settings: {
      currency: "ARS",
      locale: "es-AR",
      openingBalanceCents,
      openingBalanceMonth: isValidMonthKey(input?.settings?.openingBalanceMonth)
        ? input.settings.openingBalanceMonth : activeMonth,
      projectionMonths: [6, 12, 18, 24].includes(Number(input?.settings?.projectionMonths))
        ? Number(input.settings.projectionMonths) : 12,
    },
    people: people.length ? people : fallback.people,
    transactions,
    occurrenceStatus: {},
    occurrences,
    closedMonths,
    budgets,
    categories: categories.length ? categories : [...DEFAULT_CATEGORIES],
  };
}

function normalizeTransaction(transaction) {
  const kind = transaction?.kind === "income" ? "income" : "expense";
  const amountCents = resolveStoredCents(
    transaction?.amountCents,
    transaction?.amount,
    { positiveOnly: true },
  );
  const rawType = transaction?.schedule?.type || transaction?.scheduleType;
  const scheduleType = ["one-time", "monthly", "installment"].includes(rawType) ? rawType : "one-time";
  const rawStartMonth = transaction?.schedule?.startMonth || transaction?.startMonth;
  const startMonth = isValidMonthKey(rawStartMonth) ? rawStartMonth : formatMonthKey(new Date());
  const rawEndMonth = transaction?.schedule?.endMonth || transaction?.endMonth;
  const installments = Math.min(
    Math.max(Math.trunc(Number(transaction?.schedule?.installments || transaction?.installments) || 2), 2), 120,
  );
  if (amountCents <= 0) return null;

  return {
    id: sanitizeText(transaction?.id, createId()),
    kind,
    name: sanitizeText(transaction?.name, kind === "income" ? "Ingreso" : "Gasto"),
    category: sanitizeText(transaction?.category, "Otros"),
    person: sanitizeText(transaction?.person, "Compartido"),
    amountCents,
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

function materializeOccurrence(occurrence, overrides = {}) {
  return {
    transactionId: occurrence.id,
    monthKey: occurrence.monthKey,
    plannedAmountCents: occurrence.amountThisMonthCents,
    seriesAmountCents: occurrence.amountCents,
    actualAmountCents: null,
    status: "pending",
    effectiveDate: "",
    kind: occurrence.kind,
    name: occurrence.name,
    category: occurrence.category,
    person: occurrence.person,
    dueDay: occurrence.dueDay,
    note: occurrence.note,
    scheduleType: occurrence.schedule.type,
    installmentIndex: occurrence.installmentIndex,
    installments: occurrence.schedule.installments,
    ...overrides,
  };
}

function occurrenceForEditedTransaction(transaction, monthKey, originalOccurrence = null) {
  const candidate = cloneState(transaction);
  if (candidate.schedule.type === "installment") {
    const installmentIndex = Math.max(1, originalOccurrence?.installmentIndex || 1);
    candidate.schedule.startMonth = addMonths(monthKey, -(installmentIndex - 1));
  } else {
    candidate.schedule.startMonth = monthKey;
  }
  return occurrenceForMonth(candidate, monthKey);
}

function materializeSeriesThrough(transaction, endMonth) {
  const distance = monthDiff(transaction.schedule.startMonth, endMonth);
  if (distance < 0 || distance > 1200) return;
  for (let index = 0; index <= distance; index += 1) {
    const monthKey = addMonths(transaction.schedule.startMonth, index);
    const occurrence = occurrenceForMonth(transaction, monthKey, state.occurrences);
    if (occurrence && !state.occurrences[occurrence.statusKey]) {
      state.occurrences[occurrence.statusKey] = materializeOccurrence(occurrence);
    }
  }
}

function preserveProtectedOccurrences(transaction) {
  Object.keys(state.closedMonths).forEach((monthKey) => {
    const occurrence = occurrenceForMonth(transaction, monthKey, state.occurrences);
    if (occurrence && !state.occurrences[occurrence.statusKey]) {
      state.occurrences[occurrence.statusKey] = materializeOccurrence(occurrence);
    }
  });
  Object.entries(state.occurrences).forEach(([key, record]) => {
    if (record.transactionId !== transaction.id || record.status !== "paid") return;
    const occurrence = occurrenceForMonth(transaction, record.monthKey, state.occurrences);
    if (occurrence) state.occurrences[key] = materializeOccurrence(occurrence, record);
  });
}

function clearUnprotectedOccurrenceRecords(transactionId, fromMonth = "") {
  Object.entries(state.occurrences).forEach(([key, record]) => {
    if (record.transactionId !== transactionId) return;
    if (fromMonth && record.monthKey < fromMonth) return;
    if (record.status === "paid" || state.closedMonths[record.monthKey]) return;
    delete state.occurrences[key];
  });
}

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function normalizeOccurrenceRecords(rawRecords, transactions) {
  if (!rawRecords || typeof rawRecords !== "object" || Array.isArray(rawRecords)) return {};
  const transactionMap = new Map(transactions.map((item) => [item.id, item]));
  const records = {};
  Object.entries(rawRecords).forEach(([key, raw]) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
    const separator = key.lastIndexOf(":");
    if (separator <= 0) return;
    const transactionId = sanitizeText(raw.transactionId, key.slice(0, separator));
    const monthKey = isValidMonthKey(raw.monthKey) ? raw.monthKey : key.slice(separator + 1);
    if (!transactionId || !isValidMonthKey(monthKey) || key !== `${transactionId}:${monthKey}`) return;
    const transaction = transactionMap.get(transactionId);
    const base = transaction ? occurrenceForMonth(transaction, monthKey) : null;
    const plannedAmountCents = resolveStoredCents(raw.plannedAmountCents, raw.plannedAmount, { positiveOnly: true });
    const status = ["pending", "paid", "skipped"].includes(raw.status) ? raw.status : "pending";
    if (status !== "skipped" && plannedAmountCents <= 0 && !base) return;
    records[key] = {
      transactionId,
      monthKey,
      plannedAmountCents: plannedAmountCents || base?.amountThisMonthCents || 1,
      seriesAmountCents: resolveStoredCents(raw.seriesAmountCents, raw.seriesAmount, { positiveOnly: true }) ||
        base?.amountCents || plannedAmountCents || 1,
      actualAmountCents: status === "paid"
        ? resolveStoredCents(raw.actualAmountCents, raw.actualAmount, { positiveOnly: true }) ||
          plannedAmountCents || base?.amountThisMonthCents || 1
        : null,
      status,
      effectiveDate: /^\d{4}-\d{2}-\d{2}$/.test(raw.effectiveDate || "") ? raw.effectiveDate : "",
      kind: raw.kind === "income" || base?.kind === "income" ? "income" : "expense",
      name: sanitizeText(raw.name, base?.name || "Movimiento"),
      category: sanitizeText(raw.category, base?.category || "Otros"),
      person: sanitizeText(raw.person, base?.person || "Compartido"),
      dueDay: Math.min(Math.max(Math.trunc(Number(raw.dueDay ?? base?.dueDay) || 0), 0), 31),
      note: sanitizeText(raw.note, base?.note || ""),
      scheduleType: ["one-time", "monthly", "installment"].includes(raw.scheduleType)
        ? raw.scheduleType : base?.schedule.type || "one-time",
      installmentIndex: Math.max(0, Math.trunc(Number(raw.installmentIndex ?? base?.installmentIndex) || 0)),
      installments: Math.min(120, Math.max(1, Math.trunc(Number(raw.installments ?? base?.schedule.installments) || 1))),
    };
  });
  return records;
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

function formatCurrency(cents, compact = false) {
  return new Intl.NumberFormat(state.settings.locale, {
    style: "currency",
    currency: state.settings.currency,
    maximumFractionDigits: compact ? 0 : 2,
    notation: compact ? "compact" : "standard",
  }).format(fromCents(cents));
}

function getMonthTotals(monthKey) {
  return calculateMonthTotals(state.transactions, state.occurrences, monthKey);
}

function buildProjection(monthCount = state.settings.projectionMonths) {
  return calculateProjection({
    transactions: state.transactions,
    occurrenceRecords: state.occurrences,
    activeMonth: state.activeMonth,
    monthCount,
    openingBalanceCents: state.settings.openingBalanceCents,
    openingBalanceMonth: state.settings.openingBalanceMonth,
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
  const isClosed = Boolean(state.closedMonths[state.activeMonth]);
  dom.dashboardTitle.textContent = formatMonthLabel(state.activeMonth);
  dom.dashboardSubtitle.textContent = totals.occurrences.length
    ? `${totals.occurrences.length} movimiento${totals.occurrences.length === 1 ? "" : "s"} previsto${totals.occurrences.length === 1 ? "" : "s"} para organizar.`
    : "Todav\u00eda no hay movimientos para este mes.";

  const health = !totals.occurrences.length
    ? { label: "Sin datos todavía", tone: "neutral" }
    : totals.balanceCents >= 0
      ? { label: "Mes en equilibrio", tone: "positive" }
      : { label: "Revisar gastos", tone: "negative" };
  dom.monthHealth.textContent = isClosed ? "Mes cerrado" : health.label;
  dom.monthHealth.dataset.tone = health.tone;
  dom.monthCloseBtn.textContent = isClosed ? "Reabrir mes" : "Cerrar mes";
  dom.monthCloseBtn.classList.toggle("danger-btn", isClosed);

  dom.summaryGrid.replaceChildren();
  const cards = [
    ["Ingresos previstos", formatCurrency(totals.totalIncomeCents), `${totals.incomes.length} fuente${totals.incomes.length === 1 ? "" : "s"}`, "income"],
    ["Gastos previstos", formatCurrency(totals.totalExpenseCents), `${totals.expenses.length} compromiso${totals.expenses.length === 1 ? "" : "s"}`, "expense"],
    ["Disponible estimado", formatCurrency(totals.balanceCents), totals.balanceCents >= 0 ? "Despu\u00e9s de todos los gastos" : "Faltante para cubrir el mes", totals.balanceCents >= 0 ? "balance" : "danger"],
    ["Pendiente de pagar", formatCurrency(totals.pendingExpenseCents), `${formatCurrency(totals.paidExpenseCents)} ya pagado`, "pending"],
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
    ["Cobrado", formatCurrency(totals.receivedIncomeCents), `${formatCurrency(totals.pendingIncomeCents)} por cobrar`, "income"],
    ["Pagado", formatCurrency(totals.paidExpenseCents), `${formatCurrency(totals.pendingExpenseCents)} por pagar`, "expense"],
    ["Flujo realizado", formatCurrency(totals.actualBalanceCents), "Cobrado menos pagado", totals.actualBalanceCents >= 0 ? "balance" : "danger"],
    ["Por resolver", `${pendingCount} pendiente${pendingCount === 1 ? "" : "s"}`, "Movimientos todavía abiertos", "pending"],
  ];
  actualCards.forEach(([label, value, copy, tone]) => {
    const item = element("div", "actual-stat");
    item.dataset.tone = tone;
    item.append(element("span", "", label), element("strong", "", value), element("small", "", copy));
    dom.actualSummary.append(item);
  });

  const percentage = Math.round(totals.commitmentRate * 100);
  dom.commitmentRate.textContent = totals.totalIncomeCents ? `${percentage}%` : "-";
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
  const balanceLabel = totals.balanceCents >= 0
    ? `${formatCurrency(totals.balanceCents)} libre`
    : `${formatCurrency(Math.abs(totals.balanceCents))} faltante`;
  labels.append(element("span", "", `${formatCurrency(totals.totalExpenseCents)} comprometido`), element("strong", "", balanceLabel));
  dom.cashFlowVisual.append(track, labels);

  renderCategoryBreakdown(totals.expenses);
  renderMovementCollection(dom.dashboardMovements, totals.occurrences.slice(0, 5), true);
  renderMiniForecast();
  renderBudgetProgress(totals);
}

function renderBudgetProgress(totals) {
  const previous = getMonthTotals(addMonths(state.activeMonth, -1));
  const difference = totals.totalExpenseCents - previous.totalExpenseCents;
  dom.monthComparison.textContent = previous.totalExpenseCents
    ? `${difference <= 0 ? "↓" : "↑"} ${formatCurrency(Math.abs(difference))} vs. mes anterior`
    : "Sin mes anterior para comparar";
  dom.budgetProgress.replaceChildren();
  const budgets = state.budgets.filter((budget) => budget.monthKey === state.activeMonth);
  if (!budgets.length) {
    dom.budgetProgress.append(emptyState(
      "Sin presupuestos para este mes",
      "Podés definir límites por categoría desde Ajustes.",
    ));
    return;
  }
  budgets.forEach((budget) => {
    const spent = totals.expenses
      .filter((item) => item.category.localeCompare(budget.category, "es", { sensitivity: "base" }) === 0)
      .reduce((sum, item) => sum + item.amountThisMonthCents, 0);
    const percentage = Math.round((spent / budget.amountCents) * 100);
    const row = element("div", "budget-row");
    if (percentage > 100) row.dataset.tone = "negative";
    const head = element("div", "category-head");
    head.append(
      element("span", "", budget.category),
      element("strong", "", `${formatCurrency(spent)} / ${formatCurrency(budget.amountCents)}`),
    );
    const track = element("div", "category-track");
    const fill = element("span", "category-fill");
    fill.style.width = `${Math.min(percentage, 100)}%`;
    track.append(fill);
    row.append(head, track, element("small", "", `${percentage}% utilizado`));
    dom.budgetProgress.append(row);
  });
}

function renderCategoryBreakdown(expenses) {
  dom.categoryBreakdown.replaceChildren();
  if (!expenses.length) {
    dom.categoryBreakdown.append(emptyState("Sin gastos todav\u00eda", "Cuando carguen uno, ac\u00e1 ver\u00e1n c\u00f3mo se distribuye."));
    return;
  }
  const categories = new Map();
  expenses.forEach((item) => categories.set(item.category, (categories.get(item.category) || 0) + item.amountThisMonthCents));
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
    if (month.balanceCents < 0) card.dataset.tone = "negative";
    if (index === 0) card.classList.add("is-current");
    card.append(
      element("span", "forecast-month", formatMonthLabel(month.monthKey, true)),
      element("strong", "", formatCurrency(month.balanceCents, true)),
      element("small", "", month.balanceCents >= 0 ? "queda" : "faltar\u00eda"),
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
  if (item.schedule.type === "installment") {
    const progress = installmentProgress(item);
    return progress
      ? `Cuota ${item.installmentIndex} de ${item.schedule.installments} · resta ${formatCurrency(progress.remainingCents)}`
      : `Cuota ${item.installmentIndex} de ${item.schedule.installments}`;
  }
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
    statusButton.disabled = Boolean(state.closedMonths[item.monthKey]);
    statusButton.addEventListener("click", () => toggleOccurrenceStatus(item));

    const body = element("div", "movement-body");
    const titleLine = element("div", "movement-title-line");
    titleLine.append(element("strong", "movement-name", item.name), element("span", "kind-badge", item.kind === "income" ? "Ingreso" : "Gasto"));
    const dueState = dueStateForOccurrence(item);
    const dueLabels = {
      overdue: "Vencido",
      today: "Vence hoy",
      upcoming: "Próximo a vencer",
      scheduled: item.dueDay ? `Vence el día ${item.dueDay}` : "",
      none: "",
    };
    const meta = element("p", "movement-meta", [
      item.category,
      item.person,
      scheduleLabel(item),
      dueLabels[dueState],
    ].filter(Boolean).join(" · "));
    if (["overdue", "today", "upcoming"].includes(dueState)) meta.dataset.due = dueState;
    if (item.note && !compact) meta.append(document.createTextNode(` \u00b7 ${item.note}`));
    body.append(titleLine, meta);

    const amount = element("div", "movement-amount");
    const actualDiffers = item.status === "paid" && Number.isSafeInteger(item.actualAmountCents) &&
      item.actualAmountCents !== item.amountThisMonthCents;
    amount.append(
      element("strong", "", `${item.kind === "income" ? "+" : "-"}${formatCurrency(
        item.status === "paid" && Number.isSafeInteger(item.actualAmountCents)
          ? item.actualAmountCents : item.amountThisMonthCents,
      )}`),
      element("small", "", item.status === "paid"
        ? `${item.kind === "income" ? "Cobrado" : "Pagado"}${actualDiffers ? ` · previsto ${formatCurrency(item.amountThisMonthCents)}` : ""}`
        : "Pendiente"),
    );

    const editButton = element("button", "row-menu", "Editar");
    editButton.type = "button";
    editButton.setAttribute("aria-label", `Editar ${item.name}`);
    editButton.disabled = Boolean(state.closedMonths[item.monthKey]);
    editButton.addEventListener("click", () => openMovementDialog(item.id, item.monthKey));
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
    ["Ingresos", totals.totalIncomeCents, "income"],
    ["Gastos", totals.totalExpenseCents, "expense"],
    ["Balance", totals.balanceCents, totals.balanceCents >= 0 ? "balance" : "danger"],
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
  const negativeMonths = projection.filter((month) => month.balanceCents < 0).length;
  const totalIncomeCents = projection.reduce((sum, month) => sum + month.totalIncomeCents, 0);
  const totalExpenseCents = projection.reduce((sum, month) => sum + month.totalExpenseCents, 0);

  dom.projectionSummary.replaceChildren();
  [
    ["Saldo al final", formatCurrency(final?.cumulativeCents ?? state.settings.openingBalanceCents), `${projection.length} meses desde ${formatMonthLabel(state.activeMonth, true)}`],
    ["Ingresos del per\u00edodo", formatCurrency(totalIncomeCents), "Todo lo previsto"],
    ["Gastos del per\u00edodo", formatCurrency(totalExpenseCents), `${negativeMonths} mes${negativeMonths === 1 ? "" : "es"} con resultado negativo`],
  ].forEach(([label, value, copy], index) => {
    const card = element("article", "projection-stat");
    if (index === 0 && (final?.cumulativeCents ?? 0) < 0) card.dataset.tone = "negative";
    card.append(element("span", "", label), element("strong", "", value), element("small", "", copy));
    dom.projectionSummary.append(card);
  });

  const maxValue = Math.max(1, ...projection.flatMap((month) => [month.totalIncomeCents, month.totalExpenseCents]));
  dom.projectionChart.replaceChildren();
  dom.projectionChart.setAttribute("role", "img");
  dom.projectionChart.setAttribute("aria-label", `Gráfico de ingresos y gastos para ${projection.length} meses. El detalle completo está debajo.`);
  projection.forEach((month) => {
    const group = element("div", "chart-month");
    const bars = element("div", "chart-bars");
    const incomeBar = element("span", "chart-bar income-bar");
    const expenseBar = element("span", "chart-bar expense-bar");
    incomeBar.style.height = `${Math.max((month.totalIncomeCents / maxValue) * 100, month.totalIncomeCents ? 3 : 0)}%`;
    expenseBar.style.height = `${Math.max((month.totalExpenseCents / maxValue) * 100, month.totalExpenseCents ? 3 : 0)}%`;
    incomeBar.title = `Ingresos: ${formatCurrency(month.totalIncomeCents)}`;
    expenseBar.title = `Gastos: ${formatCurrency(month.totalExpenseCents)}`;
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
    if (month.balanceCents < 0) row.dataset.tone = "negative";
    const main = element("div", "projection-row-main");
    main.append(element("strong", "", formatMonthLabel(month.monthKey)), element("span", "", `${month.occurrences.length} movimiento${month.occurrences.length === 1 ? "" : "s"}`));
    const figures = element("div", "projection-figures");
    figures.append(
      element("span", "income-text", `+ ${formatCurrency(month.totalIncomeCents)}`),
      element("span", "expense-text", `- ${formatCurrency(month.totalExpenseCents)}`),
    );
    const result = element("div", "projection-result");
    result.append(element("strong", "", formatCurrency(month.balanceCents)), element("small", "", `Acumulado ${formatCurrency(month.cumulativeCents)}`));
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
  dom.preferencesForm.elements.openingBalance.value = fromCents(state.settings.openingBalanceCents);
  dom.preferencesForm.elements.openingBalanceMonth.value = state.settings.openingBalanceMonth;
  dom.preferencesForm.elements.projectionMonths.value = String(state.settings.projectionMonths);
  dom.categoryForm.reset();
  dom.categoriesList.replaceChildren();
  state.categories.forEach((category) => {
    const chip = element("span", "person-chip");
    chip.append(element("span", "", category));
    const remove = element("button", "", "×");
    remove.type = "button";
    remove.setAttribute("aria-label", `Eliminar categoría ${category}`);
    remove.addEventListener("click", () => removeCategory(category));
    chip.append(remove);
    dom.categoriesList.append(chip);
  });
  dom.budgetForm.elements.monthKey.value = state.activeMonth;
  dom.budgetsList.replaceChildren();
  const budgets = [...state.budgets].sort((a, b) =>
    b.monthKey.localeCompare(a.monthKey) || a.category.localeCompare(b.category, "es"));
  if (!budgets.length) {
    dom.budgetsList.append(emptyState("Sin presupuestos", "Agregá un límite mensual por categoría."));
  } else {
    budgets.forEach((budget) => {
      const row = element("div", "budget-setting-row");
      const copy = element("div", "");
      copy.append(
        element("strong", "", budget.category),
        element("small", "", `${formatMonthLabel(budget.monthKey)} · ${formatCurrency(budget.amountCents)}`),
      );
      const remove = element("button", "row-menu", "Eliminar");
      remove.type = "button";
      remove.addEventListener("click", () => removeBudget(budget.id));
      row.append(copy, remove);
      dom.budgetsList.append(row);
    });
  }
  dom.appVersion.textContent = `Versión ${APP_VERSION}.`;
}

function renderDatalists() {
  dom.peopleOptions.replaceChildren();
  state.people.forEach((person) => {
    const option = document.createElement("option");
    option.value = person.name;
    dom.peopleOptions.append(option);
  });

  dom.categoryOptions.replaceChildren();
  state.categories.forEach((category) => {
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
  if (state.closedMonths[item.monthKey]) {
    showToast("Reabrí el mes antes de modificar un movimiento");
    return;
  }
  if (item.status !== "paid") {
    dom.settlementForm.elements.occurrenceKey.value = item.statusKey;
    dom.settlementForm.elements.actualAmount.value = fromCents(item.amountThisMonthCents);
    dom.settlementForm.elements.effectiveDate.value = localDateKey();
    dom.settlementTitle.textContent = item.kind === "income" ? "Registrar cobro" : "Registrar pago";
    dom.settlementDialog.showModal();
    window.setTimeout(() => dom.settlementForm.elements.actualAmount.focus(), 40);
    return;
  }
  const previousState = cloneState(state);
  state.occurrences[item.statusKey] = materializeOccurrence(item, {
    status: "pending",
    actualAmountCents: null,
    effectiveDate: "",
  });
  if (!await saveState()) {
    state = previousState;
    render();
    return;
  }
  render();
  showToast("Marcado como pendiente");
}

async function saveSettlement(event) {
  event.preventDefault();
  const formData = new FormData(dom.settlementForm);
  const key = sanitizeText(formData.get("occurrenceKey"));
  const current = getMonthTotals(state.activeMonth).occurrences.find((item) => item.statusKey === key) ||
    Object.values(state.occurrences).find((record) => `${record.transactionId}:${record.monthKey}` === key);
  const actualAmountCents = toCents(formData.get("actualAmount"));
  const effectiveDate = sanitizeText(formData.get("effectiveDate"));
  if (!current || actualAmountCents <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) return;
  const previousState = cloneState(state);
  state.occurrences[key] = materializeOccurrence(current, {
    status: "paid",
    actualAmountCents,
    effectiveDate,
  });
  if (!await saveState()) {
    state = previousState;
    render();
    return;
  }
  dom.settlementDialog.close();
  render();
  showToast(current.kind === "income" ? "Cobro registrado" : "Pago registrado");
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
  dom.movementForm.elements.installments.disabled = !isInstallment;
  dom.movementForm.elements.endMonth.disabled = !isMonthly;
  dom.amountLabel.textContent = isInstallment ? "Monto total" : "Monto";

  if (isInstallment) {
    const totalCents = toCents(dom.movementForm.elements.amount.value);
    const count = Number(dom.movementForm.elements.installments.value) || 2;
    const futureEdit = Boolean(currentEditId) && dom.movementForm.elements.editScope.value === "future";
    dom.formHint.textContent = futureEdit
      ? "El monto y las cuotas formar\u00e1n un plan nuevo desde el mes activo; los meses anteriores conservar\u00e1n sus valores."
      : totalCents > 0
        ? `${count} cuotas de aproximadamente ${formatCurrency(Math.round(totalCents / count))}. La \u00faltima se ajusta si hace falta.`
        : "Ingres\u00e1 el total de la compra, no el valor de cada cuota.";
  } else if (isMonthly) {
    dom.formHint.textContent = "Se repetir\u00e1 cada mes hasta la fecha final, o sin l\u00edmite si la dej\u00e1s vac\u00eda.";
  } else {
    dom.formHint.textContent = "Aparecer\u00e1 \u00fanicamente en el mes de inicio.";
  }
  validateScheduleRange();
}

function openMovementDialog(transactionId = "", monthKey = state.activeMonth) {
  if (state.closedMonths[monthKey]) {
    showToast("Reabrí el mes antes de modificar movimientos");
    return;
  }
  const transaction = state.transactions.find((item) => item.id === transactionId);
  const occurrenceKey = transactionId ? `${transactionId}:${monthKey}` : "";
  const record = state.occurrences[occurrenceKey];
  const source = transaction || (record ? {
    id: record.transactionId,
    kind: record.kind,
    name: record.name,
    category: record.category,
    person: record.person,
    amountCents: record.seriesAmountCents || record.plannedAmountCents,
    schedule: {
      type: record.scheduleType,
      startMonth: record.monthKey,
      endMonth: "",
      installments: record.installments,
    },
    dueDay: record.dueDay,
    note: record.note,
  } : null);
  dom.movementForm.reset();
  dom.movementForm.elements.id.value = source?.id || "";
  dom.movementForm.elements.occurrenceKey.value = source ? occurrenceKey : "";
  dom.movementForm.elements.kind.value = source?.kind || "expense";
  dom.movementForm.elements.name.value = source?.name || "";
  dom.movementForm.elements.category.value = source?.category || "";
  dom.movementForm.elements.person.value = source?.person || state.people[0]?.name || "Compartido";
  dom.movementForm.elements.amount.value = source ? fromCents(source.amountCents) : "";
  dom.movementForm.elements.startMonth.value = source?.schedule.startMonth || state.activeMonth;
  dom.movementForm.elements.scheduleType.value = source?.schedule.type || "one-time";
  dom.movementForm.elements.installments.value = source?.schedule.installments || 2;
  dom.movementForm.elements.endMonth.value = source?.schedule.endMonth || "";
  dom.movementForm.elements.dueDay.value = source?.dueDay || "";
  dom.movementForm.elements.note.value = source?.note || "";
  const recurring = transaction && transaction.schedule.type !== "one-time";
  dom.editScopeField.hidden = !recurring;
  dom.movementForm.elements.editScope.value = transaction?.schedule.type === "monthly" ? "future" : "current";
  dom.movementDialogTitle.textContent = source ? "Editar movimiento" : "Agregar movimiento";
  dom.deleteMovementBtn.hidden = !source;
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
  const existingSeries = state.transactions[index];
  const occurrenceKey = sanitizeText(formData.get("occurrenceKey"));
  const scope = sanitizeText(formData.get("editScope"), "current");
  if (existingSeries && scope === "current") {
    const originalOccurrence = getMonthTotals(state.activeMonth).occurrences
      .find((item) => item.statusKey === occurrenceKey) ||
      occurrenceForMonth(existingSeries, state.activeMonth, state.occurrences);
    const editedOccurrence = occurrenceForEditedTransaction(transaction, state.activeMonth, originalOccurrence);
    if (!editedOccurrence) {
      state = previousState;
      showToast("El movimiento no corresponde al mes activo");
      return;
    }
    const previousRecord = state.occurrences[occurrenceKey];
    state.occurrences[occurrenceKey] = materializeOccurrence(editedOccurrence, {
      status: previousRecord?.status || originalOccurrence?.status || "pending",
      actualAmountCents: previousRecord?.actualAmountCents ?? originalOccurrence?.actualAmountCents ?? null,
      effectiveDate: previousRecord?.effectiveDate || originalOccurrence?.effectiveDate || "",
    });
  } else if (existingSeries && scope === "future") {
    materializeSeriesThrough(existingSeries, addMonths(state.activeMonth, -1));
    preserveProtectedOccurrences(existingSeries);
    clearUnprotectedOccurrenceRecords(existingSeries.id, state.activeMonth);
    state.transactions.splice(index, 1);
    transaction.id = createId();
    transaction.schedule.startMonth = state.activeMonth;
    transaction.createdAt = new Date().toISOString();
    state.transactions.push(transaction);
  } else if (existingSeries) {
    preserveProtectedOccurrences(existingSeries);
    clearUnprotectedOccurrenceRecords(existingSeries.id);
    state.transactions[index] = transaction;
  } else if (occurrenceKey && state.occurrences[occurrenceKey]) {
    const originalOccurrence = getMonthTotals(state.activeMonth).occurrences
      .find((item) => item.statusKey === occurrenceKey);
    const editedOccurrence = occurrenceForEditedTransaction(transaction, state.activeMonth, originalOccurrence);
    const previousRecord = state.occurrences[occurrenceKey];
    state.occurrences[occurrenceKey] = materializeOccurrence(editedOccurrence, {
      status: previousRecord.status,
      actualAmountCents: previousRecord.actualAmountCents,
      effectiveDate: previousRecord.effectiveDate,
    });
  } else {
    state.transactions.push(transaction);
  }

  const personName = transaction.person;
  if (!state.people.some((person) => person.name.toLocaleLowerCase("es") === personName.toLocaleLowerCase("es"))) {
    state.people.push({ id: createId(), name: personName });
  }
  if (!state.categories.some((category) =>
    category.localeCompare(transaction.category, "es", { sensitivity: "base" }) === 0
  )) {
    state.categories.push(transaction.category);
    state.categories.sort((a, b) => a.localeCompare(b, "es"));
  }

  if (!await saveState()) {
    state = previousState;
    render();
    return;
  }
  closeMovementDialog();
  render();
  showToast(existingId ? "Movimiento actualizado" : "Movimiento agregado");
}

async function deleteMovement() {
  const id = dom.movementForm.elements.id.value;
  if (!id) return;
  const index = state.transactions.findIndex((item) => item.id === id);
  const transaction = state.transactions[index];
  const occurrenceKey = dom.movementForm.elements.occurrenceKey.value;
  const record = state.occurrences[occurrenceKey];
  if (!transaction && !record) return;
  const requestedScope = dom.movementForm.elements.editScope.value || "current";
  const scope = transaction?.schedule.type === "one-time" ? "all" : requestedScope;
  const name = transaction?.name || record.name;
  const scopeCopy = scope === "current"
    ? "Sólo se excluirá del mes activo."
    : scope === "future"
      ? "Se conservarán los meses anteriores y se eliminará desde el mes activo."
      : "Se eliminará la serie, conservando únicamente meses pagados o cerrados.";

  closeMovementDialog();
  const confirmed = await confirmAction({
    title: "Eliminar movimiento",
    copy: `¿Querés eliminar “${name}”? ${scopeCopy}`,
    confirmLabel: "Eliminar",
    danger: true,
  });
  if (!confirmed) {
    openMovementDialog(id, record?.monthKey || state.activeMonth);
    return;
  }

  const previousState = cloneState(state);
  if (!transaction) {
    delete state.occurrences[occurrenceKey];
  } else if (scope === "current") {
    const occurrence = occurrenceForMonth(transaction, state.activeMonth, state.occurrences);
    if (occurrence) {
      state.occurrences[occurrence.statusKey] = materializeOccurrence(occurrence, {
        status: "skipped",
        actualAmountCents: null,
        effectiveDate: "",
      });
    }
  } else if (scope === "future") {
    materializeSeriesThrough(transaction, addMonths(state.activeMonth, -1));
    preserveProtectedOccurrences(transaction);
    clearUnprotectedOccurrenceRecords(transaction.id, state.activeMonth);
    state.transactions = state.transactions.filter((item) => item.id !== id);
  } else {
    preserveProtectedOccurrences(transaction);
    clearUnprotectedOccurrenceRecords(transaction.id);
    state.transactions = state.transactions.filter((item) => item.id !== id);
  }
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
      state = previousState;
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

async function toggleMonthClosed() {
  const isClosed = Boolean(state.closedMonths[state.activeMonth]);
  const totals = getMonthTotals(state.activeMonth);
  const confirmed = await confirmAction({
    title: isClosed ? "Reabrir mes" : "Cerrar mes",
    copy: isClosed
      ? "El mes volverá a admitir cambios. Sus valores históricos materializados se conservarán."
      : "Los valores previstos y reales quedarán congelados. Podrás reabrirlo cuando lo necesites.",
    details: isClosed ? [] : [
      `${totals.occurrences.length} movimientos`,
      `${totals.occurrences.filter((item) => item.status === "pending").length} pendientes`,
      `Resultado previsto: ${formatCurrency(totals.balanceCents)}`,
    ],
    confirmLabel: isClosed ? "Reabrir" : "Cerrar mes",
  });
  if (!confirmed) return;
  const previousState = cloneState(state);
  if (isClosed) {
    delete state.closedMonths[state.activeMonth];
  } else {
    totals.occurrences.forEach((occurrence) => {
      if (!state.occurrences[occurrence.statusKey]) {
        state.occurrences[occurrence.statusKey] = materializeOccurrence(occurrence);
      }
    });
    state.closedMonths[state.activeMonth] = { closedAt: new Date().toISOString() };
  }
  if (!await saveState()) {
    state = previousState;
    render();
    return;
  }
  render();
  showToast(isClosed ? "Mes reabierto" : "Mes cerrado y protegido");
}

async function removeCategory(category) {
  const inUse = state.transactions.some((item) =>
    item.category.localeCompare(category, "es", { sensitivity: "base" }) === 0
  ) || Object.values(state.occurrences).some((item) =>
    item.category.localeCompare(category, "es", { sensitivity: "base" }) === 0
  ) || state.budgets.some((item) =>
    item.category.localeCompare(category, "es", { sensitivity: "base" }) === 0
  );
  if (inUse) {
    showToast("Esa categoría está siendo utilizada");
    return;
  }
  const previousState = cloneState(state);
  state.categories = state.categories.filter((item) => item !== category);
  if (!await saveState()) {
    state = previousState;
    render();
    return;
  }
  render();
  showToast("Categoría eliminada");
}

async function removeBudget(id) {
  const previousState = cloneState(state);
  state.budgets = state.budgets.filter((item) => item.id !== id);
  if (!await saveState()) {
    state = previousState;
    render();
    return;
  }
  render();
  showToast("Presupuesto eliminado");
}

function csvCell(value) {
  return escapeCsvCell(value);
}

function exportCsv() {
  const startCandidates = [
    state.activeMonth,
    ...state.transactions.map((item) => item.schedule.startMonth),
    ...Object.values(state.occurrences).map((item) => item.monthKey),
  ].filter(isValidMonthKey).sort();
  let startMonth = startCandidates[0] || state.activeMonth;
  if (monthDiff(startMonth, state.activeMonth) > 120) startMonth = addMonths(state.activeMonth, -120);
  const endMonth = addMonths(state.activeMonth, state.settings.projectionMonths - 1);
  const rowMap = new Map();
  const count = Math.max(1, monthDiff(startMonth, endMonth) + 1);
  for (let index = 0; index < count; index += 1) {
    const monthKey = addMonths(startMonth, index);
    getMonthTotals(monthKey).occurrences.forEach((item) => rowMap.set(item.statusKey, item));
  }
  const header = [
    "Mes", "Tipo", "Concepto", "Categoría", "Persona", "Previsto", "Real",
    "Estado", "Fecha efectiva", "Día estimado", "Modalidad", "Cuota", "Nota",
  ];
  const rows = [...rowMap.values()].sort((a, b) =>
    a.monthKey.localeCompare(b.monthKey) || a.name.localeCompare(b.name, "es"))
    .map((item) => [
      item.monthKey,
      item.kind === "income" ? "Ingreso" : "Gasto",
      item.name,
      item.category,
      item.person,
      fromCents(item.amountThisMonthCents).toFixed(2),
      item.status === "paid" ? fromCents(item.actualAmountCents ?? item.amountThisMonthCents).toFixed(2) : "",
      item.status === "paid" ? "Realizado" : "Pendiente",
      item.effectiveDate,
      item.dueDay || "",
      item.schedule.type,
      item.installmentIndex || "",
      item.note,
    ]);
  const content = "\ufeff" + [header, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ilara-movimientos-${state.activeMonth}.csv`;
  document.body.append(link);
  link.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    link.remove();
  }, 0);
  showToast("CSV exportado");
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
dom.movementForm.elements.editScope.addEventListener("change", updateScheduleFields);
dom.closeDialogBtn.addEventListener("click", closeMovementDialog);
dom.cancelDialogBtn.addEventListener("click", closeMovementDialog);
dom.deleteMovementBtn.addEventListener("click", deleteMovement);
dom.movementDialog.addEventListener("click", (event) => {
  if (event.target === dom.movementDialog) closeMovementDialog();
});
dom.settlementForm.addEventListener("submit", saveSettlement);
document.querySelectorAll("[data-close-settlement]").forEach((button) =>
  button.addEventListener("click", () => dom.settlementDialog.close()),
);
dom.settlementDialog.addEventListener("click", (event) => {
  if (event.target === dom.settlementDialog) dom.settlementDialog.close();
});
dom.monthCloseBtn.addEventListener("click", toggleMonthClosed);

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

dom.categoryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = sanitizeText(new FormData(dom.categoryForm).get("name"));
  if (!name) return;
  if (state.categories.some((category) =>
    category.localeCompare(name, "es", { sensitivity: "base" }) === 0
  )) {
    showToast("Esa categoría ya existe");
    return;
  }
  const previousState = cloneState(state);
  state.categories.push(name);
  state.categories.sort((a, b) => a.localeCompare(b, "es"));
  if (!await saveState()) {
    state = previousState;
    render();
    return;
  }
  render();
  showToast("Categoría agregada");
});

dom.budgetForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(dom.budgetForm);
  const monthKey = sanitizeText(formData.get("monthKey"));
  const category = sanitizeText(formData.get("category"));
  const amountCents = toCents(formData.get("amount"));
  if (!isValidMonthKey(monthKey) || !category || amountCents <= 0) return;
  const previousState = cloneState(state);
  const existing = state.budgets.find((item) =>
    item.monthKey === monthKey &&
    item.category.localeCompare(category, "es", { sensitivity: "base" }) === 0);
  if (existing) {
    existing.amountCents = amountCents;
  } else {
    state.budgets.push({ id: createId(), monthKey, category, amountCents });
  }
  if (!state.categories.some((item) =>
    item.localeCompare(category, "es", { sensitivity: "base" }) === 0
  )) {
    state.categories.push(category);
    state.categories.sort((a, b) => a.localeCompare(b, "es"));
  }
  if (!await saveState()) {
    state = previousState;
    render();
    return;
  }
  dom.budgetForm.reset();
  render();
  showToast(existing ? "Presupuesto actualizado" : "Presupuesto agregado");
});

dom.preferencesForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(dom.preferencesForm);
  const openingBalanceCents = toCents(formData.get("openingBalance"));
  const openingBalanceMonth = sanitizeText(formData.get("openingBalanceMonth"));
  const projectionMonths = Number(formData.get("projectionMonths"));
  const previousState = cloneState(state);
  state.settings.openingBalanceCents = openingBalanceCents;
  state.settings.openingBalanceMonth = isValidMonthKey(openingBalanceMonth)
    ? openingBalanceMonth : state.activeMonth;
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
dom.exportCsvBtn.addEventListener("click", exportCsv);
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
