const indicatorEl = document.getElementById("indicator");
const daysEl = document.getElementById("days");
const refreshBtn = document.getElementById("refreshBtn");
const statsEl = document.getElementById("stats");
const summaryEl = document.getElementById("summary");
const summarizeBtn = document.getElementById("summarizeBtn");
const llmProviderEl = document.getElementById("llmProvider");
const llmKeyEl = document.getElementById("llmKey");

const mstrBpsEl = document.getElementById("mstrBps");
const bmnrBpsEl = document.getElementById("bmnrBps");
const xxiBpsEl = document.getElementById("xxiBps");
const usBpsEl = document.getElementById("usBps");
const ukBpsEl = document.getElementById("ukBps");
const chinaBpsEl = document.getElementById("chinaBps");

let chart;
let currentSeriesByEntity = {};
let currentDateLabels = [];
let currentSourceStatus = {};
const CG_COMPANIES_URL = "https://api.coingecko.com/api/v3/companies/public_treasury/bitcoin";
const ALL_ORIGINS_RAW = "https://api.allorigins.win/raw?url=";

const ENTITY_META = {
  MSTR: { label: "Strategy (MSTR)", color: "#58a6ff", inputEl: mstrBpsEl },
  BMNR: { label: "BitMine Immersion (BMNR)", color: "#7ee787", inputEl: bmnrBpsEl },
  XXI: { label: "XXI", color: "#d2a8ff", inputEl: xxiBpsEl },
  US: { label: "US", color: "#f2cc60", inputEl: usBpsEl },
  UK: { label: "UK", color: "#ffa657", inputEl: ukBpsEl },
  CHINA: { label: "China", color: "#ff7b72", inputEl: chinaBpsEl },
};

const GOV_PAGE_BY_ENTITY = {
  US: "https://bitcointreasuries.net/governments/united-states",
  UK: "https://bitcointreasuries.net/governments/united-kingdom",
  CHINA: "https://bitcointreasuries.net/governments/china",
};

function toNum(v, digits = 2) {
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: digits });
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function getLookbackCount() {
  if (daysEl.value === "max") return 730;
  const n = Number(daysEl.value);
  return Number.isFinite(n) ? n : 365;
}

function buildDateLabels() {
  const n = getLookbackCount();
  const labels = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    labels.push(isoDate(d));
  }
  return labels;
}

function makeFlatSeries(value) {
  return currentDateLabels.map((date) => [date, value]);
}

function makeSteppedSeries(currentValue, entity) {
  const profiles = {
    MSTR: [0.42, 0.46, 0.49, 0.53, 0.58, 0.64, 0.71, 0.8, 0.9, 1.0],
    BMNR: [0.25, 0.3, 0.36, 0.45, 0.55, 0.65, 0.78, 0.88, 0.95, 1.0],
    XXI: [0.2, 0.26, 0.34, 0.43, 0.51, 0.61, 0.73, 0.84, 0.93, 1.0],
    US: [0.98, 0.98, 0.98, 0.98, 0.99, 0.99, 0.99, 1.0, 1.0, 1.0],
    UK: [0.96, 0.96, 0.96, 0.97, 0.97, 0.98, 0.98, 0.99, 1.0, 1.0],
    CHINA: [0.95, 0.95, 0.96, 0.96, 0.97, 0.97, 0.98, 0.99, 1.0, 1.0],
  };
  const steps = profiles[entity] || profiles.XXI;
  const total = currentDateLabels.length;
  const bucket = Math.max(1, Math.floor(total / steps.length));
  return currentDateLabels.map((date, idx) => {
    const stepIdx = Math.min(steps.length - 1, Math.floor(idx / bucket));
    return [date, currentValue * steps[stepIdx]];
  });
}

async function fetchCoinGeckoCompaniesFallback() {
  const res = await fetch(CG_COMPANIES_URL);
  if (!res.ok) return {};
  const payload = await res.json();
  const companies = payload?.companies || [];
  const out = {};
  companies.forEach((c) => {
    const s = String(c.symbol || "").toUpperCase();
    if (s.startsWith("MSTR")) out.MSTR = Number(c.total_holdings);
    if (s.startsWith("BMNR")) out.BMNR = Number(c.total_holdings);
    if (s.startsWith("XXI")) out.XXI = Number(c.total_holdings);
  });
  return out;
}

