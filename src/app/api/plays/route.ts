// src/app/api/plays/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Server-only base for henrygd/ncaa-api (no trailing slash).
const BASE = (process.env.NCAA_API_BASE || "https://ncaa-api.henrygd.me").replace(/\/+$/, "");

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const gameId = (searchParams.get("gameId") || "").trim();
  if (!gameId) return NextResponse.json([], { headers: { "Cache-Control": "no-store" } });

  // 1) Try scoring-summary first (preferred)
  try {
    const sumRes = await fetch(`${BASE}/game/${gameId}/scoring-summary`, { cache: "no-store" });
    if (sumRes.ok) {
      const data: any = await sumRes.json();
      let periods: any[] = [];
      if (Array.isArray(data?.periods)) periods = data.periods;
      else if (Array.isArray(data)) periods = data;

      const plays: string[] = [];
      for (const p of periods) {
        const summary: any[] = Array.isArray(p?.summary) ? p.summary : [];
        for (const s of summary) {
          if (typeof s?.scoreText === "string" && s.scoreText.trim()) {
            plays.push(s.scoreText.trim());
          }
        }
      }
      return NextResponse.json(plays, { headers: { "Cache-Control": "no-store" } });
    }
  } catch {}

  // 2) Fallback: play-by-play → collect scoring-like text
  try {
    const pbpRes = await fetch(`${BASE}/game/${gameId}/play-by-play`, { cache: "no-store" });
    if (pbpRes.ok) {
      const data: any = await pbpRes.json();
      // Common shapes: { drives: [{ plays: [...] }]} or array of periods with plays
      const plays: string[] = [];
      const pushIf = (text: any) => {
        if (typeof text === "string") {
          // crude filter for scoring; you can refine
          if (/(touchdown|field goal|extra point|safety|two\-point|2pt|pick six)/i.test(text)) {
            plays.push(text.trim());
          }
        }
      };

      if (Array.isArray(data?.drives)) {
        for (const d of data.drives) {
          const arr = Array.isArray(d?.plays) ? d.plays : [];
          for (const p of arr) pushIf(p?.text ?? p?.description ?? p?.playText);
        }
      } else if (Array.isArray(data)) {
        for (const period of data) {
          const arr = Array.isArray(period?.plays) ? period.plays : [];
          for (const p of arr) pushIf(p?.text ?? p?.description ?? p?.playText);
        }
      }
      return NextResponse.json(plays, { headers: { "Cache-Control": "no-store" } });
    }
  } catch {}

  return NextResponse.json([], { headers: { "Cache-Control": "no-store" } });
}
