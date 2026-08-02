export function toCents(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  const cents = Math.round(amount * 100);
  return Number.isSafeInteger(cents) ? cents : 0;
}

export function fromCents(value) {
  return Number.isSafeInteger(value) ? value / 100 : 0;
}

export function resolveStoredCents(storedCents, legacyAmount, { positiveOnly = false } = {}) {
  const parsedCents = Number(storedCents);
  const cents = Number.isSafeInteger(parsedCents) ? parsedCents : toCents(legacyAmount);
  return positiveOnly && cents <= 0 ? 0 : cents;
}

export function cleanOccurrenceStatus(rawStatus, transactionIds, isValidMonthKey) {
  if (!rawStatus || typeof rawStatus !== "object" || Array.isArray(rawStatus)) return {};
  const validIds = transactionIds instanceof Set ? transactionIds : new Set(transactionIds);
  return Object.fromEntries(
    Object.entries(rawStatus).filter(([key, status]) => {
      const separator = key.lastIndexOf(":");
      if (separator <= 0) return false;
      const transactionId = key.slice(0, separator);
      const monthKey = key.slice(separator + 1);
      return status === "paid" && validIds.has(transactionId) && isValidMonthKey(monthKey);
    }),
  );
}

export function normalizeUniqueIds(items, createId) {
  const ids = new Set();
  return items.map((item) => {
    const id = ids.has(item.id) ? createId() : item.id;
    ids.add(id);
    return id === item.id ? item : { ...item, id };
  });
}

export function escapeCsvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
