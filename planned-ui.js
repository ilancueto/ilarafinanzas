/**
 * UI módulo planned — factory inyectada desde app.js.
 */
import { fromCents, toCents } from "./state-core.js";
import { isValidMonthKey, monthDiff, addMonths } from "./finance-core.js";
import {
  plannedAppliesToMonth,
  plannedStatusForMonth,
  countPlannedOutsideMonth as countPlannedOutsideMonthCore,
} from "./planned-core.js";

export function createPlannedUi(api) {
  const getState = () => api.getState();
  const setState = (next) => api.setState(next);
  const getDom = () => api.dom;
  const {
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
    render,
    showToast,
    confirmAction,
    requireOpenMonth,
    switchView,
    openMovementDialog,
    fillSelectOptions,
    setSelectValue,
    sanitizeText,
    createId,
    loadFormPrefs,
    closeMovementDialog,
    updateScheduleFields,
  } = api;

function countPlannedOutsideMonth(monthKey) {
  return countPlannedOutsideMonthCore(getState().plannedItems, monthKey);
}

function renderPlanned() {
  if (!getDom().plannedList) return;
  if (!Array.isArray(getState().plannedItems)) getState().plannedItems = [];
  const typeFilter = getDom().plannedTypeFilter?.value || "all";
  const statusFilter = getDom().plannedStatusFilter?.value || "open";
  const monthKey = getState().activeMonth;

  const rows = getState().plannedItems
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

  const openItems = getState().plannedItems
    .filter((item) => plannedAppliesToMonth(item, monthKey) && plannedStatusForMonth(item, monthKey) === "open");
  const incomeOpen = openItems.filter((item) => item.kind === "income")
    .reduce((sum, item) => sum + item.amountCents, 0);
  const expenseOpen = openItems.filter((item) => item.kind === "expense")
    .reduce((sum, item) => sum + item.amountCents, 0);
  const outsideCount = countPlannedOutsideMonth(monthKey);

  if (getDom().plannedTotals) {
    getDom().plannedTotals.replaceChildren();
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
      getDom().plannedTotals.append(cell);
    });
  }

  getDom().plannedList.replaceChildren();
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
    getDom().plannedList.append(note);
  }
  if (!rows.length) {
    getDom().plannedList.append(emptyState(
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
    getDom().plannedList.append(row);
  });
}

function updatePlannedFormFields() {
  if (!getDom().plannedForm) return;
  const monthly = getDom().plannedForm.elements.recurrence?.value === "monthly";
  if (getDom().plannedEndMonthField) getDom().plannedEndMonthField.hidden = !monthly;
}

