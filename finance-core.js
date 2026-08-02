export function formatMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function isValidMonthKey(value) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ""));
}

export function parseMonthKey(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

export function addMonths(monthKey, offset) {
  const date = parseMonthKey(monthKey);
  date.setMonth(date.getMonth() + offset);
  return formatMonthKey(date);
}

export function monthDiff(startMonth, targetMonth) {
  const start = parseMonthKey(startMonth);
  const target = parseMonthKey(targetMonth);
  return (target.getFullYear() - start.getFullYear()) * 12 + target.getMonth() - start.getMonth();
}

export function isEndMonthValid(startMonth, endMonth) {
  return !endMonth || (isValidMonthKey(startMonth) && isValidMonthKey(endMonth) && monthDiff(startMonth, endMonth) >= 0);
}

export function installmentAmountCents(transaction, installmentIndex) {
  const totalCents = transaction.amountCents;
  const count = transaction.schedule.installments;
  const baseCents = Math.floor(totalCents / count);
  const remainder = totalCents % count;
  return baseCents + (installmentIndex < remainder ? 1 : 0);
}

function occurrenceFromRecord(record, fallbackKey = "") {
  if (!record || record.status === "skipped") return null;
  const monthKey = record.monthKey;
  const separator = fallbackKey.lastIndexOf(":");
  const transactionId = record.transactionId || fallbackKey.slice(0, separator);
  const plannedAmountCents = Number.isSafeInteger(record.plannedAmountCents) ? record.plannedAmountCents : 0;
  if (!transactionId || !isValidMonthKey(monthKey) || plannedAmountCents <= 0) return null;
  return {
    id: transactionId,
    kind: record.kind === "income" ? "income" : "expense",
    name: record.name || (record.kind === "income" ? "Ingreso" : "Gasto"),
    category: record.category || "Otros",
    person: record.person || "Compartido",
    amountCents: Number.isSafeInteger(record.seriesAmountCents) ? record.seriesAmountCents : plannedAmountCents,
    amountThisMonthCents: plannedAmountCents,
    actualAmountCents: Number.isSafeInteger(record.actualAmountCents) ? record.actualAmountCents : null,
    effectiveDate: record.effectiveDate || "",
    dueDay: Number.isInteger(record.dueDay) ? record.dueDay : 0,
    note: record.note || "",
    monthKey,
    installmentIndex: Number.isInteger(record.installmentIndex) ? record.installmentIndex : 0,
    status: record.status === "paid" ? "paid" : "pending",
    statusKey: `${transactionId}:${monthKey}`,
    schedule: {
      type: record.scheduleType || "one-time",
      startMonth: monthKey,
      endMonth: "",
      installments: Number.isInteger(record.installments) ? record.installments : 1,
    },
    materialized: true,
  };
}

export function occurrenceForMonth(transaction, monthKey, occurrenceRecords = {}) {
  const key = `${transaction.id}:${monthKey}`;
  const record = occurrenceRecords[key];
  const legacyStatus = record === "paid";
  if (record && !legacyStatus) return occurrenceFromRecord(record, key);
  const diff = monthDiff(transaction.schedule.startMonth, monthKey);
  if (diff < 0) return null;
  if (transaction.schedule.type === "one-time" && diff !== 0) return null;
  if (transaction.schedule.type === "installment" && diff >= transaction.schedule.installments) return null;
  if (
    transaction.schedule.type === "monthly" && transaction.schedule.endMonth &&
    monthDiff(monthKey, transaction.schedule.endMonth) < 0
  ) return null;

  const amountCents = transaction.schedule.type === "installment"
    ? installmentAmountCents(transaction, diff) : transaction.amountCents;
  return {
    ...transaction,
    monthKey,
    amountThisMonthCents: amountCents,
    installmentIndex: transaction.schedule.type === "installment" ? diff + 1 : 0,
    actualAmountCents: legacyStatus ? amountCents : null,
    effectiveDate: "",
    status: legacyStatus ? "paid" : "pending",
    statusKey: key,
    materialized: false,
  };
}

export function getOccurrences(transactions, occurrenceRecords, monthKey) {
  const generated = transactions
    .map((transaction) => occurrenceForMonth(transaction, monthKey, occurrenceRecords))
    .filter(Boolean);
  const byKey = new Map(generated.map((item) => [item.statusKey, item]));
  Object.entries(occurrenceRecords || {}).forEach(([key, record]) => {
    if (record?.monthKey !== monthKey || byKey.has(key)) return;
    const occurrence = occurrenceFromRecord(record, key);
    if (occurrence) byKey.set(key, occurrence);
  });
  return [...byKey.values()]
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
      if (a.dueDay !== b.dueDay) return (a.dueDay || 32) - (b.dueDay || 32);
      return a.name.localeCompare(b.name, "es");
    });
}

