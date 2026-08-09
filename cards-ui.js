/**
 * UI de Tarjetas (renders, dialogs, mutaciones de cargos/FX).
 * createCardsUi(api) — deps inyectadas desde app.js.
 */
import {
  cardNextCuotaCents,
  cardRemainingCents,
  cardRemainingInstallments,
  chargeAmountArsForLimit,
  creditCardsCuentaCorriente,
  creditCardsForTotals,
  getAllCardsMonthLoad,
  getCardMonthLoad,
  getCuentaCorrienteMonthLoad,
  isCuentaCorrienteCard,
  nameLooksLikeCuentaCorriente,
  statementMonthKeyForPurchase,
  toArsCents,
  wouldExceedCardLimit,
} from "./cards-core.js";
import { fromCents, toCents } from "./state-core.js";
import { addMonths, isValidMonthKey } from "./finance-core.js";

export function createCardsUi(api) {
  const getState = () => api.getState();
  const setState = (next) => api.setState(next);
  const getDom = () => api.dom;
  const {
    element,
    emptyState,
    formatMoneyAmount,
    formatMonthLabel,
    formatIsoDateLabel,
    formatFxRate,
    formatCurrency,
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
    getMonthTotals,
  } = api;

  let selectedCardId = "";

function renderCardsFxBar() {
  const rate = effectiveUsdArs();
  getState().fx.usdArs = rate;
  if (getDom().fxRateInput) {
    const displayRate = getState().fx.useManual && getState().fx.manualUsdArs
      ? getState().fx.manualUsdArs
      : (getState().fx.apiUsdArs || getState().fx.usdArs);
    if (document.activeElement !== getDom().fxRateInput) {
      getDom().fxRateInput.value = Number.isFinite(displayRate) ? String(displayRate) : "";
    }
  }
  if (getDom().fxUseManual) getDom().fxUseManual.checked = Boolean(getState().fx.useManual);
  if (getDom().fxStatus) {
    const parts = [];
    if (getState().fx.apiUsdArs) {
      parts.push(`Oficial: $ ${formatFxRate(getState().fx.apiUsdArs)}`);
      if (getState().fx.apiUpdatedAt) parts.push(`act. ${getState().fx.apiUpdatedAt}`);
    } else {
      parts.push("Sin cotización oficial todavía");
    }
    if (getState().fx.useManual && getState().fx.manualUsdArs) {
      parts.push(`Usando manual: $ ${formatFxRate(getState().fx.manualUsdArs)}`);
    } else if (getState().fx.apiUsdArs) {
      parts.push("Usando oficial");
    }
    getDom().fxStatus.textContent = parts.join(" · ");
  }
}

function renderChargeRow(charge) {
  const row = element("div", "cards-charge-row");
  const body = element("div", "cards-charge-body");
  const badge = charge.chargeType === "installment"
    ? "Cuotas"
    : charge.chargeType === "purchase"
      ? "Compra"
      : "Fijo";
  const currencyLabel = charge.currency === "USD" ? "USD" : "ARS";
  body.append(element("strong", "", charge.name));
  if (charge.chargeType === "installment") {
    const left = cardRemainingInstallments(charge);
    const next = cardNextCuotaCents(charge);
    const remaining = cardRemainingCents(charge);
    body.append(element(
      "p",
      "cards-charge-meta",
      `${badge} · ${charge.paidInstallments}/${charge.installments} pagadas · quedan ${left} · próxima ${formatMoneyAmount(next, currencyLabel)} · resto ${formatMoneyAmount(remaining, currencyLabel)}${charge.currency === "USD" ? ` (≈ ${formatMoneyAmount(toArsCents(remaining, "USD", getState().fx), "ARS")})` : ""}`,
    ));
  } else if (charge.chargeType === "purchase") {
    body.append(element(
      "p",
      "cards-charge-meta",
      `${badge} · ${formatMonthLabel(charge.monthKey)} · ${formatMoneyAmount(charge.totalAmountCents, currencyLabel)}${charge.currency === "USD" ? ` (≈ ${formatMoneyAmount(toArsCents(charge.totalAmountCents, "USD", getState().fx), "ARS")})` : ""} · un solo pago`,
    ));
  } else {
    body.append(element(
      "p",
      "cards-charge-meta",
      `${badge} mensual · ${formatMoneyAmount(charge.monthlyAmountCents, currencyLabel)}${charge.currency === "USD" ? ` (≈ ${formatMoneyAmount(toArsCents(charge.monthlyAmountCents, "USD", getState().fx), "ARS")}/mes)` : ""}`,
    ));
  }
  if (charge.note) body.append(element("p", "cards-charge-meta", charge.note));
  const side = element("div", "cards-charge-side");
  if (charge.chargeType === "installment" && cardRemainingInstallments(charge) > 0) {
    const payOne = element("button", "secondary-btn", "Marcar 1 cuota");
    payOne.type = "button";
    payOne.addEventListener("click", () => markCardCuotaPaid(charge.id));
    side.append(payOne);
  }
  if (charge.chargeType === "installment" && charge.paidInstallments > 0) {
    const undo = element("button", "row-menu", "Deshacer cuota");
    undo.type = "button";
    undo.addEventListener("click", () => unmarkCardCuotaPaid(charge.id));
    side.append(undo);
  }
  const remove = element("button", "row-menu", "Quitar");
  remove.type = "button";
  remove.addEventListener("click", () => removeCardCharge(charge.id));
  side.append(remove);
  row.append(body, side);
  return row;
}

function renderCardsListView() {
  const monthLoad = getAllCardsMonthLoad({ creditCards: getState().creditCards, cardCharges: getState().cardCharges, monthKey: getState().activeMonth, activeMonth: getState().activeMonth, fx: getState().fx });
  const hero = element("article", "panel cards-hero");
  const heroHead = element("div", "panel-heading");
  heroHead.append(
    element("p", "eyebrow", formatMonthLabel(getState().activeMonth)),
    element("h2", "", "Este mes"),
  );
  hero.append(heroHead);
  const heroValue = element("div", "cards-hero-value");
  heroValue.append(element("strong", "", formatMoneyAmount(monthLoad.totalArs, "ARS")));
  hero.append(heroValue);
  const chips = element("div", "cards-hero-chips");
  const totalForPct = Math.max(1, monthLoad.totalArs);
  [
    ["Cuotas", monthLoad.installmentArs],
    ["Fijos", monthLoad.fixedArs],
    ["Compras", monthLoad.purchaseArs],
  ].forEach(([label, cents]) => {
    const chip = element("div", "cards-hero-chip");
    const pct = monthLoad.totalArs > 0 ? Math.round((cents / totalForPct) * 100) : 0;
    chip.append(
      element("span", "", label),
      element("strong", "", formatMoneyAmount(cents, "ARS")),
      element("small", "", monthLoad.totalArs > 0 ? `${pct}%` : "—"),
    );
    chips.append(chip);
  });
  hero.append(chips);

  if (monthLoad.byCard.length) {
    const rank = element("div", "cards-rank");
    rank.append(element("p", "cards-rank-title", "Por tarjeta"));
    const max = Math.max(...monthLoad.byCard.map((row) => row.totalArs), 1);
    monthLoad.byCard.forEach((row) => {
      const barRow = element("button", "cards-rank-row");
      barRow.type = "button";
      const label = element("div", "cards-rank-label");
      label.append(
        element("strong", "", row.card.name),
        element("span", "", formatMoneyAmount(row.totalArs, "ARS")),
      );
      const track = element("div", "cards-rank-track");
      const fill = element("span", "cards-rank-fill");
      fill.style.width = `${Math.min(100, Math.round((row.totalArs / max) * 100))}%`;
      track.append(fill);
      barRow.append(label, track);
      barRow.addEventListener("click", () => {
        selectedCardId = row.card.id;
        renderCards();
      });
      rank.append(barRow);
    });
    hero.append(rank);
  }
  getDom().cardsRoot.append(hero);

  // Próximos cierres del ciclo (solo plásticos que suman a tarjetas)
  const closings = creditCardsForTotals(getState().creditCards)
    .filter((card) => isValidIsoDate(card.closingDate))
    .map((card) => {
      const daysUntil = daysUntilIsoDate(card.closingDate);
      const load = getCardMonthLoad({ cardId: card.id, charges: getState().cardCharges, monthKey: getState().activeMonth, activeMonth: getState().activeMonth, fx: getState().fx });
      return { card, daysUntil, load };
    })
    .filter((row) => row.daysUntil !== null && row.daysUntil >= -3)
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, 6);
  if (closings.length) {
    const closePanel = element("article", "panel");
    closePanel.append(
      element("p", "eyebrow", "Ciclo"),
      element("h2", "", "Próximos cierres de resumen"),
    );
    const list = element("div", "cards-closing-list");
    closings.forEach(({ card, daysUntil, load }) => {
      const row = element("button", "cards-closing-row");
      row.type = "button";
      const when = daysUntil < 0
        ? `Cerró ${formatIsoDateLabel(card.closingDate)}`
        : daysUntil === 0
          ? `Cierra hoy · ${formatIsoDateLabel(card.closingDate)}`
          : `En ${daysUntil} día${daysUntil === 1 ? "" : "s"} · ${formatIsoDateLabel(card.closingDate)}`;
      const dueBit = isValidIsoDate(card.dueDate) ? ` · Vence ${formatIsoDateLabel(card.dueDate)}` : "";
      row.append(
        element("strong", "", card.name),
        element("span", "", when + dueBit),
        element("span", "", `Carga est. ${formatMoneyAmount(load.totalArs, "ARS")}`),
      );
      row.addEventListener("click", () => {
        selectedCardId = card.id;
        renderCards();
      });
      list.append(row);
    });
    closePanel.append(list);
    getDom().cardsRoot.append(closePanel);
  }

  // Tabla de tarjetas (excluye cuentas corrientes)
  const plasticCards = creditCardsForTotals(getState().creditCards);
  const tablePanel = element("article", "panel cards-table-panel");
  tablePanel.append(
    element("p", "eyebrow", "Listado"),
    element("h2", "", "Tarjetas"),
  );
  if (!plasticCards.length) {
    tablePanel.append(emptyState(
      "Sin tarjetas",
      "Agregá una para cuotas, fijos y compras.",
    ));
  } else {
    const table = element("div", "cards-table");
    const head = element("div", "cards-table-head");
    ["Tarjeta", "Límite / uso del mes", "Cierre ciclo", "Vence ciclo", "Este mes", ""].forEach((label) => {
      head.append(element("span", "", label));
    });
    table.append(head);
    plasticCards.forEach((card) => {
      const load = getCardMonthLoad({ cardId: card.id, charges: getState().cardCharges, monthKey: getState().activeMonth, activeMonth: getState().activeMonth, fx: getState().fx });
      const row = element("button", "cards-table-row");
      row.type = "button";
      const nameCell = element("div", "cards-table-name");
      nameCell.append(element("strong", "", card.name), element("small", "", card.person || ""));
      const limitCell = element("div", "cards-table-limit");
      if (card.limitCents > 0) {
        const pct = Math.min(999, Math.round((load.totalArs / card.limitCents) * 100));
        const track = element("div", "cards-limit-track");
        const fill = element("span", "cards-limit-fill");
        fill.style.width = `${Math.min(100, pct)}%`;
        if (pct >= 90) fill.dataset.alert = "true";
        track.append(fill);
        limitCell.append(
          element("span", "", `${formatMoneyAmount(card.limitCents, "ARS")} · ${pct}%`),
          track,
        );
      } else {
        limitCell.append(element("span", "cards-muted", "Sin límite"));
      }
      row.append(
        nameCell,
        limitCell,
        element("span", "", isValidIsoDate(card.closingDate) ? formatIsoDateLabel(card.closingDate) : "—"),
        element("span", "", isValidIsoDate(card.dueDate) ? formatIsoDateLabel(card.dueDate) : "—"),
        element("strong", "", formatMoneyAmount(load.totalArs, "ARS")),
        element("span", "cards-table-open", "Abrir →"),
      );
      row.addEventListener("click", () => {
        selectedCardId = card.id;
        renderCards();
      });
      table.append(row);
    });
    tablePanel.append(table);
  }
  getDom().cardsRoot.append(tablePanel);

  // Cuentas corrientes: sección aparte, sin re-explicar el total.
  const ccLoad = getCuentaCorrienteMonthLoad({ creditCards: getState().creditCards, cardCharges: getState().cardCharges, monthKey: getState().activeMonth, activeMonth: getState().activeMonth, fx: getState().fx });
  const ccPanel = element("article", "panel cards-cc-panel");
  ccPanel.append(
    element("p", "eyebrow", "Cuentas corrientes"),
    element("h2", "", "Cuentas corrientes"),
  );
  if (!ccLoad.byCard.length && !creditCardsCuentaCorriente(getState().creditCards).length) {
    ccPanel.append(element(
      "p",
      "cards-muted",
      "Ninguna. Marcá una tarjeta como cuenta corriente al editarla.",
    ));
  } else {
    const totalLine = element("div", "cards-cc-total");
    totalLine.append(
      element("span", "", formatMonthLabel(getState().activeMonth)),
      element("strong", "", formatMoneyAmount(ccLoad.totalArs, "ARS")),
    );
    ccPanel.append(totalLine);
    const list = element("div", "cards-cc-list");
    creditCardsCuentaCorriente(getState().creditCards).forEach((card) => {
      const load = getCardMonthLoad({ cardId: card.id, charges: getState().cardCharges, monthKey: getState().activeMonth, activeMonth: getState().activeMonth, fx: getState().fx });
      const row = element("button", "cards-cc-row");
      row.type = "button";
      row.append(
        element("strong", "", card.name),
        element("span", "", card.person || "—"),
        element("span", "", formatMoneyAmount(load.totalArs, "ARS")),
        element("span", "cards-table-open", "Ver →"),
      );
      row.addEventListener("click", () => {
        selectedCardId = card.id;
        renderCards();
      });
      list.append(row);
    });
    ccPanel.append(list);
  }
  getDom().cardsRoot.append(ccPanel);
}

