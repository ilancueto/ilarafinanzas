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
  buildCardProjection as calculateCardProjection,
  cardCuotaCents as cardCuotaCentsCore,
  cardNextCuotaCents as cardNextCuotaCentsCore,
  cardRemainingCents as cardRemainingCentsCore,
  cardRemainingInstallments as cardRemainingInstallmentsCore,
  chargeAmountArsForLimit as chargeAmountArsForLimitCore,
  creditCardsCuentaCorriente as creditCardsCuentaCorrienteCore,
  creditCardsForTotals as creditCardsForTotalsCore,
  getAllCardsMonthLoad as getAllCardsMonthLoadCore,
  getCardMonthLoad as getCardMonthLoadCore,
  getCuentaCorrienteMonthLoad as getCuentaCorrienteMonthLoadCore,
  isCuentaCorrienteCard as isCuentaCorrienteCardCore,
  nameLooksLikeCcMara as nameLooksLikeCcMaraCore,
  nameLooksLikeCuentaCorriente as nameLooksLikeCuentaCorrienteCore,
  resolveFxRate,
  statementMonthKeyForPurchase as statementMonthKeyForPurchaseCore,
  toArsCents as toArsCentsCore,
  wouldExceedCardLimit as wouldExceedCardLimitCore,
} from "./cards-core.js";
import {
  plannedAppliesToMonth as plannedAppliesToMonthCore,
  plannedStatusForMonth as plannedStatusForMonthCore,
} from "./planned-core.js";
import { createCardsUi } from "./cards-ui.js";
import { createPlannedUi } from "./planned-ui.js";
import { createProjectionUi } from "./projection-ui.js";
import { createHomeUi } from "./home-ui.js";
import { createMovementsUi } from "./movements-ui.js";
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
  openExternalUrl,
  downloadAppSetup,
  launchAppSetupAndQuit,
  saveStoredState,
  setDataProfile,
} from "./src/storage.ts";