export function getMonthTotals(transactions, occurrenceRecords, monthKey) {
  const occurrences = getOccurrences(transactions, occurrenceRecords, monthKey);
  const incomes = occurrences.filter((item) => item.kind === "income");
  const expenses = occurrences.filter((item) => item.kind === "expense");
  const totalIncomeCents = incomes.reduce((sum, item) => sum + item.amountThisMonthCents, 0);
  const totalExpenseCents = expenses.reduce((sum, item) => sum + item.amountThisMonthCents, 0);
  const realizedAmount = (item) => item.status === "paid" && Number.isSafeInteger(item.actualAmountCents)
    ? item.actualAmountCents : item.amountThisMonthCents;
  const paidExpenseCents = expenses.filter((item) => item.status === "paid")
    .reduce((sum, item) => sum + realizedAmount(item), 0);
  const receivedIncomeCents = incomes.filter((item) => item.status === "paid")
    .reduce((sum, item) => sum + realizedAmount(item), 0);
  const pendingExpenseCents = expenses.filter((item) => item.status === "pending")
    .reduce((sum, item) => sum + item.amountThisMonthCents, 0);
  const pendingIncomeCents = incomes.filter((item) => item.status === "pending")
    .reduce((sum, item) => sum + item.amountThisMonthCents, 0);

  return {
    monthKey,
    occurrences,
    incomes,
    expenses,
    totalIncomeCents,
    totalExpenseCents,
    paidExpenseCents,
    receivedIncomeCents,
    pendingExpenseCents,
    pendingIncomeCents,
    actualBalanceCents: receivedIncomeCents - paidExpenseCents,
    balanceCents: totalIncomeCents - totalExpenseCents,
    commitmentRate: totalIncomeCents > 0 ? totalExpenseCents / totalIncomeCents : totalExpenseCents > 0 ? 1 : 0,
  };
}

export function buildProjection({
  transactions,
  occurrenceRecords = {},
  occurrenceStatus = {},
  activeMonth,
  monthCount,
  openingBalanceCents,
  openingBalanceMonth = activeMonth,
}) {
  const records = Object.keys(occurrenceRecords).length ? occurrenceRecords : Object.fromEntries(
    Object.entries(occurrenceStatus).map(([key, status]) => {
      const separator = key.lastIndexOf(":");
      const transaction = transactions.find((item) => item.id === key.slice(0, separator));
      const monthKey = key.slice(separator + 1);
      const occurrence = transaction ? occurrenceForMonth(transaction, monthKey) : null;
      return [key, occurrence ? {
        transactionId: transaction.id,
        monthKey,
        plannedAmountCents: occurrence.amountThisMonthCents,
        seriesAmountCents: transaction.amountCents,
        actualAmountCents: occurrence.amountThisMonthCents,
        status,
        effectiveDate: "",
        kind: transaction.kind,
        name: transaction.name,
        category: transaction.category,
        person: transaction.person,
        dueDay: transaction.dueDay,
        note: transaction.note,
        scheduleType: transaction.schedule.type,
        installmentIndex: occurrence.installmentIndex,
        installments: transaction.schedule.installments,
      } : null];
    }).filter(([, record]) => record),
  );
  const initialBalance = Number.isSafeInteger(openingBalanceCents) ? openingBalanceCents : 0;
  let cumulativeCents = 0;
  if (isValidMonthKey(openingBalanceMonth) && monthDiff(openingBalanceMonth, activeMonth) >= 0) {
    cumulativeCents = initialBalance;
    const elapsedMonths = monthDiff(openingBalanceMonth, activeMonth);
    for (let index = 0; index < elapsedMonths; index += 1) {
      cumulativeCents += getMonthTotals(transactions, records, addMonths(openingBalanceMonth, index)).balanceCents;
    }
  }
  return Array.from({ length: monthCount }, (_, index) => {
    const monthKey = addMonths(activeMonth, index);
    if (monthKey === openingBalanceMonth && monthDiff(activeMonth, openingBalanceMonth) > 0) {
      cumulativeCents += initialBalance;
    }
    const totals = getMonthTotals(transactions, records, monthKey);
    cumulativeCents += totals.balanceCents;
    return { ...totals, cumulativeCents };
  });
}

export function dueStateForOccurrence(occurrence, referenceDate = new Date()) {
  if (!occurrence || occurrence.status === "paid" || !occurrence.dueDay) return "none";
  const [year, month] = occurrence.monthKey.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const dueDate = new Date(year, month - 1, Math.min(occurrence.dueDay, lastDay));
  const today = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const differenceDays = Math.round((dueDate - today) / 86400000);
  if (differenceDays < 0) return "overdue";
  if (differenceDays === 0) return "today";
  if (differenceDays <= 7) return "upcoming";
  return "scheduled";
}

export function installmentProgress(occurrence) {
  if (occurrence?.schedule?.type !== "installment") return null;
  const count = occurrence.schedule.installments;
  const completed = Math.max(0, occurrence.installmentIndex - (occurrence.status === "paid" ? 0 : 1));
  const transactionTotal = occurrence.amountCents;
  let paidCents = 0;
  for (let index = 0; index < completed; index += 1) {
    paidCents += installmentAmountCents({ ...occurrence, amountCents: transactionTotal }, index);
  }
  return {
    completed,
    total: count,
    remainingCents: Math.max(0, transactionTotal - paidCents),
  };
}
