import { NCAA_BASE } from "@/lib/config";
import type { Game } from "@/lib/types";

/* ------------------ small helpers ------------------ */

async function getJson(url: string, dbg?: string[]) {
  dbg?.push?.(`GET ${url}`);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text();
    dbg?.push?.(`  -> ${res.status} ${text.slice(0, 160)}`);
    throw new Error(`Fetch ${res.status} ${url}`);
  }
  const data = await res.json();
  dbg?.push?.(`  -> 200 (${Array.isArray(data) ? "array" : typeof data})`);
  return data;
}

function pnum(p: unknown): number | null {
  if (typeof p === "number") return p;
  const m = /(\d+)/.exec(String(p ?? ""));
  return m ? Number(m[1]) : null;
}
function ord(n: number | null) {
  if (!n) return "";
  return ["", "1st", "2nd", "3rd", "4th", "5th", "6th"][n] || `Q${n}`;
}


function readChar6(obj: any): string | undefined {
  return (
    obj?.char6 ??
    obj?.names?.char6 ??
    obj?.team?.char6 ??
    obj?.school?.char6 ??
    undefined
  );
}

/** Convert /scoreboard JSON into our Game[] */
function normalizeScoreboard(raw: any): Game[] {
  const arr = Array.isArray(raw) ? raw : raw?.games || [];
  return arr.map((x: any) => x?.game || x).map((g: any) => {
    const home = g?.home || {};
    const away = g?.away || {};

    // Pull any plausible id; if missing, build a deterministic fallback
    const gid = g?.gameID ?? g?.gameId ?? g?.id ?? null;
    const homeShort = home?.names?.short || home?.names?.full || home?.name || "";
    const awayShort = away?.names?.short || away?.names?.full || away?.name || "";
    const startEpoch = Number(g?.startTimeEpoch || 0);
    const fallback = `${awayShort}@${homeShort}-${startEpoch}`;
    const id = String(gid ?? fallback);

    const period = pnum(g?.currentPeriod ?? g?.period);
    const liveish = /live|q\d|ot/i.test(`${g?.gameState || ""} ${g?.currentPeriod || ""}`);
    const isFinal = /final/i.test(g?.gameState || "");
    const status = isFinal
      ? "Final"
      : (liveish ? `${ord(period)} ${g?.contestClock || ""}`.trim() : "Scheduled");

    const readChar6 = (obj: any) =>
      obj?.char6 ?? obj?.names?.char6 ?? obj?.team?.char6 ?? obj?.school?.char6 ?? "";

    return {
      id,
      homeTeam: homeShort,
      awayTeam: awayShort,
      homeChar6: String(readChar6(home) ?? ""),
      awayChar6: String(readChar6(away) ?? ""),
      homePoints: Number(home?.score ?? 0),
      awayPoints: Number(away?.score ?? 0),
      status,
      period,
      clock: g?.contestClock || "",
      startTimeEpoch: startEpoch,
    };
  });
}



/* ------------------ schedule helpers ------------------ */

/** Read available weeks for a year using README “Schedule” route. */
async function getWeeksForYear(year: number, dbg?: string[]): Promise<number[]> {
  try {
    const sch: any = await getJson(`${NCAA_BASE}/schedule/football/fbs/${year}`, dbg);
    const raw: unknown = (sch && (sch.weeks ?? sch)) ?? [];
    const arr: any[] = Array.isArray(raw) ? raw : [];
    const weeks: number[] = arr
      .map((w: any, i: number) => Number(w?.week ?? w?.id ?? i + 1))
      .filter((n: number) => Number.isFinite(n));
    const uniqSorted: number[] = Array.from(new Set(weeks)).sort((a, b) => a - b);
    if (uniqSorted.length) return uniqSorted;
  } catch {
    /* fallthrough to fallback */
  }
  // Fallback coverage including bowls/CFP
  return Array.from({ length: 27 }, (_, i) => i + 1);
}

function scoresUrl(year: number, week: number) {
  // README “Scores”: /scoreboard/football/fbs/{YEAR}/{WEEK}/all-conf
  return `${NCAA_BASE}/scoreboard/football/fbs/${year}/${week}/all-conf`;
}

