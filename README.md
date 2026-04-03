# Live App

**https://ows-production.up.railway.app**

# Ink402

Ink402 is an autonomous tech-news business built for the Open Wallet Standard Hackathon.

The project scrapes the latest tech news, turns it into premium newsletter issues, distributes them to subscribers, gates full issues behind x402 micropayments, and tracks revenue and operating costs in a shared Postgres database.

## What It Does

- Scrapes latest tech news with Firecrawl
- Generates newsletter issues with Groq
- Stores newsletters, subscribers, payments, and expenses in PostgreSQL
- Delivers teaser emails with links to premium issues
- Gates premium issues with x402 on Base Sepolia
- Tracks transparent P&L per issue
- Runs as a deployed reader app plus a local agent publisher

## Why OWS Matters

Open Wallet Standard is used for the autonomous agent's local wallet flow. The agent can pay for operating steps like scraping, generation, and email delivery using its wallet, while end users unlock premium newsletters through x402.

## Architecture

There are two modes:

### 1. Production App

The deployed app is the public-facing product.

- lets people subscribe
- shows the archive
- serves premium newsletter pages
- reads from Neon Postgres
- runs in reader mode with `AGENT_ENABLED=false`

### 2. Local Agent

The local machine is the operator.

- runs the agent workflow
- scrapes news
- writes issues
- sends teaser emails
- writes everything into the same Neon Postgres database

Because both modes use the same database, anything published locally appears immediately on the live site.

## Stack

- Backend: Node.js + Express
- Frontend: single static HTML/CSS/JS page
- Database: Neon Postgres
- Deployment: Railway
- Payments: x402 on Base Sepolia
- Wallet Layer: Open Wallet Standard
- AI: Groq
- Research: Firecrawl
- Email: Nodemailer + Gmail

## Project Structure

```text
ows/
├── README.md
└── backend/
    ├── package.json
    ├── schema.sql
    ├── public/
    │   └── index.html
    └── src/
        ├── agent.js
        ├── db.js
        ├── index.js
        ├── server.js
        └── store.js
```

## Environment Variables

Use `backend/.env.example` as the template.

Key variables:

```env
DATABASE_URL=
SERVER_URL=
GROQ_API_KEY=
GROQ_MODEL=llama-3.1-8b-instant
FIRECRAWL_API_KEY=
EMAIL_USER=
EMAIL_PASS=
WALLET_ADDRESS=
AGENT_ENABLED=
SHOW_AGENT_CONTROLS=
```

## Local Development

From `backend`:

```bash
npm install
npm run server
```

To run the local agent manually:

```bash
npm run agent -- you@example.com "Latest tech news"
```

Recommended local mode:

```env
AGENT_ENABLED=true
SHOW_AGENT_CONTROLS=true
SERVER_URL=https://ows-production.up.railway.app
```

## Production Deployment

Deploy the `backend` folder to Railway.

Recommended production settings:

- Root directory: `backend`
- Build command: `npm install`
- Start command: `npm start`

Recommended production env:

```env
DATABASE_URL=your_neon_connection_string
SERVER_URL=https://ows-production.up.railway.app
AGENT_ENABLED=false
SHOW_AGENT_CONTROLS=false
NODE_ENV=production
GROQ_MODEL=llama-3.1-8b-instant
GROQ_API_KEY=...
FIRECRAWL_API_KEY=...
EMAIL_USER=...
EMAIL_PASS=...
WALLET_ADDRESS=...
```

## P&L Model

The business tracks:

- revenue from newsletter purchases
- expenses for scraping, generation, and delivery
- payment count
- subscriber count

This makes it possible to show whether the autonomous newsletter is actually approaching break-even.

## Notes

- Production is intentionally separated from the local agent runner
- The deployed app is safe to expose publicly
- The local machine remains the publishing operator
- Neon makes it possible for local publishing and deployed reading to share the same state

## Hackathon Focus

This project is not just an AI content demo. It is an autonomous media business with:

- wallet-powered operations
- paywalled monetization
- cloud persistence
- deployable public access
- visible unit economics