function renderCardDetailView(card) {
  const load = getCardMonthLoad({ cardId: card.id, charges: getState().cardCharges, monthKey: getState().activeMonth, activeMonth: getState().activeMonth, fx: getState().fx });
  const charges = getState().cardCharges.filter((charge) => charge.active && charge.cardId === card.id);
  const remainingInstallments = charges
    .filter((charge) => charge.chargeType === "installment")
    .reduce((sum, charge) => sum + cardRemainingCents(charge), 0);

  const head = element("article", "panel cards-detail-head");
  const title = element("div", "");
  title.append(
    element("p", "eyebrow", isCuentaCorrienteCard(card) ? "Cuenta corriente" : (card.person || "Tarjeta")),
    element("h2", "", card.name),
  );
  if (isCuentaCorrienteCard(card)) {
    const notice = element("p", "cards-cc-notice");
    notice.textContent = "Cuenta corriente";
    head.append(notice);
  }
  const meta = [
    card.limitCents > 0 ? `Límite ${formatMoneyAmount(card.limitCents, "ARS")}` : "Sin límite",
    isValidIsoDate(card.closingDate) ? `Cierre ${formatIsoDateLabel(card.closingDate)}` : "Cierre —",
    isValidIsoDate(card.dueDate) ? `Vence ${formatIsoDateLabel(card.dueDate)}` : "Vence —",
  ].join(" · ");
  title.append(element("p", "cards-charge-meta", meta));
  if (card.note) title.append(element("p", "", card.note));
  const actions = element("div", "cards-card-actions");
  const editBtn = element("button", "secondary-btn", "Editar / ciclo");
  editBtn.type = "button";
  editBtn.addEventListener("click", () => openCardDialog(card.id));
  const purchaseBtn = element("button", "secondary-btn", "+ Compra");
  purchaseBtn.type = "button";
  purchaseBtn.addEventListener("click", () => openPurchaseDialog(card.id));
  const instBtn = element("button", "secondary-btn", "+ Cuotas");
  instBtn.type = "button";
  instBtn.addEventListener("click", () => openChargeDialog(card.id, "installment"));
  const fixedBtn = element("button", "secondary-btn", "+ Fijo");
  fixedBtn.type = "button";
  fixedBtn.addEventListener("click", () => openChargeDialog(card.id, "fixed"));
  const deleteBtn = element("button", "danger-btn", "Eliminar");
  deleteBtn.type = "button";
  deleteBtn.addEventListener("click", () => void removeCreditCard(card.id));
  actions.append(editBtn, purchaseBtn, instBtn, fixedBtn, deleteBtn);
  const headRow = element("div", "panel-heading inline-heading");
  headRow.append(title, actions);
  head.append(headRow);

  const kpis = element("div", "cards-detail-kpis");
  [
    ["Este mes", formatMoneyAmount(load.totalArs, "ARS"), "Total del resumen"],
    ["Cuotas", formatMoneyAmount(load.installmentArs, "ARS"), "Caen este mes"],
    ["Fijos", formatMoneyAmount(load.fixedArs, "ARS"), "Abonos del mes"],
    ["Compras", formatMoneyAmount(load.purchaseArs, "ARS"), "Un pago del mes"],
    ["Resto en cuotas", formatMoneyAmount(remainingInstallments, "ARS"), "Saldo de planes activos"],
    ["Uso del límite", card.limitCents > 0
      ? `${Math.min(999, Math.round((load.totalArs / card.limitCents) * 100))}%`
      : "—", card.limitCents > 0 ? "Sobre el límite cargado" : "Definí un límite al editar"],
  ].forEach(([label, value, copy]) => {
    const kpi = element("div", "cards-detail-kpi");
    kpi.append(element("span", "", label), element("strong", "", value), element("small", "", copy));
    kpis.append(kpi);
  });
  head.append(kpis);

  const cycleBox = element("div", "cards-cycle-box");
  const cycleCopy = element("div", "");
  cycleCopy.append(
    element("strong", "", "Ciclo de este resumen"),
    element(
      "p",
      "cards-charge-meta",
      `Cierre: ${formatIsoDateLabel(card.closingDate)} · Vencimiento: ${formatIsoDateLabel(card.dueDate)}. ` +
      "Las compras se asignan al resumen del ciclo según el día de cierre (después del cierre → mes siguiente).",
    ),
  );
  const cycleEdit = element("button", "secondary-btn", "Actualizar fechas del ciclo");
  cycleEdit.type = "button";
  cycleEdit.addEventListener("click", () => openCardDialog(card.id));
  cycleBox.append(cycleCopy, cycleEdit);
  head.append(cycleBox);

  const gen = element("div", "cards-generate-box");
  const genCopy = element("div", "");
  genCopy.append(
    element("strong", "", "Generar resumen del mes"),
    element(
      "p",
      "cards-charge-meta",
      `Crea un gasto en Movimientos por ${formatMoneyAmount(load.totalArs, "ARS")} (estimado). ` +
      "Podés editar el monto por percepciones u otros cargos del banco.",
    ),
  );
  const genBtn = element("button", "primary-btn", "Generar resumen");
  genBtn.type = "button";
  genBtn.disabled = load.totalArs <= 0;
  genBtn.addEventListener("click", () => generateCardStatement(card.id));
  gen.append(genCopy, genBtn);
  head.append(gen);
  getDom().cardsRoot.append(head);

  const chargesPanel = element("article", "panel");
  chargesPanel.append(
    element("p", "eyebrow", "Cargos"),
    element("h2", "", "Actividad de la tarjeta"),
  );
  if (!charges.length) {
    chargesPanel.append(emptyState("Sin cargos", "Sumá una compra del mes, un plan en cuotas o un fijo."));
  } else {
    const groups = [
      {
        key: "purchase",
        title: "Compras del mes (un pago)",
        copy: "Suman solo al resumen del mes indicado.",
        items: charges.filter((c) => c.chargeType === "purchase"),
      },
      {
        key: "installment",
        title: "Planes en cuotas",
        copy: "Cada mes cae una cuota hasta saldar el plan.",
        items: charges.filter((c) => c.chargeType === "installment"),
      },
      {
        key: "fixed",
        title: "Fijos mensuales",
        copy: "Se repiten todos los meses mientras estén activos.",
        items: charges.filter((c) => c.chargeType === "fixed"),
      },
    ];
    groups.forEach((group) => {
      if (!group.items.length) return;
      const block = element("div", "cards-charge-group");
      block.append(
        element("h3", "cards-charge-group-title", `${group.title} (${group.items.length})`),
        element("p", "cards-charge-meta", group.copy),
      );
      const list = element("div", "cards-charge-list");
      group.items
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, "es"))
        .forEach((charge) => list.append(renderChargeRow(charge)));
      block.append(list);
      chargesPanel.append(block);
    });
  }
  getDom().cardsRoot.append(chargesPanel);

  // Cuotas que quedan (solo esta tarjeta)
  const plans = charges.filter((charge) => charge.chargeType === "installment" && cardRemainingInstallments(charge) > 0);
  if (plans.length) {
    const future = element("article", "panel");
    future.append(
      element("p", "eyebrow", "Planificación"),
      element("h2", "", "Cuotas que quedan"),
    );
    const list = element("div", "cards-future-list");
    plans.forEach((charge) => {
      const left = cardRemainingInstallments(charge);
      const remaining = cardRemainingCents(charge);
      const row = element("div", "cards-future-row");
      row.append(
        element("strong", "", charge.name),
        element("span", "", `${left} cuota${left === 1 ? "" : "s"} · ${formatMoneyAmount(remaining, charge.currency)}`),
      );
      list.append(row);
    });
    future.append(list);
    getDom().cardsRoot.append(future);
  }
}

