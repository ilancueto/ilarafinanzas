/**
 * Dominio puro de tarjetas / plásticos (sin DOM ni state global).
 * app.js adapta con wrappers que leen state.
 */
import {
  addMonths,
  formatMonthKey,
  installmentAmountCents,
  monthDiff,
} from "./finance-core.js";

/** Heurística de nombre: CC / cuenta corriente (ej. “CC Mara”, “Cta cte”). */
export function nameLooksLikeCuentaCorriente(name) {
  const n = String(name || "")
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();
  if (!n) return false;
  return (
    n.includes("cc mara")
    || n.includes("cuenta corriente")
    || n.includes("cta cte")
    || n.includes("cuenta cte")
    || /\bcc\b/.test(n)
    || n.startsWith("cc ")
    || n.includes(" cc ")
  );
}

export function nameLooksLikeCcMara(name) {
  return nameLooksLikeCuentaCorriente(name);
}

export function isCuentaCorrienteCard(card) {
  return Boolean(card?.excludeFromCardTotals);
}

export function creditCardsForTotals(creditCards) {
  return (creditCards || []).filter((card) => !isCuentaCorrienteCard(card));
}

export function creditCardsCuentaCorriente(creditCards) {
  return (creditCards || []).filter((card) => isCuentaCorrienteCard(card));
}

/** Cotización efectiva USD→ARS a partir del objeto fx del estado. */
export function resolveFxRate(fx) {
  if (fx?.useManual && Number.isFinite(fx.manualUsdArs) && fx.manualUsdArs > 0) return fx.manualUsdArs;
  if (Number.isFinite(fx?.apiUsdArs) && fx.apiUsdArs > 0) return fx.apiUsdArs;
  if (Number.isFinite(fx?.usdArs) && fx.usdArs > 0) return fx.usdArs;
  return 1000;
}

export function toArsCents(amountCents, currency, fx) {
  if (currency === "ARS") return amountCents;
  const rate = resolveFxRate(fx);
  return Math.round(amountCents * rate);
}

/**
 * Mes del resumen al que cae una compra según el día de cierre de la tarjeta.
 * Compra el día del cierre o antes → ese mes; después del cierre → mes siguiente.
 */
export function statementMonthKeyForPurchase(card, refDate = new Date()) {
  const closeDay = /^\d{4}-\d{2}-\d{2}$/.test(String(card?.closingDate || ""))
    ? Number(card.closingDate.slice(8, 10))
    : Math.trunc(Number(card?.closingDay) || 0);
  if (closeDay < 1 || closeDay > 31) return formatMonthKey(refDate);
  const day = refDate.getDate();
  if (day <= closeDay) return formatMonthKey(refDate);
  return formatMonthKey(new Date(refDate.getFullYear(), refDate.getMonth() + 1, 1));
}

export function cardCuotaCents(charge, installmentIndex) {
  return installmentAmountCents(
    { amountCents: charge.totalAmountCents, schedule: { installments: charge.installments } },
    installmentIndex,
  );
}

export function cardRemainingInstallments(charge) {
  if (charge.chargeType !== "installment") return 0;
  return Math.max(0, charge.installments - charge.paidInstallments);
}

export function cardRemainingCents(charge) {
  if (charge.chargeType === "fixed") return charge.active ? charge.monthlyAmountCents : 0;
  let total = 0;
  for (let index = charge.paidInstallments; index < charge.installments; index += 1) {
    total += cardCuotaCents(charge, index);
  }
  return total;
}

export function cardNextCuotaCents(charge) {
  if (charge.chargeType === "fixed") return charge.active ? charge.monthlyAmountCents : 0;
  if (charge.paidInstallments >= charge.installments) return 0;
  return cardCuotaCents(charge, charge.paidInstallments);
}

export function chargeAmountArsForLimit(charge, fx) {
  if (!charge) return 0;
  if (charge.chargeType === "fixed") {
    return charge.currency === "USD"
      ? toArsCents(charge.monthlyAmountCents, "USD", fx)
      : charge.monthlyAmountCents;
  }
  if (charge.chargeType === "purchase") {
    return charge.currency === "USD"
      ? toArsCents(charge.totalAmountCents, "USD", fx)
      : charge.totalAmountCents;
  }
  const amount = cardNextCuotaCents(charge);
  return charge.currency === "USD" ? toArsCents(amount, "USD", fx) : amount;
}

