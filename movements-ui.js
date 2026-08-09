/**
 * UI módulo movements — factory inyectada desde app.js.
 */
import { fromCents, toCents } from "./state-core.js";
import { isValidMonthKey, monthDiff, addMonths, isEndMonthValid, installmentAmountCents, formatMonthKey } from "./finance-core.js";

export function createMovementsUi(api) {
  const getState = () => api.getState();
  const setState = (next) => api.setState(next);
  const getDom = () => api.dom;
  const {
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
    render,
    showToast,
    confirmAction,
    requireOpenMonth,
    fillSelectOptions,
    setSelectValue,
    sanitizeText,
    createId,
    getMonthTotals,
    renderMovementTemplates,
  } = api;

function validateScheduleRange({ report = false } = {}) {
  const form = getDom().movementForm.elements;
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
  const type = getDom().movementForm.elements.scheduleType.value;
  const isInstallment = type === "installment";
  const isMonthly = type === "monthly";
  getDom().installmentsField.hidden = !isInstallment;
  getDom().endMonthField.hidden = !isMonthly;
  getDom().movementForm.elements.installments.required = isInstallment;
  getDom().movementForm.elements.installments.disabled = !isInstallment;
  getDom().movementForm.elements.endMonth.disabled = !isMonthly;
  getDom().amountLabel.textContent = isInstallment ? "Monto total" : "Monto";

  if (isInstallment) {
    const totalCents = toCents(getDom().movementForm.elements.amount.value);
    const count = Number(getDom().movementForm.elements.installments.value) || 2;
    const editingId = sanitizeText(getDom().movementForm.elements.id?.value);
    const futureEdit = Boolean(editingId) && getDom().movementForm.elements.editScope.value === "future";
    getDom().formHint.textContent = futureEdit
      ? "El monto y las cuotas formar\u00e1n un plan nuevo desde el mes activo; los meses anteriores conservar\u00e1n sus valores."
      : totalCents > 0
        ? `${count} cuotas de aproximadamente ${formatCurrency(Math.round(totalCents / count))}. La \u00faltima se ajusta si hace falta.`
        : "Ingres\u00e1 el total de la compra, no el valor de cada cuota.";
  } else if (isMonthly) {
    getDom().formHint.textContent = "Se repetir\u00e1 cada mes hasta la fecha final, o sin l\u00edmite si la dej\u00e1s vac\u00eda.";
  } else {
    getDom().formHint.textContent = "Aparecer\u00e1 \u00fanicamente en el mes de inicio.";
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

function openMovementDialog(transactionId = "", monthKey = getState().activeMonth) {
  if (!requireOpenMonth(monthKey, "Reabrí el mes antes de modificar movimientos")) return;
  const transaction = getState().transactions.find((item) => item.id === transactionId);
  const occurrenceKey = transactionId ? `${transactionId}:${monthKey}` : "";
  const record = occurrenceKey ? getState().occurrences[occurrenceKey] : null;
  const source = buildEditSource(transaction, record, monthKey);
  const lastPrefs = loadFormPrefs();

  // Abrir ya: el paint del modal no espera a reconstruir listas.
  if (!getDom().movementDialog.open) getDom().movementDialog.showModal();

  // No usar form.reset(): vacía y reescribe todo el DOM de inputs y pelea con el tipeo.
  const categoryExtra = source?.category ? [source.category] : [];
  const personExtra = source?.person ? [source.person] : [];
  fillSelectOptions(getDom().movementForm.elements.category, getState().categories, {
    preserve: true,
    extra: categoryExtra,
  });
  fillSelectOptions(
    getDom().movementForm.elements.person,
    getState().people.map((person) => person.name),
    { preserve: true, extra: personExtra },
  );

  getDom().movementForm.elements.id.value = source?.id || "";
  getDom().movementForm.elements.occurrenceKey.value = source ? occurrenceKey : "";
  const kind = source?.kind || lastPrefs.kind || "expense";
  [...getDom().movementForm.elements.kind].forEach((input) => {
    input.checked = input.value === kind;
  });
  // Asignar campos en un solo bloque; focus al final.
  const nameInput = getDom().movementForm.elements.name;
  nameInput.value = source?.name || "";
  setSelectValue(
    getDom().movementForm.elements.category,
    source?.category || lastPrefs.category || getState().categories[0] || "Otros",
  );
  setSelectValue(
    getDom().movementForm.elements.person,
    source?.person || lastPrefs.person || getState().people[0]?.name || "Compartido",
  );
  getDom().movementForm.elements.amount.value = source ? fromCents(source.amountCents) : "";
  getDom().movementForm.elements.startMonth.value = source?.schedule.startMonth || getState().activeMonth;
  getDom().movementForm.elements.scheduleType.value = source?.schedule.type
    || (!source ? lastPrefs.scheduleType : null)
    || "one-time";
  getDom().movementForm.elements.installments.value = source?.schedule.installments || 2;
  getDom().movementForm.elements.endMonth.value = source?.schedule.endMonth || "";
  if (getDom().movementForm.elements.dueDate) {
    const start = source?.schedule?.startMonth || getState().activeMonth;
    getDom().movementForm.elements.dueDate.value = source?.dueDate
      || (source?.dueDay ? clampDateToMonth(start, source.dueDay) : "");
  } else if (getDom().movementForm.elements.dueDay) {
    getDom().movementForm.elements.dueDay.value = source?.dueDay || "";
  }
  getDom().movementForm.elements.note.value = source?.note || "";
  const scheduleType = source?.schedule?.type || transaction?.schedule?.type || "one-time";
  const recurring = Boolean(transaction) && scheduleType !== "one-time";
  getDom().editScopeField.hidden = !recurring;
  getDom().movementForm.elements.editScope.value = "all";
  getDom().movementDialogTitle.textContent = source ? "Editar movimiento" : "Agregar movimiento";
  getDom().deleteMovementBtn.hidden = !source;
  if (getDom().duplicateMovementBtn) getDom().duplicateMovementBtn.hidden = !source;
  updateScheduleFields();
  renderMovementTemplates();
  // requestAnimationFrame: un frame después del showModal, sin setTimeout de 40ms.
  requestAnimationFrame(() => {
    if (!getDom().movementDialog?.open) return;
    nameInput?.focus?.();
    if (!source) nameInput?.select?.();
  });
}

function closeMovementDialog() {
  getDom().movementDialog.close();
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

function loadViewFilters() {
  try {
    const raw = localStorage.getItem(VIEW_FILTERS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveViewFilters(partial) {
  try {
    const current = loadViewFilters();
    const next = { ...current, ...partial };
    // Merge nested tab objects when provided.
    if (partial.movements && typeof partial.movements === "object") {
      next.movements = { ...(current.movements || {}), ...partial.movements };
    }
    if (partial.planned && typeof partial.planned === "object") {
      next.planned = { ...(current.planned || {}), ...partial.planned };
    }
    localStorage.setItem(VIEW_FILTERS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

function applyStoredViewFilters() {
  const filters = loadViewFilters();
  const movements = filters.movements || {};
  if (getDom().movementTypeFilter && movements.type) {
    const allowed = ["all", "income", "expense"];
    if (allowed.includes(movements.type)) getDom().movementTypeFilter.value = movements.type;
  }
  if (getDom().movementStatusFilter && movements.status) {
    const allowed = ["all", "pending", "paid"];
    if (allowed.includes(movements.status)) getDom().movementStatusFilter.value = movements.status;
  }
  const planned = filters.planned || {};
  if (getDom().plannedTypeFilter && planned.type) {
    const allowed = ["all", "income", "expense"];
    if (allowed.includes(planned.type)) getDom().plannedTypeFilter.value = planned.type;
  }
  if (getDom().plannedStatusFilter && planned.status) {
    const allowed = ["open", "done", "all"];
    if (allowed.includes(planned.status)) getDom().plannedStatusFilter.value = planned.status;
  }
}

function persistMovementFilters() {
  saveViewFilters({
    movements: {
      type: getDom().movementTypeFilter?.value || "all",
      status: getDom().movementStatusFilter?.value || "all",
    },
  });
}

function persistPlannedFilters() {
  saveViewFilters({
    planned: {
      type: getDom().plannedTypeFilter?.value || "all",
      status: getDom().plannedStatusFilter?.value || "open",
    },
  });
}

/** Diálogos de formulario: no se cierran con clic afuera ni Escape (solo × / Cancelar / Guardar). */
function lockDialogDismiss(dialog) {
  if (!dialog || dialog.dataset.dismissLocked === "1") return;
  dialog.dataset.dismissLocked = "1";
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
  });
}

function applyOccurrenceEdit(occurrenceKey, transaction, existingSeries, monthKey = getState().activeMonth) {
  const originalOccurrence = getMonthTotals(monthKey).occurrences
    .find((item) => item.statusKey === occurrenceKey) ||
    (existingSeries
      ? occurrenceForMonth(existingSeries, monthKey, getState().occurrences)
      : null);
  const editedOccurrence = occurrenceForEditedTransaction(transaction, monthKey, originalOccurrence);
  if (!editedOccurrence) return false;
  const previousRecord = getState().occurrences[occurrenceKey];
  const key = occurrenceKey || `${transaction.id}:${monthKey}`;
  getState().occurrences[key] = materializeOccurrence(editedOccurrence, {
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
  Object.entries(getState().occurrences || {}).forEach(([key, record]) => {
    if (record.transactionId !== transactionId) return;
    if (fromMonth && monthDiff(fromMonth, record.monthKey) < 0) return;
    delete getState().occurrences[key];
  });
}

async function saveMovement(event) {
  event.preventDefault();
  const formData = new FormData(getDom().movementForm);
  if (!validateScheduleRange({ report: true })) return;
  // Guardia de mes cerrado: el mes del movimiento y el activo no deben estar cerrados.
  const formStartMonth = sanitizeText(formData.get("startMonth")) || getState().activeMonth;
  if (!requireOpenMonth(getState().activeMonth, "Reabrí el mes antes de guardar movimientos")) return;
  if (formStartMonth !== getState().activeMonth
    && !requireOpenMonth(formStartMonth, "Reabrí el mes de inicio antes de guardar")) {
    return;
  }
  const existingId = sanitizeText(formData.get("id"));
  const existingSeries = existingId
    ? getState().transactions.find((item) => item.id === existingId)
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

  const previousState = cloneState(getState());
  const index = getState().transactions.findIndex((item) => item.id === transaction.id);
  const occurrenceKey = sanitizeText(formData.get("occurrenceKey"))
    || (existingSeries ? `${existingSeries.id}:${getState().activeMonth}` : "");
  // one-time = siempre la serie completa. Default al editar = all (actualizar, no duplicar).
  let scope = sanitizeText(formData.get("editScope"), "all");
  if (existingSeries?.schedule.type === "one-time") scope = "all";
  if (!existingSeries) scope = "create";

  if (existingSeries && scope === "current") {
    if (!applyOccurrenceEdit(occurrenceKey, transaction, existingSeries, getState().activeMonth)) {
      setState(previousState);
      showToast("El movimiento no corresponde al mes activo");
      return;
    }
  } else if (existingSeries && scope === "future") {
    const prevMonth = addMonths(getState().activeMonth, -1);
    const hasPastMonths = monthDiff(existingSeries.schedule.startMonth, getState().activeMonth) > 0;
    if (hasPastMonths) {
      // Congelar meses anteriores con la serie vieja; desde este mes, serie nueva (mismo concepto).
      materializeSeriesThrough(existingSeries, prevMonth);
      preserveProtectedOccurrences(existingSeries);
      clearSeriesOccurrencesFromMonth(existingSeries.id, getState().activeMonth);
      if (existingSeries.schedule.type === "monthly") {
        getState().transactions[index] = {
          ...existingSeries,
          schedule: {
            ...existingSeries.schedule,
            endMonth: prevMonth,
          },
        };
      } else {
        // Cuotas: dejamos el pasado materializado y sacamos la serie vieja del listado activo.
        getState().transactions.splice(index, 1);
      }
      const nextSeries = {
        ...transaction,
        id: createId(),
        schedule: {
          ...transaction.schedule,
          startMonth: getState().activeMonth,
        },
        createdAt: new Date().toISOString(),
      };
      getState().transactions.push(nextSeries);
    } else {
      // Sin pasado que preservar: es una edición normal de la misma fila.
      getState().transactions[index] = transaction;
      clearUnprotectedOccurrenceRecords(transaction.id);
      preserveProtectedOccurrences(transaction);
      syncOccurrenceLabelsFromSeries(transaction);
      applyOccurrenceEdit(`${transaction.id}:${getState().activeMonth}`, transaction, transaction, getState().activeMonth);
    }
  } else if (existingSeries) {
    // Toda la serie / caso normal de editar: actualizar la misma fila.
    getState().transactions[index] = transaction;
    clearUnprotectedOccurrenceRecords(transaction.id);
    preserveProtectedOccurrences(transaction);
    syncOccurrenceLabelsFromSeries(transaction);
    // Asegurar que el mes activo refleje el form (aunque no hubiera registro previo).
    applyOccurrenceEdit(`${transaction.id}:${getState().activeMonth}`, transaction, transaction, getState().activeMonth);
  } else if (occurrenceKey && getState().occurrences[occurrenceKey]) {
    if (!applyOccurrenceEdit(occurrenceKey, transaction, null, getState().activeMonth)) {
      setState(previousState);
      showToast("El movimiento no corresponde al mes activo");
      return;
    }
  } else {
    // Alta nueva (sin id de serie): queda cobrado/pagado de una (si no se cumplió → Previstos).
    getState().transactions.push(transaction);
    const paidMonth = isValidMonthKey(transaction.schedule?.startMonth)
      ? transaction.schedule.startMonth
      : getState().activeMonth;
    const occurrence = occurrenceForMonth(transaction, paidMonth, {});
    if (occurrence) {
      getState().occurrences[`${transaction.id}:${paidMonth}`] = materializeOccurrence(occurrence, {
        status: "paid",
        actualAmountCents: occurrence.amountThisMonthCents,
        effectiveDate: localDateKey(),
      });
    }
  }

  const personName = transaction.person;
  if (!getState().people.some((person) => person.name.toLocaleLowerCase("es") === personName.toLocaleLowerCase("es"))) {
    getState().people.push({ id: createId(), name: personName });
  }
  if (!getState().categories.some((category) =>
    category.localeCompare(transaction.category, "es", { sensitivity: "base" }) === 0
  )) {
    getState().categories.push(transaction.category);
    getState().categories.sort((a, b) => a.localeCompare(b, "es"));
  }

  if (!await saveState()) {
    setState(previousState);
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
  if (!requireOpenMonth(getState().activeMonth, "Reabrí el mes antes de eliminar movimientos")) return;
  const id = sanitizeText(getDom().movementForm.elements.id.value);
  if (!id) {
    showToast("No hay movimiento para eliminar");
    return;
  }
  const index = getState().transactions.findIndex((item) => item.id === id);
  const transaction = index >= 0 ? getState().transactions[index] : null;
  const occurrenceKey = sanitizeText(getDom().movementForm.elements.occurrenceKey.value)
    || `${id}:${getState().activeMonth}`;
  const record = getState().occurrences[occurrenceKey];
  if (!transaction && !record) {
    showToast("No se encontró el movimiento");
    return;
  }
  const requestedScope = getDom().movementForm.elements.editScope?.value || "current";
  const scope = !transaction || transaction?.schedule?.type === "one-time" ? "all" : requestedScope;
  const name = transaction?.name || record?.name || "movimiento";
  const scopeCopy = scope === "current"
    ? "Sólo se excluirá del mes activo."
    : scope === "future"
      ? "Se conservarán los meses anteriores y se eliminará desde el mes activo (también si ya estaba pagado)."
      : "Se eliminará por completo en meses abiertos (también si ya estaba pagado). Los meses cerrados no se tocan.";

  closeMovementDialog();
  const confirmed = await confirmAction({
    title: "Eliminar movimiento",
    copy: `¿Querés eliminar “${name}”? ${scopeCopy}`,
    confirmLabel: "Eliminar",
    danger: true,
  });
  if (!confirmed) {
    openMovementDialog(id, record?.monthKey || getState().activeMonth);
    return;
  }

  const previousState = cloneState(getState());
  if (!transaction) {
    // Solo registro materializado (sin serie): borrar la clave del mes abierto.
    if (record?.monthKey && getState().closedMonths?.[record.monthKey]) {
      showToast("No se puede borrar un movimiento de un mes cerrado");
      return;
    }
    delete getState().occurrences[occurrenceKey];
  } else if (scope === "current") {
    const occurrence = occurrenceForMonth(transaction, getState().activeMonth, getState().occurrences);
    if (!occurrence) {
      showToast("No hay movimiento para excluir en este mes");
      openMovementDialog(id, getState().activeMonth);
      return;
    }
    // Incluye pagados: los movimientos se crean ya como "paid"; excluir del mes = skipped.
    getState().occurrences[occurrence.statusKey] = materializeOccurrence(occurrence, {
      status: "skipped",
      actualAmountCents: null,
      effectiveDate: "",
    });
  } else if (scope === "future") {
    materializeSeriesThrough(transaction, addMonths(getState().activeMonth, -1));
    preserveProtectedOccurrences(transaction);
    // includePaid: los movimientos se crean ya como "paid"; sin esto el item sigue en la lista.
    clearUnprotectedOccurrenceRecords(transaction.id, getState().activeMonth, { includePaid: true });
    getState().transactions = getState().transactions.filter((item) => item.id !== id);
  } else {
    preserveProtectedOccurrences(transaction);
    clearUnprotectedOccurrenceRecords(transaction.id, "", { includePaid: true });
    getState().transactions = getState().transactions.filter((item) => item.id !== id);
  }
  if (!await saveState()) {
    setState(previousState);
    render();
    return;
  }
  render();
  showToast("Movimiento eliminado", {
    label: "Deshacer",
    handler: async () => {
      const beforeRestore = cloneState(getState());
      setState(previousState);
      if (!await saveState()) {
        setState(beforeRestore);
        render();
        return;
      }
      render();
      showToast("Movimiento restaurado");
    },
  });
}


  return {
    validateScheduleRange,
    updateScheduleFields,
    buildEditSource,
    openMovementDialog,
    closeMovementDialog,
    loadFormPrefs,
    saveFormPrefs,
    loadViewFilters,
    saveViewFilters,
    applyStoredViewFilters,
    persistMovementFilters,
    persistPlannedFilters,
    lockDialogDismiss,
    applyOccurrenceEdit,
    clearSeriesOccurrencesFromMonth,
    saveMovement,
    deleteMovement,
  };
}