function openPlannedDialog(id = "") {
  if (!getDom().plannedDialog || !getDom().plannedForm) return;
  // Alta o edición de un plan del mes activo: no permitir si el mes está cerrado.
  // (Editar un plan de otro mes abierto sí se puede al cambiar la fecha.)
  if (!id && !requireOpenMonth(getState().activeMonth, "Reabrí el mes antes de agregar un previsto")) return;
  const item = id ? getState().plannedItems.find((entry) => entry.id === id) : null;
  if (item && isMonthClosed(item.monthKey) && item.recurrence === "once") {
    showToast("Reabrí el mes del previsto antes de editarlo");
    return;
  }
  const form = getDom().plannedForm;
  form.reset();
  fillSelectOptions(form.elements.category, getState().categories, {
    preserve: false,
    extra: item?.category ? [item.category] : [],
  });
  fillSelectOptions(form.elements.person, getState().people.map((person) => person.name), {
    preserve: false,
    extra: item?.person ? [item.person] : [],
  });
  const prefs = loadFormPrefs();
  if (form.elements.id) form.elements.id.value = item?.id || "";
  // kind es radio: RadioNodeList acepta .value
  if (form.elements.kind) form.elements.kind.value = item?.kind || prefs.kind || "expense";
  if (form.elements.name) form.elements.name.value = item?.name || "";
  setSelectValue(form.elements.category, item?.category || prefs.category || getState().categories[0] || "Otros");
  setSelectValue(form.elements.person, item?.person || prefs.person || getState().people[0]?.name || "Compartido");
  if (form.elements.amount) form.elements.amount.value = item ? fromCents(item.amountCents) : "";
  // monthKey NO está en el HTML: se deriva de dueDate al guardar. No escribir elements.monthKey.
  if (form.elements.recurrence) form.elements.recurrence.value = item?.recurrence || "once";
  if (form.elements.endMonth) form.elements.endMonth.value = item?.endMonth || "";
  if (form.elements.dueDate) {
    const fallbackDay = new Date().getDate();
    form.elements.dueDate.value = item?.dueDate
      || (item?.dueDay ? clampDateToMonth(item.monthKey || getState().activeMonth, item.dueDay) : "")
      || clampDateToMonth(getState().activeMonth, fallbackDay)
      || `${getState().activeMonth}-01`;
  }
  if (form.elements.note) form.elements.note.value = item?.note || "";
  if (getDom().plannedDialogTitle) {
    getDom().plannedDialogTitle.textContent = item ? "Editar previsto" : "Nuevo previsto";
  }
  if (getDom().deletePlannedBtn) getDom().deletePlannedBtn.hidden = !item;
  updatePlannedFormFields();
  if (!getDom().plannedDialog.open) getDom().plannedDialog.showModal();
  requestAnimationFrame(() => form.elements.name?.focus?.());
}

async function savePlannedItem(event) {
  event.preventDefault();
  if (!getDom().plannedForm) return;
  const formData = new FormData(getDom().plannedForm);
  const existingId = sanitizeText(formData.get("id"));
  const existing = existingId
    ? getState().plannedItems.find((item) => item.id === existingId)
    : null;
  const dueDateRaw = sanitizeText(formData.get("dueDate"));
  if (!isValidIsoDate(dueDateRaw)) {
    showToast("Elegí una fecha válida del calendario");
    return;
  }
  // El mes del plan sale de la fecha (un solo control).
  const monthKeyFromDate = dueDateRaw.slice(0, 7);
  if (!requireOpenMonth(monthKeyFromDate, "Reabrí el mes de la fecha antes de guardar el previsto")) return;
  if (existing?.monthKey && existing.monthKey !== monthKeyFromDate
    && !requireOpenMonth(existing.monthKey, "Reabrí el mes original del previsto antes de moverlo")) {
    return;
  }
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
  const previousState = cloneState(getState());
  if (!Array.isArray(getState().plannedItems)) getState().plannedItems = [];
  const index = getState().plannedItems.findIndex((entry) => entry.id === item.id);
  if (index >= 0) getState().plannedItems[index] = item;
  else getState().plannedItems.push(item);

  if (!getState().people.some((person) => person.name.toLocaleLowerCase("es") === item.person.toLocaleLowerCase("es"))) {
    getState().people.push({ id: createId(), name: item.person });
  }
  if (!getState().categories.some((category) =>
    category.localeCompare(item.category, "es", { sensitivity: "base" }) === 0
  )) {
    getState().categories.push(item.category);
    getState().categories.sort((a, b) => a.localeCompare(b, "es"));
  }

  // Si el previsto es de otro mes, mostramos ese mes para que aparezca en la lista.
  if (item.monthKey && item.monthKey !== getState().activeMonth) {
    getState().activeMonth = item.monthKey;
  }

  if (!await saveState()) {
    setState(previousState);
    render();
    return;
  }
  getDom().plannedDialog.close();
  render();
  showToast(existingId ? "Previsto actualizado" : "Previsto agregado");
}

