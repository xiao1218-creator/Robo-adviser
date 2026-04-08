# BTC Holdings Tracker Website

This project is a lightweight website for observing BTC holdings for selected companies and countries.

## Tracked Indicator

Primary indicator: **BTC Holdings**.

Tracked entities:
- Strategy (`MSTR`)
- BitMine Immersion (`BMNR`)
- XXI (`XXI`)
- US proxy (`SPY`)
- UK proxy (`EWU`)
- China proxy (`MCHI`)

## Data Source

- BTC holdings are entered as disclosed amounts and can be updated directly in the UI.
- Use latest company filings and public treasury trackers to keep values current.

## Features

- Daily holdings chart
- Company selection (single or combined)
- Lookback window selection (90/180/365/max days)
- Editable BTC holdings per entity
- Quick stats (current holdings by entity)
- Optional AI-generated summary via Gemini or OpenAI API
  - If no API key is entered, a built-in rule-based summary is shown

## Holdings Behavior

The chart plots holdings over the selected period using the values entered in the UI.  
When holdings change in disclosures, update the corresponding input and refresh.

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

- The optional Gemini/OpenAI key is only used in-browser and is not persisted by this app.
- For production-grade security, proxy LLM requests through a backend/API route instead of direct browser calls.
