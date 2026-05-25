import http from "http";
import { existsSync, readFileSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import {
  appMeta as sampleAppMeta,
  regionExposure,
  scenarioDefaults,
  seriesCatalog as sampleSeriesCatalog,
  sourceNotes,
  timelineEvents,
} from "./src/data.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

loadDotEnv(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT || 3000);
const FRED_API_KEY = process.env.FRED_API_KEY || "";
const EIA_API_KEY = process.env.EIA_API_KEY || "";
const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 8000);
const CACHE_DIR = path.join(__dirname, ".cache");
const CACHE_FILE = path.join(CACHE_DIR, "dashboard-data.json");
const sampleSeriesById = new Map(sampleSeriesCatalog.map((series) => [series.id, series]));

const liveSeriesSources = [
  { id: "vix", provider: "fred", seriesIds: ["VIXCLS"] },
  { id: "treasury-2y", provider: "fred", seriesIds: ["DGS2"] },
  { id: "treasury-10y", provider: "fred", seriesIds: ["DGS10"] },
  { id: "wti", provider: "fred", seriesIds: ["DCOILWTICO"] },
  { id: "brent", provider: "fred", seriesIds: ["DCOILBRENTEU"] },
  { id: "sp500", provider: "fred", seriesIds: ["SP500"] },
  { id: "nasdaq", provider: "fred", seriesIds: ["NASDAQ100", "NASDAQCOM"] },
  { id: "dxy", provider: "fred", seriesIds: ["DTWEXBGS"] },
  { id: "gold", provider: "fred", seriesIds: ["GOLDAMGBD228NLBM"] },
  { id: "eia-crude-stocks", provider: "eia", seriesIds: ["PET.WCESTUS1.W"] },
];

let currentSnapshot = buildSampleSnapshot("Cache not initialized yet.");

await ensureCacheDirectory();
currentSnapshot = (await readCachedSnapshot()) ?? currentSnapshot;
await refreshSnapshot(true);
scheduleNextRefresh();

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (requestUrl.pathname === "/api/data" && request.method === "GET") {
    respondJson(response, 200, currentSnapshot);
    return;
  }

  if (requestUrl.pathname === "/api/alerts" && request.method === "GET") {
    respondJson(response, 200, {
      updatedAt: currentSnapshot.appMeta.updatedAt,
      alerts: currentSnapshot.alerts,
    });
    return;
  }

  if (requestUrl.pathname === "/api/refresh" && (request.method === "GET" || request.method === "POST")) {
    const snapshot = await refreshSnapshot(true);
    respondJson(response, 200, snapshot);
    return;
  }

  await serveStaticAsset(requestUrl.pathname, response);
});

server.listen(PORT, () => {
  console.log(`War Impact Tracker server running at http://localhost:${PORT}`);
});