/* ------------------ core logic (char6-only matching) ------------------ */

function parseTrackedCodes(csv: string): string[] {
  return csv
    .split(",")
    .map((s) => s.trim().toUpperCase().slice(0, 6))
    .filter(Boolean);
}

function filterByChar6(games: Game[], codes: string[]) {
  if (!codes.length) return games;
  const set = new Set(codes);
  return games.filter(
    (g) =>
      (g.homeChar6 && set.has(g.homeChar6.toUpperCase())) ||
      (g.awayChar6 && set.has(g.awayChar6.toUpperCase()))
  );
}

async function fetchWeek(year: number, week: number, dbg?: string[]): Promise<Game[]> {
  const raw = await getJson(scoresUrl(year, week), dbg);
  return normalizeScoreboard(raw);
}

async function findLiveForCodes(codes: string[], year: number, dbg?: string[]) {
  const weeks = await getWeeksForYear(year, dbg);
  // Probe the last few current weeks quickly
  const probe = weeks.slice(-6).reverse();
  for (const w of probe) {
    try {
      const weekGames = await fetchWeek(year, w, dbg);
      const filtered = filterByChar6(weekGames, codes);
      const live = filtered.filter((g) => /1st|2nd|3rd|4th|OT/i.test(g.status));
      if (live.length) return { games: live, meta: { mode: "live", year, week: w } };
    } catch {
      /* keep scanning */
    }
  }
  return { games: [], meta: { mode: "no-live" } };
}

async function lastFinishedPerCode(codes: string[], year: number, dbg?: string[]) {
  const years = [year, year - 1];
  const found = new Map<string, Game>();

  for (const y of years) {
    const weeks = await getWeeksForYear(y, dbg);
    const desc = [...weeks].sort((a, b) => b - a);

    for (const w of desc) {
      let games: Game[] = [];
      try {
        games = await fetchWeek(y, w, dbg);
      } catch {
        continue;
      }

      const matches = filterByChar6(games, codes);
      // Per code, pick latest in this week; prefer Finals
      const byCode = new Map<string, Game>();
      for (const g of matches) {
        const involved = [g.homeChar6?.toUpperCase(), g.awayChar6?.toUpperCase()].filter(Boolean) as string[];
        for (const c of involved) {
          if (!codes.includes(c)) continue;
          const cur = byCode.get(c);
          if (!cur) byCode.set(c, g);
          else if ((g.status === "Final" && cur.status !== "Final") || g.startTimeEpoch > cur.startTimeEpoch) {
            byCode.set(c, g);
          }
        }
      }
      for (const c of codes) {
        if (!found.has(c) && byCode.has(c)) found.set(c, byCode.get(c)!);
      }
      if (found.size === codes.length) break;
    }
    if (found.size === codes.length) break;
  }

  // De-dupe (two tracked codes might be in the same game)
  const seen = new Set<string>();
  const list = Array.from(found.values()).filter((g) => {
    const id = String(g.id || "");
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  return { games: list, meta: { mode: "last-finished-per-team" } };
}

/* ------------------ route handler ------------------ */

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const teamsCsv = (searchParams.get("teams") || "").trim();   // now expected as char6, e.g. "TENNES,OHIOST"
  const debug = searchParams.get("debug") === "1";
  const dbg: string[] = [];

  const codes = parseTrackedCodes(teamsCsv);
  if (!codes.length) {
    return Response.json({ games: [], meta: { mode: "no-teams", debug: debug ? dbg : undefined } });
  }

  const year = new Date().getUTCFullYear();

  // 1) live-first
  const live = await findLiveForCodes(codes, year, debug ? dbg : undefined);
  if (live.games.length) {
    return Response.json({ ...live, meta: { ...live.meta, debug: debug ? dbg : undefined } });
  }

  // 2) last finished per tracked code
  const last = await lastFinishedPerCode(codes, year, debug ? dbg : undefined);
  return Response.json({ ...last, meta: { ...last.meta, debug: debug ? dbg : undefined } });
}
