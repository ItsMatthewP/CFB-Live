import { NextResponse } from "next/server";
import teams from "@/data/teams.json";

export const dynamic = "force-dynamic";

/** ---------- CONFIG ---------- */
const API_KEY = process.env.SPORTSDATA_API_KEY!;
const BASE = "https://api.sportsdata.io/v3/cfb/scores/json";
/** ---------------------------- */

/** Types from your teams.json (trimmed to what we use) */
type TeamRow = {
  TeamID: number;
  School: string;            // exact match only
  ShortDisplayName?: string; // not used for matching
  Key?: string;              // not used for matching
  // SportsDataIO also exposes team abbreviations via the Scores endpoints (HomeTeam/AwayTeam),
  // but we build an ID->abbr map here too in case you want to cross-check later.
  // If your teams.json includes an Abbreviation field, you can add it here.
  Abbreviation?: string;
};

/** Build fast lookup maps from teams.json */
const ALL_TEAMS = (teams as TeamRow[]).filter(t => !!t?.School);
const SCHOOL_TO_ROW = new Map(
  ALL_TEAMS.map(t => [t.School.trim().toLowerCase(), t])
);
const ID_TO_ROW = new Map(
  ALL_TEAMS.map(t => [t.TeamID, t])
);

/** Target date: today, unless today < 2025-08-30, then use 2025-08-30 */
function targetDateISO(): string {
  const now = new Date();
  const min = new Date("2025-08-30T00:00:00");
  const use = now < min ? min : now;
  const y = use.getFullYear();
  const m = String(use.getMonth() + 1).padStart(2, "0");
  const d = String(use.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** mm/ss helpers + display logic */
function pad2(v: unknown) {
  const n = Number.isFinite(Number(v)) ? Number(v) : 0;
  return String(n).padStart(2, "0");
}
function ordinal(n: number) {
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
}
/** Period/Quarter + mm:ss → "2nd 05:00", "OT 03:13", "Halftime", "Final", or "Scheduled" */
function formatPeriodClockFromRow(row: any): string {
  const periodRaw = row?.Quarter ?? row?.Period ?? row?.CurrentQuarter ?? null;
  const mm = row?.TimeRemainingMinutes ?? row?.Minutes ?? null;
  const ss = row?.TimeRemainingSeconds ?? row?.Seconds ?? null;
  const status = String(row?.Status || "").toUpperCase();

  const label = String(periodRaw ?? "").toUpperCase();
  if (label === "F" || label === "F/OT" || status === "FINAL") return "Final";
  if (label === "HALF" || label === "HALFTIME") return "Halftime";
  if (label === "OT" || label === "OVERTIME") {
    return (mm != null || ss != null) ? `OT ${pad2(mm)}:${pad2(ss)}` : "OT";
  }
  const q = Number(label || periodRaw);
  if (Number.isFinite(q) && q >= 1) return `${ordinal(q)} ${pad2(mm)}:${pad2(ss)}`;
  if (mm != null || ss != null) return `${pad2(mm)}:${pad2(ss)}`;
  return row?.Status || "Scheduled";
}

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

export async function GET(req: Request) {
  if (!API_KEY) {
    return NextResponse.json({ error: "SPORTSDATA_API_KEY missing" }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const trackedCsv = (searchParams.get("tracked") || "").trim();
  if (!trackedCsv) return NextResponse.json([]);

  // Exact School → TeamID (no fuzzy matching)
  const wantedIds = trackedCsv
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => SCHOOL_TO_ROW.get(s.toLowerCase())?.TeamID)
    .filter((id): id is number => typeof id === "number");

  if (!wantedIds.length) return NextResponse.json([]);

  // ScoresBasic for chosen date (today or 2025-08-30)
  const date = targetDateISO();
  const url = `${BASE}/ScoresBasic/${encodeURIComponent(date)}?key=${encodeURIComponent(API_KEY)}`;
  const all = await fetchJson(url);

  // Filter to games that include one of the wanted TeamIDs
  const filtered = (Array.isArray(all) ? all : []).filter((g: any) => {
    const h = g.HomeTeamID ?? g.HomeTeamId;
    const a = g.AwayTeamID ?? g.AwayTeamId;
    return wantedIds.includes(h) || wantedIds.includes(a);
  });

  // Normalize to the UI shape and include ABBR on both teams
  const out = filtered.map((row: any) => {
    // Names (full) — fallbacks vary by feed
    const homeName =
      row.HomeTeamName || row.HomeTeamFullName || row.HomeTeam || row.HomeTeamKey || "Home";
    const awayName =
      row.AwayTeamName || row.AwayTeamFullName || row.AwayTeam || row.AwayTeamKey || "Away";

    // Abbreviations — SportsDataIO commonly supplies HomeTeam / AwayTeam as abbrev codes.
    // If not present, try teams.json by TeamID.
    const homeAbbr =
      (row.HomeTeam ?? row.HomeAbbreviation ?? "").toString().toUpperCase() ||
      (ID_TO_ROW.get(row.HomeTeamID ?? row.HomeTeamId)?.Abbreviation ?? "");
    const awayAbbr =
      (row.AwayTeam ?? row.AwayAbbreviation ?? "").toString().toUpperCase() ||
      (ID_TO_ROW.get(row.AwayTeamID ?? row.AwayTeamId)?.Abbreviation ?? "");

    return {
      id: String(
        row.GameID ?? row.ScoreID ?? row.GlobalGameID ?? `${homeName}@${awayName}-${row.DateTime || ""}`
      ),
      top: {
        name: homeName,
        abbr: homeAbbr,
        score: Number(row.HomeTeamScore ?? row.HomeScore ?? 0),
      },
      bottom: {
        name: awayName,
        abbr: awayAbbr,
        score: Number(row.AwayTeamScore ?? row.AwayScore ?? 0),
        right: formatPeriodClockFromRow(row),
      },
      // ScoresBasic does not include PBP; leave empty (your UI shows placeholders)
      plays: [] as string[],
      meta: {
        homeTeamId: row.HomeTeamID ?? row.HomeTeamId,
        awayTeamId: row.AwayTeamID ?? row.AwayTeamId,
      },
    };
  });

  // Optional: keep stable ordering
  out.sort((a, b) => a.id.localeCompare(b.id));

  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}