/**
 * Carga de una tarjeta en un mes (≈ ARS), desglosada.
 * @param {{ cardId: string, charges: array, monthKey: string, activeMonth: string, fx: object }} args
 */
export function getCardMonthLoad({ cardId, charges, monthKey, activeMonth, fx }) {
  const cardCharges = (charges || []).filter((charge) => charge.active && charge.cardId === cardId);
  let installmentArs = 0;
  let installmentUsd = 0;
  let fixedArs = 0;
  let fixedUsd = 0;
  let purchaseArs = 0;
  let purchaseUsd = 0;
  const items = [];

  cardCharges.forEach((charge) => {
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
    const monthOffset = monthDiff(activeMonth, monthKey);
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
    installmentArs + fixedArs + purchaseArs
    + toArsCents(installmentUsd, "USD", fx)
    + toArsCents(fixedUsd, "USD", fx)
    + toArsCents(purchaseUsd, "USD", fx);
  return {
    installmentArs: installmentArs + toArsCents(installmentUsd, "USD", fx),
    fixedArs: fixedArs + toArsCents(fixedUsd, "USD", fx),
    purchaseArs: purchaseArs + toArsCents(purchaseUsd, "USD", fx),
    totalArs,
    items,
  };
}

export function getAllCardsMonthLoad({
  creditCards,
  cardCharges,
  monthKey,
  activeMonth,
  fx,
  includeExcluded = false,
} = {}) {
  let installmentArs = 0;
  let fixedArs = 0;
  let purchaseArs = 0;
  const source = includeExcluded ? (creditCards || []) : creditCardsForTotals(creditCards);
  const byCard = source.map((card) => {
    const load = getCardMonthLoad({
      cardId: card.id,
      charges: cardCharges,
      monthKey,
      activeMonth,
      fx,
    });
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

export function getCuentaCorrienteMonthLoad({
  creditCards,
  cardCharges,
  monthKey,
  activeMonth,
  fx,
} = {}) {
  let totalArs = 0;
  const byCard = creditCardsCuentaCorriente(creditCards).map((card) => {
    const load = getCardMonthLoad({
      cardId: card.id,
      charges: cardCharges,
      monthKey,
      activeMonth,
      fx,
    });
    totalArs += load.totalArs;
    return { card, ...load };
  }).sort((a, b) => b.totalArs - a.totalArs || a.card.name.localeCompare(b.card.name, "es"));
  return { totalArs, byCard };
}

/**
 * Proyección solo del ledger de tarjetas (no toca KPIs del hogar).
 * - Cuotas: la próxima pendiente cae en fromMonth; las siguientes, mes a mes.
 * - Fijos: se repiten cada mes del horizonte.
 * - Compras (purchase): un solo mes (monthKey del gasto).
 */
export function buildCardProjection({
  creditCards,
  cardCharges,
  monthCount = 6,
  fromMonth,
  fx,
} = {}) {
  const horizon = Math.min(Math.max(Math.trunc(Number(monthCount)) || 6, 1), 36);
  const excludedCardIds = new Set(
    creditCardsCuentaCorriente(creditCards).map((card) => card.id),
  );
  const activeCharges = (cardCharges || []).filter(
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
      installmentArs + fixedArs + purchaseArs
      + toArsCents(installmentUsd, "USD", fx)
      + toArsCents(fixedUsd, "USD", fx)
      + toArsCents(purchaseUsd, "USD", fx);
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

export function wouldExceedCardLimit({
  creditCards,
  cardCharges,
  cardId,
  extraArsCents,
  monthKey,
  activeMonth,
  fx,
} = {}) {
  const card = (creditCards || []).find((item) => item.id === cardId);
  if (!card || !(card.limitCents > 0)) return null;
  const load = getCardMonthLoad({
    cardId,
    charges: cardCharges,
    monthKey,
    activeMonth,
    fx,
  });
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
