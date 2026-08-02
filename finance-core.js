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

export function installmentAmount(transaction, installmentIndex) {
  const totalCents = Math.round(transaction.amount * 100);
  const count = transaction.schedule.installments;
  const baseCents = Math.floor(totalCents / count);
  const remainder = totalCents % count;
  return (baseCents + (installmentIndex < remainder ? 1 : 0)) / 100;
}

export function occurrenceForMonth(transaction, monthKey, occurrenceStatus = {}) {
  const diff = monthDiff(transaction.schedule.startMonth, monthKey);
  if (diff < 0) return null;
  if (transaction.schedule.type === "one-time" && diff !== 0) return null;
  if (transaction.schedule.type === "installment" && diff >= transaction.schedule.installments) return null;
  if (
    transaction.schedule.type === "monthly" && transaction.schedule.endMonth &&
    monthDiff(monthKey, transaction.schedule.endMonth) < 0
  ) return null;

  const amount = transaction.schedule.type === "installment"
    ? installmentAmount(transaction, diff) : transaction.amount;
  const key = `${transaction.id}:${monthKey}`;
  return {
    ...transaction,
    monthKey,
    amountThisMonth: amount,
    installmentIndex: transaction.schedule.type === "installment" ? diff + 1 : 0,
    status: occurrenceStatus[key] === "paid" ? "paid" : "pending",
    statusKey: key,
  };
}

export function getOccurrences(transactions, occurrenceStatus, monthKey) {
  return transactions
    .map((transaction) => occurrenceForMonth(transaction, monthKey, occurrenceStatus))
    .filter(Boolean)
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
      if (a.dueDay !== b.dueDay) return (a.dueDay || 32) - (b.dueDay || 32);
      return a.name.localeCompare(b.name, "es");
    });
}

export function getMonthTotals(transactions, occurrenceStatus, monthKey) {
  const occurrences = getOccurrences(transactions, occurrenceStatus, monthKey);
  const incomes = occurrences.filter((item) => item.kind === "income");
  const expenses = occurrences.filter((item) => item.kind === "expense");
  const totalIncome = incomes.reduce((sum, item) => sum + item.amountThisMonth, 0);
  const totalExpense = expenses.reduce((sum, item) => sum + item.amountThisMonth, 0);
  const paidExpense = expenses.filter((item) => item.status === "paid")
    .reduce((sum, item) => sum + item.amountThisMonth, 0);
  const receivedIncome = incomes.filter((item) => item.status === "paid")
    .reduce((sum, item) => sum + item.amountThisMonth, 0);

  return {
    monthKey,
    occurrences,
    incomes,
    expenses,
    totalIncome,
    totalExpense,
    paidExpense,
    receivedIncome,
    pendingExpense: totalExpense - paidExpense,
    pendingIncome: totalIncome - receivedIncome,
    actualBalance: receivedIncome - paidExpense,
    balance: totalIncome - totalExpense,
    commitmentRate: totalIncome > 0 ? totalExpense / totalIncome : totalExpense > 0 ? 1 : 0,
  };
}

export function buildProjection({ transactions, occurrenceStatus, activeMonth, monthCount, openingBalance }) {
  let cumulative = Number(openingBalance) || 0;
  return Array.from({ length: monthCount }, (_, index) => {
    const totals = getMonthTotals(transactions, occurrenceStatus, addMonths(activeMonth, index));
    cumulative += totals.balance;
    return { ...totals, cumulative };
  });
}
