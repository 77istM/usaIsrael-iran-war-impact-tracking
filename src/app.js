import {
  appMeta as sampleAppMeta,
  regionExposure as sampleRegionExposure,
  scenarioDefaults as sampleScenarioDefaults,
  seriesCatalog as sampleSeriesCatalog,
  sourceNotes as sampleSourceNotes,
  timelineEvents as sampleTimelineEvents,
} from "./data.js";

function createFallbackDashboardData() {
  return {
    appMeta: {
      ...sampleAppMeta,
      updatedAt: new Date().toISOString(),
      sourceLabel: "Sample data",
      liveCoverage: 0,
      marketOpen: false,
      refreshCadenceMinutes: 120,
      statusNote: "Sample data loaded while the backend warms up.",
    },
    seriesCatalog: sampleSeriesCatalog,
    regionExposure: sampleRegionExposure,
    timelineEvents: sampleTimelineEvents,
    sourceNotes: sampleSourceNotes,
    scenarioDefaults: sampleScenarioDefaults,
    alerts: [],
  };
}

function latestFromValues(values) {
  const current = values[values.length - 1];
  const previous = values[values.length - 2] ?? current;
  const change = current - previous;
  return {
    current,
    previous,
    change,
    delta: change,
    percent: previous ? (change / previous) * 100 : 0,
  };
}

function mergeDashboardData(payload) {
  const fallback = createFallbackDashboardData();
  const liveById = new Map((payload?.seriesCatalog || []).map((series) => [series.id, series]));
  const mergedSeriesCatalog = fallback.seriesCatalog.map((series) => {
    const liveSeries = liveById.get(series.id);
    return {
      ...series,
      ...(liveSeries || {}),
      values: (liveSeries?.values?.length ? liveSeries.values : series.values).slice(-45),
      source: liveSeries?.source || "sample",
      sourceSeriesId: liveSeries?.sourceSeriesId || null,
      format: series.format,
    };
  });

  return {
    appMeta: {
      ...fallback.appMeta,
      ...(payload?.appMeta || {}),
      updatedAt: payload?.appMeta?.updatedAt || fallback.appMeta.updatedAt,
    },
    seriesCatalog: mergedSeriesCatalog,
    regionExposure: payload?.regionExposure || fallback.regionExposure,
    timelineEvents: payload?.timelineEvents || fallback.timelineEvents,
    sourceNotes: payload?.sourceNotes || fallback.sourceNotes,
    scenarioDefaults: payload?.scenarioDefaults || fallback.scenarioDefaults,
    alerts: payload?.alerts || [],
  };
}

const state = {
  selectedSeriesId: sampleSeriesCatalog[0].id,
  dashboardData: createFallbackDashboardData(),
};

const formatDate = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const formatTime = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

function $(selector) {
  return document.querySelector(selector);
}

function formatSigned(value, digits = 2, suffix = "") {
  const absolute = Math.abs(value).toFixed(digits);
  return `${value >= 0 ? "+" : "-"}${absolute}${suffix}`;
}

function createSvgEl(tagName) {
  return document.createElementNS("http://www.w3.org/2000/svg", tagName);
}

function getDashboardData() {
  return state.dashboardData;
}

function getLatestPoints(seriesCatalog) {
  return seriesCatalog.map((series) => ({
    ...series,
    latest: latestFromValues(series.values),
  }));
}

function seriesScale(values, width, height, padding = 26) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = (width - padding * 2) / Math.max(values.length - 1, 1);
  return values.map((value, index) => {
    const x = padding + step * index;
    const normalized = (value - min) / span;
    const y = height - padding - normalized * (height - padding * 2);
    return { x, y, value };
  });
}

function renderKpis() {
  const data = getDashboardData();
  const kpiGrid = $("#kpi-grid");
  kpiGrid.innerHTML = "";

  getLatestPoints(data.seriesCatalog).forEach((series) => {
    const change = series.latest.delta;
    const selected = series.id === state.selectedSeriesId;
    const card = document.createElement("button");
    card.type = "button";
    card.className = `kpi-card ${selected ? "selected" : ""}`;
    card.innerHTML = `
      <p class="kpi-name">${series.label}</p>
      <div class="kpi-value">${series.format(series.latest.current)}</div>
      <div class="kpi-meta">
        <span>${series.description}</span>
        <span style="color:${change >= 0 ? "#98f0c7" : "#ff7a8f"}">${formatSigned(change, Math.abs(change) < 10 ? 2 : 0)} ${series.unit}</span>
      </div>
    `;
    card.addEventListener("click", () => {
      state.selectedSeriesId = series.id;
      renderDashboard();
    });
    kpiGrid.appendChild(card);
  });
}

