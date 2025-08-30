"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import GameCard, { Game } from "@/components/GameCard";

/* Persist tracked teams for the session (until tab closes) */
const TEAMS_KEY = "cfb_tracked_csv";
const WEEK_KEY  = "cfb_week";
const YEAR_KEY  = "cfb_year";

const getSession = (k: string, fb: string) =>
  typeof window === "undefined" ? fb : sessionStorage.getItem(k) ?? fb;
const setSession = (k: string, v: string) => {
  if (typeof window !== "undefined") sessionStorage.setItem(k, v);
};

export default function Page() {
  const [trackedCsv, setTrackedCsv] = useState<string>(() => getSession(TEAMS_KEY, ""));
  const [input, setInput] = useState("");
  const [week, setWeek] = useState<string>(() => getSession(WEEK_KEY, ""));
  const [year, setYear] = useState<string>(() => getSession(YEAR_KEY, "2025"));

  const trackedList = useMemo(
    () => trackedCsv.split(",").map((s) => s.trim()).filter(Boolean),
    [trackedCsv]
  );

  useEffect(() => setSession(TEAMS_KEY, trackedCsv), [trackedCsv]);
  useEffect(() => setSession(WEEK_KEY, week), [week]);
  useEffect(() => setSession(YEAR_KEY, year), [year]);

  const [games, setGames] = useState<Game[]>([]);
  const [loadingTeams, setLoadingTeams] = useState<Set<string>>(new Set());

  const fetchGames = useCallback(async () => {
    if (!trackedList.length) {
      setGames([]);
      return;
    }

    setLoadingTeams(new Set(trackedList));

    const qs = new URLSearchParams({ tracked: trackedList.join(",") });
    if (week) qs.set("week", week);
    if (year) qs.set("year", year);

    try {
      const res = await fetch(`/api/games?${qs.toString()}`, { cache: "no-store" });
      const data: Game[] = await res.json();
      if (Array.isArray(data)) setGames(data);
    } catch {
      // leave current cards in place on failure
    } finally {
      setLoadingTeams(new Set());
    }
  }, [trackedList, week, year]);

  // initial + every 10s
  useEffect(() => {
    fetchGames();
    const id = setInterval(fetchGames, 5_000);
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
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <input
            className="textbox"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder='e.g. "Tennessee, Michigan"'
            style={{ minWidth: 260 }}
          />

        {/* NEW: Week + Year inputs */}
          <input
            className="textbox"
            value={week}
            onChange={(e) => setWeek(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
            placeholder="Week (1-16)"
            title="College football week number"
            style={{ width: 120 }}
          />
          <input
            className="textbox"
            value={year}
            onChange={(e) => setYear(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
            placeholder="Year (e.g., 2025)"
            title="Season year"
            style={{ width: 140 }}
          />

          <button className="btn" onClick={addTeam}>Add</button>
          <button className="btn" onClick={fetchGames}>Refresh</button>
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
            const game = games.find(
              (g) =>
                g.top?.name?.toLowerCase() === team.toLowerCase() ||
                g.bottom?.name?.toLowerCase() === team.toLowerCase()
            );

            if (loadingTeams.has(team) && !game) {
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
