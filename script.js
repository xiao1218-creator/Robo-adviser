const BTC_API_BASE = "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart";
const STOOQ_PROXY = "https://api.allorigins.win/raw?url=";
const indicatorEl = document.getElementById("indicator");
const daysEl = document.getElementById("days");
const refreshBtn = document.getElementById("refreshBtn");
const statsEl = document.getElementById("stats");
const summaryEl = document.getElementById("summary");
const summarizeBtn = document.getElementById("summarizeBtn");
const apiKeyEl = document.getElementById("openAiKey");
const mstrBpsEl = document.getElementById("mstrBps");
const bmnrBpsEl = document.getElementById("bmnrBps");
const xxiBpsEl = document.getElementById("xxiBps");
const usBpsEl = document.getElementById("usBps");
const ukBpsEl = document.getElementById("ukBps");
const chinaBpsEl = document.getElementById("chinaBps");

let chart;
let currentSeriesByCompany = {};
let currentDateLabels = [];
const COMPANY_META = {
  MSTR: { label: "Strategy (MSTR)", color: "#58a6ff" },
  BMNR: { label: "BitMine Immersion (BMNR)", color: "#7ee787" },
  XXI: { label: "XXI", color: "#d2a8ff" },
  US: { label: "US (Proxy)", color: "#f2cc60" },
  UK: { label: "UK (Proxy)", color: "#ffa657" },
  CHINA: { label: "China (Proxy)", color: "#ff7b72" },
};
const PRICE_SYMBOL_BY_ENTITY = {
  MSTR: "MSTR",
  BMNR: "BMNR",
  XXI: "XXI",
  US: "SPY",
  UK: "EWU",
  CHINA: "MCHI",
};

function formatDate(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}

function toNum(v, digits = 4) {
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: digits });
}

function parseCsv(csv) {
  const rows = csv.trim().split("\n");
  const out = [];
  for (let i = 1; i < rows.length; i += 1) {
    const cols = rows[i].split(",");
    if (cols.length < 5) continue;
    const date = cols[0];
    const close = Number(cols[4]);
    if (!Number.isFinite(close)) continue;
    out.push([Date.parse(`${date}T00:00:00Z`), close]);
  }
  return out;
}

function toMap(series) {
  const m = new Map();
  series.forEach(([ts, v]) => m.set(formatDate(ts), v));
  return m;
}

function computeMNAVSeries(stockSeries, btcSeries, btcPerShare) {
  const btcMap = toMap(btcSeries);
  return stockSeries.map(([ts, close]) => {
    const btcPrice = btcMap.get(formatDate(ts));
    if (!btcPrice || btcPerShare <= 0) return [ts, null];
    return [ts, close / (btcPrice * btcPerShare)];
  });
}

function getCompanySeries() {
  const mode = indicatorEl.value;
  if (mode === "combined") return Object.entries(currentSeriesByCompany);
  return [[mode, currentSeriesByCompany[mode] || []]];
}

function renderStats() {
  const picked = getCompanySeries();
  const cards = picked
    .map(([ticker, series]) => {
      const clean = (series || []).filter(([, v]) => v !== null).map(([, v]) => v);
      if (!clean.length) return null;
      const min = Math.min(...clean);
      const max = Math.max(...clean);
      const latest = clean[clean.length - 1];
      const avg = clean.reduce((a, b) => a + b, 0) / clean.length;
      return [
        `<div class="stat-card">`,
        `<p><strong>${COMPANY_META[ticker].label}</strong></p>`,
        `<p class="label">Latest</p><p>${toNum(latest, 3)}</p>`,
        `<p class="label">Average</p><p>${toNum(avg, 3)}</p>`,
        `<p class="label">Range</p><p>${toNum(min, 3)} - ${toNum(max, 3)}</p>`,
        `</div>`,
      ].join("");
    })
    .filter(Boolean);

  if (!cards.length) {
    statsEl.innerHTML = "<p>No values yet for this range.</p>";
    return;
  }
  statsEl.innerHTML = cards.join("");
}

function renderChart() {
  const picked = getCompanySeries();
  const ctx = document.getElementById("indicatorChart");
  const labels = currentDateLabels;
  const datasets = picked.map(([ticker, series]) => ({
    label: COMPANY_META[ticker].label,
    data: labels.map((date) => toMap(series || []).get(date) ?? null),
    borderColor: COMPANY_META[ticker].color,
    backgroundColor: `${COMPANY_META[ticker].color}33`,
    borderWidth: 2,
    pointRadius: 0,
    tension: 0.25,
  }));

  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { labels: { color: "#e6edf3" } } },
      scales: {
        x: { ticks: { color: "#9da7b3", maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
        y: { ticks: { color: "#9da7b3" }, title: { display: true, text: "mNAV", color: "#9da7b3" } },
      },
    },
  });
}

