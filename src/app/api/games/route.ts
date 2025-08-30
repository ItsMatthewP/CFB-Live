// src/app/api/games/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Server-only base (no trailing slash)
const BASE = (process.env.NCAA_API_BASE || "https://ncaa-api.henrygd.me").replace(/\/+$/, "");

/* ------------------------------ small utils ------------------------------ */
const bust = () => `&_=${Date.now()}`;

function toSide(name: string, score: any, right: string, abbr?: string) {
  return { name, score: Number(score ?? 0), right, abbr };
}

function normState(s: any) {
  return String(s || "").toLowerCase();
}

function normalizePeriod(p: any): number | "OT" | "" {
  if (!p && p !== 0) return "";
  if (typeof p === "number" && Number.isFinite(p)) return p;
  const s = String(p).trim().toUpperCase();
  if (s.includes("OT")) return "OT";
  if (s === "1" || /1ST/.test(s)) return 1;
  if (s === "2" || /2ND/.test(s)) return 2;
  if (s === "3" || /3RD/.test(s)) return 3;
  if (s === "4" || /4TH/.test(s)) return 4;
  return "";
}

function formatStatusFromGame(currentPeriod: any, clock: any, stateLike: any) {
  const st = normState(stateLike);
  if (/final/.test(st) || st === "f") return "Final";
  const p = normalizePeriod(currentPeriod);
  const c = typeof clock === "string" ? clock : "";
  if (p === "OT") return `OT ${c}`.trim();
  if (p) return `Q${p} ${c}`.trim();
  if (/live|in_progress|i/.test(st)) return c ? c : "Live";
  if (/pre|scheduled|s/.test(st)) return "Scheduled";
  return c || "Live";
}

/* ------------------------------ fetch /game/{id} ------------------------------ */
type GameDetails = {
  homeName: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
  period: number | "OT" | "";
  clock: string;
  state: string; // raw
  startTimeEpoch?: number;
  homeChar6?: string;
  awayChar6?: string;
};

async function fetchGameDetails(id: string): Promise<GameDetails | null> {
  try {
    const res = await fetch(`${BASE}/game/${id}?${bust()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data: any = await res.json();
    const c = Array.isArray(data?.contests) ? data.contests[0] : null;
    if (!c) return null;

    // Teams array gives both sides and scores
    const teams = Array.isArray(c?.teams) ? c.teams : [];
    const home = teams.find((t: any) => t?.isHome) || teams[0] || {};
    const away = teams.find((t: any) => t?.isHome === false) || teams[1] || {};

    const homeName = String(home?.nameShort ?? home?.nameFull ?? "HOME");
    const awayName = String(away?.nameShort ?? away?.nameFull ?? "AWAY");

    const homeScore = Number(home?.score ?? 0);
    const awayScore = Number(away?.score ?? 0);

    const period = normalizePeriod(c?.currentPeriod);
    const clock = String(c?.clock ?? "");
    const state =
      c?.statusCodeDisplay || c?.gameState || c?.finalMessage || "";

    return {
      homeName,
      awayName,
      homeScore,
      awayScore,
      period,
      clock,
      state,
      startTimeEpoch: Number(c?.startTimeEpoch || 0) || undefined,
      homeChar6: home?.name6Char,
      awayChar6: away?.name6Char,
    };
  } catch {
    return null;
  }
}

/* -------------------------------- handler -------------------------------- */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const trackedCsv = searchParams.get("tracked") || "";
  const tracked = trackedCsv.split(",").map(s => s.trim()).filter(Boolean);
  if (!tracked.length) return NextResponse.json([], { headers: { "Cache-Control": "no-store" } });

  // optional week/year passthrough to your scoreboard
  const week = (searchParams.get("week") || "").trim();
  const year = (searchParams.get("year") || "2025").trim();

  // 1) get games (and IDs) from your existing scoreboard route
  const origin = new URL(request.url).origin;
  const sbParams = new URLSearchParams({ tracked: tracked.join(",") });
  if (week) sbParams.set("week", week);
  if (year) sbParams.set("year", year);

  const sbRes = await fetch(`${origin}/api/scoreboard?${sbParams.toString()}&${bust()}`, {
    cache: "no-store",
  });
  if (!sbRes.ok) {
    return NextResponse.json({ error: `Scoreboard error ${sbRes.status}` }, { status: 502 });
  }
  const sb = await sbRes.json();
  const games = Array.isArray(sb?.games) ? sb.games : [];

  // 2) for each game, use /game/{id} for scores + period/clock + names
  const out: any[] = [];
  const trackedSet = new Set(tracked.map((s) => s.toLowerCase()));

  for (const g of games) {
    const id = (() => {
      const m = /\/game\/(\d+)/.exec(g?.url || "");
      return m ? m[1] : (g?.gameID || g?.id || "").toString();
    })();
    if (!id) continue;

    const det = await fetchGameDetails(id);
    if (!det) continue;

    const right = formatStatusFromGame(det.period, det.clock, det.state);
    const homeIsTracked = trackedSet.has(det.homeName.toLowerCase());

    const top = homeIsTracked
      ? toSide(det.homeName, det.homeScore, right, det.homeChar6)
      : toSide(det.awayName, det.awayScore, right, det.awayChar6);

    const bottom = homeIsTracked
      ? toSide(det.awayName, det.awayScore, right, det.awayChar6)
      : toSide(det.homeName, det.homeScore, right, det.homeChar6);

    // 3) plays still come from your plays route (scoring-summary)
    let plays: string[] = [];
    try {
      const p = await fetch(`${origin}/api/plays?` + new URLSearchParams({ gameId: id }) + `&${bust()}`, { cache: "no-store" });
      if (p.ok) plays = await p.json();
    } catch {}

    out.push({
      id: String(id),
      top,
      bottom,
      plays,
      meta: {
        homeChar6: det.homeChar6,
        awayChar6: det.awayChar6,
        state: det.state,
        currentPeriod: det.period,
        contestClock: det.clock,
        startTimeEpoch: det.startTimeEpoch ?? 0,
      },
    });
  }

  // 4) ordering — if week provided, show finals first; else live first
  const live = out.filter((c) => /live|in_progress|^i$/.test(String(c.meta?.state).toLowerCase()));
  const upc  = out.filter((c) => /pre|scheduled|^s$/.test(String(c.meta?.state).toLowerCase()));
  const fin  = out.filter((c) => /final|^f$/.test(String(c.meta?.state).toLowerCase()));

  const getStart = (c: any) => Number(c?.meta?.startTimeEpoch || c?.startTimeEpoch || 0);
  live.sort((a,b)=> getStart(a)-getStart(b));
  upc.sort((a,b)=> getStart(a)-getStart(b));
  fin.sort((a,b)=> getStart(b)-getStart(a));

  const weekProvided = week !== "";
  const ordered = weekProvided ? [...fin, ...live, ...upc] : [...live, ...upc, ...fin];

  return NextResponse.json(ordered, { headers: { "Cache-Control": "no-store" } });
}
