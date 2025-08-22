// src/lib/config.ts
// Unified base URL for the NCAA API (henrygd/ncaa-api).
// Prefer server-side env NCAA_API_BASE; fall back to NCAA_BASE_URL; finally the public demo.
export const NCAA_BASE: string =
  (process.env.NCAA_API_BASE || process.env.NCAA_BASE_URL || "https://ncaa-api.henrygd.me").replace(/\/+$/, "");
