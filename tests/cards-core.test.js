import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCardProjection,
  cardNextCuotaCents,
  cardRemainingCents,
  cardRemainingInstallments,
  chargeAmountArsForLimit,
  getAllCardsMonthLoad,
  getCardMonthLoad,
  isCuentaCorrienteCard,
  nameLooksLikeCuentaCorriente,
  statementMonthKeyForPurchase,
  toArsCents,
  wouldExceedCardLimit,
} from "../cards-core.js";

const fx = { usdArs: 1000, useManual: false, manualUsdArs: null, apiUsdArs: null };

function installmentCharge(overrides = {}) {
  return {
    id: "ch-1",
    cardId: "card-1",
    name: "TV",
    chargeType: "installment",
    currency: "ARS",
    totalAmountCents: 120_000,
    monthlyAmountCents: 0,
    installments: 3,
    paidInstallments: 0,
    monthKey: "",
    note: "",
    active: true,
    ...overrides,
  };
}

test("detecta nombres de cuenta corriente", () => {
  assert.equal(nameLooksLikeCuentaCorriente("CC Mara"), true);
  assert.equal(nameLooksLikeCuentaCorriente("Cuenta corriente"), true);
  assert.equal(nameLooksLikeCuentaCorriente("Visa Gold"), false);
});

test("isCuentaCorrienteCard usa el flag excludeFromCardTotals", () => {
  assert.equal(isCuentaCorrienteCard({ excludeFromCardTotals: true }), true);
  assert.equal(isCuentaCorrienteCard({ excludeFromCardTotals: false }), false);
});

test("reparte cuotas y resto sin perder centavos", () => {
  const charge = installmentCharge({ totalAmountCents: 100_00, installments: 3 });
  assert.equal(cardRemainingInstallments(charge), 3);
  const next = cardNextCuotaCents(charge);
  const remaining = cardRemainingCents(charge);
  assert.equal(remaining, 100_00);
  assert.ok(next > 0);
  assert.equal(next + cardRemainingCents({ ...charge, paidInstallments: 1 }), remaining);
});

test("toArsCents multiplica USD por cotización", () => {
  assert.equal(toArsCents(10_00, "ARS", fx), 10_00);
  assert.equal(toArsCents(10_00, "USD", fx), 10_00 * 1000);
});

test("carga del mes: cuota del mes activo + fijo + compra del mes", () => {
  const charges = [
    installmentCharge({ paidInstallments: 0 }),
    {
      id: "f1",
      cardId: "card-1",
      name: "Netflix",
      chargeType: "fixed",
      currency: "ARS",
      totalAmountCents: 0,
      monthlyAmountCents: 5_000,
      installments: 1,
      paidInstallments: 0,
      monthKey: "",
      active: true,
    },
    {
      id: "p1",
      cardId: "card-1",
      name: "Super",
      chargeType: "purchase",
      currency: "ARS",
      totalAmountCents: 8_000,
      monthlyAmountCents: 0,
      installments: 1,
      paidInstallments: 0,
      monthKey: "2026-08",
      active: true,
    },
  ];
  const load = getCardMonthLoad({
    cardId: "card-1",
    charges,
    monthKey: "2026-08",
    activeMonth: "2026-08",
    fx,
  });
  assert.equal(load.fixedArs, 5_000);
  assert.equal(load.purchaseArs, 8_000);
  assert.equal(load.installmentArs, 40_000); // 120000 / 3
  assert.equal(load.totalArs, 5_000 + 8_000 + 40_000);
});

test("getAllCardsMonthLoad excluye CC por defecto", () => {
  const creditCards = [
    { id: "a", name: "Visa", excludeFromCardTotals: false },
    { id: "b", name: "CC", excludeFromCardTotals: true },
  ];
  const cardCharges = [
    installmentCharge({ cardId: "a", totalAmountCents: 30_000, installments: 1, paidInstallments: 0 }),
    installmentCharge({
      id: "ch-b",
      cardId: "b",
      totalAmountCents: 90_000,
      installments: 1,
      paidInstallments: 0,
    }),
  ];
  // installments:1 with chargeType installment — cardRemaining might still work
  const plastic = getAllCardsMonthLoad({
    creditCards,
    cardCharges: [
      { ...installmentCharge({ cardId: "a", totalAmountCents: 30_000, installments: 3 }), id: "ca" },
      { ...installmentCharge({ cardId: "b", totalAmountCents: 90_000, installments: 3 }), id: "cb" },
    ],
    monthKey: "2026-08",
    activeMonth: "2026-08",
    fx,
    includeExcluded: false,
  });
  assert.equal(plastic.byCard.length, 1);
  assert.equal(plastic.byCard[0].card.id, "a");
});

test("buildCardProjection repite fijos y avanza cuotas", () => {
  const creditCards = [{ id: "card-1", name: "Visa", excludeFromCardTotals: false }];
  const cardCharges = [
    installmentCharge({ totalAmountCents: 30_000, installments: 3, paidInstallments: 0 }),
    {
      id: "fix",
      cardId: "card-1",
      name: "Fijo",
      chargeType: "fixed",
      currency: "ARS",
      monthlyAmountCents: 1_000,
      totalAmountCents: 0,
      installments: 1,
      paidInstallments: 0,
      active: true,
    },
  ];
  const months = buildCardProjection({
    creditCards,
    cardCharges,
    monthCount: 3,
    fromMonth: "2026-08",
    fx,
  });
  assert.equal(months.length, 3);
  assert.equal(months[0].fixedArs, 1_000);
  assert.equal(months[1].fixedArs, 1_000);
  assert.equal(months[0].installmentArs, 10_000);
  assert.equal(months[2].installmentArs, 10_000);
});

test("wouldExceedCardLimit detecta tope", () => {
  const creditCards = [{ id: "card-1", name: "Visa", limitCents: 50_000, excludeFromCardTotals: false }];
  const cardCharges = [
    installmentCharge({ totalAmountCents: 30_000, installments: 1, paidInstallments: 0 }),
  ];
  // 1 installment of 30000 + extra
  const over = wouldExceedCardLimit({
    creditCards,
    cardCharges,
    cardId: "card-1",
    extraArsCents: 25_000,
    monthKey: "2026-08",
    activeMonth: "2026-08",
    fx,
  });
  assert.ok(over);
  assert.ok(over.overBy > 0);

  const ok = wouldExceedCardLimit({
    creditCards,
    cardCharges,
    cardId: "card-1",
    extraArsCents: 1_000,
    monthKey: "2026-08",
    activeMonth: "2026-08",
    fx,
  });
  // 30000 + 1000 = 31000 < 50000
  assert.equal(ok, null);
});

test("statementMonthKeyForPurchase respeta cierre", () => {
  const card = { closingDate: "2026-08-15", closingDay: 15 };
  // day 10 <= 15 → August
  assert.equal(statementMonthKeyForPurchase(card, new Date(2026, 7, 10)), "2026-08");
  // day 20 > 15 → September
  assert.equal(statementMonthKeyForPurchase(card, new Date(2026, 7, 20)), "2026-09");
});

test("chargeAmountArsForLimit convierte USD", () => {
  const fixedUsd = {
    chargeType: "fixed",
    currency: "USD",
    monthlyAmountCents: 10_00,
    active: true,
  };
  assert.equal(chargeAmountArsForLimit(fixedUsd, fx), 10_00 * 1000);
});