function renderCards() {
  if (!getDom().cardsRoot) return;
  renderCardsFxBar();
  if (selectedCardId && !getState().creditCards.some((card) => card.id === selectedCardId)) {
    selectedCardId = "";
  }
  const selected = getState().creditCards.find((card) => card.id === selectedCardId) || null;
  if (getDom().cardsBackBtn) getDom().cardsBackBtn.hidden = !selected;
  if (getDom().cardsPageTitle) {
    getDom().cardsPageTitle.textContent = selected ? selected.name : "Tarjetas";
  }
  const eyebrow = getDom().cardsPageEyebrow || document.querySelector("#cardsPageEyebrow");
  if (eyebrow) {
    eyebrow.textContent = selected
      ? (isCuentaCorrienteCard(selected) ? "Cuenta corriente" : "Tarjeta")
      : formatMonthLabel(getState().activeMonth);
  }
  if (getDom().cardsPageCopy) {
    // Subtítulo largo retirado; solo se usa en detalle si hace falta un hint corto.
    getDom().cardsPageCopy.hidden = true;
    getDom().cardsPageCopy.textContent = "";
  }

  getDom().cardsRoot.replaceChildren();
  if (selected) renderCardDetailView(selected);
  else renderCardsListView();
}

function openCardDialog(editCardId = "") {
  if (!getDom().cardDialog || !getDom().cardForm) return;
  const existing = getState().creditCards.find((card) => card.id === editCardId) || null;
  getDom().cardForm.reset();
  if (getDom().cardForm.elements.id) getDom().cardForm.elements.id.value = existing?.id || "";
  fillSelectOptions(getDom().cardForm.elements.person, getState().people.map((person) => person.name), { preserve: false });
  setSelectValue(getDom().cardForm.elements.person, existing?.person || getState().people[0]?.name || "Compartido");
  if (existing) {
    getDom().cardForm.elements.name.value = existing.name;
    if (getDom().cardForm.elements.closingDate) getDom().cardForm.elements.closingDate.value = existing.closingDate || "";
    if (getDom().cardForm.elements.dueDate) getDom().cardForm.elements.dueDate.value = existing.dueDate || "";
    if (getDom().cardForm.elements.limit) {
      getDom().cardForm.elements.limit.value = existing.limitCents ? String(fromCents(existing.limitCents)) : "";
    }
    if (getDom().cardForm.elements.note) getDom().cardForm.elements.note.value = existing.note || "";
    if (getDom().cardForm.elements.excludeFromCardTotals) {
      getDom().cardForm.elements.excludeFromCardTotals.checked = Boolean(existing.excludeFromCardTotals);
    }
  } else {
    if (getDom().cardForm.elements.closingDate) getDom().cardForm.elements.closingDate.value = "";
    if (getDom().cardForm.elements.dueDate) getDom().cardForm.elements.dueDate.value = "";
    if (getDom().cardForm.elements.limit) getDom().cardForm.elements.limit.value = "";
    if (getDom().cardForm.elements.excludeFromCardTotals) {
      getDom().cardForm.elements.excludeFromCardTotals.checked = false;
    }
  }
  const title = document.querySelector("#cardDialogTitle");
  if (title) title.textContent = existing ? "Editar tarjeta / ciclo" : "Nueva tarjeta";
  // Al tipear un nombre tipo “CC…”, marcar cuenta corriente (solo si el usuario no lo desmarcó a mano en esta sesión del form).
  const nameInput = getDom().cardForm.elements.name;
  const excludeInput = getDom().cardForm.elements.excludeFromCardTotals;
  if (nameInput && excludeInput && !nameInput.dataset.ccAutoWired) {
    nameInput.dataset.ccAutoWired = "1";
    nameInput.addEventListener("input", () => {
      if (excludeInput.dataset.userTouched === "1") return;
      if (nameLooksLikeCuentaCorriente(nameInput.value)) {
        excludeInput.checked = true;
      }
    });
    excludeInput.addEventListener("change", () => {
      excludeInput.dataset.userTouched = "1";
    });
  }
  if (excludeInput) excludeInput.dataset.userTouched = existing ? "1" : "";
  getDom().cardDialog.showModal();
  window.setTimeout(() => getDom().cardForm.elements.name?.focus(), 40);
}

