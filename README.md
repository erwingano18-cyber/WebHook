# Webflow Webhook Fullstack

Stack:

- Node.js
- Express API
- MySQL storage
- React.js with Vite
- Redux Toolkit

Features:

- Webflow webhook receiver
- Lead dashboard (React + Redux)
- Auto-forward email on new webhook leads
- Button to push lead to SuiteCRM

## Project Structure

- `src/` Express backend
- `src/routes/webflowWebhook.js` webhook handler
- `client/` React Vite frontend with Redux

## 1) Prerequisites

- Node.js 18+
- MySQL 8+

## 2) Install Dependencies

```bash
npm install
npm --prefix client install
```

## 3) Configure Environment

Copy `.env.example` to `.env` and set values.

Required MySQL values:

- `MYSQL_HOST=127.0.0.1`
- `MYSQL_PORT=3306`
- `MYSQL_USER=root`
- `MYSQL_PASSWORD=...`
- `MYSQL_DATABASE=webhook_leads`

Server and client integration:

- `PORT=3000`
- `CLIENT_ORIGIN=http://localhost:5173`

Webhook security:

- `WEBFLOW_WEBHOOK_SECRET=your-secret`

Email forwarding values:

- `AUTO_FORWARD_ENABLED=true`
- `SPAM_SCORE_THRESHOLD=5`
- `FORWARD_SPAM_LEADS=false`
- `FORWARD_TO_EMAIL=you@example.com`
- `EMAIL_FROM=no-reply@yourdomain.com`
- `SMTP_HOST=...`
- `SMTP_PORT=587`
- `SMTP_USER=...`
- `SMTP_PASS=...`

SuiteCRM values:

- `SUITECRM_BASE_URL=https://your-suitecrm-domain.com`
- Option A: `SUITECRM_BEARER_TOKEN=...`
- Option B: `SUITECRM_CLIENT_ID`, `SUITECRM_CLIENT_SECRET`, `SUITECRM_USERNAME`, `SUITECRM_PASSWORD`

## 4) Run Development

```bash
npm run dev
```

URLs:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3000`

On first startup, backend auto-creates the `leads` table in MySQL.

## 5) Webflow Webhook Endpoint

Set Webflow to call:

- `POST https://your-domain.com/webhook/webflow`

If secret is enabled, include header:

- `x-webhook-secret: your-secret`

## API Endpoints

- `POST /webhook/webflow`
- `GET /api/leads`
- `POST /api/leads/:id/forward`
- `POST /api/leads/:id/suitecrm`
- `GET /api/config`
- `GET /health`
