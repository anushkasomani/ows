import { signAndSend } from "@open-wallet-standard/core";
import dotenv from "dotenv";
import { ethers } from "ethers";
import Groq from "groq-sdk";
import nodemailer from "nodemailer";
import { recordExpense, updateNewsletterContent } from "./store.js";

dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
const OWS_WALLET_NAME = "agent-treasury";
const SERVICE_FEE_RECIPIENT =
  "0x8dA7936deBca60c98A0F6Eb0142990027986f959";
const TREASURY_ADDRESS = "0x5652D2e1Fa1Bc32c5EdC81C92966a0542576E43E";
const SEPOLIA_RPC_URL = "https://ethereum-sepolia.publicnode.com";

const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
let paymentQueue = Promise.resolve();
const PUBLIC_SERVER_URL =
  process.env.SERVER_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  (process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : "http://localhost:3000");

export const DEFAULT_TOPIC = "Latest tech news";
const FIRECRAWL_LIMIT = 3;
const MAX_SOURCE_CHARS = 1400;
const MAX_RESEARCH_CHARS = 6000;

const enqueuePayment = (work) => {
  const nextRun = paymentQueue.then(work, work);
  paymentQueue = nextRun.catch(() => {});
  return nextRun;
};

const normalizeText = (value = "") =>
  value.replace(/\s+/g, " ").trim();

const compressResearch = (pages) => {
  const trimmedPages = pages
    .map((page) => normalizeText(page.markdown || ""))
    .filter(Boolean)
    .map((text, index) => `Source ${index + 1}: ${text.slice(0, MAX_SOURCE_CHARS)}`);

  let total = "";

  for (const section of trimmedPages) {
    const next = total ? `${total}\n\n${section}` : section;
    if (next.length > MAX_RESEARCH_CHARS) {
      break;
    }
    total = next;
  }

  return total;
};

const payForService = async ({ newsletterId, serviceName, costEth }) => {
  console.log(`💸 Paying ${costEth} ETH for ${serviceName}...`);

  return enqueuePayment(async () => {
    try {
      const feeData = await provider.getFeeData();
      const tx = {
        to: SERVICE_FEE_RECIPIENT,
        value: ethers.parseEther(costEth.toString()),
        chainId: 11155111,
        nonce: await provider.getTransactionCount(TREASURY_ADDRESS, "pending"),
        gasLimit: 21000n,
        maxFeePerGas: feeData.maxFeePerGas,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
        type: 2,
      };

      const result = await signAndSend(
        OWS_WALLET_NAME,
        "eip155:11155111",
        ethers.Transaction.from(tx).unsignedSerialized,
        undefined,
        undefined,
        SEPOLIA_RPC_URL
      );

      await provider.waitForTransaction(result.txHash);

      await recordExpense({
        newsletterId,
        serviceName,
        costEth,
        txHash: result.txHash,
      });

      return result.txHash;
    } catch (error) {
      console.error(`Payment failed for ${serviceName}:`, error.message);
      throw new Error(`Unable to fund ${serviceName}.`);
    }
  });
};

const fetchResearch = async ({ newsletterId, topic }) => {
  await payForService({
    newsletterId,
    serviceName: "Firecrawl Scrape",
    costEth: 0.00001,
  });

  const response = await fetch("https://api.firecrawl.dev/v2/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: topic,
      limit: FIRECRAWL_LIMIT,
      scrapeOptions: { formats: ["markdown"] },
    }),
  });

  if (!response.ok) {
    throw new Error(`Firecrawl failed with ${response.status}`);
  }

  const result = await response.json();
  const pages = result.data?.web ?? [];

  if (!pages.length) {
    throw new Error("Firecrawl returned no research results.");
  }

  const compressedResearch = compressResearch(pages);

  if (!compressedResearch) {
    throw new Error("Research results were empty after compression.");
  }

  return compressedResearch;
};

const writeNewsletter = async ({ newsletterId, researchData }) => {
  await payForService({
    newsletterId,
    serviceName: "Groq Generation",
    costEth: 0.000005,
  });

  const completion = await groq.chat.completions.create({
    messages: [
      {
        role: "system",
        content:
          "You are an autonomous newsletter business covering the latest tech news. Write a concise, high-signal issue in plain text with a sharp opening, 3-4 short sections, and a strong closing takeaway.",
      },
      {
        role: "user",
        content: `Turn this latest tech news research into a premium newsletter issue:\n\n${researchData}`,
      },
    ],
    model: GROQ_MODEL,
    max_completion_tokens: 900,
  });

  const content = completion.choices[0]?.message?.content?.trim() ?? "";

  if (!content) {
    throw new Error("Groq returned empty newsletter content.");
  }

  return content;
};

const sendNewsletter = async ({
  newsletterId,
  content,
  teaser,
  recipientEmail,
}) => {
  await payForService({
    newsletterId,
    serviceName: "Email Delivery",
    costEth: 0.000002,
  });

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  await transporter.verify();

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: recipientEmail,
    subject: `Autonomous Tech Update #${newsletterId}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;line-height:1.6">
        <h1 style="margin-bottom:12px">Autonomous Newsletter Business</h1>
        <p style="font-size:18px;margin-bottom:20px">${escapeHtml(teaser)}</p>
        <p style="margin-bottom:20px">A new tech issue just dropped. Unlock the full edition here:</p>
        <a
          href="${PUBLIC_SERVER_URL}/newsletter/${newsletterId}"
          style="display:inline-block;padding:14px 20px;background:#111;color:#fff;text-decoration:none;border-radius:10px;font-weight:700"
        >
          Read Full Issue for $0.01 USDC
        </a>
        <hr style="margin:24px 0" />
        <p style="font-size:12px;color:#666">
          This issue was researched, written, and delivered by an autonomous agent using OWS and x402.
        </p>
      </div>
    `,
    text: `${teaser}\n\nRead the full issue: ${PUBLIC_SERVER_URL}/newsletter/${newsletterId}\n\n${content}`,
  });
};

export const runAutonomousBusiness = async ({
  newsletterId,
  topic,
  subscriberEmail,
}) => {
  console.log(`🤖 Agent waking up for newsletter #${newsletterId}...`);

  let currentStep = "starting";

  try {
    currentStep = "research";
    const research = await fetchResearch({ newsletterId, topic });
    console.log("✅ Research gathered.");

    currentStep = "writing";
    const content = await writeNewsletter({
      newsletterId,
      researchData: research,
    });
    console.log("✅ Newsletter written.");

    const teaser = content.split("\n\n")[0] || content.slice(0, 220);

    await updateNewsletterContent({
      newsletterId,
      teaser,
      fullContent: content,
    });

    if (subscriberEmail) {
      currentStep = "email";
      await sendNewsletter({
        newsletterId,
        content,
        teaser,
        recipientEmail: subscriberEmail,
      });
      console.log(`📧 Newsletter sent to ${subscriberEmail}.`);
    }

    return { newsletterId, teaser, fullContent: content };
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";

    await updateNewsletterContent({
      newsletterId,
      teaser: `Issue generation failed during ${currentStep}.`,
      fullContent:
        `This issue could not be completed.\n\n` +
        `Failed step: ${currentStep}\n` +
        `Reason: ${details}\n\n` +
        `Check the backend logs and credentials, then trigger a fresh run.`,
    });

    console.error(`🚨 Newsletter #${newsletterId} failed during ${currentStep}:`, details);
    throw error;
  }
};

const escapeHtml = (value = "") =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