function loadDotEnv(envPath) {
  if (!existsSync(envPath)) {
    return;
  }

  const content = readFileSync(envPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

async function ensureCacheDirectory() {
  await mkdir(CACHE_DIR, { recursive: true });
}

async function readCachedSnapshot() {
  try {
    const text = await readFile(CACHE_FILE, "utf8");
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function writeCachedSnapshot(snapshot) {
  await writeFile(CACHE_FILE, JSON.stringify(snapshot, null, 2), "utf8");
}

function buildSampleSnapshot(note) {
  const nowIso = new Date().toISOString();
  const sampleSeries = sampleSeriesCatalog.map((series) => ({
    ...series,
    source: "sample",
    sourceSeriesId: null,
  }));

  const alerts = buildAlerts(sampleSeries, true);

  return {
    appMeta: {
      ...sampleAppMeta,
      updatedAt: nowIso,
      sourceLabel: "Sample cache",
      liveCoverage: 0,
      marketOpen: isUSMarketOpen(new Date()),
      refreshCadenceMinutes: isUSMarketOpen(new Date()) ? 15 : 120,
      statusNote: note,
    },
    seriesCatalog: sampleSeries,
    regionExposure,
    timelineEvents,
    sourceNotes,
    scenarioDefaults,
    alerts,
    cache: {
      generatedAt: nowIso,
      liveCoverage: 0,
      note,
    },
  };
}

function withReliabilityMeta(snapshot, { attemptedAt, refreshError = "" } = {}) {
  const referenceIso = snapshot?.cache?.generatedAt || snapshot?.appMeta?.updatedAt || new Date().toISOString();
  const refreshCadenceMinutes = Number(snapshot?.appMeta?.refreshCadenceMinutes) || 120;
  const staleThresholdMinutes = Math.max(refreshCadenceMinutes * 2, refreshCadenceMinutes + 10);
  const ageMinutes = Math.max(0, Math.round((Date.now() - new Date(referenceIso).getTime()) / 60000));
  const isStale = ageMinutes >= staleThresholdMinutes;

  const reliabilityNote = isStale
    ? `Snapshot is ${ageMinutes} minutes old (stale threshold ${staleThresholdMinutes} minutes).`
    : `Snapshot age is ${ageMinutes} minutes.`;

  return {
    ...snapshot,
    appMeta: {
      ...snapshot.appMeta,
      updatedAt: referenceIso,
      dataAsOf: referenceIso,
      lastRefreshAttemptAt: attemptedAt || new Date().toISOString(),
      staleThresholdMinutes,
      snapshotAgeMinutes: ageMinutes,
      staleData: isStale,
      reliabilityNote,
      refreshError: refreshError || snapshot.appMeta?.refreshError || "",
    },
    cache: {
      ...(snapshot.cache || {}),
      generatedAt: snapshot?.cache?.generatedAt || referenceIso,
      staleData: isStale,
      snapshotAgeMinutes: ageMinutes,
      staleThresholdMinutes,
    },
  };
}

async function refreshSnapshot(force = false) {
  if (!force && currentSnapshot && currentSnapshot.appMeta?.sourceLabel?.startsWith("Live")) {
    return currentSnapshot;
  }

  const attemptedAt = new Date().toISOString();
  try {
    const liveResults = [];
    for (const source of liveSeriesSources) {
      liveResults.push(await resolveSeriesSource(source));
    }

    const liveCoverage = liveResults.filter((item) => item.source !== "sample").length;
    const mergedSeries = sampleSeriesCatalog.map((series) => {
      const match = liveResults.find((item) => item.id === series.id);
      return {
        ...series,
        ...(match ?? {}),
        values: (match?.values?.length ? match.values : series.values).slice(-45),
        source: match?.source ?? "sample",
        sourceSeriesId: match?.sourceSeriesId ?? null,
      };
    });

    const generatedAt = new Date().toISOString();
    currentSnapshot = withReliabilityMeta({
      appMeta: {
        ...sampleAppMeta,
        updatedAt: generatedAt,
        sourceLabel: liveCoverage > 0 ? "Live FRED/EIA snapshot" : "Cached sample snapshot",
        liveCoverage,
        marketOpen: isUSMarketOpen(new Date()),
        refreshCadenceMinutes: isUSMarketOpen(new Date()) ? 15 : 120,
        statusNote: liveCoverage > 0 ? `${liveCoverage} live series refreshed successfully.` : "Using cached sample values because the upstream feeds were not available.",
      },
      seriesCatalog: mergedSeries,
      regionExposure,
      timelineEvents,
      sourceNotes,
      scenarioDefaults,
      alerts: buildAlerts(mergedSeries, liveCoverage === 0),
      cache: {
        generatedAt,
        liveCoverage,
        marketOpen: isUSMarketOpen(new Date()),
      },
    }, { attemptedAt });

    await writeCachedSnapshot(currentSnapshot);
    return currentSnapshot;
  } catch (error) {
    const cachedSnapshot = (await readCachedSnapshot()) ?? currentSnapshot ?? buildSampleSnapshot(String(error?.message || "Unknown error"));
    const refreshError = String(error?.message || error);
    cachedSnapshot.appMeta = {
      ...cachedSnapshot.appMeta,
      sourceLabel: cachedSnapshot.appMeta?.sourceLabel || "Cached sample snapshot",
      statusNote: `Refresh failed: ${refreshError}`,
      refreshError,
    };
    cachedSnapshot.alerts = [
      {
        severity: "high",
        title: "Live refresh failed",
        message: `The backend could not refresh live market data: ${refreshError}. The dashboard is serving the most recent cache or sample fallback.`,
      },
      ...(cachedSnapshot.alerts || []),
    ];
    currentSnapshot = withReliabilityMeta(cachedSnapshot, { attemptedAt, refreshError });
    return currentSnapshot;
  }
}

async function fetchWithTimeout(url, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function resolveSeriesSource(source) {
  const sample = sampleSeriesById.get(source.id);

  for (const seriesId of source.seriesIds) {
    try {
      if (source.provider === "fred" && FRED_API_KEY) {
        const values = await fetchFredSeries(seriesId);
        if (values.length > 0) {
          return createSeriesSnapshot(sample, values, "FRED", seriesId);
        }
      }

      if (source.provider === "eia" && EIA_API_KEY) {
        const values = await fetchEiaSeries(seriesId);
        if (values.length > 0) {
          return createSeriesSnapshot(sample, values, "EIA", seriesId);
        }
      }
    } catch {
      // Try the next source or fall back to cache/sample.
    }
  }

  return createSeriesSnapshot(sample, sample?.values || [], "sample", null);
}

function createSeriesSnapshot(sample, values, source, sourceSeriesId) {
  return {
    id: sample?.id || sourceSeriesId,
    label: sample?.label || sourceSeriesId,
    unit: sample?.unit || "",
    color: sample?.color || "#67d4ff",
    accent: sample?.accent || "#a4edff",
    description: sample?.description || "Live series",
    values: values.slice(-45),
    source,
    sourceSeriesId,
  };
}

async function fetchFredSeries(seriesId) {
  const url = new URL("https://api.stlouisfed.org/fred/series/observations");
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("api_key", FRED_API_KEY);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("sort_order", "asc");
  url.searchParams.set("limit", "45");

  const response = await fetchWithTimeout(url);
  const payload = await response.json();

  if (!response.ok || payload?.error_code) {
    throw new Error(payload?.error_message || `FRED series ${seriesId} request failed`);
  }

  return (payload.observations || [])
    .map((observation) => Number(observation.value))
    .filter((value) => Number.isFinite(value));
}

async function fetchEiaSeries(seriesId) {
  const url = new URL("https://api.eia.gov/series/");
  url.searchParams.set("api_key", EIA_API_KEY);
  url.searchParams.set("series_id", seriesId);

  const response = await fetchWithTimeout(url);
  const payload = await response.json();

  if (!response.ok || payload?.error) {
    throw new Error(payload?.error || `EIA series ${seriesId} request failed`);
  }

  const data = payload?.series?.[0]?.data || [];
  return data
    .slice()
    .reverse()
    .map((point) => Number(point[1]))
    .filter((value) => Number.isFinite(value));
}

function buildAlerts(seriesCatalog, isFallback) {
  const latestById = new Map(seriesCatalog.map((series) => [series.id, getLatest(series.values)]));
  const alerts = [];

  if (isFallback) {
    alerts.push({
      severity: "medium",
      title: "Serving cached fallback data",
      message: "One or more upstream feeds were unavailable, so the dashboard is using the latest cache or sample snapshot.",
    });
  }

  const vix = latestById.get("vix");
  if (vix?.current >= 25) {
    alerts.push({
      severity: "high",
      title: "Volatility elevated",
      message: `VIX is at ${formatNumber(vix.current, 1)}, which keeps the market stress regime in risk-off territory.`,
    });
  }

  const wti = latestById.get("wti");
  const brent = latestById.get("brent");
  if ((wti?.current ?? 0) >= 90 || (brent?.current ?? 0) >= 95) {
    alerts.push({
      severity: "high",
      title: "Oil shock risk is elevated",
      message: `WTI is ${wti ? formatNumber(wti.current, 2) : "n/a"} and Brent is ${brent ? formatNumber(brent.current, 2) : "n/a"}. Supply risk remains a key transmission channel.`,
    });
  }

  const treasury2y = latestById.get("treasury-2y");
  const treasury10y = latestById.get("treasury-10y");
  if ((treasury2y?.current ?? 0) > (treasury10y?.current ?? 0)) {
    alerts.push({
      severity: "medium",
      title: "Yield curve inversion still present",
      message: `The 2Y yield is ${formatNumber(treasury2y.current, 2)}% versus ${formatNumber(treasury10y.current, 2)}% on the 10Y, which signals growth caution.`,
    });
  }

  const crudeStocks = latestById.get("eia-crude-stocks");
  if (crudeStocks?.change <= -2) {
    alerts.push({
      severity: "medium",
      title: "EIA crude stocks are drawing down",
      message: `Weekly crude stocks fell by ${formatNumber(Math.abs(crudeStocks.change), 1)} mb, suggesting tighter supply or stronger draws.`,
    });
  }

  const gold = latestById.get("gold");
  if (gold?.change > 0) {
    alerts.push({
      severity: "low",
      title: "Safe-haven demand remains bid",
      message: `Gold is up ${formatNumber(gold.change, 0)}, showing persistent demand for defensive positioning.`,
    });
  }

  return alerts.slice(0, 5);
}

function getLatest(values) {
  const current = values?.[values.length - 1];
  const previous = values?.[values.length - 2] ?? current;
  const change = Number.isFinite(current) && Number.isFinite(previous) ? current - previous : 0;
  return {
    current,
    previous,
    change,
    percent: previous ? (change / previous) * 100 : 0,
  };
}

function formatNumber(value, digits = 2) {
  return Number(value).toFixed(digits);
}

function isUSMarketOpen(now) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const weekday = parts.find((item) => item.type === "weekday")?.value || "Sun";
  const hour = Number(parts.find((item) => item.type === "hour")?.value || "0");
  const minute = Number(parts.find((item) => item.type === "minute")?.value || "0");
  const minutes = hour * 60 + minute;
  const isWeekday = !["Sat", "Sun"].includes(weekday);
  return isWeekday && minutes >= 9 * 60 + 30 && minutes < 16 * 60;
}

function getNextRefreshDelayMs() {
  return isUSMarketOpen(new Date()) ? 15 * 60 * 1000 : 2 * 60 * 60 * 1000;
}

function scheduleNextRefresh() {
  setTimeout(async () => {
    await refreshSnapshot(true);
    scheduleNextRefresh();
  }, getNextRefreshDelayMs());
}

function respondJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

async function serveStaticAsset(requestPath, response) {
  let pathname = requestPath;
  if (pathname === "/" || pathname === "") {
    pathname = "/index.html";
  }

  const safePath = path.normalize(pathname).replace(/^([.]{2}[\/])+/, "");
  const filePath = path.join(__dirname, safePath);

  if (!filePath.startsWith(__dirname)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  try {
    const content = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": getContentType(filePath),
      "Cache-Control": filePath.endsWith(".js") || filePath.endsWith(".css") ? "no-cache" : "no-store",
    });
    response.end(content);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

function getContentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}