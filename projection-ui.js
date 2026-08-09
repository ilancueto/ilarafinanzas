/**
 * UI módulo projection — factory inyectada desde app.js.
 */
import { getAllCardsMonthLoad } from "./cards-core.js";

export function createProjectionUi(api) {
  const getState = () => api.getState();
  const getDom = () => api.dom;
  const {
    element,
    emptyState,
    formatCurrency,
    formatMonthLabel,
    buildProjection,
    switchView,
    render,
  } = api;

const EXPENSE_CHART_COLORS = [
  "#D4A574", "#E08A7A", "#8FBF9A", "#C48972", "#A78BFA",
  "#E0B86A", "#7EB8C9", "#D4A0C0", "#8FB4A8", "#F0B4A8",
  "#B8A0D4", "#C9B48A",
];

/** UI local de Proyección (no se persiste). */
const projectionUi = {
  selectedMonthKey: null,
  selectedCategory: null,
  expenseFilter: "all", // all | monthly | installment | one-time
  includeCards: false,
  incomeCutPercent: 0,
};

/** Carga estimada de plásticos (sin CC) para un mes de proyección. */
function projectionCardsLoadCents(monthKey) {
  return getAllCardsMonthLoad({
    creditCards: getState().creditCards,
    cardCharges: getState().cardCharges,
    monthKey,
    activeMonth: getState().activeMonth,
    fx: getState().fx,
    includeExcluded: false,
  }).totalArs || 0;
}

/** Ingreso del mes con recorte de escenario (“¿y si baja el sueldo?”). */
function projectionIncomeCents(month, cutPercent = projectionUi.incomeCutPercent) {
  const base = month?.totalIncomeCents || 0;
  const cut = Math.min(90, Math.max(0, Number(cutPercent) || 0));
  if (!cut) return base;
  return Math.round(base * (1 - cut / 100));
}

function scheduleTypeLabel(type) {
  if (type === "monthly") return "Mensual";
  if (type === "installment") return "Cuotas";
  return "Una vez";
}

function filterExpensesForProjection(expenses, filter = projectionUi.expenseFilter) {
  return (expenses || []).filter((item) => {
    if (item.kind && item.kind !== "expense") return false;
    if (filter === "all") return true;
    return item.schedule?.type === filter;
  });
}

function categoryTotalsFromExpenses(expenses) {
  const map = new Map();
  expenses.forEach((item) => {
    const key = item.category || "Sin categoría";
    map.set(key, (map.get(key) || 0) + item.amountThisMonthCents);
  });
  return [...map.entries()]
    .map(([category, cents]) => ({ category, cents }))
    .sort((a, b) => b.cents - a.cents || a.category.localeCompare(b.category, "es"));
}

function selectProjectionMonth(monthKey, { rerender = true } = {}) {
  projectionUi.selectedMonthKey = monthKey;
  projectionUi.selectedCategory = null;
  if (rerender) renderProjection();
}

function selectProjectionCategory(category) {
  projectionUi.selectedCategory =
    projectionUi.selectedCategory === category ? null : category;
  renderProjection();
}

function setProjectionExpenseFilter(filter) {
  projectionUi.expenseFilter = filter;
  projectionUi.selectedCategory = null;
  renderProjection();
}

function renderProjection() {
  const projection = buildProjection();
  if (!projection.length) {
    getDom().projectionSummary?.replaceChildren();
    getDom().projectionChart?.replaceChildren();
    getDom().projectionList?.replaceChildren();
    if (getDom().projectionBreakdown) {
      getDom().projectionBreakdown.replaceChildren(
        emptyState("Sin datos", "Cargá movimientos para ver la proyección."),
      );
    }
    if (getDom().projectionBreakdownDetail) {
      getDom().projectionBreakdownDetail.hidden = true;
      getDom().projectionBreakdownDetail.replaceChildren();
    }
    return;
  }

  const monthKeys = projection.map((month) => month.monthKey);
  if (!monthKeys.includes(projectionUi.selectedMonthKey)) {
    projectionUi.selectedMonthKey = monthKeys.includes(getState().activeMonth)
      ? getState().activeMonth
      : monthKeys[0];
  }
  const selectedMonth = projection.find((month) => month.monthKey === projectionUi.selectedMonthKey)
    || projection[0];

  const cut = projectionUi.incomeCutPercent;
  const withCards = projectionUi.includeCards;
  const enriched = projection.map((month) => {
    const incomeCents = projectionIncomeCents(month, cut);
    const cardsCents = withCards ? projectionCardsLoadCents(month.monthKey) : 0;
    const homeExpenseCents = month.totalExpenseCents;
    const expenseCents = homeExpenseCents + cardsCents;
    return {
      ...month,
      incomeCents,
      homeExpenseCents,
      cardsCents,
      expenseCents,
      netCents: incomeCents - expenseCents,
    };
  });
  const selectedEnriched = enriched.find((month) => month.monthKey === selectedMonth.monthKey)
    || enriched[0];

  const monthsWithExpense = enriched.filter((month) => month.expenseCents > 0);
  const avgExpenseCents = monthsWithExpense.length
    ? Math.round(
      monthsWithExpense.reduce((sum, month) => sum + month.expenseCents, 0)
      / monthsWithExpense.length,
    )
    : 0;
  const monthsWithoutIncome = enriched.filter((month) => month.incomeCents <= 0).length;
  const selectedExpenses = filterExpensesForProjection(selectedMonth.expenses);
  const selectedExpenseTotal = selectedExpenses.reduce((sum, item) => sum + item.amountThisMonthCents, 0)
    + (selectedEnriched?.cardsCents || 0);
  const categoryCount = categoryTotalsFromExpenses(selectedExpenses).length;

  if (getDom().projectionIncludeCards) getDom().projectionIncludeCards.checked = withCards;
  if (getDom().projectionIncomeCut) getDom().projectionIncomeCut.value = String(cut || 0);

  getDom().projectionSummary.replaceChildren();
  [
    [
      "Gasto del mes",
      formatCurrency(selectedExpenseTotal),
      [
        formatMonthLabel(selectedMonth.monthKey),
        withCards && selectedEnriched?.cardsCents
          ? `hogar ${formatCurrency(selectedEnriched.homeExpenseCents)} + tarjetas ${formatCurrency(selectedEnriched.cardsCents)}`
          : null,
      ].filter(Boolean).join(" · "),
      selectedEnriched.expenseCents > selectedEnriched.incomeCents && selectedEnriched.incomeCents > 0
        ? "negative"
        : "",
    ],
    [
      "Ingreso del mes",
      formatCurrency(selectedEnriched.incomeCents),
      cut ? `Escenario −${cut}% sobre lo cargado` : "Sin recorte de escenario",
      "",
    ],
    [
      "Promedio gasto / mes",
      formatCurrency(avgExpenseCents),
      monthsWithExpense.length
        ? `En ${monthsWithExpense.length} mes${monthsWithExpense.length === 1 ? "" : "es"} con gasto`
        : "Sin gastos en el horizonte",
      "",
    ],
    [
      cut || withCards ? "Balance escenario" : "Sin ingreso cargado",
      cut || withCards
        ? formatCurrency(selectedEnriched.netCents)
        : String(monthsWithoutIncome),
      cut || withCards
        ? (selectedEnriched.netCents >= 0 ? "Ingreso − gasto (con escenario)" : "Queda en rojo en este corte")
        : (monthsWithoutIncome
          ? "Meses del horizonte sin sueldo/ingreso"
          : "Todos los meses tienen ingreso"),
      (cut || withCards)
        ? (selectedEnriched.netCents < 0 ? "negative" : "")
        : (monthsWithoutIncome ? "negative" : ""),
    ],
  ].forEach(([label, value, copy, tone]) => {
    const card = element("article", "projection-stat");
    if (tone) card.dataset.tone = tone;
    card.append(element("span", "", label), element("strong", "", value), element("small", "", copy));
    getDom().projectionSummary.append(card);
  });

  // --- Chart: income vs expense per month (clickable) ---
  const maxValue = Math.max(
    1,
    ...enriched.flatMap((month) => [month.incomeCents, month.expenseCents]),
  );
  getDom().projectionChart.replaceChildren();
  getDom().projectionChart.setAttribute("role", "list");
  getDom().projectionChart.setAttribute(
    "aria-label",
    "Ingresos y gastos por mes. Hacé clic en un mes para ver el desglose de gastos.",
  );
  enriched.forEach((month) => {
    const group = element("button", "chart-month");
    group.type = "button";
    group.setAttribute("role", "listitem");
    if (month.monthKey === selectedMonth.monthKey) group.dataset.active = "true";
    group.setAttribute(
      "aria-label",
      `${formatMonthLabel(month.monthKey)}: ingresos ${formatCurrency(month.incomeCents)}, gastos ${formatCurrency(month.expenseCents)}`,
    );
    const cardBit = month.cardsCents
      ? `\nTarjetas est. ${formatCurrency(month.cardsCents)}`
      : "";
    group.title = `${formatMonthLabel(month.monthKey)}\n+ ${formatCurrency(month.incomeCents)}\n− ${formatCurrency(month.expenseCents)}${cardBit}\nClic para desglosar`;
    const bars = element("div", "chart-bars");
    const incomeBar = element("span", "chart-bar income-bar");
    const expenseBar = element("span", "chart-bar expense-bar");
    incomeBar.style.height = `${Math.max((month.incomeCents / maxValue) * 100, month.incomeCents ? 3 : 0)}%`;
    expenseBar.style.height = `${Math.max((month.expenseCents / maxValue) * 100, month.expenseCents ? 3 : 0)}%`;
    bars.append(incomeBar, expenseBar);
    group.append(bars, element("small", "", formatMonthLabel(month.monthKey, true)));
    group.addEventListener("click", () => selectProjectionMonth(month.monthKey));
    getDom().projectionChart.append(group);
  });

  // --- Filters ---
  if (getDom().projectionExpenseFilters) {
    getDom().projectionExpenseFilters.replaceChildren();
    [
      ["all", "Todos"],
      ["monthly", "Mensuales"],
      ["installment", "Cuotas"],
      ["one-time", "Una vez"],
    ].forEach(([value, label]) => {
      const chip = element("button", "proj-filter-chip", label);
      chip.type = "button";
      if (projectionUi.expenseFilter === value) chip.dataset.active = "true";
      chip.addEventListener("click", () => setProjectionExpenseFilter(value));
      getDom().projectionExpenseFilters.append(chip);
    });
  }

  if (getDom().projectionBreakdownTitle) {
    getDom().projectionBreakdownTitle.textContent =
      `Gastos · ${formatMonthLabel(selectedMonth.monthKey)}`
      + (withCards ? " (+ tarjetas est.)" : "")
      + (cut ? ` · ingreso −${cut}%` : "");
  }

  // --- Category bars ---
  const categories = categoryTotalsFromExpenses(selectedExpenses);
  if (withCards && selectedEnriched?.cardsCents > 0) {
    categories.push({
      category: "Tarjetas (estimado plásticos)",
      cents: selectedEnriched.cardsCents,
      isCards: true,
    });
    categories.sort((a, b) => b.cents - a.cents || a.category.localeCompare(b.category, "es"));
  }
  const maxCat = Math.max(1, ...categories.map((item) => item.cents));
  if (getDom().projectionBreakdown) {
    getDom().projectionBreakdown.replaceChildren();
    if (!categories.length) {
      getDom().projectionBreakdown.append(
        emptyState(
          "Sin gastos en este corte",
          "Probá otro mes (clic en el gráfico) u otro filtro de tipo.",
        ),
      );
    } else {
      categories.forEach((row, index) => {
        const color = row.isCards
          ? "#d4a574"
          : EXPENSE_CHART_COLORS[index % EXPENSE_CHART_COLORS.length];
        const pct = Math.round((row.cents / selectedExpenseTotal) * 100) || 0;
        const barRow = element("button", "expense-bar-row");
        barRow.type = "button";
        if (projectionUi.selectedCategory === row.category) barRow.dataset.active = "true";
        barRow.setAttribute(
          "aria-label",
          `${row.category}: ${formatCurrency(row.cents)}, ${pct} por ciento`,
        );
        const label = element("div", "expense-bar-label");
        const swatch = element("span", "expense-swatch");
        swatch.style.background = color;
        label.append(swatch, element("span", "", row.category));
        const track = element("div", "expense-bar-track");
        const fill = element("span", "expense-bar-fill");
        fill.style.width = `${Math.max((row.cents / maxCat) * 100, row.cents ? 2 : 0)}%`;
        fill.style.background = color;
        track.append(fill);
        const meta = element("div", "expense-bar-meta");
        meta.append(
          element("strong", "", formatCurrency(row.cents)),
          element("small", "", `${pct}%`),
        );
        barRow.append(label, track, meta);
        if (!row.isCards) {
          barRow.addEventListener("click", () => selectProjectionCategory(row.category));
        } else {
          barRow.disabled = true;
          barRow.title = "Carga de plásticos (sin cuentas corrientes). No es un resumen generado en Movimientos.";
        }
        getDom().projectionBreakdown.append(barRow);
      });
    }
  }

  // --- Detail of selected category ---
  if (getDom().projectionBreakdownDetail) {
    if (!projectionUi.selectedCategory) {
      getDom().projectionBreakdownDetail.hidden = true;
      getDom().projectionBreakdownDetail.replaceChildren();
    } else {
      const items = selectedExpenses
        .filter((item) => (item.category || "Sin categoría") === projectionUi.selectedCategory)
        .sort((a, b) => b.amountThisMonthCents - a.amountThisMonthCents
          || a.name.localeCompare(b.name, "es"));
      getDom().projectionBreakdownDetail.hidden = false;
      getDom().projectionBreakdownDetail.replaceChildren();
      const head = element("div", "breakdown-detail-head");
      head.append(
        element("strong", "", projectionUi.selectedCategory),
        element(
          "span",
          "",
          `${items.length} movimiento${items.length === 1 ? "" : "s"} · ${formatCurrency(
            items.reduce((sum, item) => sum + item.amountThisMonthCents, 0),
          )}`,
        ),
      );
      const list = element("div", "breakdown-detail-list");
      items.forEach((item) => {
        const line = element("div", "breakdown-detail-row");
        const left = element("div", "");
        left.append(
          element("strong", "", item.name),
          element(
            "small",
            "",
            [item.person, scheduleTypeLabel(item.schedule?.type)].filter(Boolean).join(" · "),
          ),
        );
        line.append(left, element("strong", "expense-text", formatCurrency(item.amountThisMonthCents)));
        list.append(line);
      });
      const openMonth = element("button", "text-btn", "Abrir este mes en Movimientos →");
      openMonth.type = "button";
      openMonth.addEventListener("click", () => {
        getState().activeMonth = selectedMonth.monthKey;
        switchView("movements");
        render();
      });
      getDom().projectionBreakdownDetail.append(head, list, openMonth);
    }
  }

  // --- Month list ---
  getDom().projectionList.replaceChildren();
  projection.forEach((month) => {
    const row = element("button", "projection-row");
    row.type = "button";
    if (month.monthKey === selectedMonth.monthKey) row.dataset.active = "true";
    if (month.totalExpenseCents > 0 && month.totalIncomeCents <= 0) row.dataset.tone = "negative";
    const main = element("div", "projection-row-main");
    const incomeNote = month.totalIncomeCents > 0
      ? `${month.occurrences.length} movimiento${month.occurrences.length === 1 ? "" : "s"}`
      : "Sin ingreso cargado";
    main.append(element("strong", "", formatMonthLabel(month.monthKey)), element("span", "", incomeNote));
    const figures = element("div", "projection-figures");
    figures.append(
      element("span", "income-text", `+ ${formatCurrency(month.totalIncomeCents)}`),
      element("span", "expense-text", `- ${formatCurrency(month.totalExpenseCents)}`),
    );
    const balance = month.totalIncomeCents - month.totalExpenseCents;
    const result = element("div", "projection-result");
    result.append(
      element("strong", "", formatCurrency(balance)),
      element("small", "", "Ingresos − gastos"),
    );
    if (balance < 0) result.dataset.tone = "negative";
    row.append(main, figures, result);
    row.addEventListener("click", () => selectProjectionMonth(month.monthKey));
    row.addEventListener("dblclick", () => {
      getState().activeMonth = month.monthKey;
      switchView("movements");
      render();
    });
    getDom().projectionList.append(row);
  });
}


  return {
    projectionCardsLoadCents,
    projectionIncomeCents,
    scheduleTypeLabel,
    filterExpensesForProjection,
    categoryTotalsFromExpenses,
    selectProjectionMonth,
    selectProjectionCategory,
    setProjectionExpenseFilter,
    renderProjection,
    getProjectionUi: () => projectionUi,
    setIncludeCards: (value) => {
      projectionUi.includeCards = Boolean(value);
    },
    setIncomeCutPercent: (value) => {
      projectionUi.incomeCutPercent = Math.min(90, Math.max(0, Number(value) || 0));
    },
  };
}
