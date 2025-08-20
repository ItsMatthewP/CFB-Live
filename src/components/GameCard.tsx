"use client";

import React from "react";

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

export default function GameCard({ game }: { game: WireGame }) {
  // Build two most-recent play lines (formatted)
  const playLines = React.useMemo<string[]>(() => {
    if (!game?.plays) {
      return [
        "(OSU): Tom Smith 7yd TD Run",
        "(TEX): Jane Doe to John Roe for a 22yd TD Pass",
      ];
    }

    // Case 1: API already sent strings
    if (typeof game.plays[0] === "string") {
      return (game.plays as string[]).slice(-2);
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

        let abbr = homeAbbr; // default to home if we can't tell
        if (game.meta?.homeTeamId && game.meta?.awayTeamId && p.ScoringTeamID != null) {
          abbr =
            p.ScoringTeamID === game.meta.homeTeamId
              ? homeAbbr
              : p.ScoringTeamID === game.meta.awayTeamId
              ? awayAbbr
              : homeAbbr; // unknown id -> home fallback
        }

        return `(${abbr}): ${desc}`;
      })
      .filter((s): s is string => !!s);

    const lastTwo = lines.slice(-2);
    return lastTwo.length
      ? lastTwo
      : [
          "(ABR): Play Description",
          "(ABR): Play Description",
        ];
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

      {/* Recent scoring plays (or placeholders) */}
      <div className="mt-3 text-sm">
        {playLines.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    </div>
  );
}