function renderTrendChart() {
  const data = getDashboardData();
  const selected = data.seriesCatalog.find((series) => series.id === state.selectedSeriesId) ?? data.seriesCatalog[0];
  $("#chart-title").textContent = `${selected.label} trend`;
  $("#chart-legend").innerHTML = `
    <span class="pill"><span class="legend-dot" style="background:${selected.color}"></span>${selected.label}</span>
    <span class="pill">${selected.description}</span>
  `;

  const container = $("#trend-chart");
  container.innerHTML = "";

  const width = 940;
  const height = 340;
  const padding = 30;
  const svg = createSvgEl("svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.classList.add("trend-svg");

  const background = createSvgEl("rect");
  background.setAttribute("x", "0");
  background.setAttribute("y", "0");
  background.setAttribute("width", width);
  background.setAttribute("height", height);
  background.setAttribute("rx", "22");
  background.setAttribute("fill", "rgba(255,255,255,0.02)");
  svg.appendChild(background);

  for (let index = 0; index < 5; index += 1) {
    const gridLine = createSvgEl("line");
    const y = padding + ((height - padding * 2) / 4) * index;
    gridLine.setAttribute("x1", padding.toString());
    gridLine.setAttribute("x2", (width - padding).toString());
    gridLine.setAttribute("y1", y.toString());
    gridLine.setAttribute("y2", y.toString());
    gridLine.setAttribute("stroke", "rgba(255,255,255,0.08)");
    gridLine.setAttribute("stroke-width", "1");
    svg.appendChild(gridLine);
  }

  const points = seriesScale(selected.values, width, height, padding);
  const pathData = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");

  const defs = createSvgEl("defs");
  const linear = createSvgEl("linearGradient");
  linear.setAttribute("id", `${selected.id}-fade`);
  linear.setAttribute("x1", "0%");
  linear.setAttribute("y1", "0%");
  linear.setAttribute("x2", "0%");
  linear.setAttribute("y2", "100%");

  const stop1 = createSvgEl("stop");
  stop1.setAttribute("offset", "0%");
  stop1.setAttribute("stop-color", selected.color);
  stop1.setAttribute("stop-opacity", "0.55");

  const stop2 = createSvgEl("stop");
  stop2.setAttribute("offset", "100%");
  stop2.setAttribute("stop-color", selected.color);
  stop2.setAttribute("stop-opacity", "0.02");

  linear.append(stop1, stop2);
  defs.appendChild(linear);
  svg.appendChild(defs);

  const area = createSvgEl("path");
  area.setAttribute(
    "d",
    `${pathData} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`,
  );
  area.setAttribute("fill", `url(#${selected.id}-fade)`);
  area.setAttribute("opacity", "0.85");
  svg.appendChild(area);

  const line = createSvgEl("path");
  line.setAttribute("d", pathData);
  line.setAttribute("fill", "none");
  line.setAttribute("stroke", selected.accent);
  line.setAttribute("stroke-width", "4");
  line.setAttribute("stroke-linecap", "round");
  line.setAttribute("stroke-linejoin", "round");
  svg.appendChild(line);

  const latestPoint = points[points.length - 1];
  const dot = createSvgEl("circle");
  dot.setAttribute("cx", latestPoint.x.toString());
  dot.setAttribute("cy", latestPoint.y.toString());
  dot.setAttribute("r", "6");
  dot.setAttribute("fill", selected.accent);
  dot.setAttribute("stroke", "#06111c");
  dot.setAttribute("stroke-width", "4");
  svg.appendChild(dot);

  container.appendChild(svg);
}

function renderSignalSummary() {
  const data = getDashboardData();
  const selected = getLatestPoints(data.seriesCatalog).find((series) => series.id === state.selectedSeriesId) ?? getLatestPoints(data.seriesCatalog)[0];
  const latest = selected.latest;
  const summary = [
    {
      title: `${selected.label} latest move`,
      description: `${selected.format(latest.current)} after a ${formatSigned(latest.delta, Math.abs(latest.delta) < 10 ? 2 : 0)} move from the previous reading.`,
    },
    {
      title: "Risk channel",
      description: selected.description,
    },
    {
      title: "Interpretation",
      description: latest.delta >= 0 ? "The current trend is consistent with a risk-off repricing and higher inflation pressure." : "The selected series is easing, which may indicate a partial stabilization in this channel.",
    },
  ];

  const summaryContainer = $("#signal-summary");
  summaryContainer.innerHTML = summary
    .map(
      (item) => `
        <article class="signal-item">
          <h3 class="signal-title">${item.title}</h3>
          <p class="signal-description">${item.description}</p>
        </article>
      `,
    )
    .join("");
}

function renderWorldMap() {
  const data = getDashboardData();
  const svg = $("#world-map");
  svg.innerHTML = "";

  const globe = createSvgEl("circle");
  globe.setAttribute("cx", "500");
  globe.setAttribute("cy", "260");
  globe.setAttribute("r", "220");
  globe.setAttribute("fill", "rgba(103, 212, 255, 0.04)");
  globe.setAttribute("stroke", "rgba(255,255,255,0.08)");
  svg.appendChild(globe);

  for (let index = 0; index < 6; index += 1) {
    const meridian = createSvgEl("line");
    const x = 220 + index * 110;
    meridian.setAttribute("x1", x.toString());
    meridian.setAttribute("x2", x.toString());
    meridian.setAttribute("y1", "70");
    meridian.setAttribute("y2", "450");
    meridian.setAttribute("stroke", "rgba(255,255,255,0.05)");
    svg.appendChild(meridian);
  }

  for (let index = 0; index < 4; index += 1) {
    const parallel = createSvgEl("line");
    const y = 120 + index * 85;
    parallel.setAttribute("x1", "140");
    parallel.setAttribute("x2", "860");
    parallel.setAttribute("y1", y.toString());
    parallel.setAttribute("y2", y.toString());
    parallel.setAttribute("stroke", "rgba(255,255,255,0.05)");
    svg.appendChild(parallel);
  }

  data.regionExposure.forEach((region) => {
    const group = createSvgEl("g");
    const bubble = createSvgEl("circle");
    const radius = 18 + region.score / 7;
    bubble.setAttribute("cx", region.x.toString());
    bubble.setAttribute("cy", region.y.toString());
    bubble.setAttribute("r", radius.toString());
    bubble.setAttribute("fill", region.color);
    bubble.setAttribute("fill-opacity", "0.3");
    bubble.setAttribute("stroke", region.color);
    bubble.setAttribute("stroke-width", "2");

    const pulse = createSvgEl("circle");
    pulse.setAttribute("cx", region.x.toString());
    pulse.setAttribute("cy", region.y.toString());
    pulse.setAttribute("r", (radius + 10).toString());
    pulse.setAttribute("fill", "none");
    pulse.setAttribute("stroke", region.color);
    pulse.setAttribute("stroke-opacity", "0.15");
    pulse.setAttribute("stroke-width", "6");

    const label = createSvgEl("text");
    label.setAttribute("x", (region.x + radius + 12).toString());
    label.setAttribute("y", (region.y - 6).toString());
    label.setAttribute("fill", "#edf4ff");
    label.setAttribute("font-size", "20");
    label.setAttribute("font-weight", "700");
    label.textContent = region.name;

    const sub = createSvgEl("text");
    sub.setAttribute("x", (region.x + radius + 12).toString());
    sub.setAttribute("y", (region.y + 18).toString());
    sub.setAttribute("fill", "#9bb0d3");
    sub.setAttribute("font-size", "13");
    sub.textContent = `${region.score}/100 stress`;

    group.append(pulse, bubble, label, sub);
    svg.appendChild(group);
  });
}

function renderRegionList() {
  const data = getDashboardData();
  const container = $("#region-list");
  container.innerHTML = data.regionExposure
    .map(
      (region) => `
        <article class="region-item">
          <h3 class="region-title">${region.name}</h3>
          <p class="region-copy">${region.impact}</p>
          <div class="kpi-meta"><span>Exposure score</span><span style="color:${region.color}">${region.score}/100</span></div>
        </article>
      `,
    )
    .join("");
}

function renderSources() {
  const data = getDashboardData();
  const container = $("#source-list");
  container.innerHTML = data.sourceNotes
    .map(
      (source) => `
        <article class="source-item">
          <h3 class="source-title">${source.title}</h3>
          <p class="source-copy">${source.copy}</p>
        </article>
      `,
    )
    .join("");
}

function renderTimeline() {
  const data = getDashboardData();
  const container = $("#timeline");
  container.innerHTML = data.timelineEvents
    .map(
      (event) => `
        <article class="timeline-item">
          <p class="eyebrow">${event.date}</p>
          <h3 class="timeline-title">${event.title}</h3>
          <p class="timeline-copy">${event.copy}</p>
        </article>
      `,
    )
    .join("");
}

function calculateScenario() {
  const buffer = Number($("#buffer-input").value);
  const shock = Number($("#shock-input").value);
  const replacement = Number($("#replacement-input").value);
  const demand = Number($("#demand-input").value);
  const horizon = Number($("#horizon-input").value);

  const netBurn = Math.max(shock - replacement + demand, 0.01);
  const daysToDepletion = buffer / netBurn;
  const depletionDate = new Date(Date.now() + daysToDepletion * 24 * 60 * 60 * 1000);
  const remainingAfterHorizon = Math.max(buffer - netBurn * horizon, 0);
  const percentLeft = (remainingAfterHorizon / buffer) * 100;

  return {
    netBurn,
    daysToDepletion,
    depletionDate,
    remainingAfterHorizon,
    percentLeft,
    horizon,
  };
}

function renderScenario() {
  const data = getDashboardData();
  const result = calculateScenario();
  const container = $("#scenario-results");
  container.innerHTML = `
    <article class="scenario-result">
      <div class="scenario-label">Net burn rate</div>
      <div class="scenario-value">${result.netBurn.toFixed(2)} mb/d</div>
    </article>
    <article class="scenario-result">
      <div class="scenario-label">Estimated depletion date</div>
      <div class="scenario-value">${formatDate.format(result.depletionDate)}</div>
    </article>
    <article class="scenario-result">
      <div class="scenario-label">Buffer left after ${result.horizon} days</div>
      <div class="scenario-value">${result.remainingAfterHorizon.toFixed(0)} mb (${Math.max(result.percentLeft, 0).toFixed(1)}%)</div>
    </article>
  `;
}

function bindScenarioInputs() {
  ["#buffer-input", "#shock-input", "#replacement-input", "#demand-input", "#horizon-input"].forEach((selector) => {
    $(selector).addEventListener("input", renderScenario);
  });
}

function renderAlerts() {
  const data = getDashboardData();
  const container = $("#alerts-list");
  if (!container) {
    return;
  }

  const alerts = data.alerts || [];
  if (alerts.length === 0) {
    container.innerHTML = `
      <article class="alert-item alert-low">
        <h3 class="alert-title">No critical alerts</h3>
        <p class="alert-copy">The current snapshot does not cross any alert thresholds.</p>
      </article>
    `;
    return;
  }

  container.innerHTML = alerts
    .map(
      (alert) => `
        <article class="alert-item alert-${alert.severity || "low"}">
          <div class="alert-badge">${(alert.severity || "low").toUpperCase()}</div>
          <h3 class="alert-title">${alert.title}</h3>
          <p class="alert-copy">${alert.message}</p>
        </article>
      `,
    )
    .join("");
}

function renderMeta() {
  const data = getDashboardData();
  const updatedAt = new Date(data.appMeta.updatedAt);
  $("#last-updated").textContent = `${formatDate.format(updatedAt)} at ${formatTime.format(updatedAt)}`;
  $("#risk-stance").textContent = data.appMeta.riskStance || "Elevated";
  $("#risk-note").textContent = data.appMeta.statusNote || data.appMeta.riskNote || "Oil, rates, and volatility are elevated versus baseline.";
  $("#data-status").textContent = data.appMeta.sourceLabel || "Sample data";
}

function seedScenarioInputs() {
  const data = getDashboardData();
  $("#buffer-input").value = data.scenarioDefaults.buffer;
  $("#shock-input").value = data.scenarioDefaults.shock;
  $("#replacement-input").value = data.scenarioDefaults.replacement;
  $("#demand-input").value = data.scenarioDefaults.demand;
  $("#horizon-input").value = data.scenarioDefaults.horizon;
}

function renderDashboard() {
  renderMeta();
  renderAlerts();
  renderKpis();
  renderTrendChart();
  renderSignalSummary();
  renderWorldMap();
  renderRegionList();
  renderSources();
  renderTimeline();
  renderScenario();
}

async function loadLiveDashboardData() {
  try {
    const response = await fetch("/api/data", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Data request failed with ${response.status}`);
    }

    const payload = await response.json();
    state.dashboardData = mergeDashboardData(payload);
    if (!state.dashboardData.seriesCatalog.some((series) => series.id === state.selectedSeriesId)) {
      state.selectedSeriesId = state.dashboardData.seriesCatalog[0].id;
    }
    renderDashboard();
  } catch {
    state.dashboardData = createFallbackDashboardData();
    renderDashboard();
  }
}

seedScenarioInputs();
bindScenarioInputs();
renderDashboard();
void loadLiveDashboardData();