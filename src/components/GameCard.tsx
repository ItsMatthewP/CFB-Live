"use client";

import React from "react";

/** Number of recent scoring plays to display per card */
const MAX_PLAYS = 5;

/** Shape returned by /api/games */
export type WireGame = {
  id: string;
  top: { name: string; abbr?: string; score: number };
  bottom: { name: string; abbr?: string; score: number; right: string };
  // Either already-formatted strings OR raw SportsDataIO scoring plays
  plays:
    | string[]
    | Array<{
        ScoringTeamID?: number | null;
        Description?: string | null;
      }>;
  meta?: {
    homeTeamId?: number;
    awayTeamId?: number;
  };
};

function fallbackAbbr(name: string | undefined) {
  if (!name) return "TEAM";
  return name
    .replace(/\./g, "")
    .split(/\s+/)
    .map((w) => w[0] || "")
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

/** Build placeholder lines in the requested format when no real plays exist */
function placeholderLines(): string[] {
  return [
    "(OSU): Tom Smith 7yd TD Run",
    "(TEX): Jane Doe to John Roe for a 22yd TD Pass",
    "(ALA): K. Parker 35yd FG",
    "(FSU): D. Hill 4yd TD Run",
    "(UGA): J. Beck to B. Bowers 18yd TD Pass",
  ].slice(0, MAX_PLAYS);
}

export default function GameCard({ game }: { game: WireGame }) {
  // Build up to MAX_PLAYS most-recent play lines (formatted)
  const playLines = React.useMemo<string[]>(() => {
    if (!game?.plays) return placeholderLines();

    // Case 1: API already sent formatted strings
    if (typeof game.plays[0] === "string") {
      const lines = (game.plays as string[]).filter(Boolean);
      return lines.length ? lines.slice(-MAX_PLAYS) : placeholderLines();
    }

    // Case 2: raw ScoringPlays from SportsDataIO
    const raw = game.plays as Array<{
      ScoringTeamID?: number | null;
      Description?: string | null;
    }>;

    const homeAbbr = game.top.abbr || fallbackAbbr(game.top.name);
    const awayAbbr = game.bottom.abbr || fallbackAbbr(game.bottom.name);

    const lines = raw
      .map((p) => {
        const desc = (p.Description || "").trim();
        if (!desc) return null;

        let abbr = homeAbbr; // default if unknown
        if (game.meta?.homeTeamId && game.meta?.awayTeamId && p.ScoringTeamID != null) {
          abbr =
            p.ScoringTeamID === game.meta.homeTeamId
              ? homeAbbr
              : p.ScoringTeamID === game.meta.awayTeamId
              ? awayAbbr
              : homeAbbr; // fallback if id doesn't match either
        }

        return `(${abbr}): ${desc}`;
      })
      .filter((s): s is string => !!s);

    return lines.length ? lines.slice(-MAX_PLAYS) : placeholderLines();
  }, [game]);

  return (
    <div className="card p-4 whitespace-pre-line leading-relaxed">
      {/* Score header (two lines) */}
      <div className="text-lg font-semibold">
        {game.top.name} {game.top.score}
      </div>
      <div className="text-lg">
        {game.bottom.name} {game.bottom.score}
        {game.bottom.right ? <span className="ml-2">{game.bottom.right}</span> : null}
      </div>

      {/* Recent scoring plays (up to MAX_PLAYS) */}
      <div className="mt-3 text-sm">
        {playLines.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    </div>
  );
}