async function deletePlannedItem() {
  const id = sanitizeText(getDom().plannedForm?.elements?.id?.value);
  if (!id) return;
  const confirmed = await confirmAction({
    title: "Eliminar previsto",
    copy: "Se borra el plan. Los movimientos ya incorporados no se tocan.",
    confirmLabel: "Eliminar",
    danger: true,
  });
  if (!confirmed) return;
  const previousState = cloneState(getState());
  getState().plannedItems = (getState().plannedItems || []).filter((item) => item.id !== id);
  if (!await saveState()) {
    setState(previousState);
    render();
    return;
  }
  getDom().plannedDialog?.close();
  render();
  showToast("Previsto eliminado", {
    label: "Deshacer",
    handler: async () => {
      const before = cloneState(getState());
      setState(previousState);
      if (!await saveState()) {
        setState(before);
        render();
        return;
      }
      render();
      showToast("Previsto restaurado");
    },
  });
}

/**
 * Duplicar: no cierra/reabre el dialog (eso vaciaba el form por method=dialog / race).
 * Deja los campos tal cual y limpia id para que Guardar cree un movimiento nuevo.
 */
function duplicateMovementFromDialog() {
  if (!requireOpenMonth(getState().activeMonth, "Reabrí el mes antes de duplicar")) return;
  const form = getDom().movementForm;
  if (!form) return;
  // Quitar identidad: al guardar se crea serie nueva con estos datos.
  if (form.elements.id) form.elements.id.value = "";
  if (form.elements.occurrenceKey) form.elements.occurrenceKey.value = "";
  // Copia en el mes activo (no en el mes de origen de la serie).
  if (form.elements.startMonth) form.elements.startMonth.value = getState().activeMonth;
  if (form.elements.endMonth) form.elements.endMonth.value = "";
  if (getDom().editScopeField) getDom().editScopeField.hidden = true;
  if (form.elements.editScope) form.elements.editScope.value = "all";
  if (getDom().duplicateMovementBtn) getDom().duplicateMovementBtn.hidden = true;
  if (getDom().deleteMovementBtn) getDom().deleteMovementBtn.hidden = true;
  if (getDom().movementDialogTitle) {
    getDom().movementDialogTitle.textContent = "Duplicar movimiento";
  }
  updateScheduleFields();
  showToast("Revisá y guardá la copia (queda como movimiento nuevo)");
  requestAnimationFrame(() => form.elements.name?.focus?.());
}

function openPlannedConfirm(id) {
  const item = (getState().plannedItems || []).find((entry) => entry.id === id);
  if (!item || !getDom().plannedConfirmDialog || !getDom().plannedConfirmForm) return;
  if (!requireOpenMonth(getState().activeMonth, "Reabrí el mes antes de confirmar un previsto")) return;
  if (plannedStatusForMonth(item, getState().activeMonth) !== "open") {
    showToast("Este previsto ya se resolvió para el mes");
    return;
  }
  getDom().plannedConfirmForm.elements.id.value = item.id;
  getDom().plannedConfirmForm.elements.amount.value = fromCents(item.amountCents);
  if (getDom().plannedConfirmTitle) {
    getDom().plannedConfirmTitle.textContent = item.kind === "income"
      ? `¿Se cobró «${item.name}»?`
      : `¿Se pagó «${item.name}»?`;
  }
  if (getDom().plannedConfirmCopy) {
    getDom().plannedConfirmCopy.textContent =
      `Monto esperado: ${formatCurrency(item.amountCents)}. Si cambió, editalo abajo y confirmá.`;
  }
  getDom().plannedConfirmDialog.showModal();
  window.setTimeout(() => getDom().plannedConfirmForm.elements.amount.focus(), 40);
}

