// src/components/GameCard.tsx
"use client";

type Side = { name: string; abbr?: string; score: number; right: string };
export type Game = {
  id: string;
  top: Side;
  bottom: Side;
  plays: string[];
  meta?: { homeChar6?: string; awayChar6?: string; state?: string; currentPeriod?: string; contestClock?: string };
};

const MAX_PLAYS = 5;

export default function GameCard({ game, trackedTeams }: { game: Game; trackedTeams: string[] }) {
  const trackedSet = new Set(trackedTeams.map((t) => t.toLowerCase()));
  const isTopTracked = trackedSet.has(game.top.name.toLowerCase());

  // Show newest at the TOP: take the last MAX_PLAYS and reverse for display
  const lines = (game.plays?.length ? game.plays : [
    // placeholders if missing
    "(OSU): Tom Smith 7yd TD Run",
    "(TEX): Jane Doe to John Roe for a 22yd TD Pass",
    "(OSU): Tom Smith 7yd TD Run",
    "(TEX): Jane Doe to John Roe for a 22yd TD Pass",
    "(OSU): Tom Smith 7yd TD Run"
  ]).slice(-MAX_PLAYS).reverse();

  return (
    <article className="card">
      {/* Top line (tracked team is forced to top by API) */}
      <h2 className="game-title" style={{ fontSize: isTopTracked ? 30 : 28 }}>
        <strong>{game.top.name}</strong> <span>{game.top.score}</span>
      </h2>

      {/* Bottom line + status */}
      <p className="game-sub">
        <span style={{ fontWeight: 800 }}>{game.bottom.name}</span> <span>{game.bottom.score}</span>{"  "}
        <span className="game-status">{game.bottom.right}</span>
      </p>

      {/* Scoring plays */}
      <div className="plays">
        {lines.map((t, i) => (
          <div key={i}>{t}</div>
        ))}
      </div>
    </article>
  );
}
