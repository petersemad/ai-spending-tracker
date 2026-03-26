# V2 Innovation Roadmap & Idea Bank

## 🧠 Brainstormed Premium Features
1. **📸 Receipt & Invoice AI Parsing (Vision/OCR):** 
   Snap a photo of a receipt, and OpenAI Vision extracts the amount, tax, and category instantly without typing.
2. **🌊 Interactive "Cash Flow" Sankey Diagrams:** 
   Replace boring charts with stunning, interconnected flowing pipes that visualize exactly how total income splits into specific categories and subscriptions.
3. **💬 WhatsApp Audio Sync Engine:** 
   Send a voice note to a dedicated WhatsApp bot saying "I spent 550 EGP on a jacket at Zara". Whisper + GPT automatically parses and logs it via the Webhook.
4. **🌍 Geospatial Interactive Heatmaps:** 
   Map exact locations using Mapbox where money is spent dynamically via browser Geolocation APIs or inferred from Merchant Names.
5. **🔔 Predictive Budget Push Alerts:** 
   AI mathematically forecasts monthly burn rate and fires native Push Notifications to the phone's lock screen before exceeding established category budgets.

## 🛠️ Known Structural UX Bottlenecks to Fix
1. **Memory Bloat (Infinite Scrolling):** The `GET /api/transactions` endpoint retrieves ALL rows globally without `LIMIT`/`OFFSET` pagination, relying on client-side slicing. This will crash mobile devices at 10,000+ entries.
2. **Missing Input Defense:** Manual addition in the dashboard HTML does not structurally prevent negative numbers or invalid currency strings.
3. **Chart Stretching:** Chart.js container occasionally compresses vertically on mobile devices during tab switching state changes.