function openPurchaseDialog(preselectedCardId = "") {
  if (!requireOpenMonth(getState().activeMonth, "Reabrí el mes antes de cargar una compra")) return;
  if (!getDom().purchaseDialog || !getDom().purchaseForm) return;
  if (!getState().creditCards.length) {
    showToast("Primero agregá una tarjeta en la sección Tarjetas");
    switchView("cards");
    return;
  }
  getDom().purchaseForm.reset();
  const cardSelect = getDom().purchaseForm.elements.cardId;
  fillSelectOptions(cardSelect, getState().creditCards.map((card) => card.name), { preserve: false });
  // Store ids as option values
  cardSelect.replaceChildren();
  getState().creditCards.forEach((card) => {
    const option = document.createElement("option");
    option.value = card.id;
    option.textContent = card.name;
    cardSelect.append(option);
  });
  if (preselectedCardId && getState().creditCards.some((card) => card.id === preselectedCardId)) {
    cardSelect.value = preselectedCardId;
  }
  if (getDom().purchaseForm.elements.monthKey) {
    const card = getState().creditCards.find((item) => item.id === cardSelect.value);
    getDom().purchaseForm.elements.monthKey.value = card
      ? statementMonthKeyForPurchase(card)
      : getState().activeMonth;
  }
  if (getDom().purchaseForm.elements.currency) getDom().purchaseForm.elements.currency.value = "ARS";
  // Si cambia la tarjeta, reasignar mes del resumen según cierre.
  cardSelect.onchange = () => {
    const card = getState().creditCards.find((item) => item.id === cardSelect.value);
    if (card && getDom().purchaseForm.elements.monthKey) {
      getDom().purchaseForm.elements.monthKey.value = statementMonthKeyForPurchase(card);
    }
  };
  getDom().purchaseDialog.showModal();
  window.setTimeout(() => getDom().purchaseForm.elements.name?.focus(), 40);
}

