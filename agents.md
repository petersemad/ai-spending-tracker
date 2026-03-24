# AI Spending Tracker — Agent Documentation

## Project Overview
An AI-powered personal finance tracker that automatically parses CIB bank SMS messages on Android, categorizes them using OpenAI, stores them in a cloud PostgreSQL database, and displays them on a premium glassmorphic web dashboard hosted on Vercel.

## Architecture

```
Android Phone (MacroDroid)
   │  SMS from "CIB"
   ▼
Vercel Serverless Function (POST /api/webhook)
   │  Calls OpenAI gpt-4o-mini
   ▼
Neon PostgreSQL (Cloud DB)
   │
   ▼
Vercel Static Frontend (public/)
   │  Fetches GET /api/transactions
   ▼
User's Browser Dashboard
```

## Tech Stack
| Layer       | Technology                  |
|-------------|-----------------------------|
| Hosting     | Vercel (Serverless)         |
| Database    | Neon PostgreSQL (via Vercel) |
| AI          | OpenAI `gpt-4o-mini`       |
| Frontend    | Vanilla HTML/CSS/JS         |
| Font        | Google Fonts — Outfit       |
| Icons       | Phosphor Icons              |
| SMS Trigger | MacroDroid (Android)        |

## Project Structure

```
ai-spending-tracker/
├── api/
│   ├── webhook.js        # POST — Receives SMS, calls OpenAI, inserts into DB
│   ├── transactions.js   # GET  — Returns all transactions as JSON
│   ├── delete.js         # DELETE — Deletes a transaction (PIN-protected)
│   ├── update.js         # PATCH — Fully edits a transaction (amount, currency, etc. PIN-protected)
│   ├── add.js            # POST — Manually add a new transaction (PIN-protected)
│   ├── budgets.js        # GET/POST — Manage Smart Budgets explicitly
│   ├── recurring.js      # GET/POST/DELETE — Manage implicit and explicit subscriptions structurally
│   ├── exchange.js       # GET — Fetch live EGP/USD API conversions
│   └── chat.js           # POST — Edge endpoint driving OpenAI marked.js Chat engine
├── public/
│   ├── index.html        # Dashboard layout with tab navigation
│   ├── style.css         # Premium glassmorphic design system
│   └── app.js            # Client-side rendering, filtering, modals
├── package.json
└── .gitignore
```

## API Routes

### `POST /api/webhook`
- **Purpose**: Receives raw SMS text from MacroDroid, sends it to OpenAI for parsing, and inserts the structured result into the `transactions` table.
- **Request Body**: `{ "message": "<raw SMS text>" }`
- **AI Model**: `gpt-4o-mini` with `response_format: json_object` and `temperature: 0.2`
- **Ignore Logic**: If the AI returns `{ "ignore": true }`, the message is silently discarded (declined transactions, OTPs, marketing).
- **Response**: `{ "success": true, "data": { amount, type, vendor, category } }`

### `GET /api/transactions`
- **Purpose**: Returns all rows from the `transactions` table ordered by `id DESC`. Requires admin PIN query.
- **Request**: `?password=<PIN>`
- **Response**: `{ "transactions": [...] }`

### `DELETE /api/delete`
- **Purpose**: Deletes a transaction by ID. Requires admin PIN.
- **Request Body**: `{ "id": <number>, "password": "<PIN>" }`
- **Default PIN**: `1234` (configurable via `ADMIN_PASSWORD` env var)

### `PATCH /api/update`
- **Purpose**: Updates any field of a transaction (amount, currency, type, vendor, category, date). Requires admin PIN.
- **Request Body**: `{ "id": <number>, "amount": <number>, "currency": "USD", "password": "<PIN>", ... }`

### `POST /api/add`
- **Purpose**: Manually adds a new transaction from the dashboard. Requires admin PIN.
- **Request Body**: `{ "amount": <number>, "currency": "EGP", "type": "Out", "vendor": "Name", "category": "Cat", "password": "<PIN>" }`

### `POST /api/chat`
- **Purpose**: Feeds parsed DB arrays natively to OpenAI dynamically driving the Conversational Assistant.

### `GET / POST / DELETE /api/recurring`
- **Purpose**: Maps and overwrites explicit Subscription objects in the `recurring_vendors` tracking table. All methods mandate Admin PIN.

### `GET / POST / DELETE /api/budgets`
- **Purpose**: Stores category-specific monetary ceilings directly to the `budgets` schema overriding logic blocks. All methods mandate Admin PIN.

## Database Schema

