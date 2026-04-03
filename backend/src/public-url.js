const DEFAULT_PORT = 3000;

export function resolvePublicServerUrl(port = DEFAULT_PORT) {
  const normalizedPort = Number(port) || DEFAULT_PORT;
  const localhostUrl = `http://localhost:${normalizedPort}`;

  if (parseBoolean(process.env.LOCALHOST_ONLY, process.env.NODE_ENV !== "production")) {
    return localhostUrl;
  }

  return (
    normalizeUrl(process.env.SERVER_URL) ||
    normalizeUrl(process.env.RENDER_EXTERNAL_URL) ||
    normalizeRailwayDomain(process.env.RAILWAY_PUBLIC_DOMAIN) ||
    localhostUrl
  );
}

function normalizeUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.replace(/\/+$/, "");
}

function normalizeRailwayDomain(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return null;
  }

  return `https://${trimmed.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
}

function parseBoolean(rawValue, fallback) {
  if (rawValue == null || rawValue === "") {
    return fallback;
  }

  return rawValue === "true";
}