function updateChargeAmountModeUI() {
  if (!getDom().chargeForm) return;
  const isInstallment = getDom().chargeForm.elements.chargeType.value !== "fixed";
  const mode = getDom().chargeForm.elements.amountMode?.value === "cuota" ? "cuota" : "total";
  if (getDom().chargeAmountModeField) getDom().chargeAmountModeField.hidden = !isInstallment;
  if (getDom().chargeInstallmentsField) getDom().chargeInstallmentsField.hidden = !isInstallment;
  if (getDom().chargePaidField) getDom().chargePaidField.hidden = !isInstallment;
  if (getDom().chargeTotalField) getDom().chargeTotalField.hidden = !isInstallment || mode !== "total";
  if (getDom().chargeCuotaField) getDom().chargeCuotaField.hidden = !isInstallment || mode !== "cuota";
  if (getDom().chargeMonthlyField) getDom().chargeMonthlyField.hidden = isInstallment;
  if (getDom().chargeForm.elements.totalAmount) {
    getDom().chargeForm.elements.totalAmount.required = isInstallment && mode === "total";
  }
  if (getDom().chargeForm.elements.cuotaAmount) {
    getDom().chargeForm.elements.cuotaAmount.required = isInstallment && mode === "cuota";
  }
  if (getDom().chargeForm.elements.installments) {
    getDom().chargeForm.elements.installments.required = isInstallment;
  }
  if (getDom().chargeForm.elements.paidInstallments) {
    getDom().chargeForm.elements.paidInstallments.required = isInstallment;
  }
  if (getDom().chargeForm.elements.monthlyAmount) {
    getDom().chargeForm.elements.monthlyAmount.required = !isInstallment;
  }
  updateChargeAmountHint();
}

function updateChargeAmountHint() {
  if (!getDom().chargeAmountHint || !getDom().chargeForm) return;
  if (getDom().chargeForm.elements.chargeType.value === "fixed") {
    getDom().chargeAmountHint.textContent = "";
    return;
  }
  const mode = getDom().chargeForm.elements.amountMode?.value === "cuota" ? "cuota" : "total";
  const installments = Math.min(Math.max(Math.trunc(Number(getDom().chargeForm.elements.installments.value) || 0), 0), 120);
  const currency = getDom().chargeForm.elements.currency?.value === "USD" ? "USD" : "ARS";
  if (mode === "cuota") {
    const cuotaCents = toCents(getDom().chargeForm.elements.cuotaAmount?.value);
    if (cuotaCents > 0 && installments >= 2) {
      const totalCents = cuotaCents * installments;
      getDom().chargeAmountHint.textContent =
        `${installments} cuotas de ${formatMoneyAmount(cuotaCents, currency)} = total ${formatMoneyAmount(totalCents, currency)}`;
    } else {
      getDom().chargeAmountHint.textContent = "Ingresá el valor de cada cuota y la cantidad; el total se calcula solo.";
    }
    return;
  }
  const totalCents = toCents(getDom().chargeForm.elements.totalAmount?.value);
  if (totalCents > 0 && installments >= 2) {
    const approx = Math.round(totalCents / installments);
    getDom().chargeAmountHint.textContent =
      `Total ${formatMoneyAmount(totalCents, currency)} ≈ ${formatMoneyAmount(approx, currency)} por cuota (la última se ajusta si hace falta)`;
  } else {
    getDom().chargeAmountHint.textContent = "Ingresá el total del plan; se reparte en las cuotas sin perder centavos.";
  }
}

function openChargeDialog(cardId, chargeType = "installment") {
  if (!requireOpenMonth(getState().activeMonth, "Reabrí el mes antes de agregar un cargo")) return;
  if (!getDom().chargeDialog || !getDom().chargeForm) return;
  getDom().chargeForm.reset();
  getDom().chargeForm.elements.cardId.value = cardId;
  getDom().chargeForm.elements.chargeType.value = chargeType;
  if (getDom().chargeForm.elements.amountMode) getDom().chargeForm.elements.amountMode.value = "total";
  if (getDom().chargeForm.elements.installments) getDom().chargeForm.elements.installments.value = "12";
  if (getDom().chargeForm.elements.paidInstallments) getDom().chargeForm.elements.paidInstallments.value = "0";
  updateChargeAmountModeUI();
  if (getDom().chargeDialogTitle) {
    getDom().chargeDialogTitle.textContent = chargeType === "installment" ? "Plan en cuotas" : "Gasto fijo en tarjeta";
  }
  getDom().chargeDialog.showModal();
  window.setTimeout(() => getDom().chargeForm.elements.name?.focus(), 40);
}

