import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { createPaywall } from "@x402/paywall";
import { evmPaywall } from "@x402/paywall/evm";
import { DEFAULT_TOPIC, runAutonomousBusiness } from "./agent.js";
import { initializeDatabase } from "./db.js";
import {
  addSubscriber,
  createNewsletter,
  getActivity,
  getCounts,
  getNewsletterById,
  getRevenueAndExpenses,
  listNewsletters,
  recordPayment,
} from "./store.js";

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const ISSUE_PRICE_USDC = 0.01;
const AGENT_ENABLED = parseBoolean(
  process.env.AGENT_ENABLED,
  process.env.NODE_ENV !== "production"
);
const SHOW_AGENT_CONTROLS = parseBoolean(
  process.env.SHOW_AGENT_CONTROLS,
  AGENT_ENABLED
);
const PUBLIC_SERVER_URL =
  process.env.SERVER_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  (process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : `http://localhost:${PORT}`);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, "../public");

const app = express();
app.use(express.json());
app.use(express.static(publicDir));

const facilitatorClient = new HTTPFacilitatorClient({
  url: "https://x402.org/facilitator",
});

const resourceServer = new x402ResourceServer(facilitatorClient).register(
  "eip155:84532",
  new ExactEvmScheme()
);

resourceServer.onAfterSettle(async ({ result, transportContext }) => {
  const requestPath = transportContext?.request?.path;
  const newsletterId = getNewsletterIdFromPath(requestPath);

  if (!newsletterId) {
    return;
  }

  await recordPayment({
    newsletterId,
    txHash: result.transaction,
    amountUsdc: ISSUE_PRICE_USDC,
    payerAddress: result.payer ?? null,
  });
});

const paywall = createPaywall()
  .withNetwork(evmPaywall)
  .withConfig({
    appName: "Autonomous Newsletter Business",
    testnet: true,
  })
  .build();

app.use(
  paymentMiddleware(
    {
      "GET /newsletter/:id": {
        accepts: [
          {
            scheme: "exact",
            price: "$0.01",
            network: "eip155:84532",
            payTo: process.env.WALLET_ADDRESS,
          },
        ],
        description: "Unlock this latest tech news issue",
      },
    },
    resourceServer,
    undefined,
    paywall
  )
);

app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/api/config", (req, res) => {
  res.json({
    agentEnabled: AGENT_ENABLED,
    showAgentControls: SHOW_AGENT_CONTROLS,
    defaultTopic: DEFAULT_TOPIC,
    publicServerUrl: PUBLIC_SERVER_URL,
  });
});

app.post("/subscribe", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const topic = String(req.body?.topic || DEFAULT_TOPIC).trim() || DEFAULT_TOPIC;

    if (!isValidEmail(email)) {
      res.status(400).json({ error: "Enter a valid email address." });
      return;
    }

    await addSubscriber(email);

    if (AGENT_ENABLED) {
      const newsletter = await createNewsletter({
        topic,
        teaser: "Generating issue...",
        fullContent: "",
      });

      runAutonomousBusiness({
        newsletterId: newsletter.id,
        topic,
        subscriberEmail: email,
      }).catch((error) => {
        console.error(
          `Newsletter generation failed for #${newsletter.id}:`,
          error.message
        );
      });

      res.status(202).json({
        ok: true,
        message: "Subscription saved. The agent is now building your first issue.",
        newsletterId: newsletter.id,
      });
      return;
    }

    res.status(202).json({
      ok: true,
      message:
        "Subscription saved. This production app is in reader mode, so the newsletter agent continues running from the local machine.",
      newsletterId: null,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to subscribe right now." });
  }
});

