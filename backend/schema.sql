CREATE TABLE newsletters (
  id SERIAL PRIMARY KEY,
  topic TEXT NOT NULL,
  teaser TEXT NOT NULL,
  full_content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE subscribers (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  subscribed_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE payments (
  id SERIAL PRIMARY KEY,
  newsletter_id INTEGER REFERENCES newsletters(id) ON DELETE CASCADE,
  tx_hash TEXT UNIQUE NOT NULL,
  amount_usdc DECIMAL(10, 6) NOT NULL,
  payer_address TEXT,
  paid_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE agent_expenses (
  id SERIAL PRIMARY KEY,
  newsletter_id INTEGER REFERENCES newsletters(id) ON DELETE CASCADE,
  service_name TEXT NOT NULL,
  cost_eth DECIMAL(18, 10) NOT NULL,
  tx_hash TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