async function saveCreditCard(event) {
  event.preventDefault();
  const formData = new FormData(getDom().cardForm);
  const existingId = sanitizeText(formData.get("id"));
  const card = normalizeCreditCard({
    id: existingId || createId(),
    name: formData.get("name"),
    person: formData.get("person"),
    note: formData.get("note"),
    closingDate: formData.get("closingDate"),
    dueDate: formData.get("dueDate"),
    limit: formData.get("limit"),
    excludeFromCardTotals: formData.get("excludeFromCardTotals") === "on"
      || formData.get("excludeFromCardTotals") === "true",
  });
  if (!card) return;
  const previousState = cloneState(getState());
  const index = getState().creditCards.findIndex((item) => item.id === card.id);
  if (index >= 0) getState().creditCards[index] = card;
  else getState().creditCards.push(card);
  if (!await saveState()) {
    setState(previousState);
    render();
    return;
  }
  getDom().cardDialog.close();
  if (index < 0) selectedCardId = card.id;
  render();
  showToast(index >= 0 ? "Tarjeta / ciclo actualizado" : "Tarjeta agregada");
}

async function generateCardStatement(cardId) {
  if (!requireOpenMonth(getState().activeMonth, "Reabrí el mes antes de generar un resumen")) return;
  const card = getState().creditCards.find((item) => item.id === cardId);
  if (!card) return;
  const load = getCardMonthLoad({ cardId: cardId, charges: getState().cardCharges, monthKey: getState().activeMonth, activeMonth: getState().activeMonth, fx: getState().fx });
  if (load.totalArs <= 0) {
    showToast("No hay carga estimada este mes para generar un resumen");
    return;
  }
  const confirmed = await confirmAction({
    title: `Resumen · ${card.name}`,
    copy:
      `Se va a crear un gasto en Movimientos por el estimado de ${formatMonthLabel(getState().activeMonth)}. `
      + "Si el banco cobró distinto (percepciones, etc.), después lo editás desde Movimientos.",
    details: [
      `Total estimado: ${formatMoneyAmount(load.totalArs, "ARS")}`,
      `Cuotas: ${formatMoneyAmount(load.installmentArs, "ARS")}`,
      `Fijos: ${formatMoneyAmount(load.fixedArs, "ARS")}`,
      `Compras: ${formatMoneyAmount(load.purchaseArs, "ARS")}`,
      `Persona: ${card.person || "Compartido"}`,
      "Estado: pagado al crear",
    ],
    confirmLabel: "Crear en Movimientos",
  });
  if (!confirmed) return;
  const finalCents = load.totalArs;
  const transaction = normalizeTransaction({
    id: createId(),
    kind: "expense",
    name: `Resumen ${card.name}`,
    category: "Tarjeta de crédito",
    person: card.person || "Compartido",
    amountCents: finalCents,
    scheduleType: "one-time",
    startMonth: getState().activeMonth,
    dueDay: isValidIsoDate(card.dueDate) ? Number(card.dueDate.slice(8, 10)) : 0,
    note: [
      "Generado desde Tarjetas",
      isValidIsoDate(card.closingDate) ? `cierre ${card.closingDate}` : null,
      isValidIsoDate(card.dueDate) ? `vence ${card.dueDate}` : null,
      `est. ${formatMoneyAmount(load.totalArs, "ARS")}`,
      "podés editar por percepciones",
    ].filter(Boolean).join(" · "),
  });
  if (!transaction) {
    showToast("No se pudo crear el movimiento");
    return;
  }
  if (!getState().categories.some((category) =>
    category.localeCompare("Tarjeta de crédito", "es", { sensitivity: "base" }) === 0
  )) {
    getState().categories.push("Tarjeta de crédito");
    getState().categories.sort((a, b) => a.localeCompare(b, "es"));
  }
  const previousState = cloneState(getState());
  getState().transactions.push(transaction);
  const occurrence = occurrenceForMonth(transaction, getState().activeMonth, {});
  if (occurrence) {
    getState().occurrences[`${transaction.id}:${getState().activeMonth}`] = materializeOccurrence(occurrence, {
      status: "paid",
      actualAmountCents: finalCents,
      effectiveDate: localDateKey(),
    });
  }
  if (!await saveState()) {
    setState(previousState);
    render();
    return;
  }
  render();
  showToast("Resumen creado en Movimientos (pagado)", {
    label: "Ver / editar",
    handler: () => {
      switchView("movements");
      openMovementDialog(transaction.id, getState().activeMonth);
    },
  });
}

async function saveCardCharge(event) {
  event.preventDefault();
  const formData = new FormData(getDom().chargeForm);
  const rawType = formData.get("chargeType");
  const chargeType = rawType === "fixed" ? "fixed" : rawType === "purchase" ? "purchase" : "installment";
  let totalAmount = formData.get("totalAmount");
  if (chargeType === "installment" && formData.get("amountMode") === "cuota") {
    const installments = Math.min(Math.max(Math.trunc(Number(formData.get("installments")) || 0), 2), 120);
    const cuotaCents = toCents(formData.get("cuotaAmount"));
    if (cuotaCents <= 0 || installments < 2) {
      showToast("Ingresá valor de cuota y cantidad de cuotas");
      return;
    }
    // Total exacto = cuota × N (todas las cuotas iguales en este modo).
    totalAmount = fromCents(cuotaCents * installments);
  }
  const charge = normalizeCardCharge({
    id: createId(),
    cardId: formData.get("cardId"),
    name: formData.get("name"),
    chargeType,
    currency: formData.get("currency"),
    totalAmount,
    installments: formData.get("installments"),
    paidInstallments: formData.get("paidInstallments") || 0,
    monthlyAmount: formData.get("monthlyAmount"),
    monthKey: formData.get("monthKey"),
    note: formData.get("note"),
    active: true,
  }, new Set(getState().creditCards.map((card) => card.id)));
  if (!charge) {
    showToast("Revisá los datos del cargo");
    return;
  }
  const monthForLimit = charge.chargeType === "purchase"
    ? (charge.monthKey || getState().activeMonth)
    : getState().activeMonth;
  if (!requireOpenMonth(monthForLimit, "Reabrí el mes del cargo antes de agregar")) return;
  const over = wouldExceedCardLimit({ creditCards: getState().creditCards, cardCharges: getState().cardCharges, cardId: charge.cardId, extraArsCents: chargeAmountArsForLimit(charge, getState().fx), monthKey: monthForLimit, activeMonth: getState().activeMonth, fx: getState().fx });
  if (over) {
    showToast(
      `Supera el límite de ${over.card.name} `
      + `(${formatMoneyAmount(over.limitCents, "ARS")}; quedaría en ${formatMoneyAmount(over.nextTotal, "ARS")})`,
    );
    return;
  }
  const previousState = cloneState(getState());
  getState().cardCharges.push(charge);
  if (!await saveState()) {
    setState(previousState);
    render();
    return;
  }
  getDom().chargeDialog.close();
  render();
  showToast(
    chargeType === "installment"
      ? "Plan en cuotas agregado"
      : chargeType === "purchase"
        ? "Compra en tarjeta registrada"
        : "Gasto fijo agregado",
  );
}

