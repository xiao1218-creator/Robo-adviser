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

const ENTITY_META = {
  MSTR: { label: "Strategy (MSTR)", color: "#58a6ff", inputEl: mstrBpsEl },
  BMNR: { label: "BitMine Immersion (BMNR)", color: "#7ee787", inputEl: bmnrBpsEl },
  XXI: { label: "XXI", color: "#d2a8ff", inputEl: xxiBpsEl },
  US: { label: "US", color: "#f2cc60", inputEl: usBpsEl },
  UK: { label: "UK", color: "#ffa657", inputEl: ukBpsEl },
  CHINA: { label: "China", color: "#ff7b72", inputEl: chinaBpsEl },
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

function fetchData() {
  currentDateLabels = buildDateLabels();
  currentSeriesByEntity = {
    MSTR: makeFlatSeries(Number(mstrBpsEl.value)),
    BMNR: makeFlatSeries(Number(bmnrBpsEl.value)),
    XXI: makeFlatSeries(Number(xxiBpsEl.value)),
    US: makeFlatSeries(Number(usBpsEl.value)),
    UK: makeFlatSeries(Number(ukBpsEl.value)),
    CHINA: makeFlatSeries(Number(chinaBpsEl.value)),
  };

  renderChart();
  renderStats();
  summaryEl.textContent = "Loaded BTC holdings series. Update values to reflect latest disclosures.";
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

fetchData();
