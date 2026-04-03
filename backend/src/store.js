import { query } from "./db.js";

export const addSubscriber = async (email) => {
  const result = await query(
    `
      INSERT INTO subscribers (email)
      VALUES ($1)
      ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
      RETURNING id, email, subscribed_at
    `,
    [email]
  );

  return result.rows[0];
};

export const createNewsletter = async ({
  topic,
  teaser = "Generating issue...",
  fullContent = "",
}) => {
  const result = await query(
    `
      INSERT INTO newsletters (topic, teaser, full_content)
      VALUES ($1, $2, $3)
      RETURNING id, topic, teaser, full_content, created_at
    `,
    [topic, teaser, fullContent]
  );

  return mapNewsletter(result.rows[0]);
};

export const updateNewsletterContent = async ({
  newsletterId,
  teaser,
  fullContent,
}) => {
  const result = await query(
    `
      UPDATE newsletters
      SET teaser = $2,
          full_content = $3
      WHERE id = $1
      RETURNING id, topic, teaser, full_content, created_at
    `,
    [newsletterId, teaser, fullContent]
  );

  return mapNewsletter(result.rows[0]);
};

export const getNewsletterById = async (newsletterId) => {
  const result = await query(
    `
      SELECT id, topic, teaser, full_content, created_at
      FROM newsletters
      WHERE id = $1
    `,
    [newsletterId]
  );

  return result.rows[0] ? mapNewsletter(result.rows[0]) : null;
};

export const listNewsletters = async () => {
  const result = await query(`
    SELECT
      n.id,
      n.topic,
      n.teaser,
      n.full_content,
      n.created_at,
      COUNT(p.id)::int AS payment_count,
      COALESCE(SUM(p.amount_usdc), 0)::text AS revenue_usdc
    FROM newsletters n
    LEFT JOIN payments p ON p.newsletter_id = n.id
    GROUP BY n.id
    ORDER BY n.created_at DESC
  `);

  return result.rows.map((row) => ({
    ...mapNewsletter(row),
    paymentCount: row.payment_count,
    revenueUsdc: Number(row.revenue_usdc),
    isReady: Boolean(row.full_content?.trim()),
  }));
};

export const recordPayment = async ({
  newsletterId,
  txHash,
  amountUsdc,
  payerAddress,
}) => {
  const result = await query(
    `
      INSERT INTO payments (newsletter_id, tx_hash, amount_usdc, payer_address)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (tx_hash) DO NOTHING
      RETURNING id, newsletter_id, tx_hash, amount_usdc, payer_address, paid_at
    `,
    [newsletterId, txHash, amountUsdc, payerAddress]
  );

  return result.rows[0] ?? null;
};

export const recordExpense = async ({
  newsletterId,
  serviceName,
  costEth,
  txHash,
}) => {
  const result = await query(
    `
      INSERT INTO agent_expenses (newsletter_id, service_name, cost_eth, tx_hash)
      VALUES ($1, $2, $3, $4)
      RETURNING id, newsletter_id, service_name, cost_eth, tx_hash, created_at
    `,
    [newsletterId, serviceName, costEth, txHash]
  );

  return result.rows[0];
};

export const getCounts = async () => {
  const [payments, subscribers] = await Promise.all([
    query(`SELECT COUNT(*)::int AS count FROM payments`),
    query(`SELECT COUNT(*)::int AS count FROM subscribers`),
  ]);

  return {
    paymentCount: payments.rows[0].count,
    subscriberCount: subscribers.rows[0].count,
  };
};

export const getRevenueAndExpenses = async () => {
  const result = await query(`
    SELECT
      COALESCE((SELECT SUM(amount_usdc) FROM payments), 0)::text AS total_earned_usdc,
      COALESCE((SELECT SUM(cost_eth) FROM agent_expenses), 0)::text AS total_spent_eth
  `);

  return {
    totalEarnedUsdc: Number(result.rows[0].total_earned_usdc),
    totalSpentEth: Number(result.rows[0].total_spent_eth),
  };
};

export const getActivity = async () => {
  const result = await query(`
    SELECT *
    FROM (
      SELECT
        'expense' AS kind,
        ae.created_at AS occurred_at,
        ae.newsletter_id,
        n.topic,
        ae.service_name,
        ae.cost_eth::text AS cost_eth,
        NULL::text AS amount_usdc,
        NULL::text AS payer_address,
        ae.tx_hash
      FROM agent_expenses ae
      LEFT JOIN newsletters n ON n.id = ae.newsletter_id

      UNION ALL

      SELECT
        'payment' AS kind,
        p.paid_at AS occurred_at,
        p.newsletter_id,
        n.topic,
        'Newsletter purchase' AS service_name,
        NULL::text AS cost_eth,
        p.amount_usdc::text AS amount_usdc,
        p.payer_address,
        p.tx_hash
      FROM payments p
      LEFT JOIN newsletters n ON n.id = p.newsletter_id
    ) activity
    ORDER BY occurred_at DESC
    LIMIT 20
  `);

  return result.rows.map((row) => ({
    kind: row.kind,
    occurredAt: row.occurred_at,
    newsletterId: row.newsletter_id,
    topic: row.topic,
    serviceName: row.service_name,
    costEth: row.cost_eth ? Number(row.cost_eth) : null,
    amountUsdc: row.amount_usdc ? Number(row.amount_usdc) : null,
    payerAddress: row.payer_address,
    txHash: row.tx_hash,
  }));
};

const mapNewsletter = (row) => ({
  id: row.id,
  topic: row.topic,
  teaser: row.teaser,
  fullContent: row.full_content,
  createdAt: row.created_at,
});