```sql
CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    amount DECIMAL(10,2),
    currency VARCHAR(10) DEFAULT 'EGP',
    type VARCHAR(50),        -- 'In' or 'Out'
    vendor VARCHAR(255),
    category VARCHAR(255),   -- e.g. 'Transport (Debit)'
    raw_text TEXT,           -- Original SMS for audit
    date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS budgets (
    category VARCHAR(255) PRIMARY KEY,
    amount DECIMAL(10,2),
    currency VARCHAR(10) DEFAULT 'EGP'
);

CREATE TABLE IF NOT EXISTS recurring_vendors (
    vendor VARCHAR(255) PRIMARY KEY,
    amount DECIMAL(10,2),
    category VARCHAR(255),
    currency VARCHAR(10) DEFAULT 'EGP'
);
```

## Environment Variables

| Variable              | Required | Description                                    |
|-----------------------|----------|------------------------------------------------|
| `OPENAI_API_KEY`      | Yes      | OpenAI API key for gpt-4o-mini                |
| `storage_POSTGRES_URL`| Yes      | Neon DB connection string (auto-injected)      |
| `ADMIN_PASSWORD`      | No       | Custom admin PIN (default: `1234`)             |

Fallback DB variable resolution order: `storage_POSTGRES_URL` → `DATABASE_URL` → `POSTGRES_URL` → `NEON_DATABASE_URL`

## Supported CIB SMS Formats

| # | Format                            | Language | Type  |
|---|-----------------------------------|----------|-------|
| 1 | Credit card charged               | English  | Out   |
| 2 | Debit card purchase (`تم خصم مبلغ`)   | Arabic   | Out   |
| 3 | Instant transfer outgoing (`من حسابك`) | Arabic   | Out   |
| 4 | Instant transfer incoming (`إلى حسابك`) | Arabic   | In    |
| 5 | ATM withdrawal (`تم سحب مبلغ`)       | Arabic   | Out   |
| 6 | Refund / Reversal (`تم اضافة المعاملة`) | Arabic   | In    |

Declined transactions and unrecognized messages are silently ignored.

## AI Categorization

The AI picks the best category from a fixed list based on the merchant name:

| Category        | Example Merchants                              |
|-----------------|-------------------------------------------------|
| Transport       | Uber, Careem, SWVL, fuel, parking               |
| Food & Drink    | Starbucks, McDonald's, Talabat, restaurants     |
| Groceries       | Carrefour, Kazyon, Seoudi, Hyper One            |
| Shopping        | Amazon, Noon, Jumia, Zara, H&M                 |
| Entertainment   | Netflix, Spotify, YouTube, Apple, Google Play   |
| Utilities       | Vodafone, Etisalat, Orange, electricity, water  |
| Health          | Pharmacies, hospitals, clinics, labs            |
| Education       | Udemy, Coursera, schools, universities          |
| Transfer        | Person-to-person instant transfers              |
| ATM             | ATM withdrawals                                 |
| Subscription    | MacroDroid, iCloud, recurring charges           |
| Refund          | Reversed or refunded transactions               |
| Other           | Anything that doesn't fit above                 |

After the category, `(Credit)` or `(Debit)` is appended based on SMS language.

Users can also create **custom categories** via the re-categorize modal — these are stored in the browser's `localStorage`.

## Frontend Features

- **Decoupled Metric Cards**: Isolates native `EGP` and `USD` while merging cleanly below into a Unified Converted Total (Net Spent, Money In, Money Out).
- **6 Interactive Premium Tabs**:
  - **Transactions**: Core chronological logs. Time isolation filters (7 Days, 30 Days, Year-to-Date), Currency parsing, CSV EXPORT, and explicit 1-click Subscription tracking toggles.
  - **Subscriptions**: Autonomous Monthly Burn rate calculation! Interactive Modals assigning explicit Base Cost and Category mapping for known fixed expenses.
  - **Budgets**: Category ceilings overlaid logically on dynamic spend tracking bars. Supports real-time limit generation over specific Currencies dynamically.
  - **Statistics**: Chart.js data logic. Breakdowns explicit by Category Net logic (Expenses - Refunds). Dynamic line vs bar plotting isolated per Day/Week/Month strictly mathematically.
  - **AI Assistant**: A pristine Marked.js chat shell linking edge APIs straight to the native Postgres Database, permitting conversational multi-threaded financial questioning.
  - **Settings & CSV**: Absolute edge extraction.
- **Design**: Premium glassmorphic dark mode with ambient mesh gradients, noise texture, iMessage-style AI chat bubbles, Custom dynamic Neon Favicon payloads, fluid transitions.

## Deployment

```bash
cd /path/to/ai-spending-tracker
npx vercel --prod
```

After deploying, configure Neon Postgres and `OPENAI_API_KEY` in Vercel Dashboard → Settings → Environment Variables, then Redeploy.

## Android Setup (MacroDroid)

1. **Trigger**: SMS Received from `CIB`
2. **Action**: HTTP Request → POST
3. **URL**: `https://ai-spending-tracker-three.vercel.app/api/webhook`
4. **Content-Type**: `application/json`
5. **Body**: `{"message": "[sms_message]"}` (Magic Text variable)
