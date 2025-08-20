// src/app/api/games/route.ts
import { NextResponse } from "next/server";
import teams from "@/data/teams.json";

export const dynamic = "force-dynamic";

const API_KEY = process.env.SPORTSDATA_API_KEY!;
const BASE_SCORES = "https://api.sportsdata.io/v3/cfb/scores/json";
const BASE_STATS  = "https://api.sportsdata.io/v3/cfb/stats/json";

type TeamRow = { TeamID: number; School: string; Abbreviation?: string };
const ALL = (teams as TeamRow[]).filter(t => !!t.School);
const SCHOOL_TO_ROW = new Map(ALL.map(t => [t.School.trim().toLowerCase(), t]));
const ID_TO_ROW = new Map(ALL.map(t => [t.TeamID, t]));

function targetDateISO(): string {
  const now = new Date();
  const min = new Date("2025-08-30T00:00:00");
  const use = now < min ? min : now;
  const y = use.getFullYear(), m = String(use.getMonth()+1).padStart(2,"0"), d = String(use.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}
function pad2(v: unknown) { const n = Number.isFinite(Number(v)) ? Number(v) : 0; return String(n).padStart(2,"0"); }
function ordinal(n: number){ if(n===1) return "1st"; if(n===2) return "2nd"; if(n===3) return "3rd"; return `${n}th`; }
function formatPeriodClockFromRow(row: any): string {
  const periodRaw = row?.Quarter ?? row?.Period ?? row?.CurrentQuarter ?? null;
  const mm = row?.TimeRemainingMinutes ?? row?.Minutes ?? null;
  const ss = row?.TimeRemainingSeconds ?? row?.Seconds ?? null;
  const status = String(row?.Status || "").toUpperCase();
  const label = String(periodRaw ?? "").toUpperCase();
  if (label === "F" || label === "F/OT" || status === "FINAL") return "Final";
  if (label === "HALF" || label === "HALFTIME") return "Halftime";
  if (label === "OT" || label === "OVERTIME") return (mm!=null||ss!=null)?`OT ${pad2(mm)}:${pad2(ss)}`:"OT";
  const q = Number(label || periodRaw);
  if (Number.isFinite(q) && q>=1) return `${ordinal(q)} ${pad2(mm)}:${pad2(ss)}`;
  if (mm!=null||ss!=null) return `${pad2(mm)}:${pad2(ss)}`;
  return row?.Status || "Scheduled";
}

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

function isInProgress(row: any): boolean {
  const status = String(row?.Status || "").toLowerCase();
  const period = row?.Quarter ?? row?.Period ?? row?.CurrentQuarter;
  return status.includes("progress") || Number(period) >= 1 || String(period).toUpperCase()==="OT";
}

export async function GET(req: Request) {
  if (!API_KEY) return NextResponse.json({ error: "SPORTSDATA_API_KEY missing" }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const trackedCsv = (searchParams.get("tracked") || "").trim();
  if (!trackedCsv) return NextResponse.json([]);

  // exact School -> TeamID
  const wantedIds = trackedCsv
    .split(",").map(s => s.trim()).filter(Boolean)
    .map(s => SCHOOL_TO_ROW.get(s.toLowerCase())?.TeamID)
    .filter((id): id is number => typeof id === "number");

  if (!wantedIds.length) return NextResponse.json([]);

  // 1) ScoresBasic by date
  const date = targetDateISO();
  const scoresUrl = `${BASE_SCORES}/ScoresBasic/${encodeURIComponent(date)}?key=${encodeURIComponent(API_KEY)}`;
  const all = await fetchJson(scoresUrl);

  // 2) Only games that include a tracked TeamID
  const filtered = (Array.isArray(all) ? all : []).filter((g: any) => {
    const h = g.HomeTeamID ?? g.HomeTeamId;
    const a = g.AwayTeamID ?? g.AwayTeamId;
    return wantedIds.includes(h) || wantedIds.includes(a);
  });

  // 3) For in-progress games, fetch ScoringPlays(last 5)
  const enriched = await Promise.all(filtered.map(async (row: any) => {
    const homeId = row.HomeTeamID ?? row.HomeTeamId;
    const awayId = row.AwayTeamID ?? row.AwayTeamId;
    const homeName = row.HomeTeamName || row.HomeTeamFullName || row.HomeTeam || row.HomeTeamKey || "Home";
    const awayName = row.AwayTeamName || row.AwayTeamFullName || row.AwayTeam || row.AwayTeamKey || "Away";
    const homeAbbr = (row.HomeTeam ?? row.HomeAbbreviation ?? "").toString().toUpperCase()
      || (ID_TO_ROW.get(homeId)?.Abbreviation ?? "");
    const awayAbbr = (row.AwayTeam ?? row.AwayAbbreviation ?? "").toString().toUpperCase()
      || (ID_TO_ROW.get(awayId)?.Abbreviation ?? "");

    let plays: Array<{ ScoringTeamID?: number | null; Description?: string | null }> = [];
    if (isInProgress(row)) {
      const gameId = row.GameID ?? row.ScoreID ?? row.GlobalGameID;
      if (gameId != null) {
        const spUrl = `${BASE_STATS}/ScoringPlays/${encodeURIComponent(gameId)}?key=${encodeURIComponent(API_KEY)}`;
        try {
          const sp = await fetchJson(spUrl);
          const arr = Array.isArray(sp) ? sp : [];
          plays = arr.slice(-5); // last 5 plays; GameCard formats them
        } catch {
          // ignore play fetch errors; leave plays empty
        }
      }
    }

    return {
      id: String(row.GameID ?? row.ScoreID ?? row.GlobalGameID ?? `${homeName}@${awayName}-${row.DateTime || ""}`),
      top:   { name: homeName,   abbr: homeAbbr,   score: Number(row.HomeTeamScore ?? row.HomeScore ?? 0) },
      bottom:{ name: awayName,   abbr: awayAbbr,   score: Number(row.AwayTeamScore ?? row.AwayScore ?? 0), right: formatPeriodClockFromRow(row) },
      plays,
      meta: { homeTeamId: homeId, awayTeamId: awayId },
    };
  }));

  enriched.sort((a, b) => a.id.localeCompare(b.id));
  return NextResponse.json(enriched, { headers: { "Cache-Control": "no-store" } });
}