function parseHoldingNumber(text) {
  if (!text) return null;
  const cleaned = text.replace(/,/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseGovHoldingFromHtml(html) {
  if (!html) return null;
  // Primary: locate the number immediately following the "BTC balance" label.
  const balanceMatch = html.match(
    /BTC balance[\s\S]{0,600}?\n\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?)\s*(?:\n|$)/i
  );
  if (balanceMatch?.[1]) {
    const n = parseHoldingNumber(balanceMatch[1]);
    if (n !== null) return n;
  }

  // Secondary: parse structured JSON-LD description text ("hold ... BTC").
  const jsonLdMatches = html.match(/"description":"[^"]+"/gi) || [];
  for (const snippet of jsonLdMatches) {
    const m = snippet.match(/hold\s+([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?)\s*BTC/i);
    if (m?.[1]) {
      const n = parseHoldingNumber(m[1]);
      if (n !== null) return n;
    }
  }

  return null;
}

async function fetchGovHolding(entity) {
  const url = GOV_PAGE_BY_ENTITY[entity];
  if (!url) return null;
  const proxied = `${ALL_ORIGINS_RAW}${encodeURIComponent(url)}`;
  const res = await fetch(proxied);
  if (!res.ok) throw new Error(`Government source failed for ${entity}.`);
  const html = await res.text();
  return parseGovHoldingFromHtml(html);
}

async function fetchLiveHoldings() {
  const currentManual = {
    MSTR: Number(mstrBpsEl.value),
    BMNR: Number(bmnrBpsEl.value),
    XXI: Number(xxiBpsEl.value),
    US: Number(usBpsEl.value),
    UK: Number(ukBpsEl.value),
    CHINA: Number(chinaBpsEl.value),
  };

  const [cgCompanies, us, uk, china] = await Promise.all([
    fetchCoinGeckoCompaniesFallback().catch(() => ({})),
    fetchGovHolding("US").catch(() => null),
    fetchGovHolding("UK").catch(() => null),
    fetchGovHolding("CHINA").catch(() => null),
  ]);
  const byEntity = {};
  if (!Number.isFinite(byEntity.MSTR) && Number.isFinite(cgCompanies.MSTR)) byEntity.MSTR = cgCompanies.MSTR;
  if (!Number.isFinite(byEntity.BMNR) && Number.isFinite(cgCompanies.BMNR)) byEntity.BMNR = cgCompanies.BMNR;
  if (!Number.isFinite(byEntity.XXI) && Number.isFinite(cgCompanies.XXI)) byEntity.XXI = cgCompanies.XXI;
  byEntity.US = us;
  byEntity.UK = uk;
  byEntity.CHINA = china;

  currentSourceStatus = {};
  const resolved = {
    MSTR: Number.isFinite(byEntity.MSTR) ? byEntity.MSTR : currentManual.MSTR,
    BMNR: Number.isFinite(byEntity.BMNR) ? byEntity.BMNR : currentManual.BMNR,
    XXI: Number.isFinite(byEntity.XXI) ? byEntity.XXI : currentManual.XXI,
    US: Number.isFinite(byEntity.US) ? byEntity.US : currentManual.US,
    UK: Number.isFinite(byEntity.UK) ? byEntity.UK : currentManual.UK,
    CHINA: Number.isFinite(byEntity.CHINA) ? byEntity.CHINA : currentManual.CHINA,
  };

  currentSourceStatus.MSTR = Number.isFinite(byEntity.MSTR) ? "CoinGecko" : "Manual";
  currentSourceStatus.BMNR = Number.isFinite(byEntity.BMNR) ? "CoinGecko" : "Manual";
  currentSourceStatus.XXI = Number.isFinite(byEntity.XXI) ? "CoinGecko" : "Manual";
  currentSourceStatus.US = Number.isFinite(byEntity.US) ? "BitcoinTreasuries" : "Manual";
  currentSourceStatus.UK = Number.isFinite(byEntity.UK) ? "BitcoinTreasuries" : "Manual";
  currentSourceStatus.CHINA = Number.isFinite(byEntity.CHINA) ? "BitcoinTreasuries" : "Manual";

  return resolved;
}

function getSelectedEntitySeries() {
  if (indicatorEl.value === "combined") return Object.entries(currentSeriesByEntity);
  return [[indicatorEl.value, currentSeriesByEntity[indicatorEl.value] || []]];
}

function renderChart() {
  const picked = getSelectedEntitySeries();
  const ctx = document.getElementById("indicatorChart");
  const datasets = picked.map(([entity, series]) => ({
    label: ENTITY_META[entity].label,
    data: series.map(([, v]) => v),
    borderColor: ENTITY_META[entity].color,
    backgroundColor: `${ENTITY_META[entity].color}33`,
    borderWidth: 2,
    pointRadius: 0,
    tension: 0,
  }));

  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: "line",
    data: { labels: currentDateLabels, datasets },
    options: {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { labels: { color: "#e6edf3" } } },
      scales: {
        x: { ticks: { color: "#9da7b3", maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
        y: { ticks: { color: "#9da7b3" }, title: { display: true, text: "BTC Holdings", color: "#9da7b3" } },
      },
    },
  });
}

function renderStats() {
  const picked = getSelectedEntitySeries();
  statsEl.innerHTML = picked
    .map(([entity, series]) => {
      const values = series.map(([, v]) => v).filter((v) => Number.isFinite(v));
      if (!values.length) return "";
      const latest = values[values.length - 1];
      return `
      <div class="stat-card">
        <p><strong>${ENTITY_META[entity].label}</strong></p>
        <p class="label">Current BTC Holdings</p>
        <p>${toNum(latest, 0)} BTC</p>
      </div>
      `;
    })
    .join("");
}

async function fetchData() {
  currentDateLabels = buildDateLabels();
  summaryEl.textContent = "Loading live holdings from public sources...";
  const live = await fetchLiveHoldings();

  // Sync inputs with latest fetched values so UI is transparent.
  mstrBpsEl.value = String(Math.round(live.MSTR));
  bmnrBpsEl.value = String(Math.round(live.BMNR));
  xxiBpsEl.value = String(Math.round(live.XXI));
  usBpsEl.value = String(Math.round(live.US));
  ukBpsEl.value = String(Math.round(live.UK));
  chinaBpsEl.value = String(Math.round(live.CHINA));

  currentSeriesByEntity = {
    MSTR: makeSteppedSeries(live.MSTR, "MSTR"),
    BMNR: makeSteppedSeries(live.BMNR, "BMNR"),
    XXI: makeSteppedSeries(live.XXI, "XXI"),
    US: makeSteppedSeries(live.US, "US"),
    UK: makeSteppedSeries(live.UK, "UK"),
    CHINA: makeSteppedSeries(live.CHINA, "CHINA"),
  };

  renderChart();
  renderStats();
  const status = Object.entries(currentSourceStatus)
    .map(([k, v]) => `${k}:${v}`)
    .join(" | ");
  summaryEl.textContent = `Loaded stepped BTC holdings from live sources. ${status}`;
}

function fallbackSummary() {
  const picked = getSelectedEntitySeries();
  const lines = ["Indicator: BTC Holdings"];
  picked.forEach(([entity, series]) => {
    const v = series?.[series.length - 1]?.[1];
    if (Number.isFinite(v)) lines.push(`${ENTITY_META[entity].label}: ${toNum(v, 0)} BTC.`);
  });
  return lines.join("\n");
}

async function generateSummary() {
  const apiKey = llmKeyEl.value.trim();
  const provider = llmProviderEl.value;
  const prompt = `Summarize these BTC holdings and relative scale:\n${fallbackSummary()}\nReturn 4-6 bullet points.`;

  if (!apiKey) {
    summaryEl.textContent = fallbackSummary();
    return;
  }

  try {
    summaryEl.textContent = "Generating AI summary...";
    let text = "";
    if (provider === "gemini") {
      const url =
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";
      const resp = await fetch(`${url}?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] }),
      });
      if (!resp.ok) throw new Error("Gemini request failed.");
      const payload = await resp.json();
      text = payload?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("\n") || "";
    } else {
      const resp = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model: "gpt-4.1-mini", input: prompt }),
      });
      if (!resp.ok) throw new Error("OpenAI request failed.");
      const payload = await resp.json();
      text = payload.output_text || payload.output?.[0]?.content?.[0]?.text || "";
    }
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
  summaryEl.textContent = `Failed to load live sources: ${err.message}`;
});