app.get("/teaser/:id", async (req, res) => {
  try {
    const newsletter = await getNewsletterById(Number(req.params.id));

    if (!newsletter) {
      res.status(404).json({ error: "Newsletter not found." });
      return;
    }

    res.json({
      id: newsletter.id,
      topic: newsletter.topic,
      teaser: newsletter.teaser,
      createdAt: newsletter.createdAt,
      isReady: Boolean(newsletter.fullContent.trim()),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to fetch teaser." });
  }
});

app.get("/newsletter/:id", async (req, res) => {
  try {
    const newsletter = await getNewsletterById(Number(req.params.id));

    if (!newsletter) {
      res.status(404).send(renderMessage("Newsletter not found."));
      return;
    }

    res.send(renderNewsletter(newsletter));
  } catch (error) {
    console.error(error);
    res.status(500).send(renderMessage("Unable to load this issue right now."));
  }
});

app.get("/api/pnl", async (req, res) => {
  try {
    const [{ totalEarnedUsdc, totalSpentEth }, counts] = await Promise.all([
      getRevenueAndExpenses(),
      getCounts(),
    ]);

    const ethPriceUsd = await getEthPriceUsd();
    const totalSpentUsd = totalSpentEth * ethPriceUsd;
    const netUsd = totalEarnedUsdc - totalSpentUsd;

    res.json({
      totalEarnedUsd: totalEarnedUsdc,
      totalSpentUsd,
      totalSpentEth,
      netUsd,
      paymentCount: counts.paymentCount,
      subscriberCount: counts.subscriberCount,
      ethPriceUsd,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to calculate P&L." });
  }
});

app.get("/api/newsletters", async (req, res) => {
  try {
    const newsletters = await listNewsletters();
    res.json(newsletters);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to load newsletters." });
  }
});

app.get("/api/activity", async (req, res) => {
  try {
    const activity = await getActivity();
    res.json(activity);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to load activity feed." });
  }
});

const start = async () => {
  await initializeDatabase();

  app.listen(PORT, () => {
    console.log(`💰 Backend running at http://localhost:${PORT}`);
  });
};

start().catch((error) => {
  console.error("Failed to start backend:", error.message);
  process.exit(1);
});

let ethPriceCache = {
  value: 0,
  fetchedAt: 0,
};

async function getEthPriceUsd() {
  const now = Date.now();

  if (ethPriceCache.value && now - ethPriceCache.fetchedAt < 60_000) {
    return ethPriceCache.value;
  }

  try {
    const response = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
    );

    if (!response.ok) {
      throw new Error(`CoinGecko failed with ${response.status}`);
    }

    const data = await response.json();
    const value = Number(data.ethereum?.usd || 0);

    ethPriceCache = {
      value,
      fetchedAt: now,
    };

    return value;
  } catch (error) {
    console.warn("ETH price fetch failed:", error.message);
    return ethPriceCache.value || 0;
  }
}

function getNewsletterIdFromPath(pathname) {
  const match = pathname?.match(/^\/newsletter\/(\d+)$/);
  return match ? Number(match[1]) : null;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function renderNewsletter(newsletter) {
  const body = newsletter.fullContent.trim();

  return `
    <section style="font-family:'Space Grotesk',system-ui,sans-serif;max-width:760px;margin:48px auto;padding:0 20px;line-height:1.8;color:#111827">
      <p style="font-size:12px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;margin-bottom:12px">Premium Issue #${newsletter.id}</p>
      <h1 style="font-size:56px;line-height:1.05;margin:0 0 20px">${escapeHtml(newsletter.topic)}</h1>
      <div style="padding:18px 20px;border:3px solid #111;background:#fff36d;box-shadow:8px 8px 0 #111;margin-bottom:28px;font-weight:700">
        ${escapeHtml(newsletter.teaser)}
      </div>
      ${
        body
          ? `<div style="font-size:18px">${escapeHtml(body).replace(/\n/g, "<br/>")}</div>`
          : `<div style="padding:20px;border:3px solid #111;background:#fff">
               This issue exists, but the content is still being generated. Check back in a moment.
             </div>`
      }
      <hr style="margin:32px 0;border:none;border-top:3px solid #111" />
      <p style="font-size:12px;font-weight:700">Powered by an autonomous tech-news business using OWS + x402.</p>
    </section>
  `;
}

function renderMessage(message) {
  return `
    <section style="font-family:'Space Grotesk',system-ui,sans-serif;max-width:680px;margin:48px auto;padding:24px;border:3px solid #111;background:#fff36d;box-shadow:8px 8px 0 #111">
      <h1 style="margin:0 0 12px">Autonomous Newsletter Business</h1>
      <p style="margin:0">${escapeHtml(message)}</p>
    </section>
  `;
}

function escapeHtml(value = "") {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function parseBoolean(rawValue, fallback) {
  if (rawValue == null || rawValue === "") {
    return fallback;
  }

  return rawValue === "true";
}
