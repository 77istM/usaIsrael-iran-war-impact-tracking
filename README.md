# usaIsrael-iran-war-impact-tracking

Prototype dashboard for tracking the economic impact of the Iran-USA war that started on 2026-02-28.

The first implementation is a static, browser-ready MVP with:

- Latest macro-risk indicators such as VIX, Treasury yields, oil, equities, FX, and gold.
- A world stress map that highlights which regions are most affected and why.
- A simple oil-buffer scenario calculator that estimates when a reserve buffer could be exhausted.
- Documentation for connecting free APIs, MCP outputs, or ADK-generated data later.

## Run the prototype

The current implementation is plain HTML, CSS, and JavaScript. No build step is required.

1. Open `index.html` directly in a browser, or serve the folder with a local web server.
2. For example, from the project folder you can run:

```powershell
python -m http.server 8000
```

3. Open `http://localhost:8000`.

## Files

- `index.html` - dashboard shell.
- `styles.css` - visual system and responsive layout.
- `src/app.js` - dashboard rendering and scenario logic.
- `src/data.js` - sample series, region exposure data, and source metadata.

## How live data plugs in

The first version uses sample data so the UI is usable before APIs are connected. Live data should be connected in the data loading layer inside `src/app.js` and replaced by a backend or server route when you are ready.

Recommended free sources:

- FRED for VIX, Treasury yields, S&P 500, USD index, and several oil series.
- EIA for reserve, inventory, and petroleum production series.
- Yahoo Finance or another free market-data provider for additional equity or commodity coverage.

### FRED setup

1. Create a free FRED API key at the St. Louis Fed developer portal.
2. Store it in your environment as `FRED_API_KEY`.
3. Fetch series through the FRED observations endpoint.
4. Normalize the response into a common time-series shape before rendering.

Example series IDs:

- `VIXCLS` for VIX.
- `DGS2` and `DGS10` for 2Y and 10Y Treasury yields.
- `DCOILWTICO` for WTI crude.
- `DCOILBRENTEU` for Brent crude.
- `SP500` for the S&P 500 index.
- `DTWEXBGS` for a broad dollar index proxy.

### Where to connect APIs in the app

- Replace the sample data loader in `src/app.js` with a live fetch routine.
- Keep a fallback path so the dashboard still loads if one provider is down.
- Cache responses locally if you add a backend, so the UI does not depend on every page load hitting the API.

## MCP and ADK data guidance

If you want to source data through MCP or ADK rather than direct API calls, keep the browser app as a consumer of normalized JSON.

### MCP workflow

1. Build or reuse an MCP server that can fetch the market series you need.
2. Expose a simple JSON output shape such as `[{ seriesId, timestamp, value }]`.
3. Point the dashboard's loader to that JSON endpoint instead of the raw upstream API.
4. Add caching on the MCP side if the upstream source rate limits requests.

### ADK workflow

1. Run an ADK agent or service that retrieves and normalizes the data.
2. Have the agent write the result to a JSON endpoint, file, or queue that your app can read.
3. Convert the result into the same time-series format used by the static sample data.
4. Feed the dashboard from that normalized output so the UI does not need to know whether the data came from an API, MCP tool, or ADK workflow.

## Next implementation step

The next step is to add a small live-data adapter layer and wire it to a backend or serverless route so the dashboard can switch from sample values to real observations without changing the UI.
