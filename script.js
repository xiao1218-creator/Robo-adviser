const API_BASE = "https://api.coingecko.com/api/v3/coins/digital-asset-treasury/market_chart";
const indicatorEl = document.getElementById("indicator");
const daysEl = document.getElementById("days");
const refreshBtn = document.getElementById("refreshBtn");
const statsEl = document.getElementById("stats");
const summaryEl = document.getElementById("summary");
const summarizeBtn = document.getElementById("summarizeBtn");
const apiKeyEl = document.getElementById("openAiKey");

let chart;
let currentSeries = [];
let currentIndicatorLabel = "";

function formatDate(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}

function toNum(v, digits = 4) {
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: digits });
}

function compute7dReturn(prices) {
  return prices.map((p, idx) => {
    if (idx < 7) return [p[0], null];
    const old = prices[idx - 7][1];
    return [p[0], ((p[1] - old) / old) * 100];
  });
}

function compute30dVolatility(prices) {
  const returns = prices.map((p, i) => {
    if (i === 0) return [p[0], null];
    return [p[0], (p[1] - prices[i - 1][1]) / prices[i - 1][1]];
  });

  return returns.map((r, idx) => {
    if (idx < 30) return [r[0], null];
    const window = returns.slice(idx - 29, idx + 1).map((d) => d[1]).filter((x) => x !== null);
    const mean = window.reduce((a, b) => a + b, 0) / window.length;
    const variance = window.reduce((acc, x) => acc + (x - mean) ** 2, 0) / window.length;
    const stdev = Math.sqrt(variance);
    return [r[0], stdev * Math.sqrt(365) * 100];
  });
}

function calculateSeries(prices, indicator) {
  if (indicator === "price") return { label: "DAT Price (USD)", values: prices };
  if (indicator === "return7d") return { label: "7-Day Return (%)", values: compute7dReturn(prices) };
  return { label: "30-Day Volatility (%)", values: compute30dVolatility(prices) };
}

function renderStats(series) {
  const clean = series.filter(([, v]) => v !== null).map(([, v]) => v);
  if (!clean.length) {
    statsEl.innerHTML = "<p>No values yet for this indicator range.</p>";
    return;
  }
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const latest = clean[clean.length - 1];
  const avg = clean.reduce((a, b) => a + b, 0) / clean.length;
  statsEl.innerHTML = [
    ["Latest", toNum(latest, 4)],
    ["Average", toNum(avg, 4)],
    ["Min", toNum(min, 4)],
    ["Max", toNum(max, 4)],
  ]
    .map(
      ([label, value]) => `
      <div class="stat-card">
        <p class="label">${label}</p>
        <p>${value}</p>
      </div>
    `
    )
    .join("");
}

function renderChart(series, label) {
  const labels = series.map(([ts]) => formatDate(ts));
  const values = series.map(([, v]) => v);
  const ctx = document.getElementById("indicatorChart");

  if (chart) {
    chart.destroy();
  }

  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label,
          data: values,
          borderColor: "#58a6ff",
          backgroundColor: "rgba(88, 166, 255, 0.2)",
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.25,
        },
      ],
    },
    options: {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { labels: { color: "#e6edf3" } } },
      scales: {
        x: { ticks: { color: "#9da7b3", maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
        y: { ticks: { color: "#9da7b3" } },
      },
    },
  });
}

async function fetchData() {
  const days = daysEl.value;
  const indicator = indicatorEl.value;
  const url = `${API_BASE}?vs_currency=usd&days=${days}&interval=daily`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch DAT data.");
  const data = await res.json();
  const prices = data.prices ?? [];
  const seriesInfo = calculateSeries(prices, indicator);
  currentSeries = seriesInfo.values;
  currentIndicatorLabel = seriesInfo.label;
  renderChart(seriesInfo.values, seriesInfo.label);
  renderStats(seriesInfo.values);
}

function fallbackSummary() {
  const clean = currentSeries.filter(([, v]) => v !== null).map(([, v]) => v);
  if (clean.length < 2) return "Not enough data points to summarize this indicator.";
  const first = clean[0];
  const last = clean[clean.length - 1];
  const delta = ((last - first) / Math.abs(first || 1)) * 100;
  const trend = delta >= 0 ? "upward" : "downward";
  return [
    `Indicator: ${currentIndicatorLabel}`,
    `The series shows an overall ${trend} trend of ${toNum(delta, 2)}% over the selected period.`,
    `Latest value is ${toNum(last, 4)}, with range [${toNum(Math.min(...clean), 4)}, ${toNum(Math.max(...clean), 4)}].`,
  ].join("\n");
}

async function generateSummary() {
  if (!currentSeries.length) {
    summaryEl.textContent = "Load data first.";
    return;
  }

  const apiKey = apiKeyEl.value.trim();
  if (!apiKey) {
    summaryEl.textContent = fallbackSummary();
    return;
  }

  const trimmedSeries = currentSeries
    .filter(([, v]) => v !== null)
    .slice(-90)
    .map(([ts, v]) => ({ date: formatDate(ts), value: Number(v.toFixed(6)) }));

  const prompt = `You are a financial data analyst. Summarize trend, volatility, and notable shifts for this daily DAT indicator:
Indicator: ${currentIndicatorLabel}
Data points (latest 90):
${JSON.stringify(trimmedSeries)}
Keep it short (4-6 bullet points).`;

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

    if (!resp.ok) {
      throw new Error("OpenAI request failed.");
    }

    const payload = await resp.json();
    const text = payload.output_text || payload.output?.[0]?.content?.[0]?.text;
    summaryEl.textContent = text || fallbackSummary();
  } catch (err) {
    summaryEl.textContent = `${fallbackSummary()}\n\n(LLM call failed, showing fallback summary.)`;
  }
}

refreshBtn.addEventListener("click", fetchData);
summarizeBtn.addEventListener("click", generateSummary);

fetchData().catch((err) => {
  summaryEl.textContent = err.message;
});