async function confirmPlannedItem(event) {
  event.preventDefault();
  if (!requireOpenMonth(getState().activeMonth, "Reabrí el mes antes de confirmar un previsto")) return;
  const formData = new FormData(getDom().plannedConfirmForm);
  const id = sanitizeText(formData.get("id"));
  const amountCents = toCents(formData.get("amount"));
  const item = (getState().plannedItems || []).find((entry) => entry.id === id);
  if (!item || amountCents <= 0) {
    showToast("Monto inválido");
    return;
  }
  if (plannedStatusForMonth(item, getState().activeMonth) !== "open") {
    showToast("Este previsto ya se resolvió para el mes");
    return;
  }

  const previousState = cloneState(getState());
  const transaction = normalizeTransaction({
    id: createId(),
    kind: item.kind,
    name: item.name,
    category: item.category,
    person: item.person,
    amountCents,
    scheduleType: "one-time",
    startMonth: getState().activeMonth,
    dueDay: item.dueDay,
    note: item.note ? `Desde previsto · ${item.note}` : "Desde previsto",
  });
  if (!transaction) {
    showToast("No se pudo crear el movimiento");
    return;
  }
  getState().transactions.push(transaction);
  const statusKey = `${transaction.id}:${getState().activeMonth}`;
  const occurrence = occurrenceForMonth(transaction, getState().activeMonth, {});
  if (occurrence) {
    getState().occurrences[statusKey] = materializeOccurrence(occurrence, {
      status: "paid",
      actualAmountCents: amountCents,
      effectiveDate: localDateKey(),
    });
  }
  const planIndex = getState().plannedItems.findIndex((entry) => entry.id === id);
  if (planIndex >= 0) {
    const next = { ...getState().plannedItems[planIndex] };
    next.fulfilledMonths = [...new Set([...(next.fulfilledMonths || []), getState().activeMonth])];
    next.dismissedMonths = (next.dismissedMonths || []).filter((month) => month !== getState().activeMonth);
    // One-shot: remove after confirm. Monthly: keep for next months.
    if (next.recurrence === "once") {
      getState().plannedItems.splice(planIndex, 1);
    } else {
      getState().plannedItems[planIndex] = next;
    }
  }

  if (!await saveState()) {
    setState(previousState);
    render();
    return;
  }
  getDom().plannedConfirmDialog.close();
  render();
  showToast(
    item.kind === "income" ? "Ingreso incorporado a Movimientos" : "Gasto incorporado a Movimientos",
    {
      label: "Ver",
      handler: () => {
        switchView("movements");
        openMovementDialog(transaction.id, getState().activeMonth);
      },
    },
  );
}

async function dismissPlannedItem() {
  if (!requireOpenMonth(getState().activeMonth, "Reabrí el mes antes de resolver un previsto")) return;
  const id = sanitizeText(getDom().plannedConfirmForm?.elements?.id?.value);
  const item = (getState().plannedItems || []).find((entry) => entry.id === id);
  if (!item) return;
  const confirmed = await confirmAction({
    title: "Marcar como no cumplido",
    copy: `«${item.name}» no se incorporará a Movimientos este mes.`,
    confirmLabel: "No se cumplió",
    danger: true,
  });
  if (!confirmed) return;
  const previousState = cloneState(getState());
  const index = getState().plannedItems.findIndex((entry) => entry.id === id);
  if (index < 0) return;
  const next = { ...getState().plannedItems[index] };
  next.dismissedMonths = [...new Set([...(next.dismissedMonths || []), getState().activeMonth])];
  next.fulfilledMonths = (next.fulfilledMonths || []).filter((month) => month !== getState().activeMonth);
  if (next.recurrence === "once") {
    getState().plannedItems.splice(index, 1);
  } else {
    getState().plannedItems[index] = next;
  }
  if (!await saveState()) {
    setState(previousState);
    render();
    return;
  }
  getDom().plannedConfirmDialog?.close();
  render();
  showToast("Previsto marcado como no cumplido");
}


  return {
    countPlannedOutsideMonth,
    renderPlanned,
    updatePlannedFormFields,
    openPlannedDialog,
    duplicateMovementFromDialog,
    openPlannedConfirm,
    savePlannedItem,
    deletePlannedItem,
    confirmPlannedItem,
    dismissPlannedItem,
  };
}
