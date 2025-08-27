// src/app/api/games/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function statusLabel(g: any) {
  const st = (g?.gameState || g?.state || g?.status || "").toString().toLowerCase();
  const period = g?.currentPeriod ?? g?.period ?? g?.quarter ?? "";
  const clock  = g?.contestClock ?? g?.displayClock ?? g?.time ?? g?.clock ?? "";
  if (/final/.test(st)) return "Final";
  if (/live|in_progress/.test(st)) return `${period ? `Q${period} ` : ""}${clock || ""}`.trim();
  if (/pre|scheduled/.test(st)) return "Scheduled";
  return (period ? `Q${period} ` : "") + (clock || st || "");
}

function toSide(name: string, score: any, right: string, abbr?: string) {
  return { name, score: Number(score ?? 0), right, abbr };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const trackedCsv = searchParams.get("tracked") || "";
  const tracked = trackedCsv.split(",").map(s => s.trim()).filter(Boolean);
  if (!tracked.length) {
    return NextResponse.json([], { headers: { "Cache-Control": "no-store" } });
  }

  // Accept week/year passthrough (for exact-week lookups like Week 0)
  const week = (searchParams.get("week") || "").trim();   // "0".."16"
  const year = (searchParams.get("year") || "2025").trim();

  // Call your own scoreboard route (unchanged), forwarding week/year
  const origin = new URL(request.url).origin;
  const sbParams = new URLSearchParams({ tracked: tracked.join(",") });
  if (week) sbParams.set("week", week);
  if (year) sbParams.set("year", year);

  const sbRes = await fetch(`${origin}/api/scoreboard?${sbParams.toString()}`, { cache: "no-store" });
  if (!sbRes.ok) {
    return NextResponse.json({ error: `Scoreboard error ${sbRes.status}` }, { status: 502 });
  }
  const sb = await sbRes.json();
  const games = Array.isArray(sb?.games) ? sb.games : [];

  // Map to GameCard shape and attach plays
  const out: any[] = [];
  const trackedSet = new Set(tracked.map(s => s.toLowerCase()));

  for (const g of games) {
    const id = (() => {
      const m = /\/game\/(\d+)/.exec(g?.url || "");
      return m ? m[1] : (g?.gameID || g?.id || "").toString();
    })();
    if (!id) continue;

    const homeName  = g?.home?.names?.short ?? g?.homeTeam ?? g?.home?.name ?? "";
    const awayName  = g?.away?.names?.short ?? g?.awayTeam ?? g?.away?.name ?? "";
    const homeScore = g?.home?.score ?? g?.homePoints ?? g?.home_score ?? 0;
    const awayScore = g?.away?.score ?? g?.awayPoints ?? g?.away_score ?? 0;
    const state     = g?.gameState ?? g?.state ?? g?.status ?? "";
    const right     = statusLabel(g);

    // tracked-on-top
    const homeIsTracked = trackedSet.has(String(homeName).toLowerCase());
    const top    = homeIsTracked
      ? toSide(homeName, homeScore, right, g?.home?.names?.char6)
      : toSide(awayName, awayScore, right, g?.away?.names?.char6);
    const bottom = homeIsTracked
      ? toSide(awayName, awayScore, right, g?.away?.names?.char6)
      : toSide(homeName, homeScore, right, g?.home?.names?.char6);

    // Fetch scoring plays (scoreText[]) via your plays route
    let plays: string[] = [];
    try {
      const p = await fetch(`${origin}/api/plays?` + new URLSearchParams({ gameId: id }), { cache: "no-store" });
      if (p.ok) plays = await p.json();
    } catch { /* ignore */ }

    out.push({
      id: String(id),
      top,
      bottom,
      plays,
      meta: {
        homeChar6: g?.home?.names?.char6,
        awayChar6: g?.away?.names?.char6,
        state,
        currentPeriod: g?.currentPeriod ?? g?.period ?? g?.quarter ?? "",
        contestClock: g?.contestClock ?? g?.displayClock ?? g?.time ?? "",
        // keep any timestamp your /api/scoreboard adds for sorting
        startTimeEpoch: g?.startTimeEpoch ?? 0,
      },
    });
  }

  // --- Ordering ---
  // Default (no week specified): live → upcoming → finals
  // When 'week' is provided:    finals → live → upcoming   (so past games for that week win)
  const live = out.filter((c) => /live|in_progress/i.test(String(c.meta?.state)));
  const upc  = out.filter((c) => /pre|scheduled/i.test(String(c.meta?.state)));
  const fin  = out.filter((c) => /final/i.test(String(c.meta?.state)));

  const getStart = (c: any) => Number(c?.meta?.startTimeEpoch || c?.startTimeEpoch || 0);
  live.sort((a,b)=> getStart(a)-getStart(b));
  upc.sort((a,b)=> getStart(a)-getStart(b));
  fin.sort((a,b)=> getStart(b)-getStart(a));

  const ordered = week !== "" ? [...fin, ...live, ...upc] : [...live, ...upc, ...fin];

  return NextResponse.json(ordered, { headers: { "Cache-Control": "no-store" } });
}
