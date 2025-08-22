// src/app/api/plays/route.ts
import { NCAA_BASE } from "@/lib/config";

export const dynamic = "force-dynamic";

// Very small in-memory cache to reduce upstream pressure during 10s polling.
// Cache key = gameId; TTL = 7s (short because scoring can change quickly).
const mem = new Map<string, { at: number; val: string[] }>();
const TTL = 7_000;

function now() { return Date.now(); }

function labelFor(team: any): string {
  // Try common fields for an abbreviation or short name
  return (
    team?.abbr ?? team?.abbreviation ?? team?.short ?? team?.seo ?? team?.char6 ?? team?.name ?? ""
  );
}

function fmtPlay(teamAbbr: string, description: string) {
  const t = teamAbbr ? `(${teamAbbr})` : "";
  return `${t}${t ? " " : ""}${description}`.trim();
}

async function getJson(path: string) {
  const res = await fetch(`${NCAA_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Fetch ${res.status} ${path}`);
  return res.json();
}

function extractPlaysFromScoringSummary(json: any): string[] {
  const items: any[] = Array.isArray(json?.data) ? json.data
                    : Array.isArray(json?.summary) ? json.summary
                    : Array.isArray(json?.items) ? json.items
                    : [];
  const plays: string[] = [];
  for (const it of items) {
    const desc = it?.description ?? it?.text ?? it?.play ?? it?.summary ?? "";
    if (!desc) continue;
    const abbr = labelFor(it?.team) || labelFor(it?.offense) || labelFor(it?.scoringTeam) || "";
    plays.push(fmtPlay(abbr, desc));
  }
  return plays;
}

// Very permissive scoring detector for play-by-play fallback
const SCORING_RX = /(td|touchdown|field\s?goal|fg\s?good|safety|two-?point|2pt|xp\s?good|pat\s?good|extra\s?point)/i;

function extractPlaysFromPbp(json: any): string[] {
  const periods = Array.isArray(json?.periods) ? json.periods : [];
  const plays: string[] = [];
  for (const per of periods) {
    const arr = Array.isArray(per?.plays) ? per.plays : Array.isArray(per?.events) ? per.events : [];
    for (const p of arr) {
      const txt = p?.text ?? p?.description ?? p?.playText ?? "";
      if (!txt) continue;
      if (!SCORING_RX.test(txt)) continue;
      const abbr = labelFor(p?.team) || labelFor(p?.offense) || "";
      plays.push(fmtPlay(abbr, txt));
    }
  }
  return plays;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const gameId = searchParams.get("gameId");
  if (!gameId) return new Response("gameId is required", { status: 400 });

  // Short-circuit cache
  const hit = mem.get(gameId);
  if (hit && now() - hit.at < TTL) {
    return Response.json(hit.val, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    // Try concise scoring summary first (if available)
    let plays: string[] = [];
    try {
      const summary = await getJson(`/game/${gameId}/scoring-summary`);
      plays = extractPlaysFromScoringSummary(summary);
    } catch {
      // ignore and fall back
    }

    if (!plays.length) {
      const pbp = await getJson(`/game/${gameId}/play-by-play`);
      plays = extractPlaysFromPbp(pbp);
    }

    // Ensure chronological order oldest -> newest so the client can reverse if desired
    // Many endpoints already return chronological; we'll assume they do. If not, sort by best-effort.
    // No reliable timestamps in generic schema, so leave as-is.

    // Cache and return
    mem.set(gameId, { at: now(), val: plays });
    return Response.json(plays, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return new Response(String(e?.message || e), { status: 500 });
  }
}
