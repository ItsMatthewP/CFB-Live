// src/app/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import GameCard, { Game } from "@/components/GameCard";

/* Persist tracked teams for the session (until tab closes) */
const KEY = "cfb_tracked_csv";
const getSession = (k: string, fb: string) =>
  typeof window === "undefined" ? fb : sessionStorage.getItem(k) ?? fb;
const setSession = (k: string, v: string) => {
  if (typeof window !== "undefined") sessionStorage.setItem(k, v);
};

export default function Page() {
  const [trackedCsv, setTrackedCsv] = useState<string>(() => getSession(KEY, ""));
  const [input, setInput] = useState("");

  const trackedList = useMemo(
    () => trackedCsv.split(",").map((s) => s.trim()).filter(Boolean),
    [trackedCsv]
  );

  useEffect(() => setSession(KEY, trackedCsv), [trackedCsv]);

  const [games, setGames] = useState<Game[]>([]);
  const [loadingTeams, setLoadingTeams] = useState<Set<string>>(new Set());

  const fetchGames = useCallback(async () => {
    if (!trackedList.length) {
      setGames([]);
      return;
    }

    setLoadingTeams(new Set(trackedList));

    const qs = new URLSearchParams({ tracked: trackedList.join(",") }).toString();
    try {
      const res = await fetch(`/api/games?${qs}`, { cache: "no-store" });
      const data: Game[] = await res.json();
      if (Array.isArray(data)) setGames(data);
    } catch {
      // keep old cards if fetch fails
    } finally {
      setLoadingTeams(new Set());
    }
  }, [trackedList]);

  // initial + every 10s
  useEffect(() => {
    fetchGames();
    const id = setInterval(fetchGames, 10_000);
    return () => clearInterval(id);
  }, [fetchGames]);

  // interactions
  const addTeam = useCallback(() => {
    const parts = input.split(",").map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    const existing = new Set(trackedList.map((t) => t.toLowerCase()));
    const merged: string[] = [...trackedList];
    for (const p of parts) {
      if (!existing.has(p.toLowerCase())) merged.push(p);
    }
    setTrackedCsv(merged.join(", "));
    setInput(""); // clear input after Enter/Add
  }, [input, trackedList]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") addTeam();
  };

  const removeTeam = (name: string) => {
    const next = trackedList.filter((t) => t.toLowerCase() !== name.toLowerCase());
    setTrackedCsv(next.join(", "));
  };

  return (
    <div className="space-y">
      {/* Controls */}
      <section className="card controls" aria-label="controls">
        <label className="label">Teams to track - comma separated</label>
        <div className="row">
          <input
            className="textbox"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <button className="btn" onClick={addTeam}>Add</button>
        </div>

        <div className="chips">
          {trackedList.map((t) => (
            <span className="chip" key={t}>
              {t}
              <button className="x" onClick={() => removeTeam(t)}>×</button>
            </span>
          ))}
        </div>
      </section>

      {/* Games */}
      <section className="grid">
        {trackedList.length === 0 ? (
          <div className="card">No teams tracked</div>
        ) : (
          trackedList.map((team) => {
            const teamLc = team.toLowerCase();
            // find first game whose top/bottom matches this team
            const game = games.find((g) =>
              g?.top?.name?.toLowerCase() === teamLc || g?.bottom?.name?.toLowerCase() === teamLc
            );

            if (loadingTeams.has(team) && !game) {
              // Skeleton / placeholder card for initial load
              return (
                <div className="card" key={team}>
                  <h3>{team}</h3>
                  <p>Loading stats…</p>
                </div>
              );
            }

            if (game) {
              return <GameCard key={game.id} game={game} trackedTeams={trackedList} />;
            }

            return (
              <div className="card" key={team}>
                <h3>{team}</h3>
                <p>No live or upcoming games found.</p>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
