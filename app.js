import {
  addMonths,
  buildProjection as calculateProjection,
  dueStateForOccurrence,
  formatMonthKey,
  getMonthTotals as calculateMonthTotals,
  installmentAmountCents,
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
  driveConfirmPulled,
  driveConnect,
  driveDisconnect,
  driveGetStatus,
  driveMarkLocalDirty,
  drivePull,
  drivePush,
  driveSaveCredentials,
  driveSetAutoSync,
  getDataProfile,
  listDataProfiles,
  loadStoredState,
  migrateLegacySnapshot,
  resetSandboxProfile,
  saveStoredState,
  setDataProfile,
} from "./src/storage.ts";

const APP_VERSION = "3.9.9.9";
const APP_CHANNEL = "Estable";
const DRIVE_PUSH_DEBOUNCE_MS = 12_000;
const STORAGE_KEY = "ilara-finanzas-v3";
const EMERGENCY_STORAGE_KEY_BASE = "ilara-finanzas-v3-emergency";
const BACKUP_FORMAT = "ilara-finanzas-backup";
const BACKUP_VERSION = 1;
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const LEGACY_KEYS = ["trama-finanzas-v3", "finanzas-personales-app-v2", "finanzas-personales-app-v1"];
/** Catálogo base de categorías (hogar AR/ES). Se fusiona al cargar con las del usuario. */
const DEFAULT_CATEGORIES = [
  // Ingresos
  "Sueldo",
  "Aguinaldo",
  "Bonos",
  "Comisiones",
  "Trabajo extra",
  "Freelance",
  "Honorarios",
  "Alquiler cobrado",
  "Intereses",
  "Dividendos",
  "Inversiones",
  "Venta",
  "Reintegro",
  "Devoluci\u00f3n",
  "Regalo recibido",
  "Ayuda familiar",
  "Jubilaci\u00f3n",
  "Pensi\u00f3n",
  "Asignaciones",
  "Becas",
  "Otros ingresos",
  // Vivienda y hogar
  "Hogar",
  "Alquiler",
  "Expensas",
  "Hipoteca",
  "Muebles",
  "Electrodom\u00e9sticos",
  "Decoraci\u00f3n",
  "Mantenimiento hogar",
  "Reparaciones",
  "Jard\u00edn",
  "Limpieza",
  "Seguridad / alarma",
  // Servicios
  "Servicios",
  "Luz",
  "Gas",
  "Agua",
  "Internet",
  "Tel\u00e9fono",
  "Celular",
  "TV / cable / streaming",
  "Municipalidad",
  "ABL / tasas",
  // Alimentaci\u00f3n
  "Supermercado",
  "Almac\u00e9n",
  "Verduler\u00eda",
  "Carnicer\u00eda",
  "Panader\u00eda",
  "Delivery",
  "Restaurantes",
  "Caf\u00e9 / bar",
  "Comida r\u00e1pida",
  // Transporte
  "Transporte",
  "Combustible",
  "SUBE / colectivo",
  "Uber / taxi",
  "Peajes",
  "Estacionamiento",
  "Mantenimiento auto",
  "Seguro auto",
  "Patente",
  "Mec\u00e1nico",
  "Lavadero",
  "Bicicleta / mono",
  // Salud
  "Salud",
  "Obra social / prepaga",
  "Farmacia",
  "M\u00e9dico",
  "Dentista",
  "\u00d3ptica",
  "Laboratorio",
  "Psicolog\u00eda",
  "Gimnasio / deporte",
  // Educaci\u00f3n
  "Educaci\u00f3n",
  "Colegio / universidad",
  "Cuota escolar",
  "Materiales estudio",
  "Cursos",
  "Libros",
  "Idiomas",
  "Guarder\u00eda",
  // Familia y mascotas
  "Hijos",
  "Pa\u00f1ales / beb\u00e9",
  "Juguetes",
  "Mascotas",
  "Veterinaria",
  "Alimento mascotas",
  // Ocio y lifestyle
  "Ocio",
  "Streaming",
  "Cine / teatro",
  "Salidas",
  "Viajes",
  "Vacaciones",
  "Hoteles",
  "Hobbies",
  "Juegos / apps",
  "Suscripciones",
  // Compras personales
  "Indumentaria",
  "Calzado",
  "Accesorios",
  "Belleza / cosm\u00e9tica",
  "Peluquer\u00eda",
  "Lavander\u00eda",
  "Electr\u00f3nica",
  "Tecnolog\u00eda",
  "Software",
  // Finanzas y obligaciones
  "Ahorro",
  "Inversi\u00f3n",
  "Plazo fijo",
  "Tarjeta de cr\u00e9dito",
  "Pr\u00e9stamo",
  "Cuotas",
  "Impuestos",
  "Monotributo",
  "Ganancias",
  "Bienes personales",
  "Seguros",
  "Seguro de vida",
  "Comisiones bancarias",
  "Transferencias",
  // Trabajo
  "Oficina / cowork",
  "Herramientas trabajo",
  "Capacitaci\u00f3n laboral",
  "Indumentaria laboral",
  // Varios
  "Regalos",
  "Donaciones",
  "Eventos",
  "Tr\u00e1mites",
  "Multas",
  "Imprevistos",
  "Otros",
];

const dom = {
  activeMonthInput: document.querySelector("#activeMonthInput"),
  activeMonthDisplay: document.querySelector("#activeMonthDisplay"),
  monthPickerBtn: document.querySelector("#monthPickerBtn"),
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
  copyPrevMonthBtn: document.querySelector("#copyPrevMonthBtn"),
  dueSoonPanel: document.querySelector("#dueSoonPanel"),
  dueSoonList: document.querySelector("#dueSoonList"),
  projectionMonthsSelect: document.querySelector("#projectionMonthsSelect"),
  projectionSummary: document.querySelector("#projectionSummary"),
  projectionChart: document.querySelector("#projectionChart"),
  projectionList: document.querySelector("#projectionList"),
  projectionBreakdownTitle: document.querySelector("#projectionBreakdownTitle"),
  projectionExpenseFilters: document.querySelector("#projectionExpenseFilters"),
  projectionBreakdown: document.querySelector("#projectionBreakdown"),
  projectionBreakdownDetail: document.querySelector("#projectionBreakdownDetail"),
  addPlannedBtn: document.querySelector("#addPlannedBtn"),
  plannedTypeFilter: document.querySelector("#plannedTypeFilter"),
  plannedStatusFilter: document.querySelector("#plannedStatusFilter"),
  plannedTotals: document.querySelector("#plannedTotals"),
  plannedList: document.querySelector("#plannedList"),
  plannedDialog: document.querySelector("#plannedDialog"),
  plannedForm: document.querySelector("#plannedForm"),
  plannedDialogTitle: document.querySelector("#plannedDialogTitle"),
  deletePlannedBtn: document.querySelector("#deletePlannedBtn"),
  plannedEndMonthField: document.querySelector("#plannedEndMonthField"),
  plannedConfirmDialog: document.querySelector("#plannedConfirmDialog"),
  plannedConfirmForm: document.querySelector("#plannedConfirmForm"),
  plannedConfirmTitle: document.querySelector("#plannedConfirmTitle"),
  plannedConfirmCopy: document.querySelector("#plannedConfirmCopy"),
  plannedConfirmEditBtn: document.querySelector("#plannedConfirmEditBtn"),
  plannedConfirmDismissBtn: document.querySelector("#plannedConfirmDismissBtn"),
  personForm: document.querySelector("#personForm"),
  peopleList: document.querySelector("#peopleList"),
  preferencesForm: document.querySelector("#preferencesForm"),
  appVersion: document.querySelector("#appVersion"),
  profileSandboxBanner: document.querySelector("#profileSandboxBanner"),
  profileSwitchToHogarBtn: document.querySelector("#profileSwitchToHogarBtn"),
  profileStatus: document.querySelector("#profileStatus"),
  profileHogarBtn: document.querySelector("#profileHogarBtn"),
  profilePruebaBtn: document.querySelector("#profilePruebaBtn"),
  profileResetPruebaBtn: document.querySelector("#profileResetPruebaBtn"),
  emergencyBanner: document.querySelector("#emergencyBanner"),
  emergencyBannerCopy: document.querySelector("#emergencyBannerCopy"),
  emergencyBannerSettingsBtn: document.querySelector("#emergencyBannerSettingsBtn"),
  emergencyPanel: document.querySelector("#emergencyPanel"),
  emergencyStatusCopy: document.querySelector("#emergencyStatusCopy"),
  emergencyApplyBtn: document.querySelector("#emergencyApplyBtn"),
  emergencyExportBtn: document.querySelector("#emergencyExportBtn"),
  emergencyDiscardBtn: document.querySelector("#emergencyDiscardBtn"),
  duplicateMovementBtn: document.querySelector("#duplicateMovementBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  importBtn: document.querySelector("#importBtn"),
  importFileInput: document.querySelector("#importFileInput"),
  driveSetupBlock: document.querySelector("#driveSetupBlock"),
  driveClientId: document.querySelector("#driveClientId"),
  driveClientSecret: document.querySelector("#driveClientSecret"),
  driveSaveCredsBtn: document.querySelector("#driveSaveCredsBtn"),
  driveStatusText: document.querySelector("#driveStatusText"),
  driveAutoSyncToggle: document.querySelector("#driveAutoSyncToggle"),
  driveConnectBtn: document.querySelector("#driveConnectBtn"),
  driveSyncNowBtn: document.querySelector("#driveSyncNowBtn"),
  driveDisconnectBtn: document.querySelector("#driveDisconnectBtn"),
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
  cardsRoot: document.querySelector("#cardsRoot"),
  cardsSummary: document.querySelector("#cardsSummary"),
  cardsForecast: document.querySelector("#cardsForecast"),
  cardsHorizonSelect: document.querySelector("#cardsHorizonSelect"),
  addCardBtn: document.querySelector("#addCardBtn"),
  cardDialog: document.querySelector("#cardDialog"),
  cardForm: document.querySelector("#cardForm"),
  chargeDialog: document.querySelector("#chargeDialog"),
  chargeForm: document.querySelector("#chargeForm"),
  chargeDialogTitle: document.querySelector("#chargeDialogTitle"),
  chargeTotalField: document.querySelector("#chargeTotalField"),
  chargeCuotaField: document.querySelector("#chargeCuotaField"),
  chargeAmountModeField: document.querySelector("#chargeAmountModeField"),
  chargeAmountHint: document.querySelector("#chargeAmountHint"),
  chargeInstallmentsField: document.querySelector("#chargeInstallmentsField"),
  chargePaidField: document.querySelector("#chargePaidField"),
  chargeMonthlyField: document.querySelector("#chargeMonthlyField"),
  fxRateInput: document.querySelector("#fxRateInput"),
  fxUseManual: document.querySelector("#fxUseManual"),
  fxStatus: document.querySelector("#fxStatus"),
  fxRefreshBtn: document.querySelector("#fxRefreshBtn"),
  fxSaveBtn: document.querySelector("#fxSaveBtn"),
  purchaseDialog: document.querySelector("#purchaseDialog"),
  purchaseForm: document.querySelector("#purchaseForm"),
  dashboardCardPurchaseBtn: document.querySelector("#dashboardCardPurchaseBtn"),
  dashboardCardPurchaseBtnTop: document.querySelector("#dashboardCardPurchaseBtnTop"),
  cardsBackBtn: document.querySelector("#cardsBackBtn"),
  cardsPageTitle: document.querySelector("#cardsPageTitle"),
  cardsPageCopy: document.querySelector("#cardsPageCopy"),
};

let state = createDefaultState();
let toastTimer;
let storageErrorShown = false;
let initializationWarning = "";
/** @type {{ id: string, label: string, databaseFile: string, isSandbox: boolean, isActive: boolean } | null} */
let dataProfile = null;
let profileBusy = false;

function emergencyStorageKey() {
  const profileId = dataProfile?.id || "hogar";
  return `${EMERGENCY_STORAGE_KEY_BASE}:${profileId}`;
}

function isSandboxProfile() {
  return Boolean(dataProfile?.isSandbox);
}

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
    plannedItems: [],
    creditCards: [],
    cardCharges: [],
    fx: createDefaultFx(),
  };
}

function createDefaultFx() {
  return {
    usdArs: 1000,
    useManual: false,
    manualUsdArs: null,
    apiUsdArs: null,
    apiLabel: "",
    apiUpdatedAt: "",
  };
}

function normalizeFx(input) {
  const fallback = createDefaultFx();
  const apiUsdArs = Number(input?.apiUsdArs);
  const manualUsdArs = Number(input?.manualUsdArs);
  const usdArs = Number(input?.usdArs);
  return {
    usdArs: Number.isFinite(usdArs) && usdArs > 0 ? usdArs : fallback.usdArs,
    useManual: Boolean(input?.useManual),
    manualUsdArs: Number.isFinite(manualUsdArs) && manualUsdArs > 0 ? manualUsdArs : null,
    apiUsdArs: Number.isFinite(apiUsdArs) && apiUsdArs > 0 ? apiUsdArs : null,
    apiLabel: sanitizeText(input?.apiLabel),
    apiUpdatedAt: sanitizeText(input?.apiUpdatedAt),
  };
}

function effectiveUsdArs(fx = state.fx) {
  if (fx.useManual && Number.isFinite(fx.manualUsdArs) && fx.manualUsdArs > 0) return fx.manualUsdArs;
  if (Number.isFinite(fx.apiUsdArs) && fx.apiUsdArs > 0) return fx.apiUsdArs;
  if (Number.isFinite(fx.usdArs) && fx.usdArs > 0) return fx.usdArs;
  return 1000;
}

function isValidIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function formatIsoDateLabel(isoDate) {
  if (!isValidIsoDate(isoDate)) return "—";
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

/** Convierte día-del-mes legado (1–31) a la próxima fecha ISO a partir de hoy. */
function legacyDayToNextIsoDate(day, fromDate = new Date()) {
  const n = Math.trunc(Number(day) || 0);
  if (n < 1 || n > 31) return "";
  const year = fromDate.getFullYear();
  const month = fromDate.getMonth();
  const lastThis = new Date(year, month + 1, 0).getDate();
  let candidate = new Date(year, month, Math.min(n, lastThis));
  const start = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
  if (candidate < start) {
    const lastNext = new Date(year, month + 2, 0).getDate();
    candidate = new Date(year, month + 1, Math.min(n, lastNext));
  }
  const yyyy = candidate.getFullYear();
  const mm = String(candidate.getMonth() + 1).padStart(2, "0");
  const dd = String(candidate.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function daysUntilIsoDate(isoDate, fromDate = new Date()) {
  if (!isValidIsoDate(isoDate)) return null;
  const [y, m, d] = isoDate.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const start = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
  return Math.round((target - start) / 86400000);
}

/** Detecta nombres tipo “CC Mara” para migrar a cuenta corriente. */
function nameLooksLikeCcMara(name) {
  const n = String(name || "").toLocaleLowerCase("es").normalize("NFD").replace(/\p{M}/gu, "");
  return n.includes("cc mara")
    || n.includes("cuenta corriente mara")
    || n.includes("cta cte mara")
    || n.includes("cuenta cte mara");
}

function isCuentaCorrienteCard(card) {
  return Boolean(card?.excludeFromCardTotals);
}

function creditCardsForTotals() {
  return (state.creditCards || []).filter((card) => !isCuentaCorrienteCard(card));
}

function creditCardsCuentaCorriente() {
  return (state.creditCards || []).filter((card) => isCuentaCorrienteCard(card));
}

function normalizeCreditCard(card) {
  const id = sanitizeText(card?.id, createId());
  const name = sanitizeText(card?.name);
  if (!name) return null;
  const legacyClosing = Math.min(Math.max(Math.trunc(Number(card?.closingDay) || 0), 0), 31);
  const legacyDue = Math.min(Math.max(Math.trunc(Number(card?.dueDay) || 0), 0), 31);
  let closingDate = isValidIsoDate(card?.closingDate) ? card.closingDate : "";
  let dueDate = isValidIsoDate(card?.dueDate) ? card.dueDate : "";
  // Migración suave desde solo-día
  if (!closingDate && legacyClosing) closingDate = legacyDayToNextIsoDate(legacyClosing);
  if (!dueDate && legacyDue) dueDate = legacyDayToNextIsoDate(legacyDue);
  const limitCents = resolveStoredCents(card?.limitCents, card?.limit, { positiveOnly: true });
  // Flag explícito gana; si no viene, auto-detecta “CC Mara”.
  const excludeFromCardTotals = typeof card?.excludeFromCardTotals === "boolean"
    ? card.excludeFromCardTotals
    : nameLooksLikeCcMara(name);
  return {
    id,
    name,
    person: sanitizeText(card?.person, "Compartido"),
    note: sanitizeText(card?.note),
    closingDate,
    dueDate,
    // se conservan por compat; la UI usa las fechas del ciclo
    closingDay: closingDate ? Number(closingDate.slice(8, 10)) : legacyClosing,
    dueDay: dueDate ? Number(dueDate.slice(8, 10)) : legacyDue,
    limitCents: limitCents > 0 ? limitCents : 0,
    excludeFromCardTotals,
  };
}

/**
 * Mes del resumen al que cae una compra según el día de cierre de la tarjeta.
 * Compra el día del cierre o antes → ese mes; después del cierre → mes siguiente.
 */
function statementMonthKeyForPurchase(card, refDate = new Date()) {
  const closeDay = isValidIsoDate(card?.closingDate)
    ? Number(card.closingDate.slice(8, 10))
    : Math.trunc(Number(card?.closingDay) || 0);
  if (closeDay < 1 || closeDay > 31) return formatMonthKey(refDate);
  const day = refDate.getDate();
  if (day <= closeDay) return formatMonthKey(refDate);
  return formatMonthKey(new Date(refDate.getFullYear(), refDate.getMonth() + 1, 1));
}

function chargeAmountArsForLimit(charge) {
  if (!charge) return 0;
  if (charge.chargeType === "fixed") {
    return charge.currency === "USD"
      ? toArsCents(charge.monthlyAmountCents, "USD")
      : charge.monthlyAmountCents;
  }
  if (charge.chargeType === "purchase") {
    return charge.currency === "USD"
      ? toArsCents(charge.totalAmountCents, "USD")
      : charge.totalAmountCents;
  }
  // installment: cuota del mes activo
  const amount = cardNextCuotaCents(charge);
  return charge.currency === "USD" ? toArsCents(amount, "USD") : amount;
}

function wouldExceedCardLimit(cardId, extraArsCents, monthKey = state.activeMonth) {
  const card = state.creditCards.find((item) => item.id === cardId);
  if (!card || !(card.limitCents > 0)) return null;
  const load = getCardMonthLoad(cardId, monthKey);
  const nextTotal = load.totalArs + Math.max(0, extraArsCents);
  if (nextTotal <= card.limitCents) return null;
  return {
    card,
    limitCents: card.limitCents,
    currentArs: load.totalArs,
    nextTotal,
    overBy: nextTotal - card.limitCents,
  };
}

/** Carga de una tarjeta en un mes (≈ ARS), desglosada. No toca KPIs del hogar. */
function getCardMonthLoad(cardId, monthKey = state.activeMonth) {
  const charges = state.cardCharges.filter((charge) => charge.active && charge.cardId === cardId);
  let installmentArs = 0;
  let installmentUsd = 0;
  let fixedArs = 0;
  let fixedUsd = 0;
  let purchaseArs = 0;
  let purchaseUsd = 0;
  const items = [];

  charges.forEach((charge) => {
    if (charge.chargeType === "fixed") {
      const amount = charge.monthlyAmountCents;
      if (charge.currency === "USD") fixedUsd += amount;
      else fixedArs += amount;
      items.push({ charge, kind: "fixed", amountCents: amount });
      return;
    }
    if (charge.chargeType === "purchase") {
      if (charge.monthKey !== monthKey) return;
      const amount = charge.totalAmountCents;
      if (charge.currency === "USD") purchaseUsd += amount;
      else purchaseArs += amount;
      items.push({ charge, kind: "purchase", amountCents: amount });
      return;
    }
    // installment: next cuota maps to active month; for arbitrary monthKey, offset from activeMonth
    const remaining = cardRemainingInstallments(charge);
    if (remaining <= 0) return;
    const monthOffset = monthDiff(state.activeMonth, monthKey);
    if (monthOffset < 0 || monthOffset >= remaining) return;
    const installmentIndex = charge.paidInstallments + monthOffset;
    const amount = cardCuotaCents(charge, installmentIndex);
    if (charge.currency === "USD") installmentUsd += amount;
    else installmentArs += amount;
    items.push({
      charge,
      kind: "installment",
      amountCents: amount,
      installmentIndex: installmentIndex + 1,
    });
  });

  const totalArs =
    installmentArs + fixedArs + purchaseArs +
    toArsCents(installmentUsd, "USD") + toArsCents(fixedUsd, "USD") + toArsCents(purchaseUsd, "USD");
  return {
    installmentArs: installmentArs + toArsCents(installmentUsd, "USD"),
    fixedArs: fixedArs + toArsCents(fixedUsd, "USD"),
    purchaseArs: purchaseArs + toArsCents(purchaseUsd, "USD"),
    totalArs,
    items,
  };
}

function getAllCardsMonthLoad(monthKey = state.activeMonth, { includeExcluded = false } = {}) {
  let installmentArs = 0;
  let fixedArs = 0;
  let purchaseArs = 0;
  const source = includeExcluded ? (state.creditCards || []) : creditCardsForTotals();
  const byCard = source.map((card) => {
    const load = getCardMonthLoad(card.id, monthKey);
    installmentArs += load.installmentArs;
    fixedArs += load.fixedArs;
    purchaseArs += load.purchaseArs;
    return { card, ...load };
  }).filter((row) => row.totalArs > 0)
    .sort((a, b) => b.totalArs - a.totalArs);
  return {
    installmentArs,
    fixedArs,
    purchaseArs,
    totalArs: installmentArs + fixedArs + purchaseArs,
    byCard,
  };
}

function getCuentaCorrienteMonthLoad(monthKey = state.activeMonth) {
  let totalArs = 0;
  const byCard = creditCardsCuentaCorriente().map((card) => {
    const load = getCardMonthLoad(card.id, monthKey);
    totalArs += load.totalArs;
    return { card, ...load };
  }).sort((a, b) => b.totalArs - a.totalArs || a.card.name.localeCompare(b.card.name, "es"));
  return { totalArs, byCard };
}

let selectedCardId = "";

function normalizeCardCharge(charge, cardIds) {
  const id = sanitizeText(charge?.id, createId());
  const cardId = sanitizeText(charge?.cardId);
  const name = sanitizeText(charge?.name);
  const rawType = sanitizeText(charge?.chargeType, "installment");
  const chargeType = ["installment", "fixed", "purchase"].includes(rawType) ? rawType : "installment";
  const currency = charge?.currency === "USD" ? "USD" : "ARS";
  if (!cardId || !name || (cardIds && !cardIds.has(cardId))) return null;
  if (chargeType === "installment") {
    const totalAmountCents = resolveStoredCents(charge?.totalAmountCents, charge?.totalAmount, { positiveOnly: true });
    const installments = Math.min(Math.max(Math.trunc(Number(charge?.installments) || 2), 2), 120);
    const paidInstallments = Math.min(
      Math.max(Math.trunc(Number(charge?.paidInstallments) || 0), 0),
      installments,
    );
    if (totalAmountCents <= 0) return null;
    return {
      id,
      cardId,
      name,
      chargeType,
      currency,
      totalAmountCents,
      monthlyAmountCents: 0,
      installments,
      paidInstallments,
      monthKey: "",
      note: sanitizeText(charge?.note),
      active: charge?.active !== false,
    };
  }
  if (chargeType === "purchase") {
    const totalAmountCents = resolveStoredCents(
      charge?.totalAmountCents,
      charge?.totalAmount ?? charge?.amount,
      { positiveOnly: true },
    );
    const monthKey = isValidMonthKey(charge?.monthKey) ? charge.monthKey : formatMonthKey(new Date());
    if (totalAmountCents <= 0) return null;
    return {
      id,
      cardId,
      name,
      chargeType: "purchase",
      currency,
      totalAmountCents,
      monthlyAmountCents: 0,
      installments: 1,
      paidInstallments: 0,
      monthKey,
      note: sanitizeText(charge?.note),
      active: charge?.active !== false,
    };
  }
  const monthlyAmountCents = resolveStoredCents(charge?.monthlyAmountCents, charge?.monthlyAmount, { positiveOnly: true });
  if (monthlyAmountCents <= 0) return null;
  return {
    id,
    cardId,
    name,
    chargeType: "fixed",
    currency,
    totalAmountCents: 0,
    monthlyAmountCents,
    installments: 1,
    paidInstallments: 0,
    monthKey: "",
    note: sanitizeText(charge?.note),
    active: charge?.active !== false,
  };
}

function cardCuotaCents(charge, installmentIndex) {
  return installmentAmountCents(
    { amountCents: charge.totalAmountCents, schedule: { installments: charge.installments } },
    installmentIndex,
  );
}

function cardRemainingInstallments(charge) {
  if (charge.chargeType !== "installment") return 0;
  return Math.max(0, charge.installments - charge.paidInstallments);
}

function cardRemainingCents(charge) {
  if (charge.chargeType === "fixed") return charge.active ? charge.monthlyAmountCents : 0;
  let total = 0;
  for (let index = charge.paidInstallments; index < charge.installments; index += 1) {
    total += cardCuotaCents(charge, index);
  }
  return total;
}

function cardNextCuotaCents(charge) {
  if (charge.chargeType === "fixed") return charge.active ? charge.monthlyAmountCents : 0;
  if (charge.paidInstallments >= charge.installments) return 0;
  return cardCuotaCents(charge, charge.paidInstallments);
}

function toArsCents(amountCents, currency, fx = state.fx) {
  if (currency === "ARS") return amountCents;
  const rate = effectiveUsdArs(fx);
  return Math.round(amountCents * rate);
}

/**
 * Proyección solo del ledger de tarjetas (no toca KPIs del hogar).
 * - Cuotas: la próxima pendiente cae en el mes activo; las siguientes, mes a mes.
 * - Fijos: se repiten cada mes del horizonte.
 * - Compras (purchase): un solo mes (monthKey del gasto).
 */
function buildCardProjection(monthCount = 6, fromMonth = state.activeMonth) {
  const horizon = Math.min(Math.max(Math.trunc(Number(monthCount)) || 6, 1), 36);
  const excludedCardIds = new Set(
    creditCardsCuentaCorriente().map((card) => card.id),
  );
  const activeCharges = state.cardCharges.filter(
    (charge) => charge.active && !excludedCardIds.has(charge.cardId),
  );
  return Array.from({ length: horizon }, (_, monthOffset) => {
    const monthKey = addMonths(fromMonth, monthOffset);
    let installmentArs = 0;
    let installmentUsd = 0;
    let fixedArs = 0;
    let fixedUsd = 0;
    let purchaseArs = 0;
    let purchaseUsd = 0;
    const items = [];

    activeCharges.forEach((charge) => {
      if (charge.chargeType === "fixed") {
        const amount = charge.monthlyAmountCents;
        if (charge.currency === "USD") fixedUsd += amount;
        else fixedArs += amount;
        items.push({
          chargeId: charge.id,
          cardId: charge.cardId,
          name: charge.name,
          kind: "fixed",
          currency: charge.currency,
          amountCents: amount,
        });
        return;
      }
      if (charge.chargeType === "purchase") {
        if (charge.monthKey !== monthKey) return;
        const amount = charge.totalAmountCents;
        if (charge.currency === "USD") purchaseUsd += amount;
        else purchaseArs += amount;
        items.push({
          chargeId: charge.id,
          cardId: charge.cardId,
          name: charge.name,
          kind: "purchase",
          currency: charge.currency,
          amountCents: amount,
        });
        return;
      }
      const remaining = cardRemainingInstallments(charge);
      if (remaining <= 0 || monthOffset >= remaining) return;
      const installmentIndex = charge.paidInstallments + monthOffset;
      const amount = cardCuotaCents(charge, installmentIndex);
      if (charge.currency === "USD") installmentUsd += amount;
      else installmentArs += amount;
      items.push({
        chargeId: charge.id,
        cardId: charge.cardId,
        name: charge.name,
        kind: "installment",
        currency: charge.currency,
        amountCents: amount,
        installmentIndex: installmentIndex + 1,
        installments: charge.installments,
      });
    });

    const totalArsEquivalent =
      installmentArs + fixedArs + purchaseArs +
      toArsCents(installmentUsd, "USD") + toArsCents(fixedUsd, "USD") + toArsCents(purchaseUsd, "USD");
    return {
      monthKey,
      installmentArs,
      installmentUsd,
      fixedArs,
      fixedUsd,
      purchaseArs,
      purchaseUsd,
      totalArsEquivalent,
      items,
    };
  });
}

function readEmergencyRaw() {
  const keyed = localStorage.getItem(emergencyStorageKey());
  if (keyed) return { raw: keyed, key: emergencyStorageKey() };
  // Compat: copias de emergencia previas a perfiles (solo perfil Hogar).
  if (!isSandboxProfile()) {
    const legacy = localStorage.getItem(EMERGENCY_STORAGE_KEY_BASE);
    if (legacy) return { raw: legacy, key: EMERGENCY_STORAGE_KEY_BASE };
  }
  return null;
}

async function loadState() {
  const emergency = readEmergencyRaw();
  if (emergency) {
    try {
      const parsed = JSON.parse(emergency.raw);
      const normalized = parsed?.version === 3 ? normalizeState(parsed) : migrateLegacyState(parsed);
      try {
        await migrateLegacySnapshot(emergency.key, emergency.raw, normalized);
        localStorage.removeItem(emergency.key);
        if (emergency.key !== emergencyStorageKey()) {
          localStorage.removeItem(emergencyStorageKey());
        }
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
  // Siempre fusionar el catálogo base con las del usuario y las de movimientos.
  const categoryCandidates = [
    ...DEFAULT_CATEGORIES,
    ...(Array.isArray(input?.categories) ? input.categories : []),
    ...transactions.map((item) => item.category),
  ].map((category) => sanitizeText(category)).filter(Boolean);
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
    activeView: ["dashboard", "movements", "planned", "cards", "projection", "settings"].includes(input?.activeView)
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
    creditCards: (() => {
      const cards = (Array.isArray(input?.creditCards) ? input.creditCards : [])
        .map(normalizeCreditCard)
        .filter(Boolean);
      const seen = new Set();
      return cards.filter((card) => {
        if (seen.has(card.id)) return false;
        seen.add(card.id);
        return true;
      });
    })(),
    cardCharges: (() => {
      const cards = (Array.isArray(input?.creditCards) ? input.creditCards : [])
        .map(normalizeCreditCard)
        .filter(Boolean);
      const cardIds = new Set(cards.map((card) => card.id));
      return (Array.isArray(input?.cardCharges) ? input.cardCharges : [])
        .map((charge) => normalizeCardCharge(charge, cardIds))
        .filter(Boolean);
    })(),
    fx: normalizeFx(input?.fx),
    plannedItems: (() => {
      const items = (Array.isArray(input?.plannedItems) ? input.plannedItems : [])
        .map(normalizePlannedItem)
        .filter(Boolean);
      const seen = new Set();
      return items.filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
    })(),
  };
}

function daysInMonthKey(monthKey) {
  if (!isValidMonthKey(monthKey)) return 31;
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month, 0).getDate();
}

/** Construye YYYY-MM-DD válido dentro del mes (clampa días inexistentes, ej. 31/02 → 28/02). */
function clampDateToMonth(monthKey, dayOrIso) {
  if (!isValidMonthKey(monthKey)) return "";
  let day = 0;
  if (isValidIsoDate(dayOrIso)) {
    day = Number(String(dayOrIso).slice(8, 10));
  } else {
    day = Math.trunc(Number(dayOrIso) || 0);
  }
  if (day < 1) return "";
  const max = daysInMonthKey(monthKey);
  const clamped = Math.min(day, max);
  return `${monthKey}-${String(clamped).padStart(2, "0")}`;
}

function normalizePlannedItem(raw) {
  const name = sanitizeText(raw?.name);
  const monthKey = isValidMonthKey(raw?.monthKey) ? raw.monthKey : "";
  const amountCents = resolveStoredCents(raw?.amountCents, raw?.amount, { positiveOnly: true });
  if (!name || !monthKey || amountCents <= 0) return null;
  const kind = raw?.kind === "income" ? "income" : "expense";
  const recurrence = raw?.recurrence === "monthly" ? "monthly" : "once";
  const endMonth = isValidMonthKey(raw?.endMonth) ? raw.endMonth : "";
  // Preferir fecha de calendario; clampa al mes del plan (nunca 31-feb).
  let dueDate = "";
  if (isValidIsoDate(raw?.dueDate)) {
    dueDate = clampDateToMonth(monthKey, raw.dueDate);
  } else if (raw?.dueDay) {
    dueDate = clampDateToMonth(monthKey, raw.dueDay);
  }
  const dueDay = dueDate ? Number(dueDate.slice(8, 10)) : 0;
  const months = (list) => (Array.isArray(list) ? list : [])
    .map((value) => String(value || ""))
    .filter((value) => isValidMonthKey(value));
  return {
    id: sanitizeText(raw?.id, createId()),
    kind,
    name,
    category: sanitizeText(raw?.category, "Otros"),
    person: sanitizeText(raw?.person, "Compartido"),
    amountCents,
    monthKey,
    recurrence,
    endMonth: recurrence === "monthly" && endMonth && monthDiff(monthKey, endMonth) >= 0 ? endMonth : "",
    dueDay,
    dueDate,
    note: sanitizeText(raw?.note).slice(0, 120),
    createdAt: sanitizeText(raw?.createdAt, new Date().toISOString()),
    fulfilledMonths: months(raw?.fulfilledMonths),
    dismissedMonths: months(raw?.dismissedMonths),
  };
}

function plannedAppliesToMonth(item, monthKey) {
  if (!item || !isValidMonthKey(monthKey)) return false;
  if (item.recurrence === "once") return item.monthKey === monthKey;
  if (monthDiff(item.monthKey, monthKey) < 0) return false;
  if (item.endMonth && monthDiff(monthKey, item.endMonth) < 0) return false;
  return true;
}

function plannedStatusForMonth(item, monthKey) {
  if (item.fulfilledMonths?.includes(monthKey)) return "fulfilled";
  if (item.dismissedMonths?.includes(monthKey)) return "dismissed";
  return "open";
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
    dueDay: (() => {
      if (isValidIsoDate(transaction?.dueDate)) {
        return Number(String(transaction.dueDate).slice(8, 10));
      }
      const start = isValidMonthKey(rawStartMonth) ? rawStartMonth : formatMonthKey(new Date());
      if (transaction?.dueDay) {
        const clamped = clampDateToMonth(start, transaction.dueDay);
        return clamped ? Number(clamped.slice(8, 10)) : 0;
      }
      return 0;
    })(),
    dueDate: (() => {
      const start = isValidMonthKey(rawStartMonth) ? rawStartMonth : formatMonthKey(new Date());
      if (isValidIsoDate(transaction?.dueDate)) return clampDateToMonth(start, transaction.dueDate);
      if (transaction?.dueDay) return clampDateToMonth(start, transaction.dueDay);
      return "";
    })(),
    note: sanitizeText(transaction?.note),
    createdAt: transaction?.createdAt || new Date().toISOString(),
  };
}

function materializeOccurrence(occurrence, overrides = {}) {
  const schedule = occurrence?.schedule && typeof occurrence.schedule === "object"
    ? occurrence.schedule
    : {
      type: occurrence?.scheduleType || "one-time",
      installments: occurrence?.installments || 1,
    };
  const transactionId = sanitizeText(occurrence?.id || occurrence?.transactionId);
  const plannedAmountCents = Number.isSafeInteger(occurrence?.amountThisMonthCents)
    ? occurrence.amountThisMonthCents
    : (Number.isSafeInteger(occurrence?.plannedAmountCents) ? occurrence.plannedAmountCents : 0);
  const seriesAmountCents = Number.isSafeInteger(occurrence?.amountCents)
    ? occurrence.amountCents
    : (Number.isSafeInteger(occurrence?.seriesAmountCents) ? occurrence.seriesAmountCents : plannedAmountCents);
  return {
    transactionId,
    monthKey: occurrence?.monthKey || "",
    plannedAmountCents,
    seriesAmountCents,
    actualAmountCents: null,
    status: "pending",
    effectiveDate: "",
    kind: occurrence?.kind === "income" ? "income" : "expense",
    name: sanitizeText(occurrence?.name, occurrence?.kind === "income" ? "Ingreso" : "Gasto"),
    category: sanitizeText(occurrence?.category, "Otros"),
    person: sanitizeText(occurrence?.person, "Compartido"),
    dueDay: Number.isInteger(occurrence?.dueDay) ? occurrence.dueDay : 0,
    note: sanitizeText(occurrence?.note),
    scheduleType: ["one-time", "monthly", "installment"].includes(schedule.type)
      ? schedule.type
      : (occurrence?.scheduleType || "one-time"),
    installmentIndex: Number.isInteger(occurrence?.installmentIndex) ? occurrence.installmentIndex : 0,
    installments: Math.min(Math.max(Number(schedule.installments || occurrence?.installments) || 1, 1), 120),
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
    // Sin registros previos: generar desde la serie actual (no reinyectar datos viejos).
    const occurrence = occurrenceForMonth(transaction, monthKey, {});
    if (occurrence && !state.occurrences[occurrence.statusKey]) {
      state.occurrences[occurrence.statusKey] = materializeOccurrence(occurrence);
    }
  });
  // Pagados: conservar estado/fecha/importe real, pero etiquetas y plan desde la serie.
  syncOccurrenceLabelsFromSeries(transaction, { onlyPaid: true });
}

/** Actualiza name/categoría/persona/montos plan de las ocurrencias materializadas desde la serie. */
function syncOccurrenceLabelsFromSeries(transaction, { onlyPaid = false, fromMonth = "" } = {}) {
  if (!transaction?.id) return;
  Object.entries(state.occurrences || {}).forEach(([key, record]) => {
    if (record.transactionId !== transaction.id) return;
    if (record.status === "skipped") return;
    if (onlyPaid && record.status !== "paid") return;
    if (fromMonth && record.monthKey < fromMonth) return;
    const generated = occurrenceForMonth(transaction, record.monthKey, {});
    if (!generated) return;
    state.occurrences[key] = materializeOccurrence(generated, {
      status: record.status === "paid" ? "paid" : "pending",
      actualAmountCents: record.status === "paid"
        ? (Number.isSafeInteger(record.actualAmountCents)
          ? record.actualAmountCents
          : generated.amountThisMonthCents)
        : null,
      effectiveDate: record.effectiveDate || "",
    });
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

function storageErrorMessage(error) {
  const raw = String(error?.message || error || "").trim();
  if (!raw) return "No se pudo guardar en la base local.";
  // Tauri/IPC a veces envuelve el mensaje; preferimos el texto del backend.
  const compact = raw.replace(/^Error:\s*/i, "").slice(0, 160);
  return compact || "No se pudo guardar en la base local.";
}

async function saveState({ skipDriveSchedule = false } = {}) {
  try {
    await saveStoredState(cloneState(state));
    try {
      localStorage.removeItem(emergencyStorageKey());
      if (!isSandboxProfile()) localStorage.removeItem(EMERGENCY_STORAGE_KEY_BASE);
    } catch (error) {
      console.warn("No se pudo limpiar la copia de emergencia anterior.", error);
    }
    storageErrorShown = false;
    renderEmergencyChrome();
    if (!skipDriveSchedule) scheduleDrivePush();
    return true;
  } catch (error) {
    console.warn("No se pudieron guardar los datos en SQLite.", error);
    const detail = storageErrorMessage(error);
    try {
      localStorage.setItem(emergencyStorageKey(), JSON.stringify(state));
      renderEmergencyChrome();
      if (!storageErrorShown) {
        storageErrorShown = true;
        showToast(`No se pudo guardar en SQLite (${detail}). Revisá Ajustes → Copia de emergencia.`);
      }
      return true;
    } catch (fallbackError) {
      console.warn("Tampoco se pudo crear la copia de emergencia.", fallbackError);
    }
    if (!storageErrorShown) {
      storageErrorShown = true;
      showToast(`No pudimos confirmar el guardado (${detail}). El cambio fue revertido.`);
    }
    return false;
  }
}

let driveStatus = null;
let driveBusy = false;
let drivePushTimer = null;
let driveAvailable = true;

function formatDriveSyncLabel(status) {
  if (isSandboxProfile()) {
    return "Drive pausado: estás en Perfil de prueba. Cambiá a Hogar para sincronizar.";
  }
  if (!status) return "Drive no disponible en este entorno.";
  if (!status.configured) {
    return "Sin configurar: pegá Client ID y Secret (una sola vez) y guardá.";
  }
  if (!status.connected) {
    return status.message
      ? `Listo para conectar: ${status.message}`
      : "Credenciales OK. Tocá «Conectar Google» y autorizá en el navegador.";
  }
  const bits = ["Conectado a Google"];
  if (status.email) bits.push(status.email);
  bits.push(status.autoSync ? "sync automática ON" : "sync automática OFF");
  bits.push(status.localDirty ? "hay cambios locales por subir" : "al día con la nube");
  if (status.lastSyncAt) {
    const when = String(status.lastSyncAt).slice(0, 16).replace("T", " ");
    bits.push(`última sync ${when}`);
  }
  if (status.message && !status.message.includes("OK")) bits.push(status.message);
  return bits.join(" · ");
}

function hasEmergencyCopy() {
  return Boolean(readEmergencyRaw());
}

function clearEmergencyStorage() {
  try {
    localStorage.removeItem(emergencyStorageKey());
    if (!isSandboxProfile()) localStorage.removeItem(EMERGENCY_STORAGE_KEY_BASE);
  } catch (error) {
    console.warn("No se pudo borrar la copia de emergencia.", error);
  }
}

function renderEmergencyChrome() {
  const pending = hasEmergencyCopy();
  if (dom.emergencyBanner) dom.emergencyBanner.hidden = !pending;
  if (dom.emergencyBannerCopy && pending) {
    dom.emergencyBannerCopy.textContent = isSandboxProfile()
      ? "Hay una copia de emergencia del perfil de prueba. Revisá Ajustes para aplicar, exportar o descartar."
      : "Hay cambios fuera de SQLite (copia de emergencia). Revisá Ajustes para aplicarlos o descartarlos.";
  }
  if (dom.emergencyPanel) dom.emergencyPanel.hidden = !pending;
  if (dom.emergencyStatusCopy && pending) {
    dom.emergencyStatusCopy.textContent =
      "SQLite no pudo guardar en algún momento y la app dejó una copia en el almacenamiento local del perfil activo. «Aplicar a SQLite» intenta grabarla en la base. «Exportar» baja un JSON. «Descartar» la borra (no se puede deshacer).";
  }
  if (dom.emergencyApplyBtn) dom.emergencyApplyBtn.disabled = !pending;
  if (dom.emergencyExportBtn) dom.emergencyExportBtn.disabled = !pending;
  if (dom.emergencyDiscardBtn) dom.emergencyDiscardBtn.disabled = !pending;
}

async function applyEmergencyToSqlite() {
  const emergency = readEmergencyRaw();
  if (!emergency) {
    showToast("No hay copia de emergencia");
    renderEmergencyChrome();
    return;
  }
  let normalized;
  try {
    const parsed = JSON.parse(emergency.raw);
    normalized = parsed?.version === 3 ? normalizeState(parsed) : migrateLegacyState(parsed);
  } catch (error) {
    showToast("La copia de emergencia está dañada");
    console.warn(error);
    return;
  }
  const previousState = cloneState(state);
  state = normalized;
  if (!await saveState({ skipDriveSchedule: true })) {
    state = previousState;
    render();
    showToast("No se pudo aplicar la emergencia a SQLite");
    return;
  }
  clearEmergencyStorage();
  storageErrorShown = false;
  initializationWarning = "";
  render();
  showToast("Copia de emergencia guardada en SQLite");
}

function exportEmergencyCopy() {
  const emergency = readEmergencyRaw();
  if (!emergency) {
    showToast("No hay copia de emergencia");
    return;
  }
  try {
    const parsed = JSON.parse(emergency.raw);
    const snapshot = parsed?.version === 3 ? normalizeState(parsed) : migrateLegacyState(parsed);
    downloadBackup(snapshot, "emergencia");
    showToast("Copia de emergencia exportada");
  } catch (error) {
    showToast("No se pudo exportar la emergencia");
    console.warn(error);
  }
}

async function discardEmergencyCopy() {
  if (!hasEmergencyCopy()) {
    showToast("No hay copia de emergencia");
    renderEmergencyChrome();
    return;
  }
  const confirmed = await confirmAction({
    title: "Descartar copia de emergencia",
    copy: "Se borra la copia local de emergencia. Lo que ya está en SQLite no se toca. No se puede deshacer.",
    confirmLabel: "Descartar",
    danger: true,
  });
  if (!confirmed) return;
  clearEmergencyStorage();
  storageErrorShown = false;
  renderEmergencyChrome();
  showToast("Copia de emergencia descartada");
}

function renderDriveStatus(status = driveStatus) {
  driveStatus = status;
  if (!dom.driveStatusText) return;
  dom.driveStatusText.textContent = formatDriveSyncLabel(status);
  if (dom.driveAutoSyncToggle && status) {
    dom.driveAutoSyncToggle.checked = Boolean(status.autoSync);
  }
  if (dom.driveSetupBlock) {
    dom.driveSetupBlock.hidden = Boolean(status?.configured && status?.connected);
  }
  if (dom.driveConnectBtn) {
    dom.driveConnectBtn.disabled = !status?.configured || driveBusy;
    dom.driveConnectBtn.textContent = status?.connected ? "Reconectar Google" : "Conectar Google";
  }
  if (dom.driveSyncNowBtn) {
    dom.driveSyncNowBtn.disabled = !status?.connected || driveBusy;
  }
  if (dom.driveDisconnectBtn) {
    dom.driveDisconnectBtn.disabled = !status?.connected || driveBusy;
  }
  if (dom.driveSaveCredsBtn) {
    dom.driveSaveCredsBtn.disabled = driveBusy;
  }
}

async function refreshDriveStatus() {
  if (!driveAvailable) return null;
  try {
    const status = await driveGetStatus();
    renderDriveStatus(status);
    return status;
  } catch (error) {
    console.warn("Drive status no disponible.", error);
    driveAvailable = false;
    renderDriveStatus({
      configured: false,
      connected: false,
      autoSync: false,
      email: "",
      lastSyncAt: "",
      localDirty: false,
      hasRemote: false,
      remoteModifiedTime: "",
      message: "Drive solo en la app de escritorio.",
    });
    return null;
  }
}

function backupEnvelopeJson(snapshot = state) {
  return JSON.stringify(buildBackupEnvelope(snapshot));
}

async function applyDriveContent(content, remoteModifiedTime, { silent = false } = {}) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("La copia de Drive no es JSON válido");
  }
  const importedState = parseBackup(parsed);
  const previousState = cloneState(state);
  if (!silent) {
    downloadBackup(previousState, "antes-de-drive");
  }
  state = importedState;
  if (!await saveState({ skipDriveSchedule: true })) {
    state = previousState;
    throw new Error("No se pudo guardar la copia bajada de Drive");
  }
  try {
    await driveConfirmPulled(content, remoteModifiedTime || "");
  } catch (error) {
    console.warn("No se pudo confirmar pull de Drive.", error);
  }
  render();
  await refreshDriveStatus();
}

async function runDrivePull({ force = false, interactive = false } = {}) {
  if (isSandboxProfile()) {
    if (interactive) showToast("Drive solo opera en el perfil Hogar");
    return;
  }
  if (!driveAvailable || driveBusy) return;
  const status = driveStatus || (await refreshDriveStatus());
  if (!status?.connected) return;
  driveBusy = true;
  renderDriveStatus(status);
  try {
    const result = await drivePull(force);
    driveStatus = result.status;
    if (result.action === "download" && result.content) {
      if (interactive) {
        const ok = await confirmAction({
          title: "Aplicar copia de Google Drive",
          copy: "Hay una versión en Drive. ¿Reemplazar los datos de esta PC?",
          details: summarizeBackup(parseBackup(JSON.parse(result.content))),
          confirmLabel: "Usar copia de Drive",
        });
        if (!ok) {
          renderDriveStatus(result.status);
          return;
        }
      }
      await applyDriveContent(result.content, result.remoteModifiedTime, { silent: !interactive });
      if (interactive) showToast("Copia de Drive aplicada");
      else showToast("Se actualizó desde Google Drive");
      return;
    }
    if (result.action === "conflict" && result.content) {
      const useRemote = await confirmAction({
        title: "Conflicto con Google Drive",
        copy: "Esta PC y Drive tienen cambios distintos. ¿Querés quedarte con la de Drive? (Cancelar mantiene esta PC y podés forzar subida con “Sincronizar ahora”.)",
        details: summarizeBackup(parseBackup(JSON.parse(result.content))),
        confirmLabel: "Usar Drive",
      });
      if (useRemote) {
        await applyDriveContent(result.content, result.remoteModifiedTime);
        showToast("Se aplicó la copia de Drive");
      } else {
        renderDriveStatus(result.status);
        showToast("Se mantuvieron los datos de esta PC");
      }
      return;
    }
    if (result.action === "local_ahead" && interactive) {
      showToast("Hay cambios locales: se van a subir a Drive");
      await runDrivePush({ force: false, interactive: true });
      return;
    }
    if (interactive && result.action === "empty") {
      showToast("Todavía no hay copia en Drive; se subirá la de esta PC");
      await runDrivePush({ force: true, interactive: true });
      return;
    }
    if (interactive && result.action === "noop") {
      showToast("Ya estabas al día con Drive");
    }
    renderDriveStatus(result.status);
  } catch (error) {
    console.warn("Drive pull falló.", error);
    if (interactive) showToast(String(error?.message || error || "No se pudo bajar de Drive"));
  } finally {
    driveBusy = false;
    await refreshDriveStatus();
  }
}

async function runDrivePush({ force = false, interactive = false } = {}) {
  if (isSandboxProfile()) {
    if (interactive) showToast("Drive solo opera en el perfil Hogar");
    return;
  }
  if (!driveAvailable || driveBusy) return;
  const status = driveStatus || (await refreshDriveStatus());
  if (!status?.connected) return;
  if (!status.autoSync && !interactive && !force) return;

  driveBusy = true;
  renderDriveStatus(status);
  try {
    try {
      await driveMarkLocalDirty();
    } catch {
      /* ignore */
    }
    const content = backupEnvelopeJson(state);
    const result = await drivePush(content, force);
    driveStatus = result.status;
    if (result.action === "conflict") {
      if (interactive) {
        const overwrite = await confirmAction({
          title: "Conflicto al subir",
          copy: "Drive tiene otra versión. ¿Subir esta PC y pisar la de Drive?",
          details: ["Se recomienda bajar primero si no estás seguro."],
          confirmLabel: "Pisar Drive con esta PC",
          danger: true,
        });
        if (overwrite) {
          const forced = await drivePush(content, true);
          driveStatus = forced.status;
          showToast("Copia de esta PC subida a Drive");
        }
      }
      renderDriveStatus(driveStatus);
      return;
    }
    if (interactive) {
      if (result.action === "uploaded") showToast("Subido a Google Drive");
      else if (result.action === "noop") showToast("Drive ya tenía esta copia");
    }
    renderDriveStatus(result.status);
  } catch (error) {
    console.warn("Drive push falló.", error);
    if (interactive) showToast(String(error?.message || error || "No se pudo subir a Drive"));
  } finally {
    driveBusy = false;
    await refreshDriveStatus();
  }
}

function scheduleDrivePush() {
  // El perfil de prueba nunca escribe en Drive (protege la copia real del hogar).
  if (isSandboxProfile()) return;
  if (!driveAvailable) return;
  if (driveStatus && !driveStatus.connected) return;
  if (driveStatus && !driveStatus.autoSync) {
    void driveMarkLocalDirty().then(renderDriveStatus).catch(() => {});
    return;
  }
  void driveMarkLocalDirty().then((status) => {
    renderDriveStatus(status);
  }).catch(() => {});
  if (drivePushTimer) window.clearTimeout(drivePushTimer);
  drivePushTimer = window.setTimeout(() => {
    drivePushTimer = null;
    void runDrivePush({ force: false, interactive: false });
  }, DRIVE_PUSH_DEBOUNCE_MS);
}

async function handleDriveSaveCredentials() {
  const clientId = dom.driveClientId?.value?.trim() || "";
  const clientSecret = dom.driveClientSecret?.value?.trim() || "";
  if (!clientId || !clientSecret) {
    showToast("Completá Client ID y Client Secret");
    return;
  }
  driveBusy = true;
  renderDriveStatus(driveStatus);
  try {
    const status = await driveSaveCredentials(clientId, clientSecret);
    if (dom.driveClientSecret) dom.driveClientSecret.value = "";
    renderDriveStatus(status);
    showToast("Credenciales guardadas");
  } catch (error) {
    showToast(String(error?.message || error || "No se pudieron guardar"));
  } finally {
    driveBusy = false;
    await refreshDriveStatus();
  }
}

async function handleDriveConnect() {
  driveBusy = true;
  renderDriveStatus(driveStatus);
  try {
    showToast("Se abre el navegador para autorizar Google…");
    const status = await driveConnect();
    renderDriveStatus(status);
    showToast(status.message || "Google conectado");
    await runDrivePull({ force: false, interactive: true });
    await runDrivePush({ force: false, interactive: true });
  } catch (error) {
    showToast(String(error?.message || error || "No se pudo conectar Google"));
  } finally {
    driveBusy = false;
    await refreshDriveStatus();
  }
}

async function handleDriveDisconnect() {
  const ok = await confirmAction({
    title: "Desconectar Google Drive",
    copy: "Se corta la sync en esta PC. Los datos locales y el archivo en Drive no se borran.",
    confirmLabel: "Desconectar",
    danger: true,
  });
  if (!ok) return;
  try {
    const status = await driveDisconnect();
    renderDriveStatus(status);
    showToast("Google desconectado");
  } catch (error) {
    showToast(String(error?.message || error || "No se pudo desconectar"));
  }
}

async function handleDriveSyncNow() {
  await runDrivePull({ force: false, interactive: true });
  await runDrivePush({ force: false, interactive: true });
}

function wireDriveUi() {
  dom.driveSaveCredsBtn?.addEventListener("click", () => {
    void handleDriveSaveCredentials();
  });
  dom.driveConnectBtn?.addEventListener("click", () => {
    void handleDriveConnect();
  });
  dom.driveSyncNowBtn?.addEventListener("click", () => {
    void handleDriveSyncNow();
  });
  dom.driveDisconnectBtn?.addEventListener("click", () => {
    void handleDriveDisconnect();
  });
  dom.driveAutoSyncToggle?.addEventListener("change", () => {
    void (async () => {
      try {
        const status = await driveSetAutoSync(Boolean(dom.driveAutoSyncToggle.checked));
        renderDriveStatus(status);
        if (status.autoSync && status.connected) scheduleDrivePush();
      } catch (error) {
        showToast(String(error?.message || error || "No se pudo cambiar auto-sync"));
        await refreshDriveStatus();
      }
    })();
  });
  window.addEventListener("beforeunload", () => {
    if (drivePushTimer) {
      window.clearTimeout(drivePushTimer);
      drivePushTimer = null;
    }
  });
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

/** Formato AR: puntos en miles y coma en centavos (ej. $ 1.234.567,89). */
function formatCurrency(cents, compact = false, currency = state.settings.currency || "ARS") {
  const amount = fromCents(cents);
  if (compact) {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(amount);
  }
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatMoneyAmount(cents, currency = "ARS") {
  return formatCurrency(cents, false, currency);
}

function formatFxRate(rate) {
  if (!Number.isFinite(rate) || rate <= 0) return "—";
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rate);
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

/**
 * Empty list placeholder.
 * Third arg: boolean (legacy: true = "+ Agregar movimiento") or
 * { label, onClick } for a custom CTA (e.g. previstos).
 */
function emptyState(title, copy, addAction = false) {
  const wrapper = element("div", "empty-state");
  wrapper.append(element("strong", "", title), element("p", "", copy));
  let label = "";
  let onClick = null;
  if (addAction === true) {
    label = "+ Agregar movimiento";
    onClick = () => openMovementDialog();
  } else if (addAction && typeof addAction === "object") {
    label = sanitizeText(addAction.label, "+ Agregar");
    onClick = typeof addAction.onClick === "function" ? addAction.onClick : null;
  }
  if (label && onClick) {
    const button = element("button", "secondary-btn", label);
    button.type = "button";
    button.addEventListener("click", onClick);
    wrapper.append(button);
  }
  return wrapper;
}

function renderDashboard() {
  const totals = getMonthTotals(state.activeMonth);
  const isClosed = Boolean(state.closedMonths[state.activeMonth]);
  dom.dashboardTitle.textContent = formatMonthLabel(state.activeMonth);
  dom.dashboardSubtitle.textContent = totals.occurrences.length
    ? `${totals.occurrences.length} movimiento${totals.occurrences.length === 1 ? "" : "s"} en este mes.`
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
    ["Ingresos", formatCurrency(totals.totalIncomeCents), `${totals.incomes.length} fuente${totals.incomes.length === 1 ? "" : "s"}`, "income"],
    ["Gastos", formatCurrency(totals.totalExpenseCents), `${totals.expenses.length} movimiento${totals.expenses.length === 1 ? "" : "s"}`, "expense"],
    // Saldo al momento: solo lo cobrado menos lo pagado (tildes), no el plan completo del mes.
    ["Disponible", formatCurrency(totals.actualBalanceCents), totals.actualBalanceCents >= 0 ? "Cobrado menos pagado (ahora)" : "Vas gastando más de lo cobrado", totals.actualBalanceCents >= 0 ? "balance" : "danger"],
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
  const planBalance = totals.balanceCents;
  const balanceLabel = planBalance >= 0
    ? `${formatCurrency(planBalance)} si se cumple todo`
    : `${formatCurrency(Math.abs(planBalance))} faltante del plan`;
  labels.append(element("span", "", `${formatCurrency(totals.totalExpenseCents)} del mes`), element("strong", "", balanceLabel));
  dom.cashFlowVisual.append(track, labels);

  renderCategoryBreakdown(totals.expenses);
  renderDueSoon(totals);
  // Últimos cargados del mes (por createdAt), sin tilde de pago en el home.
  const recentThisMonth = [...totals.occurrences]
    .sort((a, b) => {
      const ta = state.transactions.find((tx) => tx.id === a.id)?.createdAt
        || state.occurrences[a.statusKey]?.effectiveDate
        || "";
      const tb = state.transactions.find((tx) => tx.id === b.id)?.createdAt
        || state.occurrences[b.statusKey]?.effectiveDate
        || "";
      if (ta !== tb) return String(tb).localeCompare(String(ta));
      return String(b.name || "").localeCompare(String(a.name || ""), "es");
    })
    .slice(0, 6);
  renderMovementCollection(dom.dashboardMovements, recentThisMonth, {
    compact: true,
    hideStatusToggle: true,
  });
  renderMiniForecast();
  renderBudgetProgress(totals);
}

function renderDueSoon(totals) {
  if (!dom.dueSoonPanel || !dom.dueSoonList) return;
  const dueItems = (totals?.occurrences || [])
    .filter((item) => item.status === "pending")
    .map((item) => ({ item, due: dueStateForOccurrence(item) }))
    .filter(({ due }) => due === "overdue" || due === "today" || due === "upcoming")
    .sort((a, b) => {
      const order = { overdue: 0, today: 1, upcoming: 2 };
      if (order[a.due] !== order[b.due]) return order[a.due] - order[b.due];
      return (a.item.dueDay || 32) - (b.item.dueDay || 32)
        || a.item.name.localeCompare(b.item.name, "es");
    })
    .slice(0, 6);
  if (!dueItems.length) {
    dom.dueSoonPanel.hidden = true;
    dom.dueSoonList.replaceChildren();
    return;
  }
  dom.dueSoonPanel.hidden = false;
  dom.dueSoonList.replaceChildren();
  dueItems.forEach(({ item, due }) => {
    const row = element("button", "due-soon-row");
    row.type = "button";
    row.dataset.due = due;
    const label = due === "overdue" ? "Vencido" : due === "today" ? "Hoy" : "Próximo";
    row.append(
      element("strong", "", item.name),
      element("span", "", `${label}${item.dueDay ? ` · día ${item.dueDay}` : ""} · ${item.kind === "income" ? "Cobrar" : "Pagar"}`),
      element("span", "", formatCurrency(item.amountThisMonthCents)),
    );
    row.addEventListener("click", () => openMovementDialog(item.id, item.monthKey));
    dom.dueSoonList.append(row);
  });
}

function renderBudgetProgress(totals) {
  const previous = getMonthTotals(addMonths(state.activeMonth, -1));
  const expenseDiff = totals.totalExpenseCents - previous.totalExpenseCents;
  const incomeDiff = totals.totalIncomeCents - previous.totalIncomeCents;
  if (!previous.totalExpenseCents && !previous.totalIncomeCents) {
    dom.monthComparison.textContent = "Sin mes anterior para comparar";
  } else {
    const parts = [];
    if (previous.totalExpenseCents || totals.totalExpenseCents) {
      parts.push(
        `Gastos ${expenseDiff <= 0 ? "↓" : "↑"} ${formatCurrency(Math.abs(expenseDiff))}`,
      );
    }
    if (previous.totalIncomeCents || totals.totalIncomeCents) {
      parts.push(
        `Ingresos ${incomeDiff >= 0 ? "↑" : "↓"} ${formatCurrency(Math.abs(incomeDiff))}`,
      );
    }
    dom.monthComparison.textContent = `${parts.join(" · ")} vs ${formatMonthLabel(addMonths(state.activeMonth, -1), true)}`;
  }
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

function renderMovementCollection(container, occurrences, options = false) {
  // Compat: tercer arg boolean = compact (legado).
  const opts = typeof options === "boolean"
    ? { compact: options, hideStatusToggle: false }
    : { compact: false, hideStatusToggle: false, ...options };
  const { compact, hideStatusToggle } = opts;
  container.replaceChildren();
  if (!occurrences.length) {
    container.append(emptyState(
      "Nada por ac\u00e1",
      "Agreg\u00e1 un ingreso o gasto para empezar.",
      compact ? false : true,
    ));
    return;
  }

  occurrences.forEach((item) => {
    const row = element("article", `movement-row${compact ? " is-compact" : ""}`);
    row.dataset.kind = item.kind;
    if (hideStatusToggle) row.classList.add("no-status-toggle");

    let statusButton = null;
    if (!hideStatusToggle) {
      statusButton = element("button", `status-check${item.status === "paid" ? " is-paid" : ""}`);
      statusButton.type = "button";
      const completeLabel = item.kind === "income" ? "Marcar como cobrado" : "Marcar como pagado";
      const reopenLabel = item.kind === "income"
        ? "Marcar ingreso como pendiente"
        : "Marcar gasto como pendiente";
      statusButton.setAttribute("aria-label", item.status === "paid" ? reopenLabel : completeLabel);
      statusButton.textContent = item.status === "paid" ? "\u2713" : "";
      statusButton.disabled = Boolean(state.closedMonths[item.monthKey]);
      statusButton.addEventListener("click", () => toggleOccurrenceStatus(item));
    }

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
    amount.append(
      element("strong", "", `${item.kind === "income" ? "+" : "-"}${formatCurrency(item.amountThisMonthCents)}`),
      element("small", "", item.status === "paid"
        ? (item.kind === "income" ? "Cobrado" : "Pagado")
        : "Pendiente"),
    );

    const editButton = element("button", "row-menu", "Editar");
    editButton.type = "button";
    editButton.setAttribute("aria-label", `Editar ${item.name}`);
    editButton.disabled = Boolean(state.closedMonths[item.monthKey]);
    editButton.addEventListener("click", () => openMovementDialog(item.id, item.monthKey));
    if (statusButton) row.append(statusButton, body, amount, editButton);
    else row.append(body, amount, editButton);
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

const EXPENSE_CHART_COLORS = [
  "#3D9CF0", "#F07178", "#3DDC97", "#F5C542", "#C084FC",
  "#38BDF8", "#FB923C", "#34D399", "#A78BFA", "#F472B6",
  "#2DD4BF", "#FBBF24",
];

/** UI local de Proyección (no se persiste). */
const projectionUi = {
  selectedMonthKey: null,
  selectedCategory: null,
  expenseFilter: "all", // all | monthly | installment | one-time
};

function scheduleTypeLabel(type) {
  if (type === "monthly") return "Mensual";
  if (type === "installment") return "Cuotas";
  return "Una vez";
}

function filterExpensesForProjection(expenses, filter = projectionUi.expenseFilter) {
  return (expenses || []).filter((item) => {
    if (item.kind && item.kind !== "expense") return false;
    if (filter === "all") return true;
    return item.schedule?.type === filter;
  });
}

function categoryTotalsFromExpenses(expenses) {
  const map = new Map();
  expenses.forEach((item) => {
    const key = item.category || "Sin categoría";
    map.set(key, (map.get(key) || 0) + item.amountThisMonthCents);
  });
  return [...map.entries()]
    .map(([category, cents]) => ({ category, cents }))
    .sort((a, b) => b.cents - a.cents || a.category.localeCompare(b.category, "es"));
}

function selectProjectionMonth(monthKey, { rerender = true } = {}) {
  projectionUi.selectedMonthKey = monthKey;
  projectionUi.selectedCategory = null;
  if (rerender) renderProjection();
}

function selectProjectionCategory(category) {
  projectionUi.selectedCategory =
    projectionUi.selectedCategory === category ? null : category;
  renderProjection();
}

function setProjectionExpenseFilter(filter) {
  projectionUi.expenseFilter = filter;
  projectionUi.selectedCategory = null;
  renderProjection();
}

function renderProjection() {
  const projection = buildProjection();
  if (!projection.length) {
    dom.projectionSummary?.replaceChildren();
    dom.projectionChart?.replaceChildren();
    dom.projectionList?.replaceChildren();
    if (dom.projectionBreakdown) {
      dom.projectionBreakdown.replaceChildren(
        emptyState("Sin datos", "Cargá movimientos para ver la proyección."),
      );
    }
    if (dom.projectionBreakdownDetail) {
      dom.projectionBreakdownDetail.hidden = true;
      dom.projectionBreakdownDetail.replaceChildren();
    }
    return;
  }

  const monthKeys = projection.map((month) => month.monthKey);
  if (!monthKeys.includes(projectionUi.selectedMonthKey)) {
    projectionUi.selectedMonthKey = monthKeys.includes(state.activeMonth)
      ? state.activeMonth
      : monthKeys[0];
  }
  const selectedMonth = projection.find((month) => month.monthKey === projectionUi.selectedMonthKey)
    || projection[0];

  const monthsWithExpense = projection.filter((month) => month.totalExpenseCents > 0);
  const avgExpenseCents = monthsWithExpense.length
    ? Math.round(
      monthsWithExpense.reduce((sum, month) => sum + month.totalExpenseCents, 0)
      / monthsWithExpense.length,
    )
    : 0;
  const monthsWithoutIncome = projection.filter((month) => month.totalIncomeCents <= 0).length;
  const selectedExpenses = filterExpensesForProjection(selectedMonth.expenses);
  const selectedExpenseTotal = selectedExpenses.reduce((sum, item) => sum + item.amountThisMonthCents, 0);
  const categoryCount = categoryTotalsFromExpenses(selectedExpenses).length;

  dom.projectionSummary.replaceChildren();
  [
    [
      "Gasto del mes",
      formatCurrency(selectedExpenseTotal),
      formatMonthLabel(selectedMonth.monthKey),
      selectedMonth.totalExpenseCents > selectedMonth.totalIncomeCents && selectedMonth.totalIncomeCents > 0
        ? "negative"
        : "",
    ],
    [
      "Promedio / mes",
      formatCurrency(avgExpenseCents),
      monthsWithExpense.length
        ? `En ${monthsWithExpense.length} mes${monthsWithExpense.length === 1 ? "" : "es"} con gasto`
        : "Sin gastos en el horizonte",
      "",
    ],
    [
      "Categorías",
      String(categoryCount),
      selectedExpenses.length
        ? `${selectedExpenses.length} gasto${selectedExpenses.length === 1 ? "" : "s"} en el desglose`
        : "Sin gastos con este filtro",
      "",
    ],
    [
      "Sin ingreso cargado",
      String(monthsWithoutIncome),
      monthsWithoutIncome
        ? "Meses del horizonte sin sueldo/ingreso"
        : "Todos los meses tienen ingreso",
      monthsWithoutIncome ? "negative" : "",
    ],
  ].forEach(([label, value, copy, tone]) => {
    const card = element("article", "projection-stat");
    if (tone) card.dataset.tone = tone;
    card.append(element("span", "", label), element("strong", "", value), element("small", "", copy));
    dom.projectionSummary.append(card);
  });

  // --- Chart: income vs expense per month (clickable) ---
  const maxValue = Math.max(
    1,
    ...projection.flatMap((month) => [month.totalIncomeCents, month.totalExpenseCents]),
  );
  dom.projectionChart.replaceChildren();
  dom.projectionChart.setAttribute("role", "list");
  dom.projectionChart.setAttribute(
    "aria-label",
    "Ingresos y gastos por mes. Hacé clic en un mes para ver el desglose de gastos.",
  );
  projection.forEach((month) => {
    const group = element("button", "chart-month");
    group.type = "button";
    group.setAttribute("role", "listitem");
    if (month.monthKey === selectedMonth.monthKey) group.dataset.active = "true";
    group.setAttribute(
      "aria-label",
      `${formatMonthLabel(month.monthKey)}: ingresos ${formatCurrency(month.totalIncomeCents)}, gastos ${formatCurrency(month.totalExpenseCents)}`,
    );
    group.title = `${formatMonthLabel(month.monthKey)}\n+ ${formatCurrency(month.totalIncomeCents)}\n− ${formatCurrency(month.totalExpenseCents)}\nClic para desglosar`;
    const bars = element("div", "chart-bars");
    const incomeBar = element("span", "chart-bar income-bar");
    const expenseBar = element("span", "chart-bar expense-bar");
    incomeBar.style.height = `${Math.max((month.totalIncomeCents / maxValue) * 100, month.totalIncomeCents ? 3 : 0)}%`;
    expenseBar.style.height = `${Math.max((month.totalExpenseCents / maxValue) * 100, month.totalExpenseCents ? 3 : 0)}%`;
    bars.append(incomeBar, expenseBar);
    group.append(bars, element("small", "", formatMonthLabel(month.monthKey, true)));
    group.addEventListener("click", () => selectProjectionMonth(month.monthKey));
    dom.projectionChart.append(group);
  });

  // --- Filters ---
  if (dom.projectionExpenseFilters) {
    dom.projectionExpenseFilters.replaceChildren();
    [
      ["all", "Todos"],
      ["monthly", "Mensuales"],
      ["installment", "Cuotas"],
      ["one-time", "Una vez"],
    ].forEach(([value, label]) => {
      const chip = element("button", "proj-filter-chip", label);
      chip.type = "button";
      if (projectionUi.expenseFilter === value) chip.dataset.active = "true";
      chip.addEventListener("click", () => setProjectionExpenseFilter(value));
      dom.projectionExpenseFilters.append(chip);
    });
  }

  if (dom.projectionBreakdownTitle) {
    dom.projectionBreakdownTitle.textContent =
      `Gastos · ${formatMonthLabel(selectedMonth.monthKey)}`;
  }

  // --- Category bars ---
  const categories = categoryTotalsFromExpenses(selectedExpenses);
  const maxCat = Math.max(1, ...categories.map((item) => item.cents));
  if (dom.projectionBreakdown) {
    dom.projectionBreakdown.replaceChildren();
    if (!categories.length) {
      dom.projectionBreakdown.append(
        emptyState(
          "Sin gastos en este corte",
          "Probá otro mes (clic en el gráfico) u otro filtro de tipo.",
        ),
      );
    } else {
      categories.forEach((row, index) => {
        const color = EXPENSE_CHART_COLORS[index % EXPENSE_CHART_COLORS.length];
        const pct = Math.round((row.cents / selectedExpenseTotal) * 100) || 0;
        const barRow = element("button", "expense-bar-row");
        barRow.type = "button";
        if (projectionUi.selectedCategory === row.category) barRow.dataset.active = "true";
        barRow.setAttribute(
          "aria-label",
          `${row.category}: ${formatCurrency(row.cents)}, ${pct} por ciento`,
        );
        const label = element("div", "expense-bar-label");
        const swatch = element("span", "expense-swatch");
        swatch.style.background = color;
        label.append(swatch, element("span", "", row.category));
        const track = element("div", "expense-bar-track");
        const fill = element("span", "expense-bar-fill");
        fill.style.width = `${Math.max((row.cents / maxCat) * 100, row.cents ? 2 : 0)}%`;
        fill.style.background = color;
        track.append(fill);
        const meta = element("div", "expense-bar-meta");
        meta.append(
          element("strong", "", formatCurrency(row.cents)),
          element("small", "", `${pct}%`),
        );
        barRow.append(label, track, meta);
        barRow.addEventListener("click", () => selectProjectionCategory(row.category));
        dom.projectionBreakdown.append(barRow);
      });
    }
  }

  // --- Detail of selected category ---
  if (dom.projectionBreakdownDetail) {
    if (!projectionUi.selectedCategory) {
      dom.projectionBreakdownDetail.hidden = true;
      dom.projectionBreakdownDetail.replaceChildren();
    } else {
      const items = selectedExpenses
        .filter((item) => (item.category || "Sin categoría") === projectionUi.selectedCategory)
        .sort((a, b) => b.amountThisMonthCents - a.amountThisMonthCents
          || a.name.localeCompare(b.name, "es"));
      dom.projectionBreakdownDetail.hidden = false;
      dom.projectionBreakdownDetail.replaceChildren();
      const head = element("div", "breakdown-detail-head");
      head.append(
        element("strong", "", projectionUi.selectedCategory),
        element(
          "span",
          "",
          `${items.length} movimiento${items.length === 1 ? "" : "s"} · ${formatCurrency(
            items.reduce((sum, item) => sum + item.amountThisMonthCents, 0),
          )}`,
        ),
      );
      const list = element("div", "breakdown-detail-list");
      items.forEach((item) => {
        const line = element("div", "breakdown-detail-row");
        const left = element("div", "");
        left.append(
          element("strong", "", item.name),
          element(
            "small",
            "",
            [item.person, scheduleTypeLabel(item.schedule?.type)].filter(Boolean).join(" · "),
          ),
        );
        line.append(left, element("strong", "expense-text", formatCurrency(item.amountThisMonthCents)));
        list.append(line);
      });
      const openMonth = element("button", "text-btn", "Abrir este mes en Movimientos →");
      openMonth.type = "button";
      openMonth.addEventListener("click", () => {
        state.activeMonth = selectedMonth.monthKey;
        switchView("movements");
        render();
      });
      dom.projectionBreakdownDetail.append(head, list, openMonth);
    }
  }

  // --- Month list ---
  dom.projectionList.replaceChildren();
  projection.forEach((month) => {
    const row = element("button", "projection-row");
    row.type = "button";
    if (month.monthKey === selectedMonth.monthKey) row.dataset.active = "true";
    if (month.totalExpenseCents > 0 && month.totalIncomeCents <= 0) row.dataset.tone = "negative";
    const main = element("div", "projection-row-main");
    const incomeNote = month.totalIncomeCents > 0
      ? `${month.occurrences.length} movimiento${month.occurrences.length === 1 ? "" : "s"}`
      : "Sin ingreso cargado";
    main.append(element("strong", "", formatMonthLabel(month.monthKey)), element("span", "", incomeNote));
    const figures = element("div", "projection-figures");
    figures.append(
      element("span", "income-text", `+ ${formatCurrency(month.totalIncomeCents)}`),
      element("span", "expense-text", `- ${formatCurrency(month.totalExpenseCents)}`),
    );
    const balance = month.totalIncomeCents - month.totalExpenseCents;
    const result = element("div", "projection-result");
    result.append(
      element("strong", "", formatCurrency(balance)),
      element("small", "", "Ingresos − gastos"),
    );
    if (balance < 0) result.dataset.tone = "negative";
    row.append(main, figures, result);
    row.addEventListener("click", () => selectProjectionMonth(month.monthKey));
    row.addEventListener("dblclick", () => {
      state.activeMonth = month.monthKey;
      switchView("movements");
      render();
    });
    dom.projectionList.append(row);
  });
}

function renderProfileChrome() {
  const sandbox = isSandboxProfile();
  if (dom.profileSandboxBanner) dom.profileSandboxBanner.hidden = !sandbox;
  document.body.dataset.dataProfile = dataProfile?.id || "hogar";
  if (dom.profileStatus) {
    if (!dataProfile) {
      profileStatusFallback();
      return;
    }
    dom.profileStatus.dataset.tone = sandbox ? "sandbox" : "hogar";
    dom.profileStatus.textContent = sandbox
      ? `Activo: Perfil de prueba · base “${dataProfile.databaseFile}”. Experimentá libre: no se mezcla con el hogar ni con Drive.`
      : `Activo: Hogar (datos reales) · base “${dataProfile.databaseFile}”. Este es el perfil que usa Google Drive.`;
  }
  if (dom.profileHogarBtn) {
    dom.profileHogarBtn.disabled = profileBusy || (!sandbox && Boolean(dataProfile));
    dom.profileHogarBtn.classList.toggle("primary-btn", !sandbox);
    dom.profileHogarBtn.classList.toggle("secondary-btn", sandbox);
  }
  if (dom.profilePruebaBtn) {
    dom.profilePruebaBtn.disabled = profileBusy || sandbox;
    dom.profilePruebaBtn.classList.toggle("primary-btn", sandbox);
    dom.profilePruebaBtn.classList.toggle("secondary-btn", !sandbox);
  }
  if (dom.profileResetPruebaBtn) {
    dom.profileResetPruebaBtn.disabled = profileBusy;
  }
}

function profileStatusFallback() {
  if (!dom.profileStatus) return;
  dom.profileStatus.dataset.tone = "hogar";
  dom.profileStatus.textContent =
    "Perfiles solo en la app de escritorio. En el navegador se usa un único almacenamiento local.";
}

async function refreshDataProfile() {
  try {
    dataProfile = await getDataProfile();
  } catch (error) {
    console.warn("No se pudo leer el perfil de datos.", error);
    dataProfile = {
      id: "hogar",
      label: "Hogar (datos reales)",
      databaseFile: "ilara.db",
      isSandbox: false,
      isActive: true,
    };
  }
  renderProfileChrome();
  return dataProfile;
}

async function switchDataProfile(profileId) {
  if (profileBusy) return;
  if (dataProfile?.id === profileId) {
    showToast(profileId === "prueba" ? "Ya estás en el perfil de prueba" : "Ya estás en Hogar");
    return;
  }
  const goingSandbox = profileId === "prueba";
  const confirmed = await confirmAction({
    title: goingSandbox ? "Entrar al perfil de prueba" : "Volver al Hogar",
    copy: goingSandbox
      ? "Vas a trabajar en una base aparte. Los gastos reales del hogar no se tocan. Drive queda desactivado en este perfil."
      : "Vas a volver a los datos reales del hogar. Lo que cargaste en prueba se guarda aparte y no se mezcla.",
    confirmLabel: goingSandbox ? "Ir a prueba" : "Ir a Hogar",
  });
  if (!confirmed) return;

  profileBusy = true;
  renderProfileChrome();
  try {
    // Asegura el perfil actual en disco antes de cambiar de base.
    await saveState({ skipDriveSchedule: true });
    const result = await setDataProfile(profileId);
    dataProfile = result.active;
    storageErrorShown = false;
    state = await loadState();
    switchView(state.activeView || "dashboard");
    render();
    if (!isSandboxProfile()) await refreshDriveStatus();
    else renderDriveStatus(null);
    showToast(goingSandbox ? "Perfil de prueba activo" : "Perfil Hogar activo");
  } catch (error) {
    console.warn("No se pudo cambiar de perfil.", error);
    showToast(String(error?.message || error || "No se pudo cambiar de perfil"));
    await refreshDataProfile();
  } finally {
    profileBusy = false;
    renderProfileChrome();
  }
}

async function handleResetSandboxProfile() {
  if (profileBusy) return;
  const confirmed = await confirmAction({
    title: "Vaciar perfil de prueba",
    copy: "Se borran solo los datos de prueba. El Hogar real no se toca.",
    confirmLabel: "Vaciar prueba",
    danger: true,
  });
  if (!confirmed) return;
  profileBusy = true;
  renderProfileChrome();
  try {
    await resetSandboxProfile();
    try {
      localStorage.removeItem(`${EMERGENCY_STORAGE_KEY_BASE}:prueba`);
    } catch {
      /* ignore */
    }
    if (isSandboxProfile()) {
      storageErrorShown = false;
      state = await loadState();
      switchView(state.activeView || "dashboard");
      render();
    }
    showToast("Perfil de prueba vacío");
  } catch (error) {
    console.warn("No se pudo vaciar el perfil de prueba.", error);
    showToast(String(error?.message || error || "No se pudo vaciar la prueba"));
  } finally {
    profileBusy = false;
    await refreshDataProfile();
  }
}

function renderSettings() {
  renderProfileChrome();
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
  if (dom.appVersion) {
    dom.appVersion.textContent = `${APP_CHANNEL} · v${APP_VERSION}${isSandboxProfile() ? " · prueba" : ""}`;
  }
}

function setSelectValue(select, value) {
  if (!select) return;
  const target = sanitizeText(value);
  if (!target) return;
  // Match by value first (fast path); avoid spreading options twice.
  for (let index = 0; index < select.options.length; index += 1) {
    const option = select.options[index];
    if (option.value.localeCompare(target, "es", { sensitivity: "base" }) === 0) {
      select.selectedIndex = index;
      return;
    }
  }
}

/** Huella de opciones para no reconstruir el <select> si no cambió (más fluido al abrir). */
function selectOptionsFingerprint(values, extra = []) {
  const unique = [];
  [...extra, ...values].forEach((value) => {
    const text = sanitizeText(value);
    if (!text) return;
    if (unique.some((item) => item.localeCompare(text, "es", { sensitivity: "base" }) === 0)) return;
    unique.push(text);
  });
  return unique;
}

function fillSelectOptions(select, values, { preserve = true, extra = [] } = {}) {
  if (!select) return;
  const previous = preserve ? select.value : "";
  const unique = selectOptionsFingerprint(values, extra);
  const nextKey = unique.join("\u0001");
  if (select.dataset.optionsKey === nextKey && select.options.length === unique.length) {
    if (previous) setSelectValue(select, previous);
    else if (unique.length && select.selectedIndex < 0) select.selectedIndex = 0;
    return;
  }
  select.dataset.optionsKey = nextKey;
  // DocumentFragment: un solo reflow en vez de N appends.
  const fragment = document.createDocumentFragment();
  unique.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    fragment.append(option);
  });
  select.replaceChildren(fragment);
  if (previous) setSelectValue(select, previous);
  else if (unique.length) select.selectedIndex = 0;
}

function renderFormSelects() {
  // Con el diálogo de movimiento abierto no tocamos sus selects (lag + doble tipeo).
  if (!dom.movementDialog?.open) {
    fillSelectOptions(dom.movementForm.elements.category, state.categories);
    fillSelectOptions(dom.movementForm.elements.person, state.people.map((person) => person.name));
  }
  if (dom.budgetForm?.elements?.category) {
    fillSelectOptions(dom.budgetForm.elements.category, state.categories);
  }
}

function renderCardsFxBar() {
  const rate = effectiveUsdArs();
  state.fx.usdArs = rate;
  if (dom.fxRateInput) {
    const displayRate = state.fx.useManual && state.fx.manualUsdArs
      ? state.fx.manualUsdArs
      : (state.fx.apiUsdArs || state.fx.usdArs);
    if (document.activeElement !== dom.fxRateInput) {
      dom.fxRateInput.value = Number.isFinite(displayRate) ? String(displayRate) : "";
    }
  }
  if (dom.fxUseManual) dom.fxUseManual.checked = Boolean(state.fx.useManual);
  if (dom.fxStatus) {
    const parts = [];
    if (state.fx.apiUsdArs) {
      parts.push(`API ${state.fx.apiLabel || "dólar"}: $ ${formatFxRate(state.fx.apiUsdArs)}`);
      if (state.fx.apiUpdatedAt) parts.push(`act. ${state.fx.apiUpdatedAt}`);
    } else {
      parts.push("Sin cotización de red todavía");
    }
    if (state.fx.useManual && state.fx.manualUsdArs) {
      parts.push(`Usando manual: $ ${formatFxRate(state.fx.manualUsdArs)}`);
    } else if (state.fx.apiUsdArs) {
      parts.push("Usando cotización de red (estimativa)");
    }
    dom.fxStatus.textContent = parts.join(" · ");
  }
}

function renderChargeRow(charge) {
  const row = element("div", "cards-charge-row");
  const body = element("div", "cards-charge-body");
  const badge = charge.chargeType === "installment"
    ? "Cuotas"
    : charge.chargeType === "purchase"
      ? "Compra"
      : "Fijo";
  const currencyLabel = charge.currency === "USD" ? "USD" : "ARS";
  body.append(element("strong", "", charge.name));
  if (charge.chargeType === "installment") {
    const left = cardRemainingInstallments(charge);
    const next = cardNextCuotaCents(charge);
    const remaining = cardRemainingCents(charge);
    body.append(element(
      "p",
      "cards-charge-meta",
      `${badge} · ${charge.paidInstallments}/${charge.installments} pagadas · quedan ${left} · próxima ${formatMoneyAmount(next, currencyLabel)} · resto ${formatMoneyAmount(remaining, currencyLabel)}${charge.currency === "USD" ? ` (≈ ${formatMoneyAmount(toArsCents(remaining, "USD"), "ARS")})` : ""}`,
    ));
  } else if (charge.chargeType === "purchase") {
    body.append(element(
      "p",
      "cards-charge-meta",
      `${badge} · ${formatMonthLabel(charge.monthKey)} · ${formatMoneyAmount(charge.totalAmountCents, currencyLabel)}${charge.currency === "USD" ? ` (≈ ${formatMoneyAmount(toArsCents(charge.totalAmountCents, "USD"), "ARS")})` : ""} · un solo pago`,
    ));
  } else {
    body.append(element(
      "p",
      "cards-charge-meta",
      `${badge} mensual · ${formatMoneyAmount(charge.monthlyAmountCents, currencyLabel)}${charge.currency === "USD" ? ` (≈ ${formatMoneyAmount(toArsCents(charge.monthlyAmountCents, "USD"), "ARS")}/mes)` : ""}`,
    ));
  }
  if (charge.note) body.append(element("p", "cards-charge-meta", charge.note));
  const side = element("div", "cards-charge-side");
  if (charge.chargeType === "installment" && cardRemainingInstallments(charge) > 0) {
    const payOne = element("button", "secondary-btn", "Marcar 1 cuota");
    payOne.type = "button";
    payOne.addEventListener("click", () => markCardCuotaPaid(charge.id));
    side.append(payOne);
  }
  if (charge.chargeType === "installment" && charge.paidInstallments > 0) {
    const undo = element("button", "row-menu", "Deshacer cuota");
    undo.type = "button";
    undo.addEventListener("click", () => unmarkCardCuotaPaid(charge.id));
    side.append(undo);
  }
  const remove = element("button", "row-menu", "Quitar");
  remove.type = "button";
  remove.addEventListener("click", () => removeCardCharge(charge.id));
  side.append(remove);
  row.append(body, side);
  return row;
}

function renderCardsListView() {
  const monthLoad = getAllCardsMonthLoad(state.activeMonth);
  const hero = element("article", "panel cards-hero");
  const heroHead = element("div", "panel-heading");
  heroHead.append(
    element("p", "eyebrow", `Carga de ${formatMonthLabel(state.activeMonth)}`),
    element("h2", "", "Este mes en tarjetas"),
    element("p", "", "Cuotas que caen + fijos + compras del mes. Estimado en ARS (con TC). No es el resumen del banco."),
  );
  hero.append(heroHead);
  const heroValue = element("div", "cards-hero-value");
  heroValue.append(element("strong", "", formatMoneyAmount(monthLoad.totalArs, "ARS")));
  hero.append(heroValue);
  const chips = element("div", "cards-hero-chips");
  [
    ["Cuotas", monthLoad.installmentArs],
    ["Fijos", monthLoad.fixedArs],
    ["Compras", monthLoad.purchaseArs],
  ].forEach(([label, cents]) => {
    const chip = element("div", "cards-hero-chip");
    chip.append(element("span", "", label), element("strong", "", formatMoneyAmount(cents, "ARS")));
    chips.append(chip);
  });
  hero.append(chips);

  if (monthLoad.byCard.length) {
    const rank = element("div", "cards-rank");
    rank.append(element("p", "cards-rank-title", "Quién pesa más este mes"));
    const max = Math.max(...monthLoad.byCard.map((row) => row.totalArs), 1);
    monthLoad.byCard.forEach((row) => {
      const barRow = element("button", "cards-rank-row");
      barRow.type = "button";
      const label = element("div", "cards-rank-label");
      label.append(
        element("strong", "", row.card.name),
        element("span", "", formatMoneyAmount(row.totalArs, "ARS")),
      );
      const track = element("div", "cards-rank-track");
      const fill = element("span", "cards-rank-fill");
      fill.style.width = `${Math.min(100, Math.round((row.totalArs / max) * 100))}%`;
      track.append(fill);
      barRow.append(label, track);
      barRow.addEventListener("click", () => {
        selectedCardId = row.card.id;
        renderCards();
      });
      rank.append(barRow);
    });
    hero.append(rank);
  }
  dom.cardsRoot.append(hero);

  // Próximos cierres del ciclo (solo plásticos que suman a tarjetas)
  const closings = creditCardsForTotals()
    .filter((card) => isValidIsoDate(card.closingDate))
    .map((card) => {
      const daysUntil = daysUntilIsoDate(card.closingDate);
      const load = getCardMonthLoad(card.id, state.activeMonth);
      return { card, daysUntil, load };
    })
    .filter((row) => row.daysUntil !== null && row.daysUntil >= -3)
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, 6);
  if (closings.length) {
    const closePanel = element("article", "panel");
    closePanel.append(
      element("p", "eyebrow", "Ciclo"),
      element("h2", "", "Próximos cierres de resumen"),
    );
    const list = element("div", "cards-closing-list");
    closings.forEach(({ card, daysUntil, load }) => {
      const row = element("button", "cards-closing-row");
      row.type = "button";
      const when = daysUntil < 0
        ? `Cerró ${formatIsoDateLabel(card.closingDate)}`
        : daysUntil === 0
          ? `Cierra hoy · ${formatIsoDateLabel(card.closingDate)}`
          : `En ${daysUntil} día${daysUntil === 1 ? "" : "s"} · ${formatIsoDateLabel(card.closingDate)}`;
      const dueBit = isValidIsoDate(card.dueDate) ? ` · Vence ${formatIsoDateLabel(card.dueDate)}` : "";
      row.append(
        element("strong", "", card.name),
        element("span", "", when + dueBit),
        element("span", "", `Carga est. ${formatMoneyAmount(load.totalArs, "ARS")}`),
      );
      row.addEventListener("click", () => {
        selectedCardId = card.id;
        renderCards();
      });
      list.append(row);
    });
    closePanel.append(list);
    dom.cardsRoot.append(closePanel);
  }

  // Tabla de tarjetas (excluye cuentas corrientes)
  const plasticCards = creditCardsForTotals();
  const tablePanel = element("article", "panel cards-table-panel");
  tablePanel.append(
    element("p", "eyebrow", "Tus plásticos"),
    element("h2", "", "Tarjetas"),
  );
  if (!plasticCards.length) {
    tablePanel.append(emptyState(
      "Sin tarjetas todavía",
      "Agregá una tarjeta para compras, cuotas y fijos del plástico.",
    ));
  } else {
    const table = element("div", "cards-table");
    const head = element("div", "cards-table-head");
    ["Tarjeta", "Límite / uso del mes", "Cierre ciclo", "Vence ciclo", "Este mes", ""].forEach((label) => {
      head.append(element("span", "", label));
    });
    table.append(head);
    plasticCards.forEach((card) => {
      const load = getCardMonthLoad(card.id, state.activeMonth);
      const row = element("button", "cards-table-row");
      row.type = "button";
      const nameCell = element("div", "cards-table-name");
      nameCell.append(element("strong", "", card.name), element("small", "", card.person || ""));
      const limitCell = element("div", "cards-table-limit");
      if (card.limitCents > 0) {
        const pct = Math.min(999, Math.round((load.totalArs / card.limitCents) * 100));
        const track = element("div", "cards-limit-track");
        const fill = element("span", "cards-limit-fill");
        fill.style.width = `${Math.min(100, pct)}%`;
        if (pct >= 90) fill.dataset.alert = "true";
        track.append(fill);
        limitCell.append(
          element("span", "", `${formatMoneyAmount(card.limitCents, "ARS")} · ${pct}%`),
          track,
        );
      } else {
        limitCell.append(element("span", "cards-muted", "Sin límite"));
      }
      row.append(
        nameCell,
        limitCell,
        element("span", "", isValidIsoDate(card.closingDate) ? formatIsoDateLabel(card.closingDate) : "—"),
        element("span", "", isValidIsoDate(card.dueDate) ? formatIsoDateLabel(card.dueDate) : "—"),
        element("strong", "", formatMoneyAmount(load.totalArs, "ARS")),
        element("span", "cards-table-open", "Abrir →"),
      );
      row.addEventListener("click", () => {
        selectedCardId = card.id;
        renderCards();
      });
      table.append(row);
    });
    tablePanel.append(table);
  }
  dom.cardsRoot.append(tablePanel);

  // Cuentas corrientes (ej. CC Mara): detalle visible, no suman a “Este mes en tarjetas”.
  const ccLoad = getCuentaCorrienteMonthLoad(state.activeMonth);
  const ccPanel = element("article", "panel cards-cc-panel");
  ccPanel.append(
    element("p", "eyebrow", "Fuera del total de tarjetas"),
    element("h2", "", "Cuentas corrientes"),
    element(
      "p",
      "heading-copy",
      "No suman al total de plásticos (ej. descuento de sueldo). Acá ves el detalle por separado.",
    ),
  );
  if (!ccLoad.byCard.length && !creditCardsCuentaCorriente().length) {
    ccPanel.append(element(
      "p",
      "cards-muted",
      "Ninguna cuenta marcada. Editá la tarjeta y activá “Cuenta corriente (no sumar a tarjetas)”.",
    ));
  } else {
    const totalLine = element("div", "cards-cc-total");
    totalLine.append(
      element("span", "", `Movimiento del mes · ${formatMonthLabel(state.activeMonth)}`),
      element("strong", "", formatMoneyAmount(ccLoad.totalArs, "ARS")),
    );
    ccPanel.append(totalLine);
    const list = element("div", "cards-cc-list");
    creditCardsCuentaCorriente().forEach((card) => {
      const load = getCardMonthLoad(card.id, state.activeMonth);
      const row = element("button", "cards-cc-row");
      row.type = "button";
      row.append(
        element("strong", "", card.name),
        element("span", "", card.person || "—"),
        element("span", "", formatMoneyAmount(load.totalArs, "ARS")),
        element("span", "cards-table-open", "Ver →"),
      );
      row.addEventListener("click", () => {
        selectedCardId = card.id;
        renderCards();
      });
      list.append(row);
    });
    ccPanel.append(list);
  }
  dom.cardsRoot.append(ccPanel);
}

function renderCardDetailView(card) {
  const load = getCardMonthLoad(card.id, state.activeMonth);
  const charges = state.cardCharges.filter((charge) => charge.active && charge.cardId === card.id);
  const remainingInstallments = charges
    .filter((charge) => charge.chargeType === "installment")
    .reduce((sum, charge) => sum + cardRemainingCents(charge), 0);

  const head = element("article", "panel cards-detail-head");
  const title = element("div", "");
  title.append(
    element("p", "eyebrow", isCuentaCorrienteCard(card) ? "Cuenta corriente" : (card.person || "Tarjeta")),
    element("h2", "", card.name),
  );
  if (isCuentaCorrienteCard(card)) {
    const notice = element("p", "cards-cc-notice");
    notice.textContent =
      "Cuenta corriente: no suma al total de “Este mes en tarjetas” ni a la proyección de plásticos.";
    head.append(notice);
  }
  const meta = [
    card.limitCents > 0 ? `Límite ${formatMoneyAmount(card.limitCents, "ARS")}` : "Sin límite",
    isValidIsoDate(card.closingDate) ? `Cierre ${formatIsoDateLabel(card.closingDate)}` : "Cierre —",
    isValidIsoDate(card.dueDate) ? `Vence ${formatIsoDateLabel(card.dueDate)}` : "Vence —",
  ].join(" · ");
  title.append(element("p", "cards-charge-meta", meta));
  if (card.note) title.append(element("p", "", card.note));
  const actions = element("div", "cards-card-actions");
  const editBtn = element("button", "secondary-btn", "Editar / ciclo");
  editBtn.type = "button";
  editBtn.addEventListener("click", () => openCardDialog(card.id));
  const purchaseBtn = element("button", "secondary-btn", "+ Compra");
  purchaseBtn.type = "button";
  purchaseBtn.addEventListener("click", () => openPurchaseDialog(card.id));
  const instBtn = element("button", "secondary-btn", "+ Cuotas");
  instBtn.type = "button";
  instBtn.addEventListener("click", () => openChargeDialog(card.id, "installment"));
  const fixedBtn = element("button", "secondary-btn", "+ Fijo");
  fixedBtn.type = "button";
  fixedBtn.addEventListener("click", () => openChargeDialog(card.id, "fixed"));
  const deleteBtn = element("button", "danger-btn", "Eliminar");
  deleteBtn.type = "button";
  deleteBtn.addEventListener("click", () => void removeCreditCard(card.id));
  actions.append(editBtn, purchaseBtn, instBtn, fixedBtn, deleteBtn);
  const headRow = element("div", "panel-heading inline-heading");
  headRow.append(title, actions);
  head.append(headRow);

  const kpis = element("div", "cards-detail-kpis");
  [
    ["Este mes", formatMoneyAmount(load.totalArs, "ARS"), "Cuotas + fijos + compras"],
    ["En cuotas (resto)", formatMoneyAmount(remainingInstallments, "ARS"), "Saldo de planes activos"],
    ["Uso del límite", card.limitCents > 0
      ? `${Math.min(999, Math.round((load.totalArs / card.limitCents) * 100))}%`
      : "—", card.limitCents > 0 ? "Sobre el límite cargado" : "Definí un límite al editar"],
  ].forEach(([label, value, copy]) => {
    const kpi = element("div", "cards-detail-kpi");
    kpi.append(element("span", "", label), element("strong", "", value), element("small", "", copy));
    kpis.append(kpi);
  });
  head.append(kpis);

  const cycleBox = element("div", "cards-cycle-box");
  const cycleCopy = element("div", "");
  cycleCopy.append(
    element("strong", "", "Ciclo de este resumen"),
    element(
      "p",
      "cards-charge-meta",
      `Cierre: ${formatIsoDateLabel(card.closingDate)} · Vencimiento: ${formatIsoDateLabel(card.dueDate)}. ` +
      "Las compras se asignan al resumen del ciclo según el día de cierre (después del cierre → mes siguiente).",
    ),
  );
  const cycleEdit = element("button", "secondary-btn", "Actualizar fechas del ciclo");
  cycleEdit.type = "button";
  cycleEdit.addEventListener("click", () => openCardDialog(card.id));
  cycleBox.append(cycleCopy, cycleEdit);
  head.append(cycleBox);

  const gen = element("div", "cards-generate-box");
  const genCopy = element("div", "");
  genCopy.append(
    element("strong", "", "Generar resumen del mes"),
    element(
      "p",
      "cards-charge-meta",
      `Crea un gasto en Movimientos por ${formatMoneyAmount(load.totalArs, "ARS")} (estimado). ` +
      "Podés editar el monto por percepciones u otros cargos del banco.",
    ),
  );
  const genBtn = element("button", "primary-btn", "Generar resumen");
  genBtn.type = "button";
  genBtn.disabled = load.totalArs <= 0;
  genBtn.addEventListener("click", () => generateCardStatement(card.id));
  gen.append(genCopy, genBtn);
  head.append(gen);
  dom.cardsRoot.append(head);

  const chargesPanel = element("article", "panel");
  chargesPanel.append(
    element("p", "eyebrow", "Cargos"),
    element("h2", "", "Actividad de la tarjeta"),
  );
  if (!charges.length) {
    chargesPanel.append(emptyState("Sin cargos", "Sumá una compra del mes, un plan en cuotas o un fijo."));
  } else {
    const list = element("div", "cards-charge-list");
    charges
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, "es"))
      .forEach((charge) => list.append(renderChargeRow(charge)));
    chargesPanel.append(list);
  }
  dom.cardsRoot.append(chargesPanel);

  // Cuotas que quedan (solo esta tarjeta)
  const plans = charges.filter((charge) => charge.chargeType === "installment" && cardRemainingInstallments(charge) > 0);
  if (plans.length) {
    const future = element("article", "panel");
    future.append(
      element("p", "eyebrow", "Planificación"),
      element("h2", "", "Cuotas que quedan"),
    );
    const list = element("div", "cards-future-list");
    plans.forEach((charge) => {
      const left = cardRemainingInstallments(charge);
      const remaining = cardRemainingCents(charge);
      const row = element("div", "cards-future-row");
      row.append(
        element("strong", "", charge.name),
        element("span", "", `${left} cuota${left === 1 ? "" : "s"} · ${formatMoneyAmount(remaining, charge.currency)}`),
      );
      list.append(row);
    });
    future.append(list);
    dom.cardsRoot.append(future);
  }
}

function renderCards() {
  if (!dom.cardsRoot) return;
  renderCardsFxBar();
  if (selectedCardId && !state.creditCards.some((card) => card.id === selectedCardId)) {
    selectedCardId = "";
  }
  const selected = state.creditCards.find((card) => card.id === selectedCardId) || null;
  if (dom.cardsBackBtn) dom.cardsBackBtn.hidden = !selected;
  if (dom.cardsPageTitle) {
    dom.cardsPageTitle.textContent = selected ? selected.name : "Tarjetas de crédito";
  }
  if (dom.cardsPageCopy) {
    if (selected && isCuentaCorrienteCard(selected)) {
      dom.cardsPageCopy.textContent =
        "Cuenta corriente: detalle de movimientos. No suma a la carga de tarjetas (ya descontada del sueldo).";
    } else if (selected) {
      dom.cardsPageCopy.textContent =
        "Detalle del plástico: compras, cuotas, fijos y generar resumen del mes.";
    } else {
      dom.cardsPageCopy.textContent =
        "Carga del mes y plásticos. Las cuentas corrientes (ej. CC Mara) van aparte y no suman al total.";
    }
  }

  dom.cardsRoot.replaceChildren();
  if (selected) renderCardDetailView(selected);
  else renderCardsListView();
}

function openCardDialog(editCardId = "") {
  if (!dom.cardDialog || !dom.cardForm) return;
  const existing = state.creditCards.find((card) => card.id === editCardId) || null;
  dom.cardForm.reset();
  if (dom.cardForm.elements.id) dom.cardForm.elements.id.value = existing?.id || "";
  fillSelectOptions(dom.cardForm.elements.person, state.people.map((person) => person.name), { preserve: false });
  setSelectValue(dom.cardForm.elements.person, existing?.person || state.people[0]?.name || "Compartido");
  if (existing) {
    dom.cardForm.elements.name.value = existing.name;
    if (dom.cardForm.elements.closingDate) dom.cardForm.elements.closingDate.value = existing.closingDate || "";
    if (dom.cardForm.elements.dueDate) dom.cardForm.elements.dueDate.value = existing.dueDate || "";
    if (dom.cardForm.elements.limit) {
      dom.cardForm.elements.limit.value = existing.limitCents ? String(fromCents(existing.limitCents)) : "";
    }
    if (dom.cardForm.elements.note) dom.cardForm.elements.note.value = existing.note || "";
    if (dom.cardForm.elements.excludeFromCardTotals) {
      dom.cardForm.elements.excludeFromCardTotals.checked = Boolean(existing.excludeFromCardTotals);
    }
  } else {
    if (dom.cardForm.elements.closingDate) dom.cardForm.elements.closingDate.value = "";
    if (dom.cardForm.elements.dueDate) dom.cardForm.elements.dueDate.value = "";
    if (dom.cardForm.elements.limit) dom.cardForm.elements.limit.value = "";
    if (dom.cardForm.elements.excludeFromCardTotals) {
      dom.cardForm.elements.excludeFromCardTotals.checked = false;
    }
  }
  const title = document.querySelector("#cardDialogTitle");
  if (title) title.textContent = existing ? "Editar tarjeta / ciclo" : "Nueva tarjeta";
  dom.cardDialog.showModal();
  window.setTimeout(() => dom.cardForm.elements.name?.focus(), 40);
}

function openPurchaseDialog(preselectedCardId = "") {
  if (!dom.purchaseDialog || !dom.purchaseForm) return;
  if (!state.creditCards.length) {
    showToast("Primero agregá una tarjeta en la sección Tarjetas");
    switchView("cards");
    return;
  }
  dom.purchaseForm.reset();
  const cardSelect = dom.purchaseForm.elements.cardId;
  fillSelectOptions(cardSelect, state.creditCards.map((card) => card.name), { preserve: false });
  // Store ids as option values
  cardSelect.replaceChildren();
  state.creditCards.forEach((card) => {
    const option = document.createElement("option");
    option.value = card.id;
    option.textContent = card.name;
    cardSelect.append(option);
  });
  if (preselectedCardId && state.creditCards.some((card) => card.id === preselectedCardId)) {
    cardSelect.value = preselectedCardId;
  }
  if (dom.purchaseForm.elements.monthKey) {
    const card = state.creditCards.find((item) => item.id === cardSelect.value);
    dom.purchaseForm.elements.monthKey.value = card
      ? statementMonthKeyForPurchase(card)
      : state.activeMonth;
  }
  if (dom.purchaseForm.elements.currency) dom.purchaseForm.elements.currency.value = "ARS";
  // Si cambia la tarjeta, reasignar mes del resumen según cierre.
  cardSelect.onchange = () => {
    const card = state.creditCards.find((item) => item.id === cardSelect.value);
    if (card && dom.purchaseForm.elements.monthKey) {
      dom.purchaseForm.elements.monthKey.value = statementMonthKeyForPurchase(card);
    }
  };
  dom.purchaseDialog.showModal();
  window.setTimeout(() => dom.purchaseForm.elements.name?.focus(), 40);
}

function updateChargeAmountModeUI() {
  if (!dom.chargeForm) return;
  const isInstallment = dom.chargeForm.elements.chargeType.value !== "fixed";
  const mode = dom.chargeForm.elements.amountMode?.value === "cuota" ? "cuota" : "total";
  if (dom.chargeAmountModeField) dom.chargeAmountModeField.hidden = !isInstallment;
  if (dom.chargeInstallmentsField) dom.chargeInstallmentsField.hidden = !isInstallment;
  if (dom.chargePaidField) dom.chargePaidField.hidden = !isInstallment;
  if (dom.chargeTotalField) dom.chargeTotalField.hidden = !isInstallment || mode !== "total";
  if (dom.chargeCuotaField) dom.chargeCuotaField.hidden = !isInstallment || mode !== "cuota";
  if (dom.chargeMonthlyField) dom.chargeMonthlyField.hidden = isInstallment;
  if (dom.chargeForm.elements.totalAmount) {
    dom.chargeForm.elements.totalAmount.required = isInstallment && mode === "total";
  }
  if (dom.chargeForm.elements.cuotaAmount) {
    dom.chargeForm.elements.cuotaAmount.required = isInstallment && mode === "cuota";
  }
  if (dom.chargeForm.elements.installments) {
    dom.chargeForm.elements.installments.required = isInstallment;
  }
  if (dom.chargeForm.elements.paidInstallments) {
    dom.chargeForm.elements.paidInstallments.required = isInstallment;
  }
  if (dom.chargeForm.elements.monthlyAmount) {
    dom.chargeForm.elements.monthlyAmount.required = !isInstallment;
  }
  updateChargeAmountHint();
}

function updateChargeAmountHint() {
  if (!dom.chargeAmountHint || !dom.chargeForm) return;
  if (dom.chargeForm.elements.chargeType.value === "fixed") {
    dom.chargeAmountHint.textContent = "";
    return;
  }
  const mode = dom.chargeForm.elements.amountMode?.value === "cuota" ? "cuota" : "total";
  const installments = Math.min(Math.max(Math.trunc(Number(dom.chargeForm.elements.installments.value) || 0), 0), 120);
  const currency = dom.chargeForm.elements.currency?.value === "USD" ? "USD" : "ARS";
  if (mode === "cuota") {
    const cuotaCents = toCents(dom.chargeForm.elements.cuotaAmount?.value);
    if (cuotaCents > 0 && installments >= 2) {
      const totalCents = cuotaCents * installments;
      dom.chargeAmountHint.textContent =
        `${installments} cuotas de ${formatMoneyAmount(cuotaCents, currency)} = total ${formatMoneyAmount(totalCents, currency)}`;
    } else {
      dom.chargeAmountHint.textContent = "Ingresá el valor de cada cuota y la cantidad; el total se calcula solo.";
    }
    return;
  }
  const totalCents = toCents(dom.chargeForm.elements.totalAmount?.value);
  if (totalCents > 0 && installments >= 2) {
    const approx = Math.round(totalCents / installments);
    dom.chargeAmountHint.textContent =
      `Total ${formatMoneyAmount(totalCents, currency)} ≈ ${formatMoneyAmount(approx, currency)} por cuota (la última se ajusta si hace falta)`;
  } else {
    dom.chargeAmountHint.textContent = "Ingresá el total del plan; se reparte en las cuotas sin perder centavos.";
  }
}

function openChargeDialog(cardId, chargeType = "installment") {
  if (!dom.chargeDialog || !dom.chargeForm) return;
  dom.chargeForm.reset();
  dom.chargeForm.elements.cardId.value = cardId;
  dom.chargeForm.elements.chargeType.value = chargeType;
  if (dom.chargeForm.elements.amountMode) dom.chargeForm.elements.amountMode.value = "total";
  if (dom.chargeForm.elements.installments) dom.chargeForm.elements.installments.value = "12";
  if (dom.chargeForm.elements.paidInstallments) dom.chargeForm.elements.paidInstallments.value = "0";
  updateChargeAmountModeUI();
  if (dom.chargeDialogTitle) {
    dom.chargeDialogTitle.textContent = chargeType === "installment" ? "Plan en cuotas" : "Gasto fijo en tarjeta";
  }
  dom.chargeDialog.showModal();
  window.setTimeout(() => dom.chargeForm.elements.name?.focus(), 40);
}

async function saveCreditCard(event) {
  event.preventDefault();
  const formData = new FormData(dom.cardForm);
  const existingId = sanitizeText(formData.get("id"));
  const card = normalizeCreditCard({
    id: existingId || createId(),
    name: formData.get("name"),
    person: formData.get("person"),
    note: formData.get("note"),
    closingDate: formData.get("closingDate"),
    dueDate: formData.get("dueDate"),
    limit: formData.get("limit"),
    excludeFromCardTotals: formData.get("excludeFromCardTotals") === "on"
      || formData.get("excludeFromCardTotals") === "true",
  });
  if (!card) return;
  const previousState = cloneState(state);
  const index = state.creditCards.findIndex((item) => item.id === card.id);
  if (index >= 0) state.creditCards[index] = card;
  else state.creditCards.push(card);
  if (!await saveState()) {
    state = previousState;
    render();
    return;
  }
  dom.cardDialog.close();
  if (index < 0) selectedCardId = card.id;
  render();
  showToast(index >= 0 ? "Tarjeta / ciclo actualizado" : "Tarjeta agregada");
}

async function generateCardStatement(cardId) {
  const card = state.creditCards.find((item) => item.id === cardId);
  if (!card) return;
  const load = getCardMonthLoad(cardId, state.activeMonth);
  if (load.totalArs <= 0) {
    showToast("No hay carga estimada este mes para generar un resumen");
    return;
  }
  const confirmed = await confirmAction({
    title: `Resumen · ${card.name}`,
    copy:
      `Se va a crear un gasto en Movimientos por el estimado de ${formatMonthLabel(state.activeMonth)}. `
      + "Si el banco cobró distinto (percepciones, etc.), después lo editás desde Movimientos.",
    details: [
      `Total estimado: ${formatMoneyAmount(load.totalArs, "ARS")}`,
      `Cuotas: ${formatMoneyAmount(load.installmentArs, "ARS")}`,
      `Fijos: ${formatMoneyAmount(load.fixedArs, "ARS")}`,
      `Compras: ${formatMoneyAmount(load.purchaseArs, "ARS")}`,
      `Persona: ${card.person || "Compartido"}`,
      "Estado: pagado al crear",
    ],
    confirmLabel: "Crear en Movimientos",
  });
  if (!confirmed) return;
  const finalCents = load.totalArs;
  const transaction = normalizeTransaction({
    id: createId(),
    kind: "expense",
    name: `Resumen ${card.name}`,
    category: "Tarjeta de crédito",
    person: card.person || "Compartido",
    amountCents: finalCents,
    scheduleType: "one-time",
    startMonth: state.activeMonth,
    dueDay: isValidIsoDate(card.dueDate) ? Number(card.dueDate.slice(8, 10)) : 0,
    note: [
      "Generado desde Tarjetas",
      isValidIsoDate(card.closingDate) ? `cierre ${card.closingDate}` : null,
      isValidIsoDate(card.dueDate) ? `vence ${card.dueDate}` : null,
      `est. ${formatMoneyAmount(load.totalArs, "ARS")}`,
      "podés editar por percepciones",
    ].filter(Boolean).join(" · "),
  });
  if (!transaction) {
    showToast("No se pudo crear el movimiento");
    return;
  }
  if (!state.categories.some((category) =>
    category.localeCompare("Tarjeta de crédito", "es", { sensitivity: "base" }) === 0
  )) {
    state.categories.push("Tarjeta de crédito");
    state.categories.sort((a, b) => a.localeCompare(b, "es"));
  }
  const previousState = cloneState(state);
  state.transactions.push(transaction);
  const occurrence = occurrenceForMonth(transaction, state.activeMonth, {});
  if (occurrence) {
    state.occurrences[`${transaction.id}:${state.activeMonth}`] = materializeOccurrence(occurrence, {
      status: "paid",
      actualAmountCents: finalCents,
      effectiveDate: localDateKey(),
    });
  }
  if (!await saveState()) {
    state = previousState;
    render();
    return;
  }
  render();
  showToast("Resumen creado en Movimientos (pagado)", {
    label: "Ver / editar",
    handler: () => {
      switchView("movements");
      openMovementDialog(transaction.id, state.activeMonth);
    },
  });
}

async function saveCardCharge(event) {
  event.preventDefault();
  const formData = new FormData(dom.chargeForm);
  const rawType = formData.get("chargeType");
  const chargeType = rawType === "fixed" ? "fixed" : rawType === "purchase" ? "purchase" : "installment";
  let totalAmount = formData.get("totalAmount");
  if (chargeType === "installment" && formData.get("amountMode") === "cuota") {
    const installments = Math.min(Math.max(Math.trunc(Number(formData.get("installments")) || 0), 2), 120);
    const cuotaCents = toCents(formData.get("cuotaAmount"));
    if (cuotaCents <= 0 || installments < 2) {
      showToast("Ingresá valor de cuota y cantidad de cuotas");
      return;
    }
    // Total exacto = cuota × N (todas las cuotas iguales en este modo).
    totalAmount = fromCents(cuotaCents * installments);
  }
  const charge = normalizeCardCharge({
    id: createId(),
    cardId: formData.get("cardId"),
    name: formData.get("name"),
    chargeType,
    currency: formData.get("currency"),
    totalAmount,
    installments: formData.get("installments"),
    paidInstallments: formData.get("paidInstallments") || 0,
    monthlyAmount: formData.get("monthlyAmount"),
    monthKey: formData.get("monthKey"),
    note: formData.get("note"),
    active: true,
  }, new Set(state.creditCards.map((card) => card.id)));
  if (!charge) {
    showToast("Revisá los datos del cargo");
    return;
  }
  const monthForLimit = charge.chargeType === "purchase"
    ? (charge.monthKey || state.activeMonth)
    : state.activeMonth;
  const over = wouldExceedCardLimit(charge.cardId, chargeAmountArsForLimit(charge), monthForLimit);
  if (over) {
    showToast(
      `Supera el límite de ${over.card.name} `
      + `(${formatMoneyAmount(over.limitCents, "ARS")}; quedaría en ${formatMoneyAmount(over.nextTotal, "ARS")})`,
    );
    return;
  }
  const previousState = cloneState(state);
  state.cardCharges.push(charge);
  if (!await saveState()) {
    state = previousState;
    render();
    return;
  }
  dom.chargeDialog.close();
  render();
  showToast(
    chargeType === "installment"
      ? "Plan en cuotas agregado"
      : chargeType === "purchase"
        ? "Compra en tarjeta registrada"
        : "Gasto fijo agregado",
  );
}

async function saveCardPurchase(event) {
  event.preventDefault();
  if (!dom.purchaseForm) return;
  const formData = new FormData(dom.purchaseForm);
  const cardId = sanitizeText(formData.get("cardId"));
  const card = state.creditCards.find((item) => item.id === cardId);
  // Mes del resumen: el del form, o el que corresponde al ciclo de cierre.
  let monthKey = formData.get("monthKey") || "";
  if (!isValidMonthKey(monthKey) && card) {
    monthKey = statementMonthKeyForPurchase(card);
  }
  if (!isValidMonthKey(monthKey)) monthKey = state.activeMonth;
  const charge = normalizeCardCharge({
    id: createId(),
    cardId,
    name: formData.get("name"),
    chargeType: "purchase",
    currency: formData.get("currency"),
    totalAmount: formData.get("amount"),
    monthKey,
    note: formData.get("note"),
    active: true,
  }, new Set(state.creditCards.map((item) => item.id)));
  if (!charge) {
    showToast("Revisá tarjeta, concepto y monto");
    return;
  }
  const over = wouldExceedCardLimit(charge.cardId, chargeAmountArsForLimit(charge), charge.monthKey);
  if (over) {
    showToast(
      `Supera el límite de ${over.card.name} `
      + `(tope ${formatMoneyAmount(over.limitCents, "ARS")}; con este gasto: ${formatMoneyAmount(over.nextTotal, "ARS")})`,
    );
    return;
  }
  const previousState = cloneState(state);
  state.cardCharges.push(charge);
  if (!await saveState()) {
    state = previousState;
    render();
    return;
  }
  dom.purchaseDialog.close();
  render();
  const cycleNote = card && isValidIsoDate(card.closingDate)
    ? ` · cierre ${formatIsoDateLabel(card.closingDate)}`
    : "";
  showToast(`Compra en resumen ${formatMonthLabel(charge.monthKey)}${cycleNote}`);
}

async function removeCreditCard(cardId) {
  const card = state.creditCards.find((item) => item.id === cardId);
  if (!card) return;
  const confirmed = await confirmAction({
    title: "Eliminar tarjeta",
    copy: `¿Eliminar “${card.name}” y todos sus cargos? No afecta los KPIs del hogar.`,
    confirmLabel: "Eliminar",
    danger: true,
  });
  if (!confirmed) return;
  const previousState = cloneState(state);
  state.creditCards = state.creditCards.filter((item) => item.id !== cardId);
  state.cardCharges = state.cardCharges.filter((item) => item.cardId !== cardId);
  if (!await saveState()) {
    state = previousState;
    render();
    return;
  }
  if (selectedCardId === cardId) selectedCardId = "";
  render();
  showToast("Tarjeta eliminada", {
    label: "Deshacer",
    handler: async () => {
      const before = cloneState(state);
      state = previousState;
      if (!await saveState()) {
        state = before;
        render();
        return;
      }
      render();
      showToast("Tarjeta restaurada");
    },
  });
}

async function removeCardCharge(chargeId) {
  const previousState = cloneState(state);
  state.cardCharges = state.cardCharges.filter((item) => item.id !== chargeId);
  if (!await saveState()) {
    state = previousState;
    render();
    return;
  }
  render();
  showToast("Cargo eliminado", {
    label: "Deshacer",
    handler: async () => {
      const before = cloneState(state);
      state = previousState;
      if (!await saveState()) {
        state = before;
        render();
        return;
      }
      render();
      showToast("Cargo restaurado");
    },
  });
}

/** Copia movimientos “una sola vez” del mes anterior al mes activo (como nuevos, ya cobrados/pagados). */
async function copyFromPreviousMonth() {
  if (state.closedMonths[state.activeMonth]) {
    showToast("Reabrí el mes antes de copiar");
    return;
  }
  const prevMonth = addMonths(state.activeMonth, -1);
  const candidates = state.transactions.filter((tx) =>
    tx.schedule?.type === "one-time" && tx.schedule.startMonth === prevMonth
  );
  if (!candidates.length) {
    showToast(`No hay movimientos “una sola vez” en ${formatMonthLabel(prevMonth)}`);
    return;
  }
  const currentNames = new Set(
    getMonthTotals(state.activeMonth).occurrences.map((item) =>
      `${item.kind}|${item.name}|${item.amountThisMonthCents}`
    ),
  );
  const toCopy = candidates.filter((tx) => {
    const key = `${tx.kind}|${tx.name}|${tx.amountCents}`;
    return !currentNames.has(key);
  });
  if (!toCopy.length) {
    showToast("Esos movimientos ya están (o algo muy parecido) en este mes");
    return;
  }
  const confirmed = await confirmAction({
    title: "Copiar del mes anterior",
    copy:
      `Se van a copiar ${toCopy.length} movimiento${toCopy.length === 1 ? "" : "s"} de `
      + `${formatMonthLabel(prevMonth)} a ${formatMonthLabel(state.activeMonth)}. `
      + "Quedan cobrados/pagados. Los mensuales y en cuotas no se copian (ya se proyectan solos).",
    details: toCopy.slice(0, 8).map((tx) =>
      `${tx.kind === "income" ? "+" : "-"} ${tx.name} · ${formatCurrency(tx.amountCents)}`
    ).concat(toCopy.length > 8 ? [`… y ${toCopy.length - 8} más`] : []),
    confirmLabel: "Copiar",
  });
  if (!confirmed) return;
  const previousState = cloneState(state);
  toCopy.forEach((source) => {
    const transaction = normalizeTransaction({
      ...source,
      id: createId(),
      startMonth: state.activeMonth,
      scheduleType: "one-time",
      endMonth: "",
      installments: 1,
      createdAt: new Date().toISOString(),
    });
    if (!transaction) return;
    state.transactions.push(transaction);
    const occurrence = occurrenceForMonth(transaction, state.activeMonth, {});
    if (occurrence) {
      state.occurrences[`${transaction.id}:${state.activeMonth}`] = materializeOccurrence(occurrence, {
        status: "paid",
        actualAmountCents: occurrence.amountThisMonthCents,
        effectiveDate: localDateKey(),
      });
    }
  });
  if (!await saveState()) {
    state = previousState;
    render();
    return;
  }
  render();
  showToast(`${toCopy.length} movimiento${toCopy.length === 1 ? "" : "s"} copiado${toCopy.length === 1 ? "" : "s"}`, {
    label: "Deshacer",
    handler: async () => {
      const before = cloneState(state);
      state = previousState;
      if (!await saveState()) {
        state = before;
        render();
        return;
      }
      render();
      showToast("Copia deshecha");
    },
  });
}

function focusGlobalSearch() {
  switchView("movements");
  render();
  requestAnimationFrame(() => {
    const input = dom.movementSearch;
    if (!input) return;
    input.focus();
    input.select?.();
  });
}

const QUICK_TEMPLATES = [
  { name: "Sueldo", kind: "income", category: "Sueldo" },
  { name: "Alquiler", kind: "expense", category: "Alquiler" },
  { name: "Expensas", kind: "expense", category: "Expensas" },
  { name: "Supermercado", kind: "expense", category: "Supermercado" },
  { name: "Transporte", kind: "expense", category: "Transporte" },
  { name: "Servicios", kind: "expense", category: "Servicios" },
];

function renderMovementTemplates() {
  let host = document.querySelector("#movementTemplates");
  if (!dom.movementForm) return;
  if (!host) {
    host = element("div", "movement-templates");
    host.id = "movementTemplates";
    const grid = dom.movementForm.querySelector(".form-grid");
    if (grid) grid.before(host);
    else dom.movementForm.prepend(host);
  }
  const isEdit = Boolean(sanitizeText(dom.movementForm.elements.id?.value));
  host.hidden = isEdit;
  if (isEdit) {
    host.replaceChildren();
    return;
  }
  host.replaceChildren(element("p", "movement-templates-label", "Plantillas rápidas"));
  const row = element("div", "movement-templates-row");
  QUICK_TEMPLATES.forEach((tpl) => {
    const chip = element("button", "template-chip", tpl.name);
    chip.type = "button";
    chip.addEventListener("click", () => {
      [...dom.movementForm.elements.kind].forEach((input) => {
        input.checked = input.value === tpl.kind;
      });
      dom.movementForm.elements.name.value = tpl.name;
      setSelectValue(dom.movementForm.elements.category, tpl.category);
      requestAnimationFrame(() => dom.movementForm.elements.amount?.focus?.());
    });
    row.append(chip);
  });
  host.append(row);
}

async function markCardCuotaPaid(chargeId) {
  const charge = state.cardCharges.find((item) => item.id === chargeId);
  if (!charge || charge.chargeType !== "installment") return;
  if (charge.paidInstallments >= charge.installments) return;
  const previousState = cloneState(state);
  charge.paidInstallments += 1;
  if (!await saveState()) {
    state = previousState;
    render();
    return;
  }
  render();
  showToast(charge.paidInstallments >= charge.installments ? "Plan saldado" : "Cuota marcada");
}

async function unmarkCardCuotaPaid(chargeId) {
  const charge = state.cardCharges.find((item) => item.id === chargeId);
  if (!charge || charge.chargeType !== "installment" || charge.paidInstallments <= 0) return;
  const previousState = cloneState(state);
  charge.paidInstallments -= 1;
  if (!await saveState()) {
    state = previousState;
    render();
    return;
  }
  render();
  showToast("Cuota desmarcada");
}

async function refreshUsdRate() {
  try {
    // Prefer blue sell as a household estimate; fallback to official.
    let rate = null;
    let label = "";
    let updated = "";
    try {
      const blue = await fetch("https://dolarapi.com/v1/dolares/blue", { cache: "no-store" });
      if (blue.ok) {
        const data = await blue.json();
        rate = Number(data.venta);
        label = "dólar blue (venta)";
        updated = data.fechaActualizacion
          ? new Date(data.fechaActualizacion).toLocaleString("es-AR")
          : new Date().toLocaleString("es-AR");
      }
    } catch {
      // try next source
    }
    if (!Number.isFinite(rate) || rate <= 0) {
      const official = await fetch("https://dolarapi.com/v1/dolares/oficial", { cache: "no-store" });
      if (!official.ok) throw new Error("sin cotización");
      const data = await official.json();
      rate = Number(data.venta);
      label = "dólar oficial (venta)";
      updated = data.fechaActualizacion
        ? new Date(data.fechaActualizacion).toLocaleString("es-AR")
        : new Date().toLocaleString("es-AR");
    }
    if (!Number.isFinite(rate) || rate <= 0) throw new Error("cotización inválida");
    const previousState = cloneState(state);
    state.fx.apiUsdArs = rate;
    state.fx.apiLabel = label;
    state.fx.apiUpdatedAt = updated;
    if (!state.fx.useManual) state.fx.usdArs = rate;
    if (!await saveState()) {
      state = previousState;
      render();
      return;
    }
    render();
    showToast(`Cotización actualizada: $ ${formatFxRate(rate)} (${label})`);
  } catch (error) {
    console.warn("No se pudo obtener el dólar.", error);
    showToast("No pudimos consultar el dólar. Podés cargar un valor manual.");
  }
}

async function applyManualFx() {
  if (!dom.fxRateInput) return;
  const rate = Number(String(dom.fxRateInput.value).replace(",", "."));
  if (!Number.isFinite(rate) || rate <= 0) {
    showToast("Ingresá un tipo de cambio válido");
    return;
  }
  const previousState = cloneState(state);
  state.fx.useManual = Boolean(dom.fxUseManual?.checked);
  state.fx.manualUsdArs = rate;
  state.fx.usdArs = rate;
  if (!await saveState()) {
    state = previousState;
    render();
    return;
  }
  render();
  showToast(state.fx.useManual ? "Tipo de cambio manual guardado" : "Valor guardado (activá “usar manual” para forzar)");
}

function countPlannedOutsideMonth(monthKey) {
  return (state.plannedItems || []).filter((item) => {
    if (item.recurrence === "monthly") {
      // Mensual que todavía no empezó este mes (empieza después).
      return monthDiff(item.monthKey, monthKey) < 0;
    }
    if (item.monthKey === monthKey) return false;
    return plannedStatusForMonth(item, item.monthKey) === "open";
  }).length;
}

function renderPlanned() {
  if (!dom.plannedList) return;
  if (!Array.isArray(state.plannedItems)) state.plannedItems = [];
  const typeFilter = dom.plannedTypeFilter?.value || "all";
  const statusFilter = dom.plannedStatusFilter?.value || "open";
  const monthKey = state.activeMonth;

  const rows = state.plannedItems
    .filter((item) => plannedAppliesToMonth(item, monthKey))
    .filter((item) => typeFilter === "all" || item.kind === typeFilter)
    .map((item) => ({ item, status: plannedStatusForMonth(item, monthKey) }))
    .filter(({ status }) => {
      if (statusFilter === "open") return status === "open";
      if (statusFilter === "done") return status === "fulfilled" || status === "dismissed";
      return true;
    })
    .sort((a, b) => {
      if (a.status !== b.status) {
        const order = { open: 0, fulfilled: 1, dismissed: 2 };
        return (order[a.status] ?? 9) - (order[b.status] ?? 9);
      }
      return (a.item.dueDay || 32) - (b.item.dueDay || 32)
        || a.item.name.localeCompare(b.item.name, "es");
    });

  const openItems = state.plannedItems
    .filter((item) => plannedAppliesToMonth(item, monthKey) && plannedStatusForMonth(item, monthKey) === "open");
  const incomeOpen = openItems.filter((item) => item.kind === "income")
    .reduce((sum, item) => sum + item.amountCents, 0);
  const expenseOpen = openItems.filter((item) => item.kind === "expense")
    .reduce((sum, item) => sum + item.amountCents, 0);
  const outsideCount = countPlannedOutsideMonth(monthKey);

  if (dom.plannedTotals) {
    dom.plannedTotals.replaceChildren();
    [
      ["Ingresos abiertos", incomeOpen, "income"],
      ["Gastos abiertos", expenseOpen, "expense"],
      ["Pendientes", openItems.length, "pending"],
    ].forEach(([label, value, tone]) => {
      const cell = element("div", "list-total");
      cell.dataset.tone = tone;
      cell.append(
        element("span", "", label),
        element("strong", "", typeof value === "number" && tone !== "pending"
          ? formatCurrency(value)
          : String(value)),
      );
      dom.plannedTotals.append(cell);
    });
  }

  dom.plannedList.replaceChildren();
  if (outsideCount > 0) {
    const note = element("p", "planned-other-months");
    note.append(
      document.createTextNode("Hay "),
      element("strong", "", String(outsideCount)),
      document.createTextNode(
        outsideCount === 1
          ? " previsto en otro mes (cambiá el mes arriba para verlo)."
          : " previstos en otros meses (cambiá el mes arriba para verlos).",
      ),
    );
    dom.plannedList.append(note);
  }
  if (!rows.length) {
    dom.plannedList.append(emptyState(
      statusFilter === "open" ? "Nada pendiente este mes" : "Sin previstos en este filtro",
      outsideCount > 0
        ? "En este mes no hay nada con el filtro actual. Revisá el aviso de otros meses o agregá un previsto."
        : "Agregá un previsto (sueldo, alquiler, cuota…) y confirmalo cuando se cumpla.",
      { label: "+ Agregar previsto", onClick: () => openPlannedDialog() },
    ));
    return;
  }

  rows.forEach(({ item, status }) => {
    const row = element("article", "movement-row planned-row");
    row.dataset.kind = item.kind;
    if (status !== "open") row.dataset.muted = "true";

    const body = element("div", "movement-body");
    const titleLine = element("div", "movement-title-line");
    titleLine.append(
      element("strong", "movement-name", item.name),
      element("span", "kind-badge", item.kind === "income" ? "Ingreso" : "Gasto"),
    );
    const statusLabel = status === "fulfilled"
      ? "Cumplido · ya en Movimientos"
      : status === "dismissed"
        ? "No se cumplió"
        : item.recurrence === "monthly"
          ? "Mensual · pendiente"
          : "Pendiente";
    const meta = element("p", "movement-meta", [
      item.category,
      item.person,
      item.dueDate ? formatIsoDateLabel(item.dueDate) : (item.dueDay ? `Día ${item.dueDay}` : ""),
      statusLabel,
    ].filter(Boolean).join(" · "));
    body.append(titleLine, meta);

    const amount = element("div", "movement-amount");
    amount.append(
      element("strong", "", `${item.kind === "income" ? "+" : "-"}${formatCurrency(item.amountCents)}`),
      element("small", "", "Esperado"),
    );

    const actions = element("div", "planned-row-actions");
    if (status === "open") {
      const confirmBtn = element("button", "primary-btn planned-mini-btn", "Confirmar");
      confirmBtn.type = "button";
      confirmBtn.addEventListener("click", () => openPlannedConfirm(item.id));
      actions.append(confirmBtn);
    }
    const editBtn = element("button", "row-menu", "Editar");
    editBtn.type = "button";
    editBtn.addEventListener("click", () => openPlannedDialog(item.id));
    actions.append(editBtn);

    row.append(body, amount, actions);
    dom.plannedList.append(row);
  });
}

function updatePlannedFormFields() {
  if (!dom.plannedForm) return;
  const monthly = dom.plannedForm.elements.recurrence?.value === "monthly";
  if (dom.plannedEndMonthField) dom.plannedEndMonthField.hidden = !monthly;
}

function openPlannedDialog(id = "") {
  if (!dom.plannedDialog || !dom.plannedForm) return;
  const item = id ? state.plannedItems.find((entry) => entry.id === id) : null;
  dom.plannedForm.reset();
  fillSelectOptions(dom.plannedForm.elements.category, state.categories, {
    preserve: false,
    extra: item?.category ? [item.category] : [],
  });
  fillSelectOptions(dom.plannedForm.elements.person, state.people.map((person) => person.name), {
    preserve: false,
    extra: item?.person ? [item.person] : [],
  });
  const prefs = loadFormPrefs();
  dom.plannedForm.elements.id.value = item?.id || "";
  dom.plannedForm.elements.kind.value = item?.kind || prefs.kind || "expense";
  dom.plannedForm.elements.name.value = item?.name || "";
  setSelectValue(dom.plannedForm.elements.category, item?.category || prefs.category || state.categories[0] || "Otros");
  setSelectValue(dom.plannedForm.elements.person, item?.person || prefs.person || state.people[0]?.name || "Compartido");
  dom.plannedForm.elements.amount.value = item ? fromCents(item.amountCents) : "";
  dom.plannedForm.elements.monthKey.value = item?.monthKey || state.activeMonth;
  dom.plannedForm.elements.recurrence.value = item?.recurrence || "once";
  dom.plannedForm.elements.endMonth.value = item?.endMonth || "";
  if (dom.plannedForm.elements.dueDate) {
    const fallbackDay = new Date().getDate();
    dom.plannedForm.elements.dueDate.value = item?.dueDate
      || (item?.dueDay ? clampDateToMonth(item.monthKey || state.activeMonth, item.dueDay) : "")
      || clampDateToMonth(state.activeMonth, fallbackDay)
      || `${state.activeMonth}-01`;
  }
  // monthKey ya no se edita a mano: se deriva de la fecha.
  if (dom.plannedForm.elements.monthKey) {
    dom.plannedForm.elements.monthKey.value = item?.monthKey || state.activeMonth;
  }
  dom.plannedForm.elements.note.value = item?.note || "";
  if (dom.plannedDialogTitle) {
    dom.plannedDialogTitle.textContent = item ? "Editar previsto" : "Nuevo previsto";
  }
  if (dom.deletePlannedBtn) dom.deletePlannedBtn.hidden = !item;
  updatePlannedFormFields();
  dom.plannedDialog.showModal();
  window.setTimeout(() => dom.plannedForm.elements.name.focus(), 40);
}

async function savePlannedItem(event) {
  event.preventDefault();
  if (!dom.plannedForm) return;
  const formData = new FormData(dom.plannedForm);
  const existingId = sanitizeText(formData.get("id"));
  const existing = existingId
    ? state.plannedItems.find((item) => item.id === existingId)
    : null;
  const dueDateRaw = sanitizeText(formData.get("dueDate"));
  if (!isValidIsoDate(dueDateRaw)) {
    showToast("Elegí una fecha válida del calendario");
    return;
  }
  // El mes del plan sale de la fecha (un solo control).
  const monthKeyFromDate = dueDateRaw.slice(0, 7);
  const item = normalizePlannedItem({
    id: existingId || createId(),
    kind: formData.get("kind"),
    name: formData.get("name"),
    category: formData.get("category"),
    person: formData.get("person"),
    amount: formData.get("amount"),
    monthKey: monthKeyFromDate,
    recurrence: formData.get("recurrence"),
    endMonth: formData.get("endMonth"),
    dueDate: dueDateRaw,
    note: formData.get("note"),
    createdAt: existing?.createdAt,
    fulfilledMonths: existing?.fulfilledMonths || [],
    dismissedMonths: existing?.dismissedMonths || [],
  });
  if (!item) {
    showToast("Revisá concepto, fecha y monto del previsto");
    return;
  }
  const previousState = cloneState(state);
  if (!Array.isArray(state.plannedItems)) state.plannedItems = [];
  const index = state.plannedItems.findIndex((entry) => entry.id === item.id);
  if (index >= 0) state.plannedItems[index] = item;
  else state.plannedItems.push(item);

  if (!state.people.some((person) => person.name.toLocaleLowerCase("es") === item.person.toLocaleLowerCase("es"))) {
    state.people.push({ id: createId(), name: item.person });
  }
  if (!state.categories.some((category) =>
    category.localeCompare(item.category, "es", { sensitivity: "base" }) === 0
  )) {
    state.categories.push(item.category);
    state.categories.sort((a, b) => a.localeCompare(b, "es"));
  }

  // Si el previsto es de otro mes, mostramos ese mes para que aparezca en la lista.
  if (item.monthKey && item.monthKey !== state.activeMonth) {
    state.activeMonth = item.monthKey;
  }

  if (!await saveState()) {
    state = previousState;
    render();
    return;
  }
  dom.plannedDialog.close();
  render();
  showToast(existingId ? "Previsto actualizado" : "Previsto agregado");
}

async function deletePlannedItem() {
  const id = sanitizeText(dom.plannedForm?.elements?.id?.value);
  if (!id) return;
  const confirmed = await confirmAction({
    title: "Eliminar previsto",
    copy: "Se borra el plan. Los movimientos ya incorporados no se tocan.",
    confirmLabel: "Eliminar",
    danger: true,
  });
  if (!confirmed) return;
  const previousState = cloneState(state);
  state.plannedItems = (state.plannedItems || []).filter((item) => item.id !== id);
  if (!await saveState()) {
    state = previousState;
    render();
    return;
  }
  dom.plannedDialog?.close();
  render();
  showToast("Previsto eliminado", {
    label: "Deshacer",
    handler: async () => {
      const before = cloneState(state);
      state = previousState;
      if (!await saveState()) {
        state = before;
        render();
        return;
      }
      render();
      showToast("Previsto restaurado");
    },
  });
}

/** Abre un alta nueva con los datos del movimiento que se está editando. */
function duplicateMovementFromDialog() {
  if (state.closedMonths[state.activeMonth]) {
    showToast("Reabrí el mes antes de duplicar");
    return;
  }
  const formData = new FormData(dom.movementForm);
  const draft = {
    kind: formData.get("kind") || "expense",
    name: sanitizeText(formData.get("name")),
    category: formData.get("category"),
    person: formData.get("person"),
    amount: formData.get("amount"),
    scheduleType: formData.get("scheduleType") || "one-time",
    startMonth: state.activeMonth,
    installments: formData.get("installments") || 2,
    endMonth: "",
    dueDate: formData.get("dueDate"),
    dueDay: formData.get("dueDay"),
    note: formData.get("note"),
  };
  closeMovementDialog();
  openMovementDialog();
  // Rellenar después de abrir limpio.
  const kind = draft.kind === "income" ? "income" : "expense";
  [...dom.movementForm.elements.kind].forEach((input) => {
    input.checked = input.value === kind;
  });
  if (draft.name) dom.movementForm.elements.name.value = draft.name;
  setSelectValue(dom.movementForm.elements.category, draft.category || state.categories[0] || "Otros");
  setSelectValue(dom.movementForm.elements.person, draft.person || state.people[0]?.name || "Compartido");
  if (draft.amount !== null && draft.amount !== undefined && draft.amount !== "") {
    dom.movementForm.elements.amount.value = draft.amount;
  }
  dom.movementForm.elements.startMonth.value = state.activeMonth;
  dom.movementForm.elements.scheduleType.value = draft.scheduleType;
  dom.movementForm.elements.installments.value = draft.installments;
  dom.movementForm.elements.endMonth.value = "";
  if (dom.movementForm.elements.dueDate) {
    dom.movementForm.elements.dueDate.value = draft.dueDate
      || (draft.dueDay ? clampDateToMonth(state.activeMonth, draft.dueDay) : "");
  } else if (dom.movementForm.elements.dueDay) {
    dom.movementForm.elements.dueDay.value = draft.dueDay || "";
  }
  dom.movementForm.elements.note.value = draft.note || "";
  dom.editScopeField.hidden = true;
  if (dom.duplicateMovementBtn) dom.duplicateMovementBtn.hidden = true;
  if (dom.deleteMovementBtn) dom.deleteMovementBtn.hidden = true;
  dom.movementDialogTitle.textContent = "Duplicar movimiento";
  updateScheduleFields();
  showToast("Revisá y guardá la copia (queda como movimiento nuevo)");
  requestAnimationFrame(() => dom.movementForm.elements.name?.focus?.());
}

function openPlannedConfirm(id) {
  const item = (state.plannedItems || []).find((entry) => entry.id === id);
  if (!item || !dom.plannedConfirmDialog || !dom.plannedConfirmForm) return;
  if (plannedStatusForMonth(item, state.activeMonth) !== "open") {
    showToast("Este previsto ya se resolvió para el mes");
    return;
  }
  dom.plannedConfirmForm.elements.id.value = item.id;
  dom.plannedConfirmForm.elements.amount.value = fromCents(item.amountCents);
  if (dom.plannedConfirmTitle) {
    dom.plannedConfirmTitle.textContent = item.kind === "income"
      ? `¿Se cobró «${item.name}»?`
      : `¿Se pagó «${item.name}»?`;
  }
  if (dom.plannedConfirmCopy) {
    dom.plannedConfirmCopy.textContent =
      `Monto esperado: ${formatCurrency(item.amountCents)}. Si cambió, editalo abajo y confirmá.`;
  }
  dom.plannedConfirmDialog.showModal();
  window.setTimeout(() => dom.plannedConfirmForm.elements.amount.focus(), 40);
}

async function confirmPlannedItem(event) {
  event.preventDefault();
  const formData = new FormData(dom.plannedConfirmForm);
  const id = sanitizeText(formData.get("id"));
  const amountCents = toCents(formData.get("amount"));
  const item = (state.plannedItems || []).find((entry) => entry.id === id);
  if (!item || amountCents <= 0) {
    showToast("Monto inválido");
    return;
  }
  if (plannedStatusForMonth(item, state.activeMonth) !== "open") {
    showToast("Este previsto ya se resolvió para el mes");
    return;
  }

  const previousState = cloneState(state);
  const transaction = normalizeTransaction({
    id: createId(),
    kind: item.kind,
    name: item.name,
    category: item.category,
    person: item.person,
    amountCents,
    scheduleType: "one-time",
    startMonth: state.activeMonth,
    dueDay: item.dueDay,
    note: item.note ? `Desde previsto · ${item.note}` : "Desde previsto",
  });
  if (!transaction) {
    showToast("No se pudo crear el movimiento");
    return;
  }
  state.transactions.push(transaction);
  const statusKey = `${transaction.id}:${state.activeMonth}`;
  const occurrence = occurrenceForMonth(transaction, state.activeMonth, {});
  if (occurrence) {
    state.occurrences[statusKey] = materializeOccurrence(occurrence, {
      status: "paid",
      actualAmountCents: amountCents,
      effectiveDate: localDateKey(),
    });
  }
  const planIndex = state.plannedItems.findIndex((entry) => entry.id === id);
  if (planIndex >= 0) {
    const next = { ...state.plannedItems[planIndex] };
    next.fulfilledMonths = [...new Set([...(next.fulfilledMonths || []), state.activeMonth])];
    next.dismissedMonths = (next.dismissedMonths || []).filter((month) => month !== state.activeMonth);
    // One-shot: remove after confirm. Monthly: keep for next months.
    if (next.recurrence === "once") {
      state.plannedItems.splice(planIndex, 1);
    } else {
      state.plannedItems[planIndex] = next;
    }
  }

  if (!await saveState()) {
    state = previousState;
    render();
    return;
  }
  dom.plannedConfirmDialog.close();
  render();
  showToast(
    item.kind === "income" ? "Ingreso incorporado a Movimientos" : "Gasto incorporado a Movimientos",
    {
      label: "Ver",
      handler: () => {
        switchView("movements");
        openMovementDialog(transaction.id, state.activeMonth);
      },
    },
  );
}

async function dismissPlannedItem() {
  const id = sanitizeText(dom.plannedConfirmForm?.elements?.id?.value);
  const item = (state.plannedItems || []).find((entry) => entry.id === id);
  if (!item) return;
  const confirmed = await confirmAction({
    title: "Marcar como no cumplido",
    copy: `«${item.name}» no se incorporará a Movimientos este mes.`,
    confirmLabel: "No se cumplió",
    danger: true,
  });
  if (!confirmed) return;
  const previousState = cloneState(state);
  const index = state.plannedItems.findIndex((entry) => entry.id === id);
  if (index < 0) return;
  const next = { ...state.plannedItems[index] };
  next.dismissedMonths = [...new Set([...(next.dismissedMonths || []), state.activeMonth])];
  next.fulfilledMonths = (next.fulfilledMonths || []).filter((month) => month !== state.activeMonth);
  if (next.recurrence === "once") {
    state.plannedItems.splice(index, 1);
  } else {
    state.plannedItems[index] = next;
  }
  if (!await saveState()) {
    state = previousState;
    render();
    return;
  }
  dom.plannedConfirmDialog?.close();
  render();
  showToast("Previsto marcado como no cumplido");
}

function render() {
  // Con el form de movimiento abierto no re-renderizar listas (evita lag y doble tipeo).
  if (dom.movementDialog?.open) {
    renderProfileChrome();
    renderEmergencyChrome();
    return;
  }
  dom.activeMonthInput.value = state.activeMonth;
  dom.activeMonthDisplay.textContent = formatMonthLabel(state.activeMonth).toLocaleLowerCase("es");
  dom.projectionMonthsSelect.value = String(state.settings.projectionMonths);
  if (dom.appVersion) {
    dom.appVersion.textContent = `${APP_CHANNEL} · v${APP_VERSION}${isSandboxProfile() ? " · prueba" : ""}`;
  }
  renderProfileChrome();
  renderEmergencyChrome();
  renderFormSelects();
  renderDashboard();
  renderMovements();
  renderPlanned();
  renderCards();
  renderProjection();
  renderSettings();
}

function switchView(view) {
  if (!["dashboard", "movements", "planned", "cards", "projection", "settings"].includes(view)) return;
  if (view !== "cards") selectedCardId = "";
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
  const scroller = document.querySelector("#contentScroll");
  if (scroller) scroller.scrollTop = 0;
  void saveState();
}

async function toggleOccurrenceStatus(item) {
  if (state.closedMonths[item.monthKey]) {
    showToast("Reabrí el mes antes de modificar un movimiento");
    return;
  }
  const previousState = cloneState(state);
  const markingPaid = item.status !== "paid";
  // Un clic: el monto del movimiento es el final. Sin segundo formulario de “importe real”.
  state.occurrences[item.statusKey] = materializeOccurrence(item, {
    status: markingPaid ? "paid" : "pending",
    actualAmountCents: markingPaid ? item.amountThisMonthCents : null,
    effectiveDate: markingPaid ? localDateKey() : "",
  });
  if (!await saveState()) {
    state = previousState;
    render();
    return;
  }
  render();
  if (markingPaid) {
    showToast(item.kind === "income" ? "Marcado como cobrado" : "Marcado como pagado");
  } else {
    showToast("Marcado como pendiente");
  }
}

async function saveSettlement(event) {
  // Compat: el diálogo de “importe real” ya no se usa; redirige al toggle simple.
  event.preventDefault();
  if (dom.settlementDialog?.open) dom.settlementDialog.close();
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
    const editingId = sanitizeText(dom.movementForm.elements.id?.value);
    const futureEdit = Boolean(editingId) && dom.movementForm.elements.editScope.value === "future";
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

/** Prefer the month occurrence override when present so the form matches the list. */
function buildEditSource(transaction, record, monthKey) {
  if (!transaction && !record) return null;
  if (!transaction) {
    return {
      id: record.transactionId,
      kind: record.kind,
      name: record.name,
      category: record.category,
      person: record.person,
      amountCents: Number.isSafeInteger(record.seriesAmountCents)
        ? record.seriesAmountCents
        : record.plannedAmountCents,
      schedule: {
        type: record.scheduleType || "one-time",
        startMonth: record.monthKey || monthKey,
        endMonth: "",
        installments: record.installments || 1,
      },
      dueDay: record.dueDay,
      note: record.note,
    };
  }
  if (!record || record.status === "skipped") return transaction;

  const isInstallment = transaction.schedule.type === "installment";
  return {
    ...transaction,
    kind: record.kind === "income" || record.kind === "expense" ? record.kind : transaction.kind,
    name: sanitizeText(record.name, transaction.name),
    category: sanitizeText(record.category, transaction.category),
    person: sanitizeText(record.person, transaction.person),
    amountCents: isInstallment
      ? (Number.isSafeInteger(record.seriesAmountCents) ? record.seriesAmountCents : transaction.amountCents)
      : (Number.isSafeInteger(record.plannedAmountCents) ? record.plannedAmountCents : transaction.amountCents),
    dueDay: Number.isInteger(record.dueDay) ? record.dueDay : transaction.dueDay,
    note: record.note == null ? transaction.note : sanitizeText(record.note),
  };
}

function openMovementDialog(transactionId = "", monthKey = state.activeMonth) {
  if (state.closedMonths[monthKey]) {
    showToast("Reabrí el mes antes de modificar movimientos");
    return;
  }
  const transaction = state.transactions.find((item) => item.id === transactionId);
  const occurrenceKey = transactionId ? `${transactionId}:${monthKey}` : "";
  const record = occurrenceKey ? state.occurrences[occurrenceKey] : null;
  const source = buildEditSource(transaction, record, monthKey);
  const lastPrefs = loadFormPrefs();

  // Abrir ya: el paint del modal no espera a reconstruir listas.
  if (!dom.movementDialog.open) dom.movementDialog.showModal();

  // No usar form.reset(): vacía y reescribe todo el DOM de inputs y pelea con el tipeo.
  const categoryExtra = source?.category ? [source.category] : [];
  const personExtra = source?.person ? [source.person] : [];
  fillSelectOptions(dom.movementForm.elements.category, state.categories, {
    preserve: true,
    extra: categoryExtra,
  });
  fillSelectOptions(
    dom.movementForm.elements.person,
    state.people.map((person) => person.name),
    { preserve: true, extra: personExtra },
  );

  dom.movementForm.elements.id.value = source?.id || "";
  dom.movementForm.elements.occurrenceKey.value = source ? occurrenceKey : "";
  const kind = source?.kind || lastPrefs.kind || "expense";
  [...dom.movementForm.elements.kind].forEach((input) => {
    input.checked = input.value === kind;
  });
  // Asignar campos en un solo bloque; focus al final.
  const nameInput = dom.movementForm.elements.name;
  nameInput.value = source?.name || "";
  setSelectValue(
    dom.movementForm.elements.category,
    source?.category || lastPrefs.category || state.categories[0] || "Otros",
  );
  setSelectValue(
    dom.movementForm.elements.person,
    source?.person || lastPrefs.person || state.people[0]?.name || "Compartido",
  );
  dom.movementForm.elements.amount.value = source ? fromCents(source.amountCents) : "";
  dom.movementForm.elements.startMonth.value = source?.schedule.startMonth || state.activeMonth;
  dom.movementForm.elements.scheduleType.value = source?.schedule.type
    || (!source ? lastPrefs.scheduleType : null)
    || "one-time";
  dom.movementForm.elements.installments.value = source?.schedule.installments || 2;
  dom.movementForm.elements.endMonth.value = source?.schedule.endMonth || "";
  if (dom.movementForm.elements.dueDate) {
    const start = source?.schedule?.startMonth || state.activeMonth;
    dom.movementForm.elements.dueDate.value = source?.dueDate
      || (source?.dueDay ? clampDateToMonth(start, source.dueDay) : "");
  } else if (dom.movementForm.elements.dueDay) {
    dom.movementForm.elements.dueDay.value = source?.dueDay || "";
  }
  dom.movementForm.elements.note.value = source?.note || "";
  const scheduleType = source?.schedule?.type || transaction?.schedule?.type || "one-time";
  const recurring = Boolean(transaction) && scheduleType !== "one-time";
  dom.editScopeField.hidden = !recurring;
  dom.movementForm.elements.editScope.value = "all";
  dom.movementDialogTitle.textContent = source ? "Editar movimiento" : "Agregar movimiento";
  dom.deleteMovementBtn.hidden = !source;
  if (dom.duplicateMovementBtn) dom.duplicateMovementBtn.hidden = !source;
  updateScheduleFields();
  renderMovementTemplates();
  // requestAnimationFrame: un frame después del showModal, sin setTimeout de 40ms.
  requestAnimationFrame(() => {
    if (!dom.movementDialog?.open) return;
    nameInput?.focus?.();
    if (!source) nameInput?.select?.();
  });
}

function closeMovementDialog() {
  dom.movementDialog.close();
}

const FORM_PREFS_KEY = "ilara-form-prefs-v1";

function loadFormPrefs() {
  try {
    const raw = localStorage.getItem(FORM_PREFS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveFormPrefs(partial) {
  try {
    const next = { ...loadFormPrefs(), ...partial };
    localStorage.setItem(FORM_PREFS_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / private mode */
  }
}

/** Diálogos de formulario: no se cierran con clic afuera ni Escape (solo × / Cancelar / Guardar). */
function lockDialogDismiss(dialog) {
  if (!dialog || dialog.dataset.dismissLocked === "1") return;
  dialog.dataset.dismissLocked = "1";
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
  });
}

function applyOccurrenceEdit(occurrenceKey, transaction, existingSeries, monthKey = state.activeMonth) {
  const originalOccurrence = getMonthTotals(monthKey).occurrences
    .find((item) => item.statusKey === occurrenceKey) ||
    (existingSeries
      ? occurrenceForMonth(existingSeries, monthKey, state.occurrences)
      : null);
  const editedOccurrence = occurrenceForEditedTransaction(transaction, monthKey, originalOccurrence);
  if (!editedOccurrence) return false;
  const previousRecord = state.occurrences[occurrenceKey];
  const key = occurrenceKey || `${transaction.id}:${monthKey}`;
  state.occurrences[key] = materializeOccurrence(editedOccurrence, {
    status: previousRecord?.status || originalOccurrence?.status || "pending",
    actualAmountCents: previousRecord?.actualAmountCents ?? originalOccurrence?.actualAmountCents ?? null,
    effectiveDate: previousRecord?.effectiveDate || originalOccurrence?.effectiveDate || "",
    kind: transaction.kind,
    name: transaction.name,
    category: transaction.category,
    person: transaction.person,
    note: transaction.note,
    dueDay: transaction.dueDay,
    plannedAmountCents: editedOccurrence.amountThisMonthCents,
    seriesAmountCents: transaction.amountCents,
    scheduleType: transaction.schedule.type,
  });
  return true;
}

/** Borra ocurrencias de una serie desde un mes (inclusive), para no dejar huérfanas duplicadas. */
function clearSeriesOccurrencesFromMonth(transactionId, fromMonth) {
  Object.entries(state.occurrences || {}).forEach(([key, record]) => {
    if (record.transactionId !== transactionId) return;
    if (fromMonth && monthDiff(fromMonth, record.monthKey) < 0) return;
    delete state.occurrences[key];
  });
}

async function saveMovement(event) {
  event.preventDefault();
  const formData = new FormData(dom.movementForm);
  if (!validateScheduleRange({ report: true })) return;
  const existingId = sanitizeText(formData.get("id"));
  const existingSeries = existingId
    ? state.transactions.find((item) => item.id === existingId)
    : null;
  const transaction = normalizeTransaction({
    id: existingSeries?.id || existingId || createId(),
    kind: formData.get("kind"),
    name: formData.get("name"),
    category: formData.get("category"),
    person: formData.get("person"),
    amount: formData.get("amount"),
    scheduleType: formData.get("scheduleType"),
    startMonth: formData.get("startMonth"),
    installments: formData.get("installments"),
    endMonth: formData.get("endMonth"),
    dueDate: formData.get("dueDate"),
    dueDay: formData.get("dueDay"),
    note: formData.get("note"),
    createdAt: existingSeries?.createdAt,
  });
  if (!transaction) return;
  // Nunca cambiar el id al editar: si no, se crea otra fila.
  if (existingSeries) transaction.id = existingSeries.id;

  const previousState = cloneState(state);
  const index = state.transactions.findIndex((item) => item.id === transaction.id);
  const occurrenceKey = sanitizeText(formData.get("occurrenceKey"))
    || (existingSeries ? `${existingSeries.id}:${state.activeMonth}` : "");
  // one-time = siempre la serie completa. Default al editar = all (actualizar, no duplicar).
  let scope = sanitizeText(formData.get("editScope"), "all");
  if (existingSeries?.schedule.type === "one-time") scope = "all";
  if (!existingSeries) scope = "create";

  if (existingSeries && scope === "current") {
    if (!applyOccurrenceEdit(occurrenceKey, transaction, existingSeries, state.activeMonth)) {
      state = previousState;
      showToast("El movimiento no corresponde al mes activo");
      return;
    }
  } else if (existingSeries && scope === "future") {
    const prevMonth = addMonths(state.activeMonth, -1);
    const hasPastMonths = monthDiff(existingSeries.schedule.startMonth, state.activeMonth) > 0;
    if (hasPastMonths) {
      // Congelar meses anteriores con la serie vieja; desde este mes, serie nueva (mismo concepto).
      materializeSeriesThrough(existingSeries, prevMonth);
      preserveProtectedOccurrences(existingSeries);
      clearSeriesOccurrencesFromMonth(existingSeries.id, state.activeMonth);
      if (existingSeries.schedule.type === "monthly") {
        state.transactions[index] = {
          ...existingSeries,
          schedule: {
            ...existingSeries.schedule,
            endMonth: prevMonth,
          },
        };
      } else {
        // Cuotas: dejamos el pasado materializado y sacamos la serie vieja del listado activo.
        state.transactions.splice(index, 1);
      }
      const nextSeries = {
        ...transaction,
        id: createId(),
        schedule: {
          ...transaction.schedule,
          startMonth: state.activeMonth,
        },
        createdAt: new Date().toISOString(),
      };
      state.transactions.push(nextSeries);
    } else {
      // Sin pasado que preservar: es una edición normal de la misma fila.
      state.transactions[index] = transaction;
      clearUnprotectedOccurrenceRecords(transaction.id);
      preserveProtectedOccurrences(transaction);
      syncOccurrenceLabelsFromSeries(transaction);
      applyOccurrenceEdit(`${transaction.id}:${state.activeMonth}`, transaction, transaction, state.activeMonth);
    }
  } else if (existingSeries) {
    // Toda la serie / caso normal de editar: actualizar la misma fila.
    state.transactions[index] = transaction;
    clearUnprotectedOccurrenceRecords(transaction.id);
    preserveProtectedOccurrences(transaction);
    syncOccurrenceLabelsFromSeries(transaction);
    // Asegurar que el mes activo refleje el form (aunque no hubiera registro previo).
    applyOccurrenceEdit(`${transaction.id}:${state.activeMonth}`, transaction, transaction, state.activeMonth);
  } else if (occurrenceKey && state.occurrences[occurrenceKey]) {
    if (!applyOccurrenceEdit(occurrenceKey, transaction, null, state.activeMonth)) {
      state = previousState;
      showToast("El movimiento no corresponde al mes activo");
      return;
    }
  } else {
    // Alta nueva (sin id de serie): queda cobrado/pagado de una (si no se cumplió → Previstos).
    state.transactions.push(transaction);
    const paidMonth = isValidMonthKey(transaction.schedule?.startMonth)
      ? transaction.schedule.startMonth
      : state.activeMonth;
    const occurrence = occurrenceForMonth(transaction, paidMonth, {});
    if (occurrence) {
      state.occurrences[`${transaction.id}:${paidMonth}`] = materializeOccurrence(occurrence, {
        status: "paid",
        actualAmountCents: occurrence.amountThisMonthCents,
        effectiveDate: localDateKey(),
      });
    }
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
  saveFormPrefs({
    category: transaction.category,
    person: transaction.person,
    scheduleType: transaction.schedule?.type || "one-time",
    kind: transaction.kind,
  });
  closeMovementDialog();
  render();
  showToast(
    existingId
      ? "Movimiento actualizado"
      : (transaction.kind === "income" ? "Ingreso cargado y cobrado" : "Gasto cargado y pagado"),
  );
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
    if (!occurrence) {
      showToast("No hay movimiento para excluir en este mes");
      openMovementDialog(id, state.activeMonth);
      return;
    }
    if (occurrence.status === "paid") {
      showToast("Desmarcá el pago o cobro antes de excluir este mes");
      openMovementDialog(id, state.activeMonth);
      return;
    }
    state.occurrences[occurrence.statusKey] = materializeOccurrence(occurrence, {
      status: "skipped",
      actualAmountCents: null,
      effectiveDate: "",
    });
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
  const nameInUse = (value) =>
    String(value || "").localeCompare(person.name, "es", { sensitivity: "base" }) === 0;
  if (
    state.transactions.some((transaction) => nameInUse(transaction.person)) ||
    Object.values(state.occurrences).some((record) => nameInUse(record.person))
  ) {
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
      : "El mes quedará cerrado. Podrás reabrirlo cuando lo necesites.",
    details: isClosed ? [] : [
      `${totals.occurrences.length} movimientos`,
      `${totals.occurrences.filter((item) => item.status === "pending").length} pendientes`,
      `Resultado del mes: ${formatCurrency(totals.balanceCents)}`,
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
  if (isClosed) {
    showToast("Mes reabierto");
  } else {
    // Respaldo local automático al cerrar (descarga JSON).
    try {
      downloadBackup(state, `cierre-${state.activeMonth}`);
    } catch (error) {
      console.warn("No se pudo descargar el respaldo de cierre.", error);
    }
    showToast("Mes cerrado · se descargó un respaldo JSON");
  }
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
    "Mes", "Tipo", "Concepto", "Categoría", "Persona", "Monto",
    "Estado", "Fecha", "Día estimado", "Modalidad", "Cuota", "Nota",
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

function openMonthPicker() {
  const input = dom.activeMonthInput;
  if (!input) return;
  input.value = state.activeMonth;
  try {
    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }
  } catch {
    // Some hosts reject showPicker outside a direct gesture or if unsupported.
  }
  input.focus({ preventScroll: true });
  input.click();
}

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
dom.monthPickerBtn.addEventListener("click", openMonthPicker);
dom.activeMonthInput.addEventListener("change", (event) => {
  if (!isValidMonthKey(event.target.value)) return;
  if (event.target.value === state.activeMonth) return;
  state.activeMonth = event.target.value;
  render();
  void saveState();
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
// Duplicar se cablea arriba con optional chaining (puede no existir en HTML viejo).
// Clic en el fondo del diálogo: no cierra (evita perder el form al arrastrar/seleccionar).
lockDialogDismiss(dom.movementDialog);
lockDialogDismiss(dom.settlementDialog);
lockDialogDismiss(dom.cardDialog);
lockDialogDismiss(dom.chargeDialog);
lockDialogDismiss(dom.purchaseDialog);
lockDialogDismiss(dom.plannedDialog);
lockDialogDismiss(dom.plannedConfirmDialog);
lockDialogDismiss(dom.confirmationDialog);
dom.settlementForm.addEventListener("submit", saveSettlement);
document.querySelectorAll("[data-close-settlement]").forEach((button) =>
  button.addEventListener("click", () => dom.settlementDialog.close()),
);
dom.monthCloseBtn.addEventListener("click", toggleMonthClosed);

// Ctrl/Cmd+Enter guarda el formulario de movimiento abierto.
dom.movementDialog?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || !(event.ctrlKey || event.metaKey)) return;
  event.preventDefault();
  if (typeof dom.movementForm?.requestSubmit === "function") dom.movementForm.requestSubmit();
  else dom.movementForm?.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
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
wireDriveUi();

dom.profileHogarBtn?.addEventListener("click", () => void switchDataProfile("hogar"));
dom.profilePruebaBtn?.addEventListener("click", () => void switchDataProfile("prueba"));
dom.profileSwitchToHogarBtn?.addEventListener("click", () => void switchDataProfile("hogar"));
dom.profileResetPruebaBtn?.addEventListener("click", () => void handleResetSandboxProfile());

dom.emergencyApplyBtn?.addEventListener("click", () => void applyEmergencyToSqlite());
dom.emergencyExportBtn?.addEventListener("click", () => exportEmergencyCopy());
dom.emergencyDiscardBtn?.addEventListener("click", () => void discardEmergencyCopy());
dom.emergencyBannerSettingsBtn?.addEventListener("click", () => switchView("settings"));
dom.duplicateMovementBtn?.addEventListener("click", () => duplicateMovementFromDialog());
dom.copyPrevMonthBtn?.addEventListener("click", () => void copyFromPreviousMonth());

dom.addPlannedBtn?.addEventListener("click", () => openPlannedDialog());
dom.plannedTypeFilter?.addEventListener("change", () => renderPlanned());
dom.plannedStatusFilter?.addEventListener("change", () => renderPlanned());
dom.plannedForm?.addEventListener("submit", (event) => void savePlannedItem(event));
dom.plannedForm?.elements?.recurrence?.addEventListener("change", updatePlannedFormFields);
dom.deletePlannedBtn?.addEventListener("click", () => void deletePlannedItem());
dom.plannedConfirmForm?.addEventListener("submit", (event) => void confirmPlannedItem(event));
dom.plannedConfirmEditBtn?.addEventListener("click", () => {
  const id = sanitizeText(dom.plannedConfirmForm?.elements?.id?.value);
  dom.plannedConfirmDialog?.close();
  if (id) openPlannedDialog(id);
});
dom.plannedConfirmDismissBtn?.addEventListener("click", () => void dismissPlannedItem());
document.querySelectorAll("[data-close-planned-dialog]").forEach((button) =>
  button.addEventListener("click", () => dom.plannedDialog?.close()),
);
document.querySelectorAll("[data-close-planned-confirm]").forEach((button) =>
  button.addEventListener("click", () => dom.plannedConfirmDialog?.close()),
);

dom.addCardBtn?.addEventListener("click", openCardDialog);
dom.cardForm?.addEventListener("submit", saveCreditCard);
dom.chargeForm?.addEventListener("submit", saveCardCharge);
dom.purchaseForm?.addEventListener("submit", saveCardPurchase);
dom.dashboardCardPurchaseBtn?.addEventListener("click", () => openPurchaseDialog());
dom.dashboardCardPurchaseBtnTop?.addEventListener("click", () => openPurchaseDialog());
dom.cardsBackBtn?.addEventListener("click", () => {
  selectedCardId = "";
  renderCards();
});
["amountMode", "totalAmount", "cuotaAmount", "installments", "currency"].forEach((name) => {
  dom.chargeForm?.elements?.[name]?.addEventListener("input", () => {
    if (name === "amountMode") updateChargeAmountModeUI();
    else updateChargeAmountHint();
  });
  dom.chargeForm?.elements?.[name]?.addEventListener("change", () => {
    if (name === "amountMode") updateChargeAmountModeUI();
    else updateChargeAmountHint();
  });
});
document.querySelectorAll("[data-close-card-dialog]").forEach((button) =>
  button.addEventListener("click", () => dom.cardDialog?.close()),
);
document.querySelectorAll("[data-close-charge-dialog]").forEach((button) =>
  button.addEventListener("click", () => dom.chargeDialog?.close()),
);
document.querySelectorAll("[data-close-purchase-dialog]").forEach((button) =>
  button.addEventListener("click", () => dom.purchaseDialog?.close()),
);
dom.fxRefreshBtn?.addEventListener("click", () => void refreshUsdRate());
dom.fxSaveBtn?.addEventListener("click", () => void applyManualFx());

dom.fxUseManual?.addEventListener("change", () => {
  state.fx.useManual = Boolean(dom.fxUseManual.checked);
  if (state.fx.useManual) {
    const rate = Number(String(dom.fxRateInput?.value || "").replace(",", "."));
    if (Number.isFinite(rate) && rate > 0) {
      state.fx.manualUsdArs = rate;
      state.fx.usdArs = rate;
    }
  } else if (state.fx.apiUsdArs) {
    state.fx.usdArs = state.fx.apiUsdArs;
  }
  void saveState().then(() => render());
});

function isEditableTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function handleMenuCommand(command) {
  switch (command) {
    case "new_movement":
      openMovementDialog();
      break;
    case "import_data":
      dom.importFileInput.click();
      break;
    case "export_data":
      exportData();
      break;
    case "export_csv":
      exportCsv();
      break;
    case "view_dashboard":
      switchView("dashboard");
      break;
    case "view_movements":
      switchView("movements");
      break;
    case "view_planned":
      switchView("planned");
      break;
    case "view_cards":
      switchView("cards");
      break;
    case "view_projection":
      switchView("projection");
      break;
    case "view_settings":
      switchView("settings");
      break;
    case "month_prev":
      state.activeMonth = addMonths(state.activeMonth, -1);
      render();
      void saveState();
      break;
    case "month_next":
      state.activeMonth = addMonths(state.activeMonth, 1);
      render();
      void saveState();
      break;
    case "month_pick":
      openMonthPicker();
      break;
    case "about":
      showToast(`Ilara Finanzas ${APP_CHANNEL} · v${APP_VERSION} · datos locales`);
      break;
    default:
      break;
  }
}

async function wireDesktopShell() {
  window.addEventListener("keydown", (event) => {
    const mod = event.ctrlKey || event.metaKey;
    // Ctrl/Cmd+K: buscar en Movimientos (funciona aunque estés en un input de la app).
    if (mod && event.key.toLowerCase() === "k") {
      if (dom.movementDialog?.open || dom.plannedDialog?.open || dom.confirmationDialog?.open) return;
      event.preventDefault();
      focusGlobalSearch();
      return;
    }
    if (isEditableTarget(event.target)) return;
    // Escape no cierra formularios (mismo criterio: solo × / Cancelar).
    if (event.key === "Escape") {
      if (
        dom.movementDialog?.open
        || dom.settlementDialog?.open
        || dom.purchaseDialog?.open
        || dom.cardDialog?.open
        || dom.chargeDialog?.open
        || dom.plannedDialog?.open
        || dom.plannedConfirmDialog?.open
        || dom.confirmationDialog?.open
      ) {
        event.preventDefault();
      }
      return;
    }
    if (!mod) return;
    const key = event.key.toLowerCase();
    if (key === "n") {
      event.preventDefault();
      handleMenuCommand("new_movement");
    } else if (key === "o") {
      event.preventDefault();
      handleMenuCommand("import_data");
    } else if (key === "s" && !event.shiftKey) {
      event.preventDefault();
      handleMenuCommand("export_data");
    } else if (key === "e" && event.shiftKey) {
      event.preventDefault();
      handleMenuCommand("export_csv");
    } else if (key === "m") {
      event.preventDefault();
      handleMenuCommand("month_pick");
    } else if (key === "1") {
      event.preventDefault();
      handleMenuCommand("view_dashboard");
    } else if (key === "2") {
      event.preventDefault();
      handleMenuCommand("view_movements");
    } else if (key === "3") {
      event.preventDefault();
      handleMenuCommand("view_planned");
    } else if (key === "4") {
      event.preventDefault();
      handleMenuCommand("view_cards");
    } else if (key === "5") {
      event.preventDefault();
      handleMenuCommand("view_projection");
    } else if (key === "6") {
      event.preventDefault();
      handleMenuCommand("view_settings");
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      handleMenuCommand("month_prev");
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      handleMenuCommand("month_next");
    }
  });

  try {
    const { listen } = await import("@tauri-apps/api/event");
    await listen("ilara-menu", (event) => {
      handleMenuCommand(String(event.payload || ""));
    });
  } catch {
    // Running outside Tauri (plain Vite) — keyboard shortcuts still work.
  }
}

async function initializeApp() {
  await refreshDataProfile();
  state = await loadState();
  const initialView = window.location.hash.slice(1);
  if (["dashboard", "movements", "planned", "cards", "projection", "settings"].includes(initialView)) {
    state.activeView = initialView;
  }
  switchView(state.activeView);
  render();
  await wireDesktopShell();
  if (initializationWarning) showToast(initializationWarning);
  // Cotización estimativa al abrir (no bloquea la UI).
  void refreshUsdRate();
  // Google Drive: estado + pull automático si hay copia más nueva.
  await refreshDriveStatus();
  if (driveStatus?.connected && driveStatus?.autoSync) {
    void runDrivePull({ force: false, interactive: false }).then(() => {
      if (driveStatus?.localDirty) scheduleDrivePush();
    });
  }
}

await initializeApp();
