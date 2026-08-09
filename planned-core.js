/**
 * Dominio puro de previstos (sin DOM ni state global).
 */
import { monthDiff, isValidMonthKey } from "./finance-core.js";

export function plannedAppliesToMonth(item, monthKey) {
  if (!item || !isValidMonthKey(monthKey)) return false;
  if (item.recurrence === "once") return item.monthKey === monthKey;
  if (monthDiff(item.monthKey, monthKey) < 0) return false;
  if (item.endMonth && monthDiff(monthKey, item.endMonth) < 0) return false;
  return true;
}

export function plannedStatusForMonth(item, monthKey) {
  if (item.fulfilledMonths?.includes(monthKey)) return "fulfilled";
  if (item.dismissedMonths?.includes(monthKey)) return "dismissed";
  return "open";
}

/** Previstos abiertos que no corresponden al mes activo (para el aviso de la lista). */
export function countPlannedOutsideMonth(plannedItems, monthKey) {
  return (plannedItems || []).filter((item) => {
    if (item.recurrence === "monthly") {
      return monthDiff(item.monthKey, monthKey) < 0;
    }
    if (item.monthKey === monthKey) return false;
    return plannedStatusForMonth(item, item.monthKey) === "open";
  }).length;
}
