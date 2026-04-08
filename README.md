# mNAV Tracker Website

This project is a lightweight website for observing daily mNAV behavior for selected Bitcoin treasury companies.

## Tracked Indicator

Primary indicator: **mNAV**.

Tracked companies:
- Strategy (`MSTR`)
- BitMine Immersion (`BMNR`)
- XXI (`XXI`)

## Data Source

Public APIs:

- BTC daily close (CoinGecko):
  `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days={n}&interval=daily`
- Equity daily close (Stooq CSV via CORS proxy):
  `https://stooq.com/q/d/l/?s={ticker}.us&i=d`

## Features

- Daily time-series mNAV chart
- Company selection (single or combined)
- Lookback window selection (90/180/365/max days)
- Editable BTC/share assumptions per company
- Quick stats (latest, average, min, max)
- Optional AI-generated summary via OpenAI API
  - If no API key is entered, a built-in rule-based summary is shown

## mNAV Formula

The dashboard uses:

`mNAV = Stock Price / (BTC Price x BTC Per Share)`

BTC/share defaults are editable in the UI so you can keep assumptions updated with latest filings.

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
