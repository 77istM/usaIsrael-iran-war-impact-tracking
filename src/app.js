import {
  appMeta,
  getLatestPoints,
  regionExposure,
  scenarioDefaults,
  seriesCatalog,
  sourceNotes,
  timelineEvents,
} from "./data.js";

const state = {
  selectedSeriesId: seriesCatalog[0].id,
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
  const kpiGrid = $("#kpi-grid");
  kpiGrid.innerHTML = "";

  getLatestPoints().forEach((series) => {
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
  const selected = seriesCatalog.find((series) => series.id === state.selectedSeriesId) ?? seriesCatalog[0];
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
  const selected = getLatestPoints().find((series) => series.id === state.selectedSeriesId) ?? getLatestPoints()[0];
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

  regionExposure.forEach((region) => {
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
  const container = $("#region-list");
  container.innerHTML = regionExposure
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
  const container = $("#source-list");
  container.innerHTML = sourceNotes
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
  const container = $("#timeline");
  container.innerHTML = timelineEvents
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

function renderMeta() {
  $("#last-updated").textContent = `${formatDate.format(appMeta.updatedAt)} at ${formatTime.format(appMeta.updatedAt)}`;
  $("#risk-stance").textContent = appMeta.riskStance;
  $("#risk-note").textContent = appMeta.riskNote;
}

function seedScenarioInputs() {
  $("#buffer-input").value = scenarioDefaults.buffer;
  $("#shock-input").value = scenarioDefaults.shock;
  $("#replacement-input").value = scenarioDefaults.replacement;
  $("#demand-input").value = scenarioDefaults.demand;
  $("#horizon-input").value = scenarioDefaults.horizon;
}

function renderDashboard() {
  renderMeta();
  renderKpis();
  renderTrendChart();
  renderSignalSummary();
  renderWorldMap();
  renderRegionList();
  renderSources();
  renderTimeline();
  renderScenario();
}

seedScenarioInputs();
bindScenarioInputs();
renderDashboard();