const APP_VERSION = "3.9.9.15";
const APP_CHANNEL = "Estable";
/** Repo público de Releases (instalador Setup). */
const GITHUB_REPO = "ilancueto/ilarafinanzas";
const GITHUB_RELEASES_URL = `https://github.com/${GITHUB_REPO}/releases`;
const GITHUB_LATEST_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
const DRIVE_PUSH_DEBOUNCE_MS = 12_000;
const STORAGE_KEY = "ilara-finanzas-v3";
const EMERGENCY_STORAGE_KEY_BASE = "ilara-finanzas-v3-emergency";
const BACKUP_FORMAT = "ilara-finanzas-backup";
const BACKUP_VERSION = 1;
const BACKUP_HISTORY_KEY_BASE = "ilara-backup-history-v1";
const BACKUP_HISTORY_MAX = 12;
const BACKUP_HISTORY_KEEP_CONTENT = 3;
const VIEW_FILTERS_KEY = "ilara-view-filters-v1";
const UPDATE_DISMISS_KEY = "ilara-update-dismissed-v1";
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
  personBreakdown: document.querySelector("#personBreakdown"),
  personBreakdownPanel: document.querySelector("#personBreakdownPanel"),
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
  exportMonthCsvBtn: document.querySelector("#exportMonthCsvBtn"),
  copyPrevMonthBtn: document.querySelector("#copyPrevMonthBtn"),
  backupHistoryList: document.querySelector("#backupHistoryList"),
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
  updateBanner: document.querySelector("#updateBanner"),
  updateBannerCopy: document.querySelector("#updateBannerCopy"),
  updateBannerInstallBtn: document.querySelector("#updateBannerInstallBtn"),
  updateBannerLaterBtn: document.querySelector("#updateBannerLaterBtn"),
  installUpdateBtn: document.querySelector("#installUpdateBtn"),
  downloadUpdateBtn: document.querySelector("#downloadUpdateBtn"),
  openUpdateBrowserBtn: document.querySelector("#openUpdateBrowserBtn"),
  projectionIncludeCards: document.querySelector("#projectionIncludeCards"),
  projectionIncomeCut: document.querySelector("#projectionIncomeCut"),
  emergencyPanel: document.querySelector("#emergencyPanel"),
  emergencyStatusCopy: document.querySelector("#emergencyStatusCopy"),
  emergencyApplyBtn: document.querySelector("#emergencyApplyBtn"),
  emergencyExportBtn: document.querySelector("#emergencyExportBtn"),
  emergencyDiscardBtn: document.querySelector("#emergencyDiscardBtn"),
  duplicateMovementBtn: document.querySelector("#duplicateMovementBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  importBtn: document.querySelector("#importBtn"),
  importFileInput: document.querySelector("#importFileInput"),
  checkUpdatesBtn: document.querySelector("#checkUpdatesBtn"),
  openReleasesBtn: document.querySelector("#openReleasesBtn"),
  updateStatusText: document.querySelector("#updateStatusText"),
  driveSetupBlock: document.querySelector("#driveSetupBlock"),
  driveClientId: document.querySelector("#driveClientId"),
  driveClientSecret: document.querySelector("#driveClientSecret"),
  driveSaveCredsBtn: document.querySelector("#driveSaveCredsBtn"),
  driveStatusText: document.querySelector("#driveStatusText"),
  driveAutoSyncToggle: document.querySelector("#driveAutoSyncToggle"),
  driveConnectBtn: document.querySelector("#driveConnectBtn"),
  driveSyncNowBtn: document.querySelector("#driveSyncNowBtn"),
  drivePushBtn: document.querySelector("#drivePushBtn"),
  drivePullBtn: document.querySelector("#drivePullBtn"),
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
/** Dashboard: desglose de categorías expandido (top 5 vs todas). */
let categoryBreakdownExpanded = false;
/** Ajustes: lista de chips de categorías colapsada. */
let settingsCategoriesExpanded = false;
const SETTINGS_CATEGORIES_PREVIEW = 12;

function emergencyStorageKey() {
  const profileId = dataProfile?.id || "hogar";
  return `${EMERGENCY_STORAGE_KEY_BASE}:${profileId}`;
}

function isSandboxProfile() {
  return Boolean(dataProfile?.isSandbox);
}

function isMonthClosed(monthKey = state.activeMonth) {
  return Boolean(monthKey && state.closedMonths[monthKey]);
}

/** @returns {true} si el mes está abierto y se puede modificar */
function requireOpenMonth(monthKey = state.activeMonth, message = "Reabrí el mes antes de modificar") {
  if (!isMonthClosed(monthKey)) return true;
  showToast(message);
  return false;
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
  return resolveFxRate(fx);
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

/** Heurística de nombre: CC / cuenta corriente (ej. “CC Mara”, “Cta cte”). */
function nameLooksLikeCuentaCorriente(name) {
  return nameLooksLikeCuentaCorrienteCore(name);
}

function nameLooksLikeCcMara(name) {
  return nameLooksLikeCcMaraCore(name);
}

function isCuentaCorrienteCard(card) {
  return isCuentaCorrienteCardCore(card);
}

function creditCardsForTotals() {
  return creditCardsForTotalsCore(state.creditCards);
}

function creditCardsCuentaCorriente() {
  return creditCardsCuentaCorrienteCore(state.creditCards);
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
  // Flag explícito gana; si no viene, auto-detecta CC / cuenta corriente.
  const excludeFromCardTotals = typeof card?.excludeFromCardTotals === "boolean"
    ? card.excludeFromCardTotals
    : nameLooksLikeCuentaCorriente(name);
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
  return statementMonthKeyForPurchaseCore(card, refDate);
}

function chargeAmountArsForLimit(charge) {
  return chargeAmountArsForLimitCore(charge, state.fx);
}

function wouldExceedCardLimit(cardId, extraArsCents, monthKey = state.activeMonth) {
  return wouldExceedCardLimitCore({
    creditCards: state.creditCards,
    cardCharges: state.cardCharges,
    cardId,
    extraArsCents,
    monthKey,
    activeMonth: state.activeMonth,
    fx: state.fx,
  });
}

/** Carga de una tarjeta en un mes (≈ ARS), desglosada. No toca KPIs del hogar. */
function getCardMonthLoad(cardId, monthKey = state.activeMonth) {
  return getCardMonthLoadCore({
    cardId,
    charges: state.cardCharges,
    monthKey,
    activeMonth: state.activeMonth,
    fx: state.fx,
  });
}

function getAllCardsMonthLoad(monthKey = state.activeMonth, { includeExcluded = false } = {}) {
  return getAllCardsMonthLoadCore({
    creditCards: state.creditCards,
    cardCharges: state.cardCharges,
    monthKey,
    activeMonth: state.activeMonth,
    fx: state.fx,
    includeExcluded,
  });
}

function getCuentaCorrienteMonthLoad(monthKey = state.activeMonth) {
  return getCuentaCorrienteMonthLoadCore({
    creditCards: state.creditCards,
    cardCharges: state.cardCharges,
    monthKey,
    activeMonth: state.activeMonth,
    fx: state.fx,
  });
}

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
  return cardCuotaCentsCore(charge, installmentIndex);
}

function cardRemainingInstallments(charge) {
  return cardRemainingInstallmentsCore(charge);
}

function cardRemainingCents(charge) {
  return cardRemainingCentsCore(charge);
}

function cardNextCuotaCents(charge) {
  return cardNextCuotaCentsCore(charge);
}

function toArsCents(amountCents, currency, fx = state.fx) {
  return toArsCentsCore(amountCents, currency, fx);
}

/**
 * Proyección solo del ledger de tarjetas (no toca KPIs del hogar).
 * - Cuotas: la próxima pendiente cae en el mes activo; las siguientes, mes a mes.
 * - Fijos: se repiten cada mes del horizonte.
 * - Compras (purchase): un solo mes (monthKey del gasto).
 */
function buildCardProjection(monthCount = 6, fromMonth = state.activeMonth) {
  return calculateCardProjection({
    creditCards: state.creditCards,
    cardCharges: state.cardCharges,
    monthCount,
    fromMonth,
    fx: state.fx,
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
  return plannedAppliesToMonthCore(item, monthKey);
}

function plannedStatusForMonth(item, monthKey) {
  return plannedStatusForMonthCore(item, monthKey);
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

/** Tiempo relativo legible para “última sync” (es-AR). */
function formatRelativeTime(iso) {
  if (!iso) return "";
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) {
    return String(iso).slice(0, 16).replace("T", " ");
  }
  const diffMs = Date.now() - then.getTime();
  const abs = Math.abs(diffMs);
  const mins = Math.round(abs / 60000);
  if (mins < 1) return "hace un momento";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 14) return `hace ${days} día${days === 1 ? "" : "s"}`;
  return then.toLocaleString("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Etiqueta + tono visual para el estado de Drive.
 * @returns {{ text: string, tone: "neutral" | "ok" | "warn" | "danger" | "muted" }}
 */
function describeDriveSync(status) {
  if (isSandboxProfile()) {
    return {
      text: "Drive pausado en Perfil de prueba. Cambiá a Hogar para sincronizar datos reales.",
      tone: "muted",
    };
  }
  if (!status) {
    return { text: "Drive no disponible en este entorno.", tone: "muted" };
  }
  if (!status.configured) {
    return {
      text: "Sin configurar: pegá Client ID y Secret (una sola vez) y guardá.",
      tone: "neutral",
    };
  }
  if (!status.connected) {
    return {
      text: status.message
        ? `Listo para conectar · ${status.message}`
        : "Credenciales OK. Tocá «Conectar Google» y autorizá en el navegador.",
      tone: "neutral",
    };
  }

  const lines = [];
  lines.push(status.email ? `Conectado · ${status.email}` : "Conectado a Google");

  if (status.localDirty) {
    lines.push("Esta PC tiene cambios que aún no están en Drive");
  } else {
    lines.push("Local y Drive alineados");
  }

  if (status.lastSyncAt) {
    lines.push(`Última sync: ${formatRelativeTime(status.lastSyncAt)}`);
  } else {
    lines.push("Todavía no hubo una sync completa en esta PC");
  }

  lines.push(
    status.autoSync
      ? "Subida automática: ON (solo Guardar en segundo plano · nunca baja sola)"
      : "Subida automática: OFF · usá «Guardar en Drive» o «Cargar de Drive»",
  );

  if (status.message && !/OK/i.test(status.message) && !status.message.includes("conectado")) {
    lines.push(status.message);
  }

  let tone = "ok";
  if (status.localDirty) tone = "warn";
  if (status.message && /conflict|error|fall/i.test(status.message)) tone = "danger";

  return { text: lines.join("\n"), tone };
}

function formatDriveSyncLabel(status) {
  return describeDriveSync(status).text.replace(/\n/g, " · ");
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
  const described = describeDriveSync(status);
  // Varias líneas: legible en Ajustes (no un solo string interminable).
  dom.driveStatusText.textContent = described.text;
  dom.driveStatusText.dataset.tone = described.tone;
  if (driveBusy) {
    dom.driveStatusText.dataset.busy = "true";
  } else {
    delete dom.driveStatusText.dataset.busy;
  }
  if (dom.driveAutoSyncToggle && status) {
    dom.driveAutoSyncToggle.checked = Boolean(status.autoSync);
  }
  if (dom.driveSetupBlock) {
    dom.driveSetupBlock.hidden = Boolean(status?.configured && status?.connected);
  }
  if (dom.driveConnectBtn) {
    dom.driveConnectBtn.disabled = !status?.configured || driveBusy || isSandboxProfile();
    dom.driveConnectBtn.textContent = status?.connected ? "Reconectar Google" : "Conectar Google";
  }
  if (dom.driveSyncNowBtn) {
    // Legacy id (si quedara en HTML viejo): deshabilitado; ya no se usa el flujo mixto.
    dom.driveSyncNowBtn.disabled = true;
    dom.driveSyncNowBtn.hidden = true;
  }
  if (dom.drivePushBtn) {
    dom.drivePushBtn.disabled = !status?.connected || driveBusy || isSandboxProfile();
  }
  if (dom.drivePullBtn) {
    dom.drivePullBtn.disabled = !status?.connected || driveBusy || isSandboxProfile();
  }
  if (dom.driveDisconnectBtn) {
    dom.driveDisconnectBtn.disabled = !status?.connected || driveBusy || isSandboxProfile();
  }
  if (dom.driveSaveCredsBtn) {
    dom.driveSaveCredsBtn.disabled = driveBusy || isSandboxProfile();
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

/**
 * Cargar de Drive (solo bajar). Nunca sube.
 * interactive: pide confirmación antes de pisar local.
 * silent: solo aplica si no hay cambios locales pendientes (nunca pisa a ciegas).
 */
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
          title: "Cargar de Drive",
          copy:
            "Se va a reemplazar lo de esta PC con la copia de Google Drive. "
            + "Antes se guarda un respaldo «antes-de-drive» en Descargas.",
          details: summarizeBackup(parseBackup(JSON.parse(result.content))),
          confirmLabel: "Cargar y aplicar",
          danger: true,
        });
        if (!ok) {
          renderDriveStatus(result.status);
          showToast("No se cargó · esta PC no se tocó");
          return;
        }
      } else if (status.localDirty) {
        // Auto/silencioso: no pisar si esta PC tiene cambios sin subir.
        renderDriveStatus(result.status);
        return;
      }
      await applyDriveContent(result.content, result.remoteModifiedTime, { silent: !interactive });
      if (interactive) showToast("Cargado de Drive (respaldo local en Descargas)");
      else showToast("Se actualizó desde Google Drive");
      return;
    }
    if (result.action === "conflict" && result.content) {
      if (!interactive) {
        // Silencioso: no resolver conflictos solo.
        renderDriveStatus(result.status);
        return;
      }
      const useRemote = await confirmAction({
        title: "Cargar de Drive (conflicto)",
        copy:
          "Esta PC y Drive tienen copias distintas. "
          + "«Cargar» reemplaza lo local con Drive (respaldo previo). "
          + "Cancelar deja esta PC; si querés subir, usá «Guardar en Drive».",
        details: summarizeBackup(parseBackup(JSON.parse(result.content))),
        confirmLabel: "Cargar Drive acá",
        danger: true,
      });
      if (useRemote) {
        await applyDriveContent(result.content, result.remoteModifiedTime);
        showToast("Cargado de Drive (respaldo local en Descargas)");
      } else {
        renderDriveStatus(result.status);
        showToast("Se mantuvo esta PC · para subir usá «Guardar en Drive»");
      }
      return;
    }
    if (result.action === "local_ahead" && interactive) {
      showToast("Esta PC está adelantada respecto de Drive · usá «Guardar en Drive» si querés subir");
      renderDriveStatus(result.status);
      return;
    }
    if (interactive && result.action === "empty") {
      showToast("Drive está vacío · usá «Guardar en Drive» desde la PC que tiene los datos");
      renderDriveStatus(result.status);
      return;
    }
    if (interactive && result.action === "noop") {
      showToast("Ya tenés la misma copia que Drive");
    }
    renderDriveStatus(result.status);
  } catch (error) {
    console.warn("Drive pull falló.", error);
    if (interactive) showToast(String(error?.message || error || "No se pudo cargar de Drive"));
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
          title: "Guardar en Drive (conflicto)",
          copy:
            "Drive tiene otra versión distinta a esta PC. "
            + "Si guardás igual, se pisa lo que haya solo en Drive. "
            + "Si no estás seguro: cancelá, usá «Cargar de Drive» o exportá un backup local.",
          details: [
            "En una PC vacía no uses Guardar: primero Cargar desde la PC que tiene los datos.",
          ],
          confirmLabel: "Pisar Drive con esta PC",
          danger: true,
        });
        if (overwrite) {
          const forced = await drivePush(content, true);
          driveStatus = forced.status;
          showToast("Guardado · esta PC pisó la copia de Drive");
        } else {
          showToast("No se guardó · Drive no se tocó");
        }
      }
      renderDriveStatus(driveStatus);
      return;
    }
    if (interactive) {
      if (result.action === "uploaded") showToast("Guardado en Google Drive");
      else if (result.action === "noop") showToast("Drive ya tenía esta misma copia");
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
    showToast(
      (status.message || "Google conectado")
      + " · ahora elegí «Cargar de Drive» o «Guardar en Drive» (no se hace solo)",
    );
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

/** Solo subir esta PC → Drive. */
async function handleDrivePushNow() {
  if (isSandboxProfile()) {
    showToast("Drive solo opera en el perfil Hogar");
    return;
  }
  const txCount = (state.transactions || []).length;
  const cardCount = (state.creditCards || []).length;
  const emptyLocal = txCount === 0 && cardCount === 0;
  const ok = await confirmAction({
    title: emptyLocal ? "¿Guardar una PC casi vacía en Drive?" : "Guardar en Drive",
    copy: emptyLocal
      ? "Esta PC no tiene movimientos ni tarjetas. Si guardás, podés pisar en Drive una copia llena de la otra PC. "
        + "En PC nueva o vacía usá «Cargar de Drive», no Guardar."
      : "Se va a subir la copia de ESTA PC a Google Drive. "
        + "Si Drive tiene otra versión y hay conflicto, te vamos a preguntar antes de pisar. "
        + "En una PC vacía no uses esto: usá «Cargar de Drive».",
    details: summarizeBackup(state),
    confirmLabel: emptyLocal ? "Igual subir vacío" : "Guardar en Drive",
    danger: emptyLocal,
  });
  if (!ok) return;
  await runDrivePush({ force: false, interactive: true });
}

/** Solo bajar Drive → esta PC. */
async function handleDrivePullNow() {
  if (isSandboxProfile()) {
    showToast("Drive solo opera en el perfil Hogar");
    return;
  }
  await runDrivePull({ force: false, interactive: true });
}

function wireDriveUi() {
  dom.driveSaveCredsBtn?.addEventListener("click", () => {
    void handleDriveSaveCredentials();
  });
  dom.driveConnectBtn?.addEventListener("click", () => {
    void handleDriveConnect();
  });
  dom.drivePushBtn?.addEventListener("click", () => {
    void handleDrivePushNow();
  });
  dom.drivePullBtn?.addEventListener("click", () => {
    void handleDrivePullNow();
  });
  // Legacy: si quedara el botón viejo, no hace el pull+push mixto.
  dom.driveSyncNowBtn?.addEventListener("click", () => {
    showToast("Usá «Guardar en Drive» o «Cargar de Drive» por separado");
  });
  dom.driveDisconnectBtn?.addEventListener("click", () => {
    void handleDriveDisconnect();
  });
  dom.driveAutoSyncToggle?.addEventListener("change", () => {
    void (async () => {
      try {
        const status = await driveSetAutoSync(Boolean(dom.driveAutoSyncToggle.checked));
        renderDriveStatus(status);
        // Solo programa subida; nunca carga automática.
        if (status.autoSync && status.connected) scheduleDrivePush();
      } catch (error) {
        showToast(String(error?.message || error || "No se pudo cambiar la subida automática"));
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

function backupHistoryStorageKey() {
  return `${BACKUP_HISTORY_KEY_BASE}:${dataProfile?.id || "hogar"}`;
}

function loadBackupHistory() {
  try {
    const raw = localStorage.getItem(backupHistoryStorageKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveBackupHistory(list) {
  try {
    localStorage.setItem(backupHistoryStorageKey(), JSON.stringify(list));
  } catch (error) {
    // Si se llena la cuota, reintentar solo con metadatos.
    try {
      const metaOnly = list.map(({ content, ...meta }) => meta).slice(0, BACKUP_HISTORY_MAX);
      localStorage.setItem(backupHistoryStorageKey(), JSON.stringify(metaOnly));
    } catch {
      console.warn("No se pudo guardar historial de respaldos.", error);
    }
  }
}

/** Registra un respaldo en el historial local del perfil (últimos N, con contenido de los más recientes). */
function recordBackupHistory(snapshot, label, content) {
  const entry = {
    id: createId(),
    label: sanitizeText(label, "respaldo"),
    createdAt: new Date().toISOString(),
    activeMonth: isValidMonthKey(snapshot?.activeMonth) ? snapshot.activeMonth : state.activeMonth,
    people: Array.isArray(snapshot?.people) ? snapshot.people.length : 0,
    transactions: Array.isArray(snapshot?.transactions) ? snapshot.transactions.length : 0,
    sizeBytes: content?.length || 0,
    content: content || "",
  };
  let list = [entry, ...loadBackupHistory().filter((item) => item?.id !== entry.id)];
  list = list.slice(0, BACKUP_HISTORY_MAX).map((item, index) => {
    if (index < BACKUP_HISTORY_KEEP_CONTENT && item.content) return item;
    const { content: _drop, ...meta } = item;
    return meta;
  });
  saveBackupHistory(list);
}

function downloadJsonFile(content, filename) {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    link.remove();
  }, 0);
}

function downloadBackup(snapshot = state, label = "respaldo") {
  const content = JSON.stringify(buildBackupEnvelope(snapshot), null, 2);
  const safeLabel = sanitizeText(label, "respaldo").replace(/[^\w.-]+/g, "-") || "respaldo";
  downloadJsonFile(content, `ilara-${safeLabel}-${formatMonthKey(new Date())}.json`);
  recordBackupHistory(snapshot, safeLabel, content);
  renderBackupHistory();
}

function redownloadBackupHistoryEntry(entryId) {
  const entry = loadBackupHistory().find((item) => item.id === entryId);
  if (!entry?.content) {
    showToast("Ese respaldo ya no está en caché; exportá uno nuevo");
    return;
  }
  const safeLabel = sanitizeText(entry.label, "respaldo").replace(/[^\w.-]+/g, "-") || "respaldo";
  const stamp = String(entry.createdAt || "").slice(0, 10) || formatMonthKey(new Date());
  downloadJsonFile(entry.content, `ilara-${safeLabel}-${stamp}.json`);
  showToast("Respaldo descargado de nuevo");
}

function renderBackupHistory() {
  if (!dom.backupHistoryList) return;
  const list = loadBackupHistory();
  dom.backupHistoryList.replaceChildren();
  if (!list.length) {
    dom.backupHistoryList.append(
      element("p", "backup-history-empty", "Todavía no hay respaldos registrados en este perfil."),
    );
    return;
  }
  list.forEach((entry) => {
    const row = element("div", "backup-history-row");
    const copy = element("div", "backup-history-copy");
    const when = entry.createdAt
      ? formatRelativeTime(entry.createdAt)
      : "sin fecha";
    const sizeKb = entry.sizeBytes
      ? `${Math.max(1, Math.round(entry.sizeBytes / 1024))} KB`
      : "";
    copy.append(
      element("strong", "", entry.label || "respaldo"),
      element(
        "small",
        "",
        [
          when,
          entry.activeMonth ? formatMonthLabel(entry.activeMonth, true) : "",
          `${entry.transactions || 0} mov.`,
          sizeKb,
        ].filter(Boolean).join(" · "),
      ),
    );
    const actions = element("div", "backup-history-actions");
    if (entry.content) {
      const downloadBtn = element("button", "text-btn", "Descargar");
      downloadBtn.type = "button";
      downloadBtn.addEventListener("click", () => redownloadBackupHistoryEntry(entry.id));
      actions.append(downloadBtn);
    } else {
      actions.append(element("small", "backup-history-expired", "Solo registro"));
    }
    row.append(copy, actions);
    dom.backupHistoryList.append(row);
  });
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


// --- Home / listas (módulo) ---
const homeUi = createHomeUi({
  getState: () => state,
  setState: (next) => { state = next; },
  get dom() { return dom; },
  element,
  emptyState,
  formatCurrency,
  formatMonthLabel,
  formatIsoDateLabel,
  isValidIsoDate,
  isMonthClosed,
  clampDateToMonth,
  normalizeTransaction,
  materializeOccurrence,
  occurrenceForMonth,
  localDateKey,
  cloneState,
  saveState,
  render: (...args) => render(...args),
  showToast,
  confirmAction,
  requireOpenMonth,
  switchView: (...args) => switchView(...args),
  openMovementDialog: (...args) => openMovementDialog(...args),
  fillSelectOptions,
  setSelectValue,
  sanitizeText,
  createId,
  getMonthTotals,
  toggleOccurrenceStatus: (...args) => toggleOccurrenceStatus(...args),
  dueStateForOccurrence,
  installmentProgress,
  removeCategory: (...args) => removeCategory(...args),
});
const {
  renderDashboard,
  renderPersonBreakdown,
  renderDueSoon,
  renderBudgetProgress,
  renderSettingsCategories,
  renderCategoryBreakdown,
  renderMiniForecast,
  renderMovementCollection,
  renderMovements,
  resetBreakdownExpanded,
} = homeUi;

// --- Proyección UI (módulo) ---
const projectionUiModule = createProjectionUi({
  getState: () => state,
  setState: (next) => {
    state = next;
  },
  get dom() {
    return dom;
  },
  element,
  emptyState,
  formatCurrency,
  formatMonthLabel,
  buildProjection,
  switchView: (...args) => switchView(...args),
  render: (...args) => render(...args),
});

const {
  renderProjection,
  selectProjectionMonth,
  selectProjectionCategory,
  setProjectionExpenseFilter,
  scheduleTypeLabel,
  setIncludeCards: setProjectionIncludeCards,
  setIncomeCutPercent: setProjectionIncomeCutPercent,
} = projectionUiModule;

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

/** Compara versiones de producto multi-segmento (3.9.9.9). >0 si a>b, <0 si a<b. */
function compareProductVersions(a, b) {
  const pa = String(a || "").replace(/^v/i, "").split(".").map((part) => Number(part) || 0);
  const pb = String(b || "").replace(/^v/i, "").split(".").map((part) => Number(part) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da !== db) return da - db;
  }
  return 0;
}

async function openBrowserUrl(url) {
  try {
    await openExternalUrl(url);
  } catch (error) {
    console.warn("No se pudo abrir el navegador nativo.", error);
    try {
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (fallbackError) {
      console.warn("Tampoco window.open.", fallbackError);
      showToast("Abrí manualmente: " + url);
    }
  }
}

function setUpdateStatus(text) {
  if (dom.updateStatusText) dom.updateStatusText.textContent = text;
}

/**
 * @type {{
 *   version: string,
 *   downloadUrl: string,
 *   setupName: string,
 *   tag: string,
 *   sha256: string,
 *   localPath: string,
 *   downloading: boolean,
 * } | null}
 */
let pendingUpdate = null;
let updateBusy = false;

function loadDismissedUpdateVersion() {
  try {
    return String(localStorage.getItem(UPDATE_DISMISS_KEY) || "");
  } catch {
    return "";
  }
}

function dismissPendingUpdate(version) {
  try {
    if (version) localStorage.setItem(UPDATE_DISMISS_KEY, String(version));
  } catch {
    /* ignore */
  }
  renderUpdateChrome();
}

function clearDismissedUpdateIfStale(remoteVersion) {
  const dismissed = loadDismissedUpdateVersion();
  if (dismissed && remoteVersion && dismissed !== remoteVersion) {
    try {
      localStorage.removeItem(UPDATE_DISMISS_KEY);
    } catch {
      /* ignore */
    }
  }
}

/** Extrae SHA-256 del asset de GitHub o del archivo SHA256SUMS del release. */
async function resolveSetupSha256(setupAsset, assets) {
  const digest = String(setupAsset?.digest || "");
  if (/^sha256:/i.test(digest)) {
    return digest.replace(/^sha256:/i, "").trim().toLowerCase();
  }
  const sumsAsset = (assets || []).find((asset) =>
    /sha256sums\.txt$/i.test(asset.name || "") || /SHA256SUMS/i.test(asset.name || ""),
  );
  if (!sumsAsset?.browser_download_url || !setupAsset?.name) return "";
  try {
    const res = await fetch(sumsAsset.browser_download_url, {
      headers: { Accept: "text/plain" },
    });
    if (!res.ok) return "";
    const text = await res.text();
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      // "hash  filename" o "hash *filename"
      const m = line.trim().match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/);
      if (!m) continue;
      const file = m[2].trim().replace(/^\.\//, "");
      if (file === setupAsset.name || file.endsWith(setupAsset.name)) {
        return m[1].toLowerCase();
      }
    }
  } catch (error) {
    console.warn("No se pudo leer SHA256SUMS.", error);
  }
  return "";
}

function isUpdateAvailable() {
  return Boolean(pendingUpdate && compareProductVersions(pendingUpdate.version, APP_VERSION) > 0);
}

function renderUpdateChrome() {
  const available = isUpdateAvailable();
  const dismissed = available && loadDismissedUpdateVersion() === pendingUpdate.version;
  const showBanner = available && !dismissed;
  const ready = Boolean(pendingUpdate?.localPath);
  const busy = updateBusy || pendingUpdate?.downloading;

  if (dom.updateBanner) {
    dom.updateBanner.hidden = !showBanner;
    if (showBanner && dom.updateBannerCopy) {
      dom.updateBannerCopy.textContent = ready
        ? `v${pendingUpdate.version} descargada. Tocá «Instalar y reiniciar» (datos se conservan).`
        : `v${pendingUpdate.version} disponible (vos tenés v${APP_VERSION}). Se puede bajar e instalar desde acá.`;
    }
    if (dom.updateBannerInstallBtn) {
      dom.updateBannerInstallBtn.textContent = ready
        ? "Instalar y reiniciar"
        : busy
          ? "Descargando…"
          : "Descargar e instalar";
      dom.updateBannerInstallBtn.disabled = Boolean(busy);
    }
  }

  if (dom.downloadUpdateBtn) {
    dom.downloadUpdateBtn.hidden = !available || ready;
    dom.downloadUpdateBtn.disabled = Boolean(busy || !available);
    dom.downloadUpdateBtn.textContent = busy ? "Descargando…" : "Descargar Setup";
  }
  if (dom.installUpdateBtn) {
    dom.installUpdateBtn.hidden = !available || !ready;
    dom.installUpdateBtn.disabled = Boolean(busy || !ready);
  }
  if (dom.openUpdateBrowserBtn) {
    dom.openUpdateBrowserBtn.hidden = !available;
    dom.openUpdateBrowserBtn.disabled = Boolean(busy);
  }
}

async function openPendingUpdateInBrowser() {
  if (!pendingUpdate?.downloadUrl) {
    showToast("No hay una descarga de update lista");
    return;
  }
  await openBrowserUrl(pendingUpdate.downloadUrl);
  showToast("Se abrió la descarga del Setup en el navegador");
}

/** Nivel B: baja el Setup a temp (con SHA-256 si hay). */
async function downloadPendingUpdate({ interactive = true } = {}) {
  if (!pendingUpdate?.downloadUrl) {
    showToast("No hay una actualización pendiente");
    return false;
  }
  if (!pendingUpdate.downloadUrl.includes("github")) {
    // Sin asset directo: fallback navegador.
    await openPendingUpdateInBrowser();
    return false;
  }
  if (pendingUpdate.localPath) {
    if (interactive) showToast("El Setup ya está descargado");
    renderUpdateChrome();
    return true;
  }
  if (updateBusy) return false;
  updateBusy = true;
  pendingUpdate.downloading = true;
  renderUpdateChrome();
  setUpdateStatus(`Descargando Setup v${pendingUpdate.version}…`);
  try {
    const path = await downloadAppSetup(
      pendingUpdate.downloadUrl,
      pendingUpdate.setupName || `Ilara-Finanzas-${pendingUpdate.version}-Setup.exe`,
      pendingUpdate.sha256 || null,
    );
    pendingUpdate.localPath = path;
    pendingUpdate.downloading = false;
    setUpdateStatus(
      `Setup v${pendingUpdate.version} listo. Tocá «Instalar y reiniciar» (instalación silenciosa; tus datos se conservan).`,
    );
    renderUpdateChrome();
    if (interactive) showToast("Setup descargado · listo para instalar");
    return true;
  } catch (error) {
    console.warn("Descarga nativa del Setup falló.", error);
    pendingUpdate.downloading = false;
    setUpdateStatus(
      `No se pudo descargar el Setup (${storageErrorMessage(error)}). Probá abrir en el navegador.`,
    );
    renderUpdateChrome();
    if (interactive) {
      showToast("No se pudo descargar acá", {
        label: "Abrir en navegador",
        handler: () => void openPendingUpdateInBrowser(),
      });
    }
    return false;
  } finally {
    updateBusy = false;
    if (pendingUpdate) pendingUpdate.downloading = false;
    renderUpdateChrome();
  }
}

/** Nivel B: lanza NSIS (/S) y cierra Ilara. */
async function installPendingUpdateAndRestart() {
  if (!isUpdateAvailable()) {
    showToast("No hay actualización pendiente");
    return;
  }
  if (!pendingUpdate.localPath) {
    const ok = await downloadPendingUpdate({ interactive: true });
    if (!ok || !pendingUpdate?.localPath) return;
  }
  const confirmed = await confirmAction({
    title: "Instalar actualización",
    copy:
      `Se va a instalar v${pendingUpdate.version} y Ilara se va a cerrar. `
      + "El instalador corre en modo silencioso cuando se puede. Tus datos locales no se borran.",
    details: [
      `Archivo: ${pendingUpdate.setupName || "Setup"}`,
      pendingUpdate.sha256 ? "SHA-256 verificado al descargar" : "Sin hash publicado (se instaló igual)",
      "Si el instalador pide permiso de Windows, aceptalo.",
      "Después volvé a abrir Ilara desde el menú Inicio.",
    ].filter(Boolean),
    confirmLabel: "Instalar y reiniciar",
  });
  if (!confirmed) return;
  updateBusy = true;
  renderUpdateChrome();
  setUpdateStatus("Iniciando instalador… Ilara se cierra.");
  try {
    await launchAppSetupAndQuit(pendingUpdate.localPath, true);
    // Si no cierra (p.ej. web dev), avisar.
    showToast("Instalador lanzado · cerrá Ilara si sigue abierta");
  } catch (error) {
    console.warn("No se pudo lanzar el Setup.", error);
    updateBusy = false;
    renderUpdateChrome();
    showToast(String(error?.message || error || "No se pudo iniciar el instalador"), {
      label: "Abrir en navegador",
      handler: () => void openPendingUpdateInBrowser(),
    });
  }
}

/** Un clic: descargar (si falta) + instalar. */
async function handleUpdatePrimaryAction() {
  if (!isUpdateAvailable()) return;
  if (pendingUpdate.localPath) {
    await installPendingUpdateAndRestart();
    return;
  }
  const ok = await downloadPendingUpdate({ interactive: true });
  if (ok && pendingUpdate?.localPath) {
    await installPendingUpdateAndRestart();
  }
}

async function checkForAppUpdates({ interactive = true } = {}) {
  if (interactive || !pendingUpdate) {
    setUpdateStatus(`Tu versión: ${APP_CHANNEL} · v${APP_VERSION}. Consultando GitHub…`);
  }
  if (dom.checkUpdatesBtn) dom.checkUpdatesBtn.disabled = true;
  try {
    const response = await fetch(GITHUB_LATEST_API, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (response.status === 404) {
      pendingUpdate = null;
      setUpdateStatus(
        `Tu versión: v${APP_VERSION}. Todavía no hay Releases publicadas en GitHub (publicá v${APP_VERSION} en el repo).`,
      );
      renderUpdateChrome();
      if (interactive) {
        showToast("No hay Releases en GitHub todavía", {
          label: "Abrir repo",
          handler: () => void openBrowserUrl(GITHUB_RELEASES_URL),
        });
      }
      return;
    }
    if (!response.ok) {
      throw new Error(`GitHub respondió ${response.status}`);
    }
    const release = await response.json();
    const tag = String(release.tag_name || release.name || "").trim();
    const remoteVersion = tag.replace(/^v/i, "");
    if (!remoteVersion) throw new Error("La Release no tiene versión legible");

    const assets = Array.isArray(release.assets) ? release.assets : [];
    const setupAsset = assets.find((asset) =>
      /setup\.exe$/i.test(asset.name || "") || /Windows-x64-Setup\.exe$/i.test(asset.name || ""),
    );
    const downloadUrl = setupAsset?.browser_download_url || release.html_url || GITHUB_RELEASES_URL;
    const sha256 = setupAsset ? await resolveSetupSha256(setupAsset, assets) : "";
    const cmp = compareProductVersions(remoteVersion, APP_VERSION);
    clearDismissedUpdateIfStale(remoteVersion);

    if (cmp > 0) {
      const prevPath = pendingUpdate?.version === remoteVersion ? pendingUpdate.localPath : "";
      pendingUpdate = {
        version: remoteVersion,
        downloadUrl,
        setupName: setupAsset?.name || `Ilara-Finanzas-${remoteVersion}-Windows-x64-Setup.exe`,
        tag,
        sha256,
        localPath: prevPath || "",
        downloading: false,
      };
      setUpdateStatus(
        pendingUpdate.localPath
          ? `Setup v${remoteVersion} listo. Tocá «Instalar y reiniciar».`
          : `Hay una versión nueva: v${remoteVersion} (vos tenés v${APP_VERSION}). Podés descargar e instalar desde la app.`,
      );
      renderUpdateChrome();
      if (interactive) {
        const go = await confirmAction({
          title: "Actualización disponible",
          copy: `En GitHub está v${remoteVersion}. Tu app es v${APP_VERSION}. ¿Descargar e instalar ahora?`,
          details: [
            release.name ? `Release: ${release.name}` : `Tag: ${tag}`,
            setupAsset ? `Archivo: ${setupAsset.name}` : "Sin asset Setup (se abrirá la página)",
            sha256 ? "Se verificará SHA-256 al descargar" : "Sin hash en la Release",
            "Tus datos en este PC no se borran.",
            "La app se cierra al lanzar el instalador.",
          ].filter(Boolean),
          confirmLabel: "Descargar e instalar",
        });
        if (go) await handleUpdatePrimaryAction();
      }
    } else if (cmp === 0) {
      pendingUpdate = null;
      setUpdateStatus(`Estás al día: v${APP_VERSION} es la última Release en GitHub.`);
      renderUpdateChrome();
      if (interactive) showToast("Ya tenés la última versión");
    } else {
      pendingUpdate = null;
      setUpdateStatus(
        `Tu app es v${APP_VERSION}; en GitHub la última publicada es v${remoteVersion} (más vieja o pre-release).`,
      );
      renderUpdateChrome();
      if (interactive) showToast("Tu versión es más nueva que la Release pública");
    }
  } catch (error) {
    console.warn("No se pudo buscar actualizaciones.", error);
    setUpdateStatus(
      `Tu versión: v${APP_VERSION}. No se pudo consultar GitHub (${storageErrorMessage(error)}).`,
    );
    if (interactive) {
      showToast("No se pudo buscar actualizaciones", {
        label: "Abrir Releases",
        handler: () => void openBrowserUrl(GITHUB_RELEASES_URL),
      });
    }
  } finally {
    if (dom.checkUpdatesBtn) dom.checkUpdatesBtn.disabled = false;
  }
}

function renderSettings() {
  renderProfileChrome();
  if (pendingUpdate && compareProductVersions(pendingUpdate.version, APP_VERSION) > 0) {
    setUpdateStatus(
      `Hay una versión nueva: v${pendingUpdate.version} (vos tenés v${APP_VERSION}). Tocá «Descargar Setup nuevo».`,
    );
  } else {
    setUpdateStatus(`Versión instalada: ${APP_CHANNEL} · v${APP_VERSION}`);
  }
  renderUpdateChrome();
  renderBackupHistory();
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
  renderSettingsCategories();
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


// --- Tarjetas UI (módulo) ---
const cardsUi = createCardsUi({
  getState: () => state,
  setState: (next) => {
    state = next;
  },
  get dom() {
    return dom;
  },
  element,
  emptyState,
  formatMoneyAmount,
  formatMonthLabel,
  formatIsoDateLabel,
  formatFxRate,
  isValidIsoDate,
  daysUntilIsoDate,
  effectiveUsdArs,
  normalizeCreditCard,
  normalizeCardCharge,
  normalizeTransaction,
  materializeOccurrence,
  occurrenceForMonth,
  localDateKey,
  cloneState,
  saveState,
  render: (...args) => render(...args),
  showToast,
  confirmAction,
  requireOpenMonth,
  switchView: (...args) => switchView(...args),
  openMovementDialog: (...args) => openMovementDialog(...args),
  fillSelectOptions,
  setSelectValue,
  sanitizeText,
  createId,
});

const {
  renderCards,
  renderCardsFxBar,
  openCardDialog,
  openPurchaseDialog,
  openChargeDialog,
  updateChargeAmountModeUI,
  updateChargeAmountHint,
  saveCreditCard,
  saveCardCharge,
  saveCardPurchase,
  removeCreditCard,
  removeCardCharge,
  markCardCuotaPaid,
  unmarkCardCuotaPaid,
  generateCardStatement,
  refreshUsdRate,
  applyManualFx,
} = cardsUi;

// --- Previstos UI (módulo) ---
const plannedUi = createPlannedUi({
  getState: () => state,
  setState: (next) => {
    state = next;
  },
  get dom() {
    return dom;
  },
  element,
  emptyState,
  formatCurrency,
  formatIsoDateLabel,
  isValidIsoDate,
  isMonthClosed,
  clampDateToMonth,
  normalizeTransaction,
  normalizePlannedItem,
  materializeOccurrence,
  occurrenceForMonth,
  localDateKey,
  cloneState,
  saveState,
  render: (...args) => render(...args),
  showToast,
  confirmAction,
  requireOpenMonth,
  switchView: (...args) => switchView(...args),
  openMovementDialog: (...args) => openMovementDialog(...args),
  fillSelectOptions,
  setSelectValue,
  sanitizeText,
  createId,
  loadFormPrefs: (...args) => loadFormPrefs(...args),
  fromCents,
  toCents,
  closeMovementDialog: (...args) => closeMovementDialog(...args),
  updateScheduleFields: (...args) => updateScheduleFields(...args),
});

const {
  renderPlanned,
  updatePlannedFormFields,
  openPlannedDialog,
  openPlannedConfirm,
  savePlannedItem,
  deletePlannedItem,
  confirmPlannedItem,
  dismissPlannedItem,
  duplicateMovementFromDialog,
} = plannedUi;

function render() {
  // Con el form de movimiento abierto no re-renderizar listas (evita lag y doble tipeo).
  if (dom.movementDialog?.open) {
    renderProfileChrome();
    renderEmergencyChrome();
    return;
  }
  try {
    if (dom.activeMonthInput) dom.activeMonthInput.value = state.activeMonth;
    if (dom.activeMonthDisplay) {
      dom.activeMonthDisplay.textContent = formatMonthLabel(state.activeMonth).toLocaleLowerCase("es");
    }
    if (dom.projectionMonthsSelect) {
      dom.projectionMonthsSelect.value = String(state.settings?.projectionMonths ?? 12);
    }
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
  } catch (error) {
    console.error("Error al renderizar la UI:", error);
    showToast(`Error de pantalla: ${error?.message || error}`);
  }
}

function switchView(view) {
  if (!["dashboard", "movements", "planned", "cards", "projection", "settings"].includes(view)) return;
  if (view !== "cards") cardsUi.setSelectedCardId("");
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
  if (!requireOpenMonth(item.monthKey, "Reabrí el mes antes de modificar un movimiento")) return;
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


// --- Movimientos form (módulo) ---
const movementsUi = createMovementsUi({
  getState: () => state,
  setState: (next) => { state = next; },
  get dom() { return dom; },
  element,
  formatCurrency,
  formatMonthLabel,
  isValidIsoDate,
  clampDateToMonth,
  normalizeTransaction,
  materializeOccurrence,
  occurrenceForMonth,
  occurrenceForEditedTransaction,
  materializeSeriesThrough,
  preserveProtectedOccurrences,
  clearUnprotectedOccurrenceRecords,
  syncOccurrenceLabelsFromSeries,
  localDateKey,
  cloneState,
  saveState,
  render: (...args) => render(...args),
  showToast,
  confirmAction,
  requireOpenMonth,
  fillSelectOptions,
  setSelectValue,
  sanitizeText,
  createId,
  getMonthTotals,
  renderMovementTemplates: (...args) => renderMovementTemplates(...args),
});
const {
  validateScheduleRange,
  updateScheduleFields,
  openMovementDialog,
  closeMovementDialog,
  loadFormPrefs,
  saveFormPrefs,
  applyStoredViewFilters,
  persistMovementFilters,
  persistPlannedFilters,
  lockDialogDismiss,
  applyOccurrenceEdit,
  saveMovement,
  deleteMovement,
} = movementsUi;

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

/**
 * Exporta CSV de movimientos.
 * @param {{ monthKey?: string }} [options] Si `monthKey` está definido, solo ese mes.
 *   Sin opciones: rango histórico → proyección (desde Ajustes).
 */
function exportCsv(options = {}) {
  const onlyMonth = isValidMonthKey(options.monthKey) ? options.monthKey : "";
  const rowMap = new Map();
  if (onlyMonth) {
    getMonthTotals(onlyMonth).occurrences.forEach((item) => rowMap.set(item.statusKey, item));
  } else {
    const startCandidates = [
      state.activeMonth,
      ...state.transactions.map((item) => item.schedule.startMonth),
      ...Object.values(state.occurrences).map((item) => item.monthKey),
    ].filter(isValidMonthKey).sort();
    let startMonth = startCandidates[0] || state.activeMonth;
    if (monthDiff(startMonth, state.activeMonth) > 120) startMonth = addMonths(state.activeMonth, -120);
    const endMonth = addMonths(state.activeMonth, state.settings.projectionMonths - 1);
    const count = Math.max(1, monthDiff(startMonth, endMonth) + 1);
    for (let index = 0; index < count; index += 1) {
      const monthKey = addMonths(startMonth, index);
      getMonthTotals(monthKey).occurrences.forEach((item) => rowMap.set(item.statusKey, item));
    }
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
  if (!rows.length) {
    showToast(onlyMonth
      ? `No hay movimientos en ${formatMonthLabel(onlyMonth)}`
      : "No hay movimientos para exportar");
    return;
  }
  const content = "\ufeff" + [header, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const fileTag = onlyMonth || state.activeMonth;
  link.download = onlyMonth
    ? `ilara-mes-${onlyMonth}.csv`
    : `ilara-movimientos-${fileTag}.csv`;
  document.body.append(link);
  link.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    link.remove();
  }, 0);
  showToast(onlyMonth
    ? `CSV de ${formatMonthLabel(onlyMonth)} exportado (${rows.length})`
    : `CSV exportado (${rows.length} filas)`);
}

function exportCsvThisMonth() {
  exportCsv({ monthKey: state.activeMonth });
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
  resetBreakdownExpanded?.();
  render();
  void saveState();
});
dom.nextMonthBtn.addEventListener("click", () => {
  state.activeMonth = addMonths(state.activeMonth, 1);
  resetBreakdownExpanded?.();
  render();
  void saveState();
});
dom.monthPickerBtn.addEventListener("click", openMonthPicker);
dom.activeMonthInput.addEventListener("change", (event) => {
  if (!isValidMonthKey(event.target.value)) return;
  if (event.target.value === state.activeMonth) return;
  state.activeMonth = event.target.value;
  resetBreakdownExpanded?.();
  render();
  void saveState();
});

dom.movementSearch?.addEventListener("input", renderMovements);
[dom.movementTypeFilter, dom.movementStatusFilter].forEach((control) =>
  control?.addEventListener("change", () => {
    persistMovementFilters();
    renderMovements();
  }),
);
dom.exportMonthCsvBtn?.addEventListener("click", () => exportCsvThisMonth());
dom.projectionIncludeCards?.addEventListener("change", () => {
  setProjectionIncludeCards(dom.projectionIncludeCards.checked);
  renderProjection();
});
dom.projectionIncomeCut?.addEventListener("change", () => {
  setProjectionIncomeCutPercent(dom.projectionIncomeCut.value);
  renderProjection();
});
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
dom.exportCsvBtn.addEventListener("click", () => exportCsv());
dom.importBtn.addEventListener("click", () => dom.importFileInput.click());
dom.importFileInput.addEventListener("change", () => importData(dom.importFileInput.files[0]));
dom.checkUpdatesBtn?.addEventListener("click", () => void checkForAppUpdates({ interactive: true }));
dom.downloadUpdateBtn?.addEventListener("click", () => void downloadPendingUpdate({ interactive: true }));
dom.installUpdateBtn?.addEventListener("click", () => void installPendingUpdateAndRestart());
dom.openUpdateBrowserBtn?.addEventListener("click", () => void openPendingUpdateInBrowser());
dom.updateBannerInstallBtn?.addEventListener("click", () => void handleUpdatePrimaryAction());
dom.updateBannerLaterBtn?.addEventListener("click", () => {
  if (pendingUpdate?.version) dismissPendingUpdate(pendingUpdate.version);
  else if (dom.updateBanner) dom.updateBanner.hidden = true;
});
dom.openReleasesBtn?.addEventListener("click", () => void openBrowserUrl(GITHUB_RELEASES_URL));
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
dom.plannedTypeFilter?.addEventListener("change", () => {
  persistPlannedFilters();
  renderPlanned();
});
dom.plannedStatusFilter?.addEventListener("change", () => {
  persistPlannedFilters();
  renderPlanned();
});
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
  cardsUi.setSelectedCardId("");
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
  applyStoredViewFilters();
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
  // Updates: consulta silenciosa al abrir (banner si hay versión nueva).
  void checkForAppUpdates({ interactive: false });
  // Google Drive: solo estado al abrir.
  // No bajar ni subir solos al inicio (evita pisar datos con una PC vacía).
  // Subida en segundo plano solo si el usuario activó «Subir cambios solos».
  await refreshDriveStatus();
  if (driveStatus?.connected && driveStatus?.autoSync && driveStatus?.localDirty) {
    scheduleDrivePush();
  }
}

await initializeApp();