async function saveCardPurchase(event) {
  event.preventDefault();
  if (!getDom().purchaseForm) return;
  const formData = new FormData(getDom().purchaseForm);
  const cardId = sanitizeText(formData.get("cardId"));
  const card = getState().creditCards.find((item) => item.id === cardId);
  // Mes del resumen: el del form, o el que corresponde al ciclo de cierre.
  let monthKey = formData.get("monthKey") || "";
  if (!isValidMonthKey(monthKey) && card) {
    monthKey = statementMonthKeyForPurchase(card);
  }
  if (!isValidMonthKey(monthKey)) monthKey = getState().activeMonth;
  if (!requireOpenMonth(monthKey, "Reabrí el mes del resumen antes de cargar la compra")) return;
  const charge = normalizeCardCharge({
    id: createId(),
    cardId,
    name: formData.get("name"),
    chargeType: "purchase",
    currency: formData.get("currency"),
    totalAmount: formData.get("amount"),
    monthKey,
    note: formData.get("note"),
    active: true,
  }, new Set(getState().creditCards.map((item) => item.id)));
  if (!charge) {
    showToast("Revisá tarjeta, concepto y monto");
    return;
  }
  const over = wouldExceedCardLimit({ creditCards: getState().creditCards, cardCharges: getState().cardCharges, cardId: charge.cardId, extraArsCents: chargeAmountArsForLimit(charge, getState().fx), monthKey: charge.monthKey, activeMonth: getState().activeMonth, fx: getState().fx });
  if (over) {
    showToast(
      `Supera el límite de ${over.card.name} `
      + `(tope ${formatMoneyAmount(over.limitCents, "ARS")}; con este gasto: ${formatMoneyAmount(over.nextTotal, "ARS")})`,
    );
    return;
  }
  const previousState = cloneState(getState());
  getState().cardCharges.push(charge);
  if (!await saveState()) {
    setState(previousState);
    render();
    return;
  }
  getDom().purchaseDialog.close();
  render();
  const cycleNote = card && isValidIsoDate(card.closingDate)
    ? ` · cierre ${formatIsoDateLabel(card.closingDate)}`
    : "";
  showToast(`Compra en resumen ${formatMonthLabel(charge.monthKey)}${cycleNote}`);
}

async function removeCreditCard(cardId) {
  const card = getState().creditCards.find((item) => item.id === cardId);
  if (!card) return;
  const confirmed = await confirmAction({
    title: "Eliminar tarjeta",
    copy: `¿Eliminar “${card.name}” y todos sus cargos?`,
    confirmLabel: "Eliminar",
    danger: true,
  });
  if (!confirmed) return;
  const previousState = cloneState(getState());
  getState().creditCards = getState().creditCards.filter((item) => item.id !== cardId);
  getState().cardCharges = getState().cardCharges.filter((item) => item.cardId !== cardId);
  if (!await saveState()) {
    setState(previousState);
    render();
    return;
  }
  if (selectedCardId === cardId) selectedCardId = "";
  render();
  showToast("Tarjeta eliminada", {
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
      showToast("Tarjeta restaurada");
    },
  });
}

async function removeCardCharge(chargeId) {
  const charge = getState().cardCharges.find((item) => item.id === chargeId);
  const guardMonth = charge?.chargeType === "purchase"
    ? (charge.monthKey || getState().activeMonth)
    : getState().activeMonth;
  if (!requireOpenMonth(guardMonth, "Reabrí el mes antes de eliminar un cargo")) return;
  const previousState = cloneState(getState());
  getState().cardCharges = getState().cardCharges.filter((item) => item.id !== chargeId);
  if (!await saveState()) {
    setState(previousState);
    render();
    return;
  }
  render();
  showToast("Cargo eliminado", {
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
      showToast("Cargo restaurado");
    },
  });
}

/** Copia movimientos “una sola vez” del mes anterior al mes activo (como nuevos, ya cobrados/pagados). */
async function copyFromPreviousMonth() {
  if (!requireOpenMonth(getState().activeMonth, "Reabrí el mes antes de copiar")) return;
  const prevMonth = addMonths(getState().activeMonth, -1);
  const candidates = getState().transactions.filter((tx) =>
    tx.schedule?.type === "one-time" && tx.schedule.startMonth === prevMonth
  );
  if (!candidates.length) {
    showToast(`No hay movimientos “una sola vez” en ${formatMonthLabel(prevMonth)}`);
    return;
  }
  const currentNames = new Set(
    getMonthTotals(getState().activeMonth).occurrences.map((item) =>
      `${item.kind}|${item.name}|${item.amountThisMonthCents}`
    ),
  );
  const toCopy = candidates.filter((tx) => {
    const key = `${tx.kind}|${tx.name}|${tx.amountCents}`;
    return !currentNames.has(key);
  });
  if (!toCopy.length) {
    showToast("Esos movimientos ya están (o algo muy parecido) en este mes");
    return;
  }
  const confirmed = await confirmAction({
    title: "Copiar del mes anterior",
    copy:
      `Se van a copiar ${toCopy.length} movimiento${toCopy.length === 1 ? "" : "s"} de `
      + `${formatMonthLabel(prevMonth)} a ${formatMonthLabel(getState().activeMonth)}. `
      + "Quedan cobrados/pagados. Los mensuales y en cuotas no se copian (ya se proyectan solos).",
    details: toCopy.slice(0, 8).map((tx) =>
      `${tx.kind === "income" ? "+" : "-"} ${tx.name} · ${formatCurrency(tx.amountCents)}`
    ).concat(toCopy.length > 8 ? [`… y ${toCopy.length - 8} más`] : []),
    confirmLabel: "Copiar",
  });
  if (!confirmed) return;
  const previousState = cloneState(getState());
  toCopy.forEach((source) => {
    const transaction = normalizeTransaction({
      ...source,
      id: createId(),
      startMonth: getState().activeMonth,
      scheduleType: "one-time",
      endMonth: "",
      installments: 1,
      createdAt: new Date().toISOString(),
    });
    if (!transaction) return;
    getState().transactions.push(transaction);
    const occurrence = occurrenceForMonth(transaction, getState().activeMonth, {});
    if (occurrence) {
      getState().occurrences[`${transaction.id}:${getState().activeMonth}`] = materializeOccurrence(occurrence, {
        status: "paid",
        actualAmountCents: occurrence.amountThisMonthCents,
        effectiveDate: localDateKey(),
      });
    }
  });
  if (!await saveState()) {
    setState(previousState);
    render();
    return;
  }
  render();
  showToast(`${toCopy.length} movimiento${toCopy.length === 1 ? "" : "s"} copiado${toCopy.length === 1 ? "" : "s"}`, {
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
      showToast("Copia deshecha");
    },
  });
}

