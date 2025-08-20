"use client";

import { useEffect, useState } from "react";

/** The server returns an ARRAY of these (not { games: [...] }) */
type WireGame = {
  id: string;
  top: { name: string; score: number };
  bottom: { name: string; score: number; right: string }; // e.g., "2nd quarter with 5:00 left"
  plays: string[]; // already formatted as "(TEAM): text"; may be []
};

function useLocalStorage(key: string, initial: string) {
  const [v, setV] = useState<string>(() =>
    typeof window === "undefined" ? initial : localStorage.getItem(key) ?? initial
  );
  useEffect(() => { localStorage.setItem(key, v); }, [key, v]);
  return [v, setV] as const;
}

export default function Page() {
  const [trackedCsv, setTrackedCsv] = useLocalStorage("cfb_tracked", "Tennessee");
  const [games, setGames] = useState<WireGame[]>([]);
  const [debug, setDebug] = useState<string | null>(null);

  async function load() {
    try {
      // IMPORTANT: use ?tracked=  (not ?teams=)
      const url = `/api/games?tracked=${encodeURIComponent(trackedCsv)}`;
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json();

      // The route returns an ARRAY. Do NOT read data.games.
      const list: WireGame[] = Array.isArray(data) ? data : [];

      // Keep old data if empty to avoid flicker
      setGames(prev => (list.length ? list : prev));

      // Optional: debug snippet (first item)
      setDebug(
        list.length
          ? `${list[0].top.name} vs ${list[0].bottom.name} • ${list[0].bottom.right}`
          : "no items"
      );
    } catch (e: any) {
      // Keep last good data; show a brief debug hint
      setDebug(String(e?.message || e));
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackedCsv]);

  return (
    <div className="space-y-6">
      {/* Single input: exact School names, comma-separated */}
      <section className="card p-4">
        <label className="block text-sm text-zinc-400 mb-1">
          Teams to track (exact School names from teams.json, comma-separated)
        </label>
        <input
          className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2"
          value={trackedCsv}
          onChange={(e) => setTrackedCsv(e.target.value)}
          placeholder="Tennessee, Ohio State"
        />
        {debug && (
          <div className="mt-2 text-xs text-zinc-500">
            debug: {debug}
          </div>
        )}
      </section>

      {/* Cards */}
      <section className="grid md:grid-cols-2 gap-4">
        {games.length === 0 ? (
          <p className="text-gray-400">No live games</p>
        ) : (
          games.map((g) => (
            <div key={g.id} className="card p-4 whitespace-pre-line leading-relaxed">
              <div className="text-lg font-semibold">
                {g.top.name} {g.top.score}
              </div>
              <div className="text-lg">
                {g.bottom.name} {g.bottom.score}
                <span className="ml-2">{g.bottom.right}</span>
              </div>

              {/* Two most recent scoring plays or placeholders */}
              <div className="mt-3 text-sm">
                {(g.plays.length ? g.plays.slice(-2) : [
                  "(OSU): Tom Smith 7yd TD Run",
                  "(TEX): Jane Doe to John Roe for a 22yd TD Pass"
                ]).map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