async function fetchStockSeries(ticker) {
  const stooqUrl = encodeURIComponent(`https://stooq.com/q/d/l/?s=${ticker.toLowerCase()}.us&i=d`);
  try {
    const res = await fetch(`${STOOQ_PROXY}${stooqUrl}`);
    if (res.ok) {
      const csv = await res.text();
      const parsed = parseCsv(csv);
      if (parsed.length) return parsed;
    }
  } catch (err) {
    // try Yahoo as fallback
  }

  const yahooRange = daysEl.value === "max" ? "5y" : `${daysEl.value}d`;
  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=${yahooRange}`;
  const yahooResp = await fetch(yahooUrl);
  if (!yahooResp.ok) throw new Error(`Failed stock fetch for ${ticker}.`);
  const yahooPayload = await yahooResp.json();
  const result = yahooPayload?.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const closes = result?.indicators?.quote?.[0]?.close || [];
  const out = [];
  for (let i = 0; i < timestamps.length; i += 1) {
    const close = Number(closes[i]);
    if (!Number.isFinite(close)) continue;
    out.push([timestamps[i] * 1000, close]);
  }
  return out;
}

function cutLookback(series, days) {
  if (days === "max") return series;
  const n = Number(days);
  if (!Number.isFinite(n)) return series;
  return series.slice(-n);
}

async function fetchData() {
  const days = daysEl.value;
  summaryEl.textContent = "Loading data...";
  const [btcResp, mstrResult, bmnrResult, xxiResult, usResult, ukResult, chinaResult] = await Promise.all([
    fetch(`${BTC_API_BASE}?vs_currency=usd&days=${days}&interval=daily`),
    fetchStockSeries(PRICE_SYMBOL_BY_ENTITY.MSTR).catch(() => []),
    fetchStockSeries(PRICE_SYMBOL_BY_ENTITY.BMNR).catch(() => []),
    fetchStockSeries(PRICE_SYMBOL_BY_ENTITY.XXI).catch(() => []),
    fetchStockSeries(PRICE_SYMBOL_BY_ENTITY.US).catch(() => []),
    fetchStockSeries(PRICE_SYMBOL_BY_ENTITY.UK).catch(() => []),
    fetchStockSeries(PRICE_SYMBOL_BY_ENTITY.CHINA).catch(() => []),
  ]);
  if (!btcResp.ok) throw new Error("Failed to fetch BTC data.");
  const btcPayload = await btcResp.json();
  const btcSeries = cutLookback(btcPayload.prices || [], days);
  currentDateLabels = btcSeries.map(([ts]) => formatDate(ts));
  const bps = {
    MSTR: Number(mstrBpsEl.value),
    BMNR: Number(bmnrBpsEl.value),
    XXI: Number(xxiBpsEl.value),
    US: Number(usBpsEl.value),
    UK: Number(ukBpsEl.value),
    CHINA: Number(chinaBpsEl.value),
  };

  currentSeriesByCompany = {
    MSTR: computeMNAVSeries(cutLookback(mstrResult, days), btcSeries, bps.MSTR),
    BMNR: computeMNAVSeries(cutLookback(bmnrResult, days), btcSeries, bps.BMNR),
    XXI: computeMNAVSeries(cutLookback(xxiResult, days), btcSeries, bps.XXI),
    US: computeMNAVSeries(cutLookback(usResult, days), btcSeries, bps.US),
    UK: computeMNAVSeries(cutLookback(ukResult, days), btcSeries, bps.UK),
    CHINA: computeMNAVSeries(cutLookback(chinaResult, days), btcSeries, bps.CHINA),
  };
  renderChart();
  renderStats();
  summaryEl.textContent = "Data loaded. Generate summary to analyze trends.";
}

function flattenSeriesForSummary() {
  const picked = getCompanySeries();
  const out = [];
  picked.forEach(([ticker, series]) => {
    (series || [])
      .filter(([, v]) => v !== null)
      .slice(-90)
      .forEach(([ts, v]) => out.push({ company: ticker, date: formatDate(ts), mnav: Number(v.toFixed(6)) }));
  });
  return out;
}

function fallbackSummary() {
  const picked = getCompanySeries();
  const lines = ["Indicator: mNAV (stock price / BTC NAV per share)"];
  picked.forEach(([ticker, series]) => {
    const clean = (series || []).filter(([, v]) => v !== null).map(([, v]) => v);
    if (clean.length < 2) return;
    const first = clean[0];
    const last = clean[clean.length - 1];
    const delta = ((last - first) / Math.abs(first || 1)) * 100;
    const trend = delta >= 0 ? "upward" : "downward";
    lines.push(`${COMPANY_META[ticker].label}: ${trend} trend (${toNum(delta, 2)}%), latest ${toNum(last, 3)}.`);
  });
  return lines.join("\n");
}

async function generateSummary() {
  const rows = flattenSeriesForSummary();
  if (!rows.length) {
    summaryEl.textContent = "Load data first.";
    return;
  }
  const apiKey = apiKeyEl.value.trim();
  if (!apiKey) {
    summaryEl.textContent = fallbackSummary();
    return;
  }

  const prompt = `You are a financial analyst. Summarize the mNAV behavior for these firms:
${JSON.stringify(rows)}
Explain trend shifts and relative valuation in 4-6 bullet points.`;

  try {
    summaryEl.textContent = "Generating AI summary...";
    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: prompt,
      }),
    });
    if (!resp.ok) throw new Error("OpenAI request failed.");
    const payload = await resp.json();
    const text = payload.output_text || payload.output?.[0]?.content?.[0]?.text;
    summaryEl.textContent = text || fallbackSummary();
  } catch (err) {
    summaryEl.textContent = `${fallbackSummary()}\n\n(LLM call failed, showing fallback summary.)`;
  }
}

refreshBtn.addEventListener("click", fetchData);
summarizeBtn.addEventListener("click", generateSummary);
indicatorEl.addEventListener("change", () => {
  renderChart();
  renderStats();
});

fetchData().catch((err) => {
  summaryEl.textContent = err.message;
});
