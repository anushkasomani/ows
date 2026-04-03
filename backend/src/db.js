import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;

const shouldUseSsl =
  process.env.DATABASE_SSL === "true" ||
  (DATABASE_URL &&
    !DATABASE_URL.includes("localhost") &&
    !DATABASE_URL.includes("127.0.0.1"));

const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: shouldUseSsl ? { rejectUnauthorized: false } : false,
    })
  : null;

const ensureDatabase = () => {
  if (!pool) {
    throw new Error(
      "DATABASE_URL is missing. Add it to backend/.env before starting the backend."
    );
  }
};

export const query = async (text, params = []) => {
  ensureDatabase();
  return pool.query(text, params);
};

export const initializeDatabase = async () => {
  ensureDatabase();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS newsletters (
      id SERIAL PRIMARY KEY,
      topic TEXT NOT NULL,
      teaser TEXT NOT NULL,
      full_content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS subscribers (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      subscribed_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      newsletter_id INTEGER REFERENCES newsletters(id) ON DELETE CASCADE,
      tx_hash TEXT UNIQUE NOT NULL,
      amount_usdc DECIMAL(10,6) NOT NULL,
      payer_address TEXT,
      paid_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS agent_expenses (
      id SERIAL PRIMARY KEY,
      newsletter_id INTEGER REFERENCES newsletters(id) ON DELETE CASCADE,
      service_name TEXT NOT NULL,
      cost_eth DECIMAL(18,10) NOT NULL,
      tx_hash TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
};

export const closeDatabase = async () => {
  if (pool) {
    await pool.end();
  }
};