function focusGlobalSearch() {
  switchView("movements");
  render();
  requestAnimationFrame(() => {
    const input = getDom().movementSearch;
    if (!input) return;
    input.focus();
    input.select?.();
  });
}

const QUICK_TEMPLATES = [
  { name: "Sueldo", kind: "income", category: "Sueldo" },
  { name: "Alquiler", kind: "expense", category: "Alquiler" },
  { name: "Expensas", kind: "expense", category: "Expensas" },
  { name: "Supermercado", kind: "expense", category: "Supermercado" },
  { name: "Transporte", kind: "expense", category: "Transporte" },
  { name: "Servicios", kind: "expense", category: "Servicios" },
];

function renderMovementTemplates() {
  let host = document.querySelector("#movementTemplates");
  if (!getDom().movementForm) return;
  if (!host) {
    host = element("div", "movement-templates");
    host.id = "movementTemplates";
    const grid = getDom().movementForm.querySelector(".form-grid");
    if (grid) grid.before(host);
    else getDom().movementForm.prepend(host);
  }
  const isEdit = Boolean(sanitizeText(getDom().movementForm.elements.id?.value));
  host.hidden = isEdit;
  if (isEdit) {
    host.replaceChildren();
    return;
  }
  host.replaceChildren(element("p", "movement-templates-label", "Plantillas rápidas"));
  const row = element("div", "movement-templates-row");
  QUICK_TEMPLATES.forEach((tpl) => {
    const chip = element("button", "template-chip", tpl.name);
    chip.type = "button";
    chip.addEventListener("click", () => {
      [...getDom().movementForm.elements.kind].forEach((input) => {
        input.checked = input.value === tpl.kind;
      });
      getDom().movementForm.elements.name.value = tpl.name;
      setSelectValue(getDom().movementForm.elements.category, tpl.category);
      requestAnimationFrame(() => getDom().movementForm.elements.amount?.focus?.());
    });
    row.append(chip);
  });
  host.append(row);
}

async function markCardCuotaPaid(chargeId) {
  if (!requireOpenMonth(getState().activeMonth, "Reabrí el mes antes de marcar cuotas")) return;
  const charge = getState().cardCharges.find((item) => item.id === chargeId);
  if (!charge || charge.chargeType !== "installment") return;
  if (charge.paidInstallments >= charge.installments) return;
  const previousState = cloneState(getState());
  charge.paidInstallments += 1;
  if (!await saveState()) {
    setState(previousState);
    render();
    return;
  }
  render();
  showToast(charge.paidInstallments >= charge.installments ? "Plan saldado" : "Cuota marcada");
}

async function unmarkCardCuotaPaid(chargeId) {
  if (!requireOpenMonth(getState().activeMonth, "Reabrí el mes antes de desmarcar cuotas")) return;
  const charge = getState().cardCharges.find((item) => item.id === chargeId);
  if (!charge || charge.chargeType !== "installment" || charge.paidInstallments <= 0) return;
  const previousState = cloneState(getState());
  charge.paidInstallments -= 1;
  if (!await saveState()) {
    setState(previousState);
    render();
    return;
  }
  render();
  showToast("Cuota desmarcada");
}

async function refreshUsdRate() {
  try {
    // Solo dólar oficial (venta). No usar blue.
    const official = await fetch("https://dolarapi.com/v1/dolares/oficial", { cache: "no-store" });
    if (!official.ok) throw new Error("sin cotización");
    const data = await official.json();
    const rate = Number(data.venta);
    const label = "oficial";
    const updated = data.fechaActualizacion
      ? new Date(data.fechaActualizacion).toLocaleString("es-AR")
      : new Date().toLocaleString("es-AR");
    if (!Number.isFinite(rate) || rate <= 0) throw new Error("cotización inválida");
    const previousState = cloneState(getState());
    getState().fx.apiUsdArs = rate;
    getState().fx.apiLabel = label;
    getState().fx.apiUpdatedAt = updated;
    if (!getState().fx.useManual) getState().fx.usdArs = rate;
    if (!await saveState()) {
      setState(previousState);
      render();
      return;
    }
    render();
    showToast(`Cotización actualizada: $ ${formatFxRate(rate)}`);
  } catch (error) {
    console.warn("No se pudo obtener el dólar oficial.", error);
    showToast("No pudimos consultar el dólar oficial. Podés cargar un valor manual.");
  }
}

async function applyManualFx() {
  if (!getDom().fxRateInput) return;
  const rate = Number(String(getDom().fxRateInput.value).replace(",", "."));
  if (!Number.isFinite(rate) || rate <= 0) {
    showToast("Ingresá un tipo de cambio válido");
    return;
  }
  const previousState = cloneState(getState());
  getState().fx.useManual = Boolean(getDom().fxUseManual?.checked);
  getState().fx.manualUsdArs = rate;
  getState().fx.usdArs = rate;
  if (!await saveState()) {
    setState(previousState);
    render();
    return;
  }
  render();
  showToast(getState().fx.useManual ? "Tipo de cambio manual guardado" : "Valor guardado (activá “usar manual” para forzar)");
}

  return {
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
    getSelectedCardId: () => selectedCardId,
    setSelectedCardId: (id) => {
      selectedCardId = id || "";
    },
  };
}
