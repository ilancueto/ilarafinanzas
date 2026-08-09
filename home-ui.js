/**
 * UI módulo home — factory inyectada desde app.js.
 */
import { fromCents, toCents } from "./state-core.js";
import { addMonths, dueStateForOccurrence } from "./finance-core.js";

export function createHomeUi(api) {
  const getState = () => api.getState();
  const setState = (next) => api.setState(next);
  const getDom = () => api.dom;
  const {
    element,
    emptyState,
    formatCurrency,
    formatMonthLabel,
    formatIsoDateLabel,
    isValidIsoDate,
    isMonthClosed,
    clampDateToMonth,
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
    toggleOccurrenceStatus,
    installmentProgress,
  } = api;

function renderDashboard() {
  const totals = getMonthTotals(getState().activeMonth);
  const isClosed = Boolean(getState().closedMonths[getState().activeMonth]);
  getDom().dashboardTitle.textContent = formatMonthLabel(getState().activeMonth);
  getDom().dashboardSubtitle.textContent = totals.occurrences.length
    ? `${totals.occurrences.length} movimiento${totals.occurrences.length === 1 ? "" : "s"} en este mes.`
    : "Todav\u00eda no hay movimientos para este mes.";

  const health = !totals.occurrences.length
    ? { label: "Sin datos todavía", tone: "neutral" }
    : totals.balanceCents >= 0
      ? { label: "Mes en equilibrio", tone: "positive" }
      : { label: "Revisar gastos", tone: "negative" };
  getDom().monthHealth.textContent = isClosed ? "Mes cerrado" : health.label;
  getDom().monthHealth.dataset.tone = health.tone;
  getDom().monthCloseBtn.textContent = isClosed ? "Reabrir mes" : "Cerrar mes";
  getDom().monthCloseBtn.classList.toggle("danger-btn", isClosed);

  getDom().summaryGrid.replaceChildren();
  const cards = [
    ["Ingresos", formatCurrency(totals.totalIncomeCents), `${totals.incomes.length} fuente${totals.incomes.length === 1 ? "" : "s"}`, "income"],
    ["Gastos", formatCurrency(totals.totalExpenseCents), `${totals.expenses.length} movimiento${totals.expenses.length === 1 ? "" : "s"}`, "expense"],
    // Saldo al momento: solo lo cobrado menos lo pagado (tildes), no el plan completo del mes.
    ["Disponible", formatCurrency(totals.actualBalanceCents), totals.actualBalanceCents >= 0 ? "Cobrado menos pagado (ahora)" : "Vas gastando más de lo cobrado", totals.actualBalanceCents >= 0 ? "balance" : "danger"],
    ["Pendiente de pagar", formatCurrency(totals.pendingExpenseCents), `${formatCurrency(totals.paidExpenseCents)} ya pagado`, "pending"],
  ];
  cards.forEach(([label, value, copy, tone]) => {
    const card = element("article", "summary-card");
    card.dataset.tone = tone;
    card.append(element("p", "summary-label", label), element("strong", "summary-value", value), element("span", "summary-copy", copy));
    getDom().summaryGrid.append(card);
  });

  getDom().actualSummary.replaceChildren();
  const pendingCount = totals.occurrences.filter((item) => item.status === "pending").length;
  const actualCards = [
    ["Cobrado", formatCurrency(totals.receivedIncomeCents), `${formatCurrency(totals.pendingIncomeCents)} por cobrar`, "income"],
    ["Pagado", formatCurrency(totals.paidExpenseCents), `${formatCurrency(totals.pendingExpenseCents)} por pagar`, "expense"],
    ["Flujo realizado", formatCurrency(totals.actualBalanceCents), "Cobrado menos pagado", totals.actualBalanceCents >= 0 ? "balance" : "danger"],
    ["Por resolver", `${pendingCount} pendiente${pendingCount === 1 ? "" : "s"}`, "Movimientos todavía abiertos", "pending"],
  ];
  actualCards.forEach(([label, value, copy, tone]) => {
    const item = element("div", "actual-stat");
    item.dataset.tone = tone;
    item.append(element("span", "", label), element("strong", "", value), element("small", "", copy));
    getDom().actualSummary.append(item);
  });

  const percentage = Math.round(totals.commitmentRate * 100);
  getDom().commitmentRate.textContent = totals.totalIncomeCents ? `${percentage}%` : "-";
  getDom().cashFlowVisual.replaceChildren();
  const track = element("div", "flow-track");
  track.setAttribute("role", "progressbar");
  track.setAttribute("aria-label", "Porcentaje de ingresos comprometido en gastos");
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", "100");
  track.setAttribute("aria-valuenow", String(Math.min(percentage, 100)));
  const fill = element("span", "flow-fill");
  fill.setAttribute("aria-hidden", "true");
  fill.style.width = `${Math.min(percentage, 100)}%`;
  if (percentage > 85) fill.dataset.alert = "true";
  track.append(fill);
  const labels = element("div", "flow-labels");
  const planBalance = totals.balanceCents;
  const balanceLabel = planBalance >= 0
    ? `${formatCurrency(planBalance)} si se cumple todo`
    : `${formatCurrency(Math.abs(planBalance))} faltante del plan`;
  labels.append(element("span", "", `${formatCurrency(totals.totalExpenseCents)} del mes`), element("strong", "", balanceLabel));
  getDom().cashFlowVisual.append(track, labels);

  renderCategoryBreakdown(totals.expenses);
  renderPersonBreakdown(totals);
  renderDueSoon(totals);
  // Últimos cargados del mes (por createdAt), sin tilde de pago en el home.
  const recentThisMonth = [...totals.occurrences]
    .sort((a, b) => {
      const ta = getState().transactions.find((tx) => tx.id === a.id)?.createdAt
        || getState().occurrences[a.statusKey]?.effectiveDate
        || "";
      const tb = getState().transactions.find((tx) => tx.id === b.id)?.createdAt
        || getState().occurrences[b.statusKey]?.effectiveDate
        || "";
      if (ta !== tb) return String(tb).localeCompare(String(ta));
      return String(b.name || "").localeCompare(String(a.name || ""), "es");
    })
    .slice(0, 6);
  renderMovementCollection(getDom().dashboardMovements, recentThisMonth, {
    compact: true,
    hideStatusToggle: true,
  });
  renderMiniForecast();
  renderBudgetProgress(totals);
}

/** Totales del mes agrupados por persona (para el home). */
function personTotalsFromOccurrences(occurrences) {
  const map = new Map();
  (occurrences || []).forEach((item) => {
    const person = sanitizeText(item.person, "Compartido") || "Compartido";
    if (!map.has(person)) {
      map.set(person, {
        person,
        incomeCents: 0,
        expenseCents: 0,
        receivedCents: 0,
        paidCents: 0,
        count: 0,
      });
    }
    const row = map.get(person);
    row.count += 1;
    if (item.kind === "income") {
      row.incomeCents += item.amountThisMonthCents;
      if (item.status === "paid") row.receivedCents += item.amountThisMonthCents;
    } else {
      row.expenseCents += item.amountThisMonthCents;
      if (item.status === "paid") row.paidCents += item.amountThisMonthCents;
    }
  });
  return [...map.values()].sort((a, b) => {
    const aTotal = a.incomeCents + a.expenseCents;
    const bTotal = b.incomeCents + b.expenseCents;
    return bTotal - aTotal || a.person.localeCompare(b.person, "es");
  });
}

function renderPersonBreakdown(totals) {
  if (!getDom().personBreakdown || !getDom().personBreakdownPanel) return;
  const rows = personTotalsFromOccurrences(totals?.occurrences);
  if (!rows.length) {
    getDom().personBreakdownPanel.hidden = true;
    getDom().personBreakdown.replaceChildren();
    return;
  }
  getDom().personBreakdownPanel.hidden = false;
  getDom().personBreakdown.replaceChildren();
  rows.forEach((row) => {
    const card = element("article", "person-breakdown-card");
    const plan = row.incomeCents - row.expenseCents;
    const actual = row.receivedCents - row.paidCents;
    card.append(
      element("strong", "person-breakdown-name", row.person),
      element(
        "p",
        "person-breakdown-meta",
        `${row.count} mov. · plan ${formatCurrency(plan)} · real ${formatCurrency(actual)}`,
      ),
    );
    const grid = element("div", "person-breakdown-grid");
    [
      ["Ingresos", formatCurrency(row.incomeCents), "income"],
      ["Gastos", formatCurrency(row.expenseCents), "expense"],
      ["Cobrado", formatCurrency(row.receivedCents), "income"],
      ["Pagado", formatCurrency(row.paidCents), "expense"],
    ].forEach(([label, value, tone]) => {
      const cell = element("div", "person-breakdown-stat");
      cell.dataset.tone = tone;
      cell.append(element("span", "", label), element("strong", "", value));
      grid.append(cell);
    });
    card.append(grid);
    getDom().personBreakdown.append(card);
  });
}

function renderDueSoon(totals) {
  if (!getDom().dueSoonPanel || !getDom().dueSoonList) return;
  const dueItems = (totals?.occurrences || [])
    .filter((item) => item.status === "pending")
    .map((item) => ({ item, due: dueStateForOccurrence(item) }))
    .filter(({ due }) => due === "overdue" || due === "today" || due === "upcoming")
    .sort((a, b) => {
      const order = { overdue: 0, today: 1, upcoming: 2 };
      if (order[a.due] !== order[b.due]) return order[a.due] - order[b.due];
      return (a.item.dueDay || 32) - (b.item.dueDay || 32)
        || a.item.name.localeCompare(b.item.name, "es");
    })
    .slice(0, 6);
  if (!dueItems.length) {
    getDom().dueSoonPanel.hidden = true;
    getDom().dueSoonList.replaceChildren();
    return;
  }
  getDom().dueSoonPanel.hidden = false;
  getDom().dueSoonList.replaceChildren();
  dueItems.forEach(({ item, due }) => {
    const row = element("button", "due-soon-row");
    row.type = "button";
    row.dataset.due = due;
    const label = due === "overdue" ? "Vencido" : due === "today" ? "Hoy" : "Próximo";
    row.append(
      element("strong", "", item.name),
      element("span", "", `${label}${item.dueDay ? ` · día ${item.dueDay}` : ""} · ${item.kind === "income" ? "Cobrar" : "Pagar"}`),
      element("span", "", formatCurrency(item.amountThisMonthCents)),
    );
    row.addEventListener("click", () => openMovementDialog(item.id, item.monthKey));
    getDom().dueSoonList.append(row);
  });
}

function renderBudgetProgress(totals) {
  const previous = getMonthTotals(addMonths(getState().activeMonth, -1));
  const expenseDiff = totals.totalExpenseCents - previous.totalExpenseCents;
  const incomeDiff = totals.totalIncomeCents - previous.totalIncomeCents;
  if (!previous.totalExpenseCents && !previous.totalIncomeCents) {
    getDom().monthComparison.textContent = "Sin mes anterior para comparar";
  } else {
    const parts = [];
    if (previous.totalExpenseCents || totals.totalExpenseCents) {
      parts.push(
        `Gastos ${expenseDiff <= 0 ? "↓" : "↑"} ${formatCurrency(Math.abs(expenseDiff))}`,
      );
    }
    if (previous.totalIncomeCents || totals.totalIncomeCents) {
      parts.push(
        `Ingresos ${incomeDiff >= 0 ? "↑" : "↓"} ${formatCurrency(Math.abs(incomeDiff))}`,
      );
    }
    getDom().monthComparison.textContent = `${parts.join(" · ")} vs ${formatMonthLabel(addMonths(getState().activeMonth, -1), true)}`;
  }
  getDom().budgetProgress.replaceChildren();
  const budgets = getState().budgets.filter((budget) => budget.monthKey === getState().activeMonth);
  if (!budgets.length) {
    getDom().budgetProgress.append(emptyState(
      "Sin presupuestos para este mes",
      "Podés definir límites por categoría desde Ajustes.",
    ));
    return;
  }
  budgets.forEach((budget) => {
    const spent = totals.expenses
      .filter((item) => item.category.localeCompare(budget.category, "es", { sensitivity: "base" }) === 0)
      .reduce((sum, item) => sum + item.amountThisMonthCents, 0);
    const percentage = Math.round((spent / budget.amountCents) * 100);
    const row = element("div", "budget-row");
    if (percentage > 100) row.dataset.tone = "negative";
    const head = element("div", "category-head");
    head.append(
      element("span", "", budget.category),
      element("strong", "", `${formatCurrency(spent)} / ${formatCurrency(budget.amountCents)}`),
    );
    const track = element("div", "category-track");
    const fill = element("span", "category-fill");
    fill.style.width = `${Math.min(percentage, 100)}%`;
    track.append(fill);
    row.append(head, track, element("small", "", `${percentage}% utilizado`));
    getDom().budgetProgress.append(row);
  });
}

/** Chips de categorías en Ajustes: preview + Ver todas (evita lista eterna). */
function renderSettingsCategories() {
  if (!getDom().categoriesList) return;
  getDom().categoriesList.replaceChildren();
  const all = [...(getState().categories || [])].sort((a, b) => a.localeCompare(b, "es"));
  if (!all.length) {
    settingsCategoriesExpanded = false;
    getDom().categoriesList.append(
      element("p", "backup-history-empty", "Sin categorías todavía. Agregá una arriba."),
    );
    return;
  }
  const hasMore = all.length > SETTINGS_CATEGORIES_PREVIEW;
  const visible = settingsCategoriesExpanded || !hasMore
    ? all
    : all.slice(0, SETTINGS_CATEGORIES_PREVIEW);
  visible.forEach((category) => {
    const chip = element("span", "person-chip");
    chip.append(element("span", "", category));
    const remove = element("button", "", "×");
    remove.type = "button";
    remove.setAttribute("aria-label", `Eliminar categoría ${category}`);
    remove.addEventListener("click", () => removeCategory(category));
    chip.append(remove);
    getDom().categoriesList.append(chip);
  });
  if (hasMore) {
    const toggle = element(
      "button",
      "text-btn category-breakdown-toggle settings-categories-toggle",
      settingsCategoriesExpanded
        ? "Ver menos"
        : `Ver todas (${all.length})`,
    );
    toggle.type = "button";
    toggle.setAttribute("aria-expanded", settingsCategoriesExpanded ? "true" : "false");
    toggle.addEventListener("click", () => {
      settingsCategoriesExpanded = !settingsCategoriesExpanded;
      renderSettingsCategories();
    });
    // Fuera del flex wrap de chips: fila completa debajo.
    const wrap = element("div", "settings-categories-toggle-wrap");
    wrap.append(toggle);
    if (!settingsCategoriesExpanded) {
      wrap.append(
        element(
          "small",
          "settings-categories-hint",
          ` · mostrando ${SETTINGS_CATEGORIES_PREVIEW} de ${all.length}`,
        ),
      );
    }
    getDom().categoriesList.append(wrap);
  }
}

function renderCategoryBreakdown(expenses) {
  getDom().categoryBreakdown.replaceChildren();
  if (!expenses.length) {
    categoryBreakdownExpanded = false;
    getDom().categoryBreakdown.append(emptyState("Sin gastos todav\u00eda", "Cuando carguen uno, ac\u00e1 ver\u00e1n c\u00f3mo se distribuye."));
    return;
  }
  const categories = new Map();
  expenses.forEach((item) => categories.set(item.category, (categories.get(item.category) || 0) + item.amountThisMonthCents));
  const sorted = [...categories.entries()].sort((a, b) => b[1] - a[1]);
  const previewLimit = 5;
  const hasMore = sorted.length > previewLimit;
  const visible = categoryBreakdownExpanded || !hasMore
    ? sorted
    : sorted.slice(0, previewLimit);
  const max = sorted[0][1];
  visible.forEach(([category, amount]) => {
    const row = element("div", "category-row");
    const head = element("div", "category-head");
    head.append(element("span", "", category), element("strong", "", formatCurrency(amount)));
    const bar = element("div", "category-track");
    const categoryFill = element("span", "category-fill");
    categoryFill.setAttribute("aria-hidden", "true");
    categoryFill.style.width = `${(amount / max) * 100}%`;
    bar.append(categoryFill);
    row.append(head, bar);
    getDom().categoryBreakdown.append(row);
  });
  if (hasMore) {
    const toggle = element(
      "button",
      "text-btn category-breakdown-toggle",
      categoryBreakdownExpanded
        ? "Ver menos"
        : `Ver todas (${sorted.length})`,
    );
    toggle.type = "button";
    toggle.setAttribute(
      "aria-expanded",
      categoryBreakdownExpanded ? "true" : "false",
    );
    toggle.addEventListener("click", () => {
      categoryBreakdownExpanded = !categoryBreakdownExpanded;
      renderCategoryBreakdown(expenses);
    });
    getDom().categoryBreakdown.append(toggle);
  }
}

function renderMiniForecast() {
  getDom().miniForecast.replaceChildren();
  buildProjection(4).forEach((month, index) => {
    const card = element("button", "forecast-card");
    card.type = "button";
    if (month.balanceCents < 0) card.dataset.tone = "negative";
    if (index === 0) card.classList.add("is-current");
    card.append(
      element("span", "forecast-month", formatMonthLabel(month.monthKey, true)),
      element("strong", "", formatCurrency(month.balanceCents, true)),
      element("small", "", month.balanceCents >= 0 ? "queda" : "faltar\u00eda"),
    );
    card.addEventListener("click", () => {
      getState().activeMonth = month.monthKey;
      switchView("projection");
      render();
    });
    getDom().miniForecast.append(card);
  });
}

function scheduleLabel(item) {
  if (item.schedule.type === "installment") {
    const progress = installmentProgress(item);
    return progress
      ? `Cuota ${item.installmentIndex} de ${item.schedule.installments} · resta ${formatCurrency(progress.remainingCents)}`
      : `Cuota ${item.installmentIndex} de ${item.schedule.installments}`;
  }
  if (item.schedule.type === "monthly") {
    return item.schedule.endMonth ? `Mensual hasta ${formatMonthLabel(item.schedule.endMonth, true)}` : "Todos los meses";
  }
  return "Una sola vez";
}

function renderMovementCollection(container, occurrences, options = false) {
  // Compat: tercer arg boolean = compact (legado).
  const opts = typeof options === "boolean"
    ? { compact: options, hideStatusToggle: false }
    : { compact: false, hideStatusToggle: false, ...options };
  const { compact, hideStatusToggle } = opts;
  container.replaceChildren();
  if (!occurrences.length) {
    container.append(emptyState(
      "Nada por ac\u00e1",
      "Agreg\u00e1 un ingreso o gasto para empezar.",
      compact ? false : true,
    ));
    return;
  }

  occurrences.forEach((item) => {
    const row = element("article", `movement-row${compact ? " is-compact" : ""}`);
    row.dataset.kind = item.kind;
    if (hideStatusToggle) row.classList.add("no-status-toggle");

    let statusButton = null;
    if (!hideStatusToggle) {
      statusButton = element("button", `status-check${item.status === "paid" ? " is-paid" : ""}`);
      statusButton.type = "button";
      const completeLabel = item.kind === "income" ? "Marcar como cobrado" : "Marcar como pagado";
      const reopenLabel = item.kind === "income"
        ? "Marcar ingreso como pendiente"
        : "Marcar gasto como pendiente";
      statusButton.setAttribute("aria-label", item.status === "paid" ? reopenLabel : completeLabel);
      statusButton.textContent = item.status === "paid" ? "\u2713" : "";
      statusButton.disabled = Boolean(getState().closedMonths[item.monthKey]);
      statusButton.addEventListener("click", () => toggleOccurrenceStatus(item));
    }

    const body = element("div", "movement-body");
    const titleLine = element("div", "movement-title-line");
    titleLine.append(element("strong", "movement-name", item.name), element("span", "kind-badge", item.kind === "income" ? "Ingreso" : "Gasto"));
    const dueState = dueStateForOccurrence(item);
    const dueLabels = {
      overdue: "Vencido",
      today: "Vence hoy",
      upcoming: "Próximo a vencer",
      scheduled: item.dueDay ? `Vence el día ${item.dueDay}` : "",
      none: "",
    };
    const meta = element("p", "movement-meta", [
      item.category,
      item.person,
      scheduleLabel(item),
      dueLabels[dueState],
    ].filter(Boolean).join(" · "));
    if (["overdue", "today", "upcoming"].includes(dueState)) meta.dataset.due = dueState;
    if (item.note && !compact) meta.append(document.createTextNode(` \u00b7 ${item.note}`));
    body.append(titleLine, meta);

    const amount = element("div", "movement-amount");
    amount.append(
      element("strong", "", `${item.kind === "income" ? "+" : "-"}${formatCurrency(item.amountThisMonthCents)}`),
      element("small", "", item.status === "paid"
        ? (item.kind === "income" ? "Cobrado" : "Pagado")
        : "Pendiente"),
    );

    const editButton = element("button", "row-menu", "Editar");
    editButton.type = "button";
    editButton.setAttribute("aria-label", `Editar ${item.name}`);
    editButton.disabled = Boolean(getState().closedMonths[item.monthKey]);
    editButton.addEventListener("click", () => openMovementDialog(item.id, item.monthKey));
    if (statusButton) row.append(statusButton, body, amount, editButton);
    else row.append(body, amount, editButton);
    container.append(row);
  });
}

function renderMovements() {
  const totals = getMonthTotals(getState().activeMonth);
  const search = getDom().movementSearch.value.trim().toLocaleLowerCase("es");
  const type = getDom().movementTypeFilter.value;
  const status = getDom().movementStatusFilter.value;
  const filtered = totals.occurrences.filter((item) => {
    const haystack = `${item.name} ${item.category} ${item.person} ${item.note}`.toLocaleLowerCase("es");
    return (!search || haystack.includes(search)) &&
      (type === "all" || item.kind === type) && (status === "all" || item.status === status);
  });

  getDom().movementTotals.replaceChildren();
  [
    ["Ingresos", totals.totalIncomeCents, "income"],
    ["Gastos", totals.totalExpenseCents, "expense"],
    ["Balance", totals.balanceCents, totals.balanceCents >= 0 ? "balance" : "danger"],
  ].forEach(([label, value, tone]) => {
    const item = element("div", "list-total");
    item.dataset.tone = tone;
    item.append(element("span", "", label), element("strong", "", formatCurrency(value)));
    getDom().movementTotals.append(item);
  });
  renderMovementCollection(getDom().movementList, filtered);
}


  return {
    renderDashboard,
    personTotalsFromOccurrences,
    renderPersonBreakdown,
    renderDueSoon,
    renderBudgetProgress,
    renderSettingsCategories,
    renderCategoryBreakdown,
    renderMiniForecast,
    scheduleLabel,
    renderMovementCollection,
    renderMovements,
  };
}
