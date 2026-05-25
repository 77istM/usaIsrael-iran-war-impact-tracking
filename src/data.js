const now = new Date();

function buildSeries(start, volatility, trend, points = 30) {
  return Array.from({ length: points }, (_, index) => {
    const wobble = Math.sin(index / 3.2) * volatility + Math.cos(index / 5.1) * volatility * 0.55;
    const ramp = (index / Math.max(points - 1, 1)) * trend;
    return Number((start + wobble + ramp).toFixed(2));
  });
}

function latestChange(values) {
  const previous = values[values.length - 2];
  const current = values[values.length - 1];
  const delta = current - previous;
  return {
    current,
    delta,
    percent: previous === 0 ? 0 : (delta / previous) * 100,
  };
}

const vix = buildSeries(18.2, 1.8, 8.4);
const treasury2y = buildSeries(4.1, 0.12, -0.35);
const treasury10y = buildSeries(4.36, 0.1, -0.18);
const wti = buildSeries(78.5, 3.2, 19.5);
const brent = buildSeries(82.4, 3.8, 21.8);
const sp500 = buildSeries(4775, 24, -215);
const nasdaq = buildSeries(16150, 90, -610);
const dxy = buildSeries(103.6, 0.65, 2.3);
const gold = buildSeries(2335, 14, 145);

export const seriesCatalog = [
  {
    id: "vix",
    label: "VIX",
    unit: "index",
    color: "#67d4ff",
    accent: "#a4edff",
    description: "Equity volatility and risk aversion",
    values: vix,
    format: (value) => value.toFixed(1),
  },
  {
    id: "treasury-2y",
    label: "US 2Y Treasury",
    unit: "%",
    color: "#98f0c7",
    accent: "#c5ffe0",
    description: "Front-end rate reaction to growth and inflation stress",
    values: treasury2y,
    format: (value) => `${value.toFixed(2)}%`,
  },
  {
    id: "treasury-10y",
    label: "US 10Y Treasury",
    unit: "%",
    color: "#8fb3ff",
    accent: "#c4d6ff",
    description: "Long-end yield and macro confidence",
    values: treasury10y,
    format: (value) => `${value.toFixed(2)}%`,
  },
  {
    id: "wti",
    label: "WTI Crude",
    unit: "$",
    color: "#ffbc6b",
    accent: "#ffd89a",
    description: "Energy shock transmission",
    values: wti,
    format: (value) => `$${value.toFixed(2)}`,
  },
  {
    id: "brent",
    label: "Brent Crude",
    unit: "$",
    color: "#ff7a8f",
    accent: "#ffb0bc",
    description: "Global oil benchmark pressure",
    values: brent,
    format: (value) => `$${value.toFixed(2)}`,
  },
  {
    id: "sp500",
    label: "S&P 500",
    unit: "pts",
    color: "#67d4ff",
    accent: "#a8ecff",
    description: "US growth and earnings sentiment",
    values: sp500,
    format: (value) => value.toLocaleString(undefined, { maximumFractionDigits: 0 }),
  },
  {
    id: "nasdaq",
    label: "Nasdaq 100",
    unit: "pts",
    color: "#b394ff",
    accent: "#dbc8ff",
    description: "Duration-sensitive risk assets",
    values: nasdaq,
    format: (value) => value.toLocaleString(undefined, { maximumFractionDigits: 0 }),
  },
  {
    id: "dxy",
    label: "Dollar Index",
    unit: "index",
    color: "#b7f7a8",
    accent: "#d9ffd1",
    description: "Safe-haven FX flow",
    values: dxy,
    format: (value) => value.toFixed(2),
  },
  {
    id: "gold",
    label: "Gold",
    unit: "$",
    color: "#f7d86b",
    accent: "#ffeeb1",
    description: "Stress hedge and inflation shield",
    values: gold,
    format: (value) => `$${value.toFixed(0)}`,
  },
];

export const regionExposure = [
  {
    name: "Middle East",
    score: 96,
    impact: "Highest exposure to shipping risk, energy infrastructure, and insurance costs.",
    color: "#ff7a8f",
    x: 610,
    y: 200,
  },
  {
    name: "Europe",
    score: 74,
    impact: "Energy-import stress, industrial margin compression, and higher sovereign risk premiums.",
    color: "#ffbc6b",
    x: 525,
    y: 145,
  },
  {
    name: "Asia",
    score: 81,
    impact: "Oil import dependency, shipping rerouting, and FX pressure in import-heavy economies.",
    color: "#67d4ff",
    x: 770,
    y: 175,
  },
  {
    name: "North America",
    score: 52,
    impact: "Market volatility and inflation expectations, but stronger insulation from supply disruptions.",
    color: "#98f0c7",
    x: 180,
    y: 160,
  },
  {
    name: "Africa",
    score: 68,
    impact: "Import-cost shock for energy and food, with localized subsidy pressure.",
    color: "#b394ff",
    x: 560,
    y: 305,
  },
  {
    name: "South America",
    score: 45,
    impact: "Commodity upside for exporters offsets global risk-off and capital outflow risk.",
    color: "#8fb3ff",
    x: 255,
    y: 350,
  },
];

export const timelineEvents = [
  {
    date: "2026-02-28",
    title: "War begins",
    copy: "Conflict starts and the first wave of market repricing pushes volatility and crude higher.",
  },
  {
    date: "2026-03-05",
    title: "Shipping risk expands",
    copy: "Insurance and rerouting costs rise as traders price in Gulf transit disruption.",
  },
  {
    date: "2026-03-14",
    title: "Treasury rally",
    copy: "Growth fears and safe-haven buying pull down the long-end yield as the curve shifts.",
  },
  {
    date: "2026-04-02",
    title: "Energy inflation spreads",
    copy: "Fuel costs begin to transmit into consumer prices, industrial input costs, and shipping margins.",
  },
];

export const sourceNotes = [
  {
    title: "FRED",
    copy: "Best free source for VIX, Treasury yields, S&P 500, dollar index proxies, and several oil series. Connect through the observations endpoint and cache responses locally.",
  },
  {
    title: "EIA",
    copy: "Use for reserve, inventory, and petroleum production series when you need oil-balance context.",
  },
  {
    title: "Market-data fallback",
    copy: "Use a second free market feed for equity and commodity backups, then normalize all values into one time-series schema.",
  },
  {
    title: "MCP or ADK",
    copy: "Have your agent or tool output normalized JSON and point the dashboard at that endpoint or file. Keep the UI unaware of the upstream provider.",
  },
];

export const scenarioDefaults = {
  buffer: 2800,
  shock: 2.4,
  replacement: 1.1,
  demand: 0.45,
  horizon: 180,
};

export const appMeta = {
  updatedAt: now,
  riskStance: "Elevated",
  riskNote: "Oil, rates, and volatility are all elevated versus baseline.",
};

export function getLatestPoints() {
  return seriesCatalog.map((series) => ({
    ...series,
    latest: latestChange(series.values),
  }));
}