import dotenv from "dotenv";
import { DEFAULT_TOPIC, runAutonomousBusiness } from "./agent.js";
import { initializeDatabase } from "./db.js";
import { createNewsletter } from "./store.js";

dotenv.config();

const subscriberEmail = process.argv[2];
const topic = process.argv.slice(3).join(" ").trim() || DEFAULT_TOPIC;

if (!subscriberEmail) {
  console.error(
    "Usage: node src/index.js <subscriber-email> [newsletter topic]"
  );
  process.exit(1);
}

const main = async () => {
  await initializeDatabase();

  const newsletter = await createNewsletter({
    topic,
    teaser: "Generating issue...",
    fullContent: "",
  });

  await runAutonomousBusiness({
    newsletterId: newsletter.id,
    topic,
    subscriberEmail,
  });

  console.log(`✅ Newsletter #${newsletter.id} completed.`);
};

main().catch((error) => {
  console.error("🚨 Agent run failed:", error.message);
  process.exit(1);
});
