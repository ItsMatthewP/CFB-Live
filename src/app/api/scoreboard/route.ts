// src/app/api/scoreboard/route.ts
import { NCAA_BASE } from "@/lib/config";

export const dynamic = "force-dynamic";

type ScoreboardGame = {
  game?: any;
};

async function getJson(path: string) {
  const res = await fetch(`${NCAA_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Fetch ${res.status} ${path}`);
  return res.json();
}

// Heuristic to estimate current football week (CFB ~late Aug start)
function currentApproxWeekUTC(d = new Date()): number {
  const year = d.getUTCFullYear();
  const base = new Date(Date.UTC(year, 7, 24)); // Aug 24 UTC (Week 0-ish)
  // Move base to the Saturday on/after Aug 24
  const dow = base.getUTCDay(); // 0=Sun .. 6=Sat
  const delta = (6 - dow + 7) % 7;
  const firstSat = new Date(base.getTime() + delta * 86400000);
  const diffDays = Math.floor((d.getTime() - firstSat.getTime()) / 86400000);
  const week = Math.floor(diffDays / 7) + 1;
  return Math.max(1, Math.min(22, week));
}

function namesShortLower(g: any): { home: string; away: string } {
  const home = (g?.home?.names?.short ?? g?.homeTeam ?? g?.home?.name ?? "").toString().toLowerCase();
  const away = (g?.away?.names?.short ?? g?.awayTeam ?? g?.away?.name ?? "").toString().toLowerCase();
  return { home, away };
}

function matchesTracked(g: any, trackedSet: Set<string>): boolean {
  const { home, away } = namesShortLower(g);
  return trackedSet.has(home) || trackedSet.has(away);
}

function stateOf(g: any): string {
  return (g?.gameState || g?.state || g?.status || "").toString().toLowerCase();
}

function idOf(g: any): string {
  const url = g?.url || "";
  const m = /\/game\/(\d+)/.exec(url);
  return m ? m[1] : (g?.gameID || g?.id || "").toString();
}

function startEpoch(g: any): number {
  const e = Number(g?.startTimeEpoch ?? g?.start_time_epoch ?? g?.start ?? 0);
  return isFinite(e) ? e : 0;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tracked = (searchParams.get("tracked") || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!tracked.length) {
    return Response.json({ meta: { msg: "No tracked teams" }, games: [] }, { headers: { "Cache-Control": "no-store" } });
  }
  const trackedSet = new Set(tracked.map(s => s.toLowerCase()));

  const d = new Date();
  const year = d.getUTCFullYear();
  const approx = currentApproxWeekUTC(d);

  // Build a short list of weeks to try around the current date for live/upcoming
  const weeksToTry = Array.from(new Set([approx-2, approx-1, approx, approx+1, approx+2].filter(w => w >= 1 && w <= 22)));

  // Fetch those scoreboards in parallel
  const boards: any[] = [];
  await Promise.all(weeksToTry.map(async (w) => {
    try {
      const sb = await getJson(`/scoreboard/football/fbs/${year}/${w}/all-conf`);
      boards.push({ week: w, data: sb });
    } catch {}
  }));

  // Collect matching games
  const live: any[] = [];
  const upcoming: any[] = [];
  for (const b of boards) {
    const arr: ScoreboardGame[] = Array.isArray(b?.data?.games) ? b.data.games : [];
    for (const gobj of arr) {
      const g = gobj?.game ?? gobj;
      if (!g) continue;
      if (!matchesTracked(g, trackedSet)) continue;
      const st = stateOf(g);
      if (/live|in_progress/i.test(st)) live.push(g);
      else if (/pre|scheduled/i.test(st)) upcoming.push(g);
    }
  }

  // For last finished, check some previous weeks if needed
  const finals: any[] = [];
  if (!live.length) {
    for (let w = approx; w >= Math.max(1, approx - 6); w--) {
      try {
        const sb = await getJson(`/scoreboard/football/fbs/${year}/${w}/all-conf`);
        const arr: ScoreboardGame[] = Array.isArray(sb?.games) ? sb.games : [];
        for (const gobj of arr) {
          const g = gobj?.game ?? gobj;
          if (!g) continue;
          if (!matchesTracked(g, trackedSet)) continue;
          const st = stateOf(g);
          if (/final/i.test(st)) finals.push(g);
        }
        if (finals.length) break;
      } catch {}
    }
  }

  // Sorts
  live.sort((a,b) => startEpoch(a) - startEpoch(b));
  upcoming.sort((a,b) => startEpoch(a) - startEpoch(b));
  finals.sort((a,b) => startEpoch(b) - startEpoch(a));

  return Response.json({
    meta: { year, approxWeek: approx },
    games: [...live, ...upcoming, ...finals]
  }, { headers: { "Cache-Control": "no-store" } });
}
