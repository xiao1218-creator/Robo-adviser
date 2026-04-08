# DAT.co Indicator Website

This project is a lightweight website for observing the daily time-series behavior of a DAT.co-related indicator.

## Chosen Indicator

Primary indicator: **DAT Price (USD)** for **Digital ASSet Treasury (DAT)**.

Additional derived indicators included:
- 7-Day Return (%)
- 30-Day Volatility (%)

## Data Source

Public API (CoinGecko):

- Coin: `digital-asset-treasury`
- Endpoint:
  `https://api.coingecko.com/api/v3/coins/digital-asset-treasury/market_chart?vs_currency=usd&days={n}&interval=daily`

## Features

- Daily time-series line chart
- Indicator selection
- Lookback window selection (90/180/365/max days)
- Quick stats (latest, average, min, max)
- Optional AI-generated summary via OpenAI API
  - If no API key is entered, a built-in rule-based summary is shown

## Local Run

This is a static site, so no build system is required.

Option 1: Open `index.html` directly in your browser.

Option 2: Serve with any static server.

## Deploy (Vercel)

1. Push this repository to GitHub.
2. In Vercel, create a new project and import the repo.
3. Framework preset: **Other** (static site).
4. Deploy.

You can also deploy from CLI (if Node is available on your machine):

```bash
vercel --prod
```

## Notes

- The optional OpenAI key is only used in-browser and is not persisted by this app.
- For production-grade security, proxy LLM requests through a backend/API route instead of direct browser calls.
