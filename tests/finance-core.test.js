import test from "node:test";
import assert from "node:assert/strict";
import {
  addMonths,
  buildProjection,
  dueStateForOccurrence,
  getMonthTotals,
  getOccurrences,
  installmentProgress,
  installmentAmountCents,
  isEndMonthValid,
  occurrenceForMonth,
} from "../finance-core.js";

function transaction(overrides = {}) {
  return {
    id: "tx-1",
    kind: "expense",
    name: "Compra",
    category: "Hogar",
    person: "Compartido",
    amountCents: 10000,
    schedule: { type: "one-time", startMonth: "2026-08", endMonth: "", installments: 1 },
    dueDay: 10,
    note: "",
    createdAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

test("suma meses cruzando el cambio de año", () => {
  assert.equal(addMonths("2026-12", 1), "2027-01");
  assert.equal(addMonths("2026-01", -1), "2025-12");
});

test("un movimiento único aparece solamente en su mes", () => {
  const item = transaction();
  assert.ok(occurrenceForMonth(item, "2026-08"));
  assert.equal(occurrenceForMonth(item, "2026-07"), null);
  assert.equal(occurrenceForMonth(item, "2026-09"), null);
});

test("un movimiento mensual incluye el mes final", () => {
  const item = transaction({ schedule: { type: "monthly", startMonth: "2026-08", endMonth: "2026-10", installments: 1 } });
  assert.ok(occurrenceForMonth(item, "2026-08"));
  assert.ok(occurrenceForMonth(item, "2026-10"));
  assert.equal(occurrenceForMonth(item, "2026-11"), null);
});

test("valida el orden de inicio y fin", () => {
  assert.equal(isEndMonthValid("2026-08", ""), true);
  assert.equal(isEndMonthValid("2026-08", "2026-08"), true);
  assert.equal(isEndMonthValid("2026-08", "2026-07"), false);
});

test("reparte centavos de cuotas sin perder dinero", () => {
  const item = transaction({ amountCents: 10001, schedule: { type: "installment", startMonth: "2026-08", endMonth: "", installments: 3 } });
  const values = [0, 1, 2].map((index) => installmentAmountCents(item, index));
  assert.deepEqual(values, [3334, 3334, 3333]);
  assert.equal(values.reduce((sum, value) => sum + value, 0), 10001);
  assert.equal(occurrenceForMonth(item, "2026-11"), null);
});

test("calcula previsto, realizado y pendiente por separado", () => {
  const income = transaction({ id: "income", kind: "income", name: "Sueldo", amountCents: 100000 });
  const expense = transaction({ id: "expense", amountCents: 40000 });
  const status = { "income:2026-08": "paid", "expense:2026-08": "paid" };
  const totals = getMonthTotals([income, expense], status, "2026-08");

  assert.equal(totals.totalIncomeCents, 100000);
  assert.equal(totals.totalExpenseCents, 40000);
  assert.equal(totals.balanceCents, 60000);
  assert.equal(totals.actualBalanceCents, 60000);
  assert.equal(totals.pendingIncomeCents, 0);
  assert.equal(totals.pendingExpenseCents, 0);
});

test("ordena pendientes antes que pagados y luego por vencimiento", () => {
  const later = transaction({ id: "later", name: "Más tarde", dueDay: 20 });
  const sooner = transaction({ id: "sooner", name: "Antes", dueDay: 5 });
  const paid = transaction({ id: "paid", name: "Pagado", dueDay: 1 });
  const occurrences = getOccurrences([later, sooner, paid], { "paid:2026-08": "paid" }, "2026-08");
  assert.deepEqual(occurrences.map((item) => item.id), ["sooner", "later", "paid"]);
});

test("la proyección acumula desde el saldo inicial", () => {
  const income = transaction({
    id: "income",
    kind: "income",
    amountCents: 10000,
    schedule: { type: "monthly", startMonth: "2026-08", endMonth: "", installments: 1 },
  });
  const projection = buildProjection({
    transactions: [income],
    occurrenceStatus: {},
    activeMonth: "2026-08",
    monthCount: 3,
    openingBalanceCents: -5000,
    openingBalanceMonth: "2026-08",
  });
  assert.deepEqual(projection.map((month) => month.cumulativeCents), [5000, 15000, 25000]);
});

test("arrastra el saldo desde su mes de origen sin volver a aplicarlo", () => {
  const income = transaction({
    id: "income",
    kind: "income",
    amountCents: 10000,
    schedule: { type: "monthly", startMonth: "2026-08", endMonth: "", installments: 1 },
  });
  const projection = buildProjection({
    transactions: [income],
    occurrenceRecords: {},
    activeMonth: "2026-10",
    monthCount: 2,
    openingBalanceCents: 5000,
    openingBalanceMonth: "2026-08",
  });
  assert.deepEqual(projection.map((month) => month.cumulativeCents), [35000, 45000]);
});

test("usa el importe real sin perder el importe previsto", () => {
  const expense = transaction({ id: "expense", amountCents: 40000 });
  const records = {
    "expense:2026-08": {
      transactionId: "expense",
      monthKey: "2026-08",
      plannedAmountCents: 40000,
      seriesAmountCents: 40000,
      actualAmountCents: 42550,
      status: "paid",
      effectiveDate: "2026-08-10",
      kind: "expense",
      name: "Compra",
      category: "Hogar",
      person: "Compartido",
      dueDay: 10,
      note: "",
      scheduleType: "one-time",
      installmentIndex: 0,
      installments: 1,
    },
  };
  const totals = getMonthTotals([expense], records, "2026-08");
  assert.equal(totals.totalExpenseCents, 40000);
  assert.equal(totals.paidExpenseCents, 42550);
  assert.equal(totals.pendingExpenseCents, 0);
  assert.equal(totals.actualBalanceCents, -42550);
});

test("conserva una ocurrencia materializada aunque la serie ya no exista", () => {
  const record = {
    transactionId: "removed",
    monthKey: "2026-07",
    plannedAmountCents: 10000,
    seriesAmountCents: 10000,
    actualAmountCents: 9900,
    status: "paid",
    effectiveDate: "2026-07-05",
    kind: "expense",
    name: "Histórico",
    category: "Hogar",
    person: "Compartido",
    dueDay: 5,
    note: "",
    scheduleType: "monthly",
    installmentIndex: 0,
    installments: 1,
  };
  const occurrences = getOccurrences([], { "removed:2026-07": record }, "2026-07");
  assert.equal(occurrences.length, 1);
  assert.equal(occurrences[0].name, "Histórico");
  assert.equal(occurrences[0].actualAmountCents, 9900);
});

test("una exclusión mensual oculta sólo esa ocurrencia", () => {
  const monthly = transaction({
    schedule: { type: "monthly", startMonth: "2026-08", endMonth: "", installments: 1 },
  });
  const skipped = {
    "tx-1:2026-09": {
      transactionId: "tx-1",
      monthKey: "2026-09",
      plannedAmountCents: 10000,
      status: "skipped",
    },
  };
  assert.ok(occurrenceForMonth(monthly, "2026-08", skipped));
  assert.equal(occurrenceForMonth(monthly, "2026-09", skipped), null);
  assert.ok(occurrenceForMonth(monthly, "2026-10", skipped));
});

test("clasifica vencimientos con una fecha de referencia estable", () => {
  const base = { status: "pending", dueDay: 10, monthKey: "2026-08" };
  assert.equal(dueStateForOccurrence(base, new Date(2026, 7, 11)), "overdue");
  assert.equal(dueStateForOccurrence(base, new Date(2026, 7, 10)), "today");
  assert.equal(dueStateForOccurrence(base, new Date(2026, 7, 5)), "upcoming");
  assert.equal(dueStateForOccurrence({ ...base, status: "paid" }, new Date(2026, 7, 11)), "none");
});

test("calcula progreso y saldo restante de cuotas", () => {
  const item = occurrenceForMonth(transaction({
    amountCents: 10001,
    schedule: { type: "installment", startMonth: "2026-08", endMonth: "", installments: 3 },
  }), "2026-09");
  assert.deepEqual(installmentProgress(item), {
    completed: 1,
    total: 3,
    remainingCents: 6667,
  });
});
