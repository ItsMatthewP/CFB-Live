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
  if (!tracked.length) return NextResponse.json([], { headers: { "Cache-Control": "no-store" } });

  // Call our own scoreboard route (same-origin) to keep week logic in one place
  const origin = new URL(request.url).origin;
  const sbRes = await fetch(`${origin}/api/scoreboard?` + new URLSearchParams({ tracked: tracked.join(",") }), { cache: "no-store" });
  if (!sbRes.ok) return NextResponse.json({ error: `Scoreboard error ${sbRes.status}` }, { status: 502 });
  const sb = await sbRes.json();
  const games = Array.isArray(sb?.games) ? sb.games : [];

  // Map to GameCard shape and attach plays
  const out: any[] = [];
  for (const g of games) {
    const id = (() => {
      const m = /\/game\/(\d+)/.exec(g?.url || "");
      return m ? m[1] : (g?.gameID || g?.id || "").toString();
    })();
    if (!id) continue;

    const homeName = g?.home?.names?.short ?? g?.homeTeam ?? g?.home?.name ?? "";
    const awayName = g?.away?.names?.short ?? g?.awayTeam ?? g?.away?.name ?? "";
    const homeScore = g?.home?.score ?? g?.homePoints ?? g?.home_score ?? 0;
    const awayScore = g?.away?.score ?? g?.awayPoints ?? g?.away_score ?? 0;
    const state = g?.gameState ?? g?.state ?? g?.status ?? "";
    const right = statusLabel(g);

    // tracked-on-top
    const trackedSet = new Set(tracked.map(s => s.toLowerCase()));
    const homeIsTracked = trackedSet.has(String(homeName).toLowerCase());
    const top = homeIsTracked ? toSide(homeName, homeScore, right, g?.home?.names?.char6)
                              : toSide(awayName, awayScore, right, g?.away?.names?.char6);
    const bottom = homeIsTracked ? toSide(awayName, awayScore, right, g?.away?.names?.char6)
                                 : toSide(homeName, homeScore, right, g?.home?.names?.char6);

    // Fetch scoring plays
    let plays: string[] = [];
    try {
      const p = await fetch(`${origin}/api/plays?` + new URLSearchParams({ gameId: id }), { cache: "no-store" });
      if (p.ok) plays = await p.json();
    } catch {}

    out.push({
      id: String(id),
      top,
      bottom,
      plays,
      meta: {
        homeChar6: g?.home?.names?.char6,
        awayChar6: g?.away?.names?.char6,
        state: state,
        currentPeriod: g?.currentPeriod ?? g?.period ?? g?.quarter ?? "",
        contestClock: g?.contestClock ?? g?.displayClock ?? g?.time ?? ""
      }
    });
  }

  // order: live first, then upcoming by time, then finals by time desc
  const live = out.filter((c) => /live|in_progress/i.test(String(c.meta?.state)));
  const upc  = out.filter((c) => /pre|scheduled/i.test(String(c.meta?.state)));
  const fin  = out.filter((c) => /final/i.test(String(c.meta?.state)));

  const getStart = (c: any) => Number(
    c?.meta?.startTimeEpoch ||
    c?.startTimeEpoch ||
    0
  );

  live.sort((a,b)=> getStart(a)-getStart(b));
  upc.sort((a,b)=> getStart(a)-getStart(b));
  fin.sort((a,b)=> getStart(b)-getStart(a));

  return NextResponse.json([...live, ...upc, ...fin], { headers: { "Cache-Control": "no-store" } });
}
