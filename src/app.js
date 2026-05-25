import {
  appMeta as sampleAppMeta,
  regionExposure as sampleRegionExposure,
  scenarioDefaults as sampleScenarioDefaults,
  seriesCatalog as sampleSeriesCatalog,
  sourceNotes as sampleSourceNotes,
  timelineEvents as sampleTimelineEvents,
} from "./data.js";

function createFallbackDashboardData() {
  const nowIso = new Date().toISOString();
  return {
    appMeta: {
      ...sampleAppMeta,
      updatedAt: nowIso,
      dataAsOf: nowIso,
      lastRefreshAttemptAt: nowIso,
      sourceLabel: "Sample data",
      liveCoverage: 0,
      marketOpen: false,
      refreshCadenceMinutes: 120,
      staleThresholdMinutes: 240,
      snapshotAgeMinutes: 0,
      staleData: false,
      reliabilityNote: "Snapshot age is 0 minutes.",
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

const SERIES_STORAGE_KEY = "war-impact:selected-series";

function readStoredSeriesId() {
  try {
    return window.localStorage.getItem(SERIES_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistSelectedSeriesId(seriesId) {
  try {
    window.localStorage.setItem(SERIES_STORAGE_KEY, seriesId);
  } catch {
    // Ignore storage errors so rendering still works in restricted contexts.
  }
}

const initialStoredSeriesId = readStoredSeriesId();

const state = {
  selectedSeriesId: initialStoredSeriesId || sampleSeriesCatalog[0].id,
  dashboardData: createFallbackDashboardData(),
  ui: {
    isLoading: true,
    isRefreshing: false,
    lastError: "",
  },
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

function setSvgAttrs(element, attributes) {
  Object.entries(attributes).forEach(([name, value]) => {
    element.setAttribute(name, value);
  });
  return element;
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

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function rectanglesOverlap(a, b, padding = 8) {
  return !(
    a.x + a.width + padding <= b.x
    || b.x + b.width + padding <= a.x
    || a.y + a.height + padding <= b.y
    || b.y + b.height + padding <= a.y
  );
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
      persistSelectedSeriesId(series.id);
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

  const cursorLine = createSvgEl("line");
  cursorLine.setAttribute("class", "trend-cursor-line");
  cursorLine.setAttribute("y1", padding.toString());
  cursorLine.setAttribute("y2", (height - padding).toString());
  cursorLine.setAttribute("x1", latestPoint.x.toString());
  cursorLine.setAttribute("x2", latestPoint.x.toString());
  cursorLine.setAttribute("stroke", "rgba(255,255,255,0.25)");
  cursorLine.setAttribute("stroke-width", "1");
  cursorLine.setAttribute("stroke-dasharray", "3 4");
  cursorLine.setAttribute("opacity", "0");
  svg.appendChild(cursorLine);

  const hoverDot = createSvgEl("circle");
  hoverDot.setAttribute("class", "trend-hover-dot");
  hoverDot.setAttribute("r", "7");
  hoverDot.setAttribute("fill", selected.accent);
  hoverDot.setAttribute("stroke", "#06111c");
  hoverDot.setAttribute("stroke-width", "4");
  hoverDot.setAttribute("opacity", "0");
  svg.appendChild(hoverDot);

  const hitArea = createSvgEl("rect");
  hitArea.setAttribute("x", padding.toString());
  hitArea.setAttribute("y", padding.toString());
  hitArea.setAttribute("width", (width - padding * 2).toString());
  hitArea.setAttribute("height", (height - padding * 2).toString());
  hitArea.setAttribute("fill", "transparent");
  hitArea.setAttribute("class", "trend-hit-area");
  svg.appendChild(hitArea);

  const tooltip = document.createElement("div");
  tooltip.className = "trend-tooltip";
  tooltip.hidden = true;

  const observationText = (index) => `Observation ${index + 1}/${points.length}`;

  const showTooltip = (index) => {
    const point = points[index];
    if (!point) {
      return;
    }

    const xPercent = point.x / width;
    const yPercent = point.y / height;
    const xPx = xPercent * container.clientWidth;
    const yPx = yPercent * container.clientHeight;

    cursorLine.setAttribute("x1", point.x.toString());
    cursorLine.setAttribute("x2", point.x.toString());
    cursorLine.setAttribute("opacity", "1");

    hoverDot.setAttribute("cx", point.x.toString());
    hoverDot.setAttribute("cy", point.y.toString());
    hoverDot.setAttribute("opacity", "1");

    tooltip.hidden = false;
    tooltip.innerHTML = `
      <div class="trend-tooltip-title">${selected.label}</div>
      <div class="trend-tooltip-value">${selected.format(point.value)}</div>
      <div class="trend-tooltip-meta">${observationText(index)}</div>
    `;

    const boundedX = clamp(xPx, 24, Math.max(24, container.clientWidth - 24));
    const boundedY = clamp(yPx, 20, Math.max(20, container.clientHeight - 20));
    tooltip.style.left = `${boundedX}px`;
    tooltip.style.top = `${boundedY}px`;
  };

  const hideTooltip = () => {
    cursorLine.setAttribute("opacity", "0");
    hoverDot.setAttribute("opacity", "0");
    tooltip.hidden = true;
  };

  const nearestIndexFromClientX = (clientX) => {
    const rect = svg.getBoundingClientRect();
    const normalizedX = clamp(clientX - rect.left, 0, rect.width);
    const ratio = rect.width > 0 ? normalizedX / rect.width : 0;
    const projectedX = ratio * width;
    const step = (width - padding * 2) / Math.max(points.length - 1, 1);
    return clamp(Math.round((projectedX - padding) / step), 0, points.length - 1);
  };

  hitArea.addEventListener("pointermove", (event) => {
    showTooltip(nearestIndexFromClientX(event.clientX));
  });
  hitArea.addEventListener("pointerleave", hideTooltip);

  points.forEach((point, index) => {
    const target = createSvgEl("circle");
    target.setAttribute("class", "trend-point-target");
    target.setAttribute("cx", point.x.toString());
    target.setAttribute("cy", point.y.toString());
    target.setAttribute("r", "10");
    target.setAttribute("fill", "transparent");
    target.setAttribute("tabindex", "0");
    target.setAttribute("aria-label", `${selected.label} ${selected.format(point.value)} at ${observationText(index)}`);
    target.addEventListener("focus", () => showTooltip(index));
    target.addEventListener("blur", hideTooltip);
    target.addEventListener("mouseenter", () => showTooltip(index));
    target.addEventListener("mouseleave", hideTooltip);
    svg.appendChild(target);
  });

  container.appendChild(svg);
  container.appendChild(tooltip);
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

  const defs = createSvgEl("defs");

  const oceanGradient = createSvgEl("linearGradient");
  setSvgAttrs(oceanGradient, {
    id: "flat-world-ocean",
    x1: "0%",
    y1: "0%",
    x2: "0%",
    y2: "100%",
  });

  const oceanTop = createSvgEl("stop");
  setSvgAttrs(oceanTop, {
    offset: "0%",
    "stop-color": "#10263d",
    "stop-opacity": "1",
  });

  const oceanBottom = createSvgEl("stop");
  setSvgAttrs(oceanBottom, {
    offset: "100%",
    "stop-color": "#07111d",
    "stop-opacity": "1",
  });

  oceanGradient.append(oceanTop, oceanBottom);
  defs.appendChild(oceanGradient);

  const landGlow = createSvgEl("radialGradient");
  setSvgAttrs(landGlow, {
    id: "flat-world-glow",
    cx: "50%",
    cy: "45%",
    r: "60%",
  });

  const glowCenter = createSvgEl("stop");
  setSvgAttrs(glowCenter, {
    offset: "0%",
    "stop-color": "rgba(103, 212, 255, 0.18)",
    "stop-opacity": "1",
  });

  const glowEdge = createSvgEl("stop");
  setSvgAttrs(glowEdge, {
    offset: "100%",
    "stop-color": "rgba(103, 212, 255, 0)",
    "stop-opacity": "1",
  });

  landGlow.append(glowCenter, glowEdge);
  defs.appendChild(landGlow);
  svg.appendChild(defs);

  const frame = createSvgEl("rect");
  setSvgAttrs(frame, {
    x: "18",
    y: "18",
    width: "964",
    height: "484",
    rx: "32",
    fill: "url(#flat-world-ocean)",
    stroke: "rgba(255,255,255,0.08)",
  });
  svg.appendChild(frame);

  const glow = createSvgEl("ellipse");
  setSvgAttrs(glow, {
    cx: "520",
    cy: "250",
    rx: "340",
    ry: "190",
    fill: "url(#flat-world-glow)",
    opacity: "0.65",
  });
  svg.appendChild(glow);

  const graticule = createSvgEl("g");
  graticule.setAttribute("opacity", "0.9");

  [120, 240, 360, 480, 600, 720, 840].forEach((x) => {
    const line = createSvgEl("line");
    setSvgAttrs(line, {
      x1: String(x),
      y1: "72",
      x2: String(x),
      y2: "448",
      stroke: "rgba(255,255,255,0.045)",
      "stroke-width": "1",
    });
    graticule.appendChild(line);
  });

  [108, 190, 272, 354, 436].forEach((y) => {
    const line = createSvgEl("line");
    setSvgAttrs(line, {
      x1: "92",
      y1: String(y),
      x2: "908",
      y2: String(y),
      stroke: "rgba(255,255,255,0.045)",
      "stroke-width": "1",
    });
    graticule.appendChild(line);
  });

  const equator = createSvgEl("line");
  setSvgAttrs(equator, {
    x1: "92",
    y1: "272",
    x2: "908",
    y2: "272",
    stroke: "rgba(103, 212, 255, 0.12)",
    "stroke-width": "1.5",
  });
  graticule.appendChild(equator);

  svg.appendChild(graticule);

  const continents = [
    {
      d: "M78 132 L104 108 L143 92 L188 88 L230 100 L262 122 L284 150 L290 176 L278 196 L256 205 L226 198 L204 204 L178 215 L151 210 L130 196 L112 175 L94 158 L82 145 Z",
      opacity: "0.11",
    },
    {
      d: "M252 78 L276 68 L298 74 L292 92 L270 98 L250 90 Z",
      opacity: "0.08",
    },
    {
      d: "M242 244 L274 254 L292 280 L290 310 L278 344 L262 374 L246 386 L236 358 L240 326 L234 298 L228 270 Z",
      opacity: "0.11",
    },
    {
      d: "M466 124 L500 114 L540 120 L560 138 L552 156 L526 162 L500 156 L486 144 Z",
      opacity: "0.09",
    },
    {
      d: "M502 172 L540 180 L563 208 L561 246 L552 286 L535 326 L516 342 L498 320 L490 282 L494 240 L488 198 Z",
      opacity: "0.12",
    },
    {
      d: "M570 120 L622 108 L680 110 L740 124 L794 144 L836 164 L862 186 L854 208 L818 220 L778 214 L742 224 L706 218 L676 230 L640 222 L620 198 L600 186 L578 172 L558 154 Z",
      opacity: "0.10",
    },
    {
      d: "M700 212 L724 218 L740 242 L728 258 L704 248 L694 228 Z",
      opacity: "0.08",
    },
    {
      d: "M774 316 L804 304 L836 308 L852 324 L846 346 L822 356 L796 352 L780 336 Z",
      opacity: "0.09",
    },
    {
      d: "M594 188 L618 182 L640 192 L634 206 L612 210 L596 202 Z",
      opacity: "0.08",
    },
  ];

  continents.forEach((continent) => {
    const land = createSvgEl("path");
    setSvgAttrs(land, {
      d: continent.d,
      fill: "rgba(191, 220, 208, 0.12)",
      "fill-opacity": continent.opacity,
      stroke: "rgba(220, 236, 255, 0.14)",
      "stroke-width": "1.2",
      "stroke-linejoin": "round",
    });
    svg.appendChild(land);
  });

  const border = createSvgEl("rect");
  setSvgAttrs(border, {
    x: "18",
    y: "18",
    width: "964",
    height: "484",
    rx: "32",
    fill: "none",
    stroke: "rgba(255,255,255,0.05)",
  });
  svg.appendChild(border);

  const mapBounds = {
    left: 34,
    top: 34,
    right: 966,
    bottom: 486,
  };

  const placedBoxes = [];
  const layoutByRegionName = new Map();
  const orderedForPlacement = [...data.regionExposure].sort((left, right) => right.score - left.score);

  orderedForPlacement.forEach((region) => {
    const radius = 18 + region.score / 7;
    const labelWidth = Math.max(150, region.name.length * 10.5 + 40);
    const labelHeight = 44;
    const candidates = [
      { x: region.x - labelWidth / 2, y: region.y - radius - labelHeight - 16 },
      { x: region.x + radius + 10, y: region.y - labelHeight / 2 },
      { x: region.x - labelWidth - radius - 10, y: region.y - labelHeight / 2 },
      { x: region.x - labelWidth / 2, y: region.y + radius + 12 },
      { x: region.x + 16, y: region.y - radius - labelHeight - 20 },
      { x: region.x - labelWidth - 16, y: region.y - radius - labelHeight - 20 },
    ];

    let selectedRect = null;
    for (const candidate of candidates) {
      const rect = {
        x: clamp(candidate.x, mapBounds.left, mapBounds.right - labelWidth),
        y: clamp(candidate.y, mapBounds.top, mapBounds.bottom - labelHeight),
        width: labelWidth,
        height: labelHeight,
      };

      const hasCollision = placedBoxes.some((placed) => rectanglesOverlap(rect, placed));
      if (!hasCollision) {
        selectedRect = rect;
        break;
      }
    }

    if (!selectedRect) {
      const fallback = candidates[0];
      selectedRect = {
        x: clamp(fallback.x, mapBounds.left, mapBounds.right - labelWidth),
        y: clamp(fallback.y, mapBounds.top, mapBounds.bottom - labelHeight),
        width: labelWidth,
        height: labelHeight,
      };
    }

    layoutByRegionName.set(region.name, {
      radius,
      labelX: selectedRect.x,
      labelY: selectedRect.y,
      labelWidth,
      labelHeight,
    });
    placedBoxes.push(selectedRect);
  });

  data.regionExposure.forEach((region) => {
    const layout = layoutByRegionName.get(region.name);
    const group = createSvgEl("g");
    group.setAttribute("class", "map-region");
    group.setAttribute("tabindex", "0");
    group.setAttribute("role", "group");

    const radius = layout?.radius ?? 24;
    const labelWidth = layout?.labelWidth ?? 160;
    const labelHeight = layout?.labelHeight ?? 44;
    const labelX = layout?.labelX ?? clamp(region.x - labelWidth / 2, mapBounds.left, mapBounds.right - labelWidth);
    const labelY = layout?.labelY ?? clamp(region.y - radius - labelHeight - 14, mapBounds.top, mapBounds.bottom - labelHeight);

    const labelCenterX = labelX + labelWidth / 2;
    const labelCenterY = labelY + labelHeight / 2;
    let connectorStartX = labelCenterX;
    let connectorStartY = labelY + labelHeight;

    if (region.y < labelY) {
      connectorStartY = labelY;
    }
    if (region.x < labelX) {
      connectorStartX = labelX;
      connectorStartY = labelCenterY;
    } else if (region.x > labelX + labelWidth) {
      connectorStartX = labelX + labelWidth;
      connectorStartY = labelCenterY;
    }

    const title = createSvgEl("title");
    title.textContent = `${region.name}: ${region.score}/100 stress`;

    const description = createSvgEl("desc");
    description.textContent = region.impact;

    const connector = createSvgEl("line");
    connector.setAttribute("class", "map-connector");
    connector.setAttribute("x1", connectorStartX.toString());
    connector.setAttribute("x2", region.x.toString());
    connector.setAttribute("y1", connectorStartY.toString());
    connector.setAttribute("y2", region.y.toString());
    connector.setAttribute("stroke", region.color);
    connector.setAttribute("stroke-opacity", "0.35");
    connector.setAttribute("stroke-width", "1.5");

    const bubble = createSvgEl("circle");
    bubble.setAttribute("class", "map-bubble");
    bubble.setAttribute("cx", region.x.toString());
    bubble.setAttribute("cy", region.y.toString());
    bubble.setAttribute("r", radius.toString());
    bubble.setAttribute("fill", region.color);
    bubble.setAttribute("fill-opacity", "0.3");
    bubble.setAttribute("stroke", region.color);
    bubble.setAttribute("stroke-width", "2");

    const pulse = createSvgEl("circle");
  pulse.setAttribute("class", "map-pulse");
    pulse.setAttribute("cx", region.x.toString());
    pulse.setAttribute("cy", region.y.toString());
    pulse.setAttribute("r", (radius + 10).toString());
    pulse.setAttribute("fill", "none");
    pulse.setAttribute("stroke", region.color);
    pulse.setAttribute("stroke-opacity", "0.15");
    pulse.setAttribute("stroke-width", "6");

    const labelBox = createSvgEl("rect");
  labelBox.setAttribute("class", "map-label-box");
    labelBox.setAttribute("x", labelX.toString());
    labelBox.setAttribute("y", labelY.toString());
    labelBox.setAttribute("width", labelWidth.toString());
    labelBox.setAttribute("height", labelHeight.toString());
    labelBox.setAttribute("rx", "12");
    labelBox.setAttribute("fill", "rgba(6, 15, 25, 0.78)");
    labelBox.setAttribute("stroke", `${region.color}88`);
    labelBox.setAttribute("stroke-width", "1.2");

    const label = createSvgEl("text");
  label.setAttribute("class", "map-label-title");
    label.setAttribute("x", region.x.toString());
    label.setAttribute("y", (labelY + 19).toString());
    label.setAttribute("fill", "#edf4ff");
    label.setAttribute("font-size", "17");
    label.setAttribute("font-weight", "700");
    label.setAttribute("text-anchor", "middle");
    label.textContent = region.name;

    const sub = createSvgEl("text");
  sub.setAttribute("class", "map-label-subtitle");
    sub.setAttribute("x", region.x.toString());
    sub.setAttribute("y", (labelY + 35).toString());
    sub.setAttribute("fill", "#9bb0d3");
    sub.setAttribute("font-size", "12");
    sub.setAttribute("text-anchor", "middle");
    sub.textContent = `${region.score}/100 stress`;

    const activate = () => group.classList.add("active");
    const deactivate = () => group.classList.remove("active");
    group.addEventListener("mouseenter", activate);
    group.addEventListener("mouseleave", deactivate);
    group.addEventListener("focus", activate);
    group.addEventListener("blur", deactivate);

    group.append(title, description, connector, pulse, bubble, labelBox, label, sub);
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
  const dataStatus = $("#data-status");
  const dashboardState = $("#dashboard-state");
  const refreshButton = $("#refresh-data");
  const updatedAt = new Date(data.appMeta.dataAsOf || data.appMeta.updatedAt);
  $("#last-updated").textContent = `${formatDate.format(updatedAt)} at ${formatTime.format(updatedAt)}`;
  $("#risk-stance").textContent = data.appMeta.riskStance || "Elevated";
  $("#risk-note").textContent = data.appMeta.statusNote || data.appMeta.riskNote || "Oil, rates, and volatility are elevated versus baseline.";

  const snapshotAgeMinutes = Number(data.appMeta.snapshotAgeMinutes || 0);
  const staleThresholdMinutes = Number(data.appMeta.staleThresholdMinutes || 0);
  const staleData = Boolean(data.appMeta.staleData);
  const reliabilityNote = data.appMeta.reliabilityNote || "";
  const refreshError = data.appMeta.refreshError || "";

  dataStatus.classList.remove("pill-live", "pill-warning", "pill-error");
  if (state.ui.lastError) {
    dataStatus.classList.add("pill-error");
    dataStatus.textContent = "Fallback snapshot in use";
    dashboardState.textContent = state.ui.lastError;
    dashboardState.dataset.state = "error";
  } else if (state.ui.isLoading) {
    dataStatus.classList.add("pill-warning");
    dataStatus.textContent = "Loading live data";
    dashboardState.textContent = "Fetching latest snapshot from the backend...";
    dashboardState.dataset.state = "loading";
  } else if (state.ui.isRefreshing) {
    dataStatus.classList.add("pill-warning");
    dataStatus.textContent = "Refreshing snapshot";
    dashboardState.textContent = "Refresh in progress. Values will update when the request completes.";
    dashboardState.dataset.state = "loading";
  } else if (staleData) {
    dataStatus.classList.add("pill-warning");
    dataStatus.textContent = "Snapshot may be stale";
    dashboardState.textContent = `${reliabilityNote} Last refresh did not produce fresh data.`;
    dashboardState.dataset.state = "warning";
  } else if (refreshError) {
    dataStatus.classList.add("pill-warning");
    dataStatus.textContent = data.appMeta.sourceLabel || "Cached snapshot";
    dashboardState.textContent = `Last refresh warning: ${refreshError}. ${reliabilityNote}`;
    dashboardState.dataset.state = "warning";
  } else {
    dataStatus.classList.add("pill-live");
    dataStatus.textContent = data.appMeta.sourceLabel || "Sample data";
    dashboardState.textContent = `${data.appMeta.statusNote || "Latest available snapshot is active."} ${snapshotAgeMinutes >= 0 ? `Age: ${snapshotAgeMinutes}m${staleThresholdMinutes ? ` (stale at ${staleThresholdMinutes}m)` : ""}.` : ""}`.trim();
    dashboardState.dataset.state = "ready";
  }

  const isBusy = state.ui.isLoading || state.ui.isRefreshing;
  refreshButton.disabled = isBusy;
  refreshButton.setAttribute("aria-busy", isBusy ? "true" : "false");
  refreshButton.textContent = state.ui.isRefreshing ? "Refreshing..." : "Refresh now";
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
    state.ui.lastError = "";
    state.ui.isLoading = false;
    if (!state.dashboardData.seriesCatalog.some((series) => series.id === state.selectedSeriesId)) {
      state.selectedSeriesId = state.dashboardData.seriesCatalog[0].id;
      persistSelectedSeriesId(state.selectedSeriesId);
    }
    renderDashboard();
  } catch {
    state.dashboardData = createFallbackDashboardData();
    state.ui.isLoading = false;
    state.ui.lastError = "Live fetch failed. Showing fallback data so the dashboard remains usable.";
    if (!state.dashboardData.seriesCatalog.some((series) => series.id === state.selectedSeriesId)) {
      state.selectedSeriesId = state.dashboardData.seriesCatalog[0].id;
      persistSelectedSeriesId(state.selectedSeriesId);
    }
    renderDashboard();
  }
}

async function refreshDashboardData() {
  if (state.ui.isLoading || state.ui.isRefreshing) {
    return;
  }

  state.ui.isRefreshing = true;
  renderMeta();
  try {
    const response = await fetch("/api/refresh", { method: "POST" });
    if (!response.ok) {
      throw new Error(`Refresh request failed with ${response.status}`);
    }

    const payload = await response.json();
    state.dashboardData = mergeDashboardData(payload);
    state.ui.lastError = "";
    if (!state.dashboardData.seriesCatalog.some((series) => series.id === state.selectedSeriesId)) {
      state.selectedSeriesId = state.dashboardData.seriesCatalog[0].id;
      persistSelectedSeriesId(state.selectedSeriesId);
    }
    renderDashboard();
  } catch {
    state.ui.lastError = "Manual refresh failed. The dashboard is still showing the most recent snapshot.";
    renderMeta();
  } finally {
    state.ui.isRefreshing = false;
    renderMeta();
  }
}

function bindRefreshButton() {
  const refreshButton = $("#refresh-data");
  refreshButton.addEventListener("click", () => {
    void refreshDashboardData();
  });
}

seedScenarioInputs();
bindScenarioInputs();
bindRefreshButton();
renderDashboard();
void loadLiveDashboardData();