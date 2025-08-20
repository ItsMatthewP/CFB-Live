"use client";

import { useEffect, useState } from "react";
import GameCard from "@/components/GameCard";

type WireGame = {
  id: string;
  top: { name: string; abbr?: string; score: number };
  bottom: { name: string; abbr?: string; score: number; right: string };
  plays:
    | string[]
    | Array<{ ScoringTeamID?: number | null; Description?: string | null }>;
  meta?: { homeTeamId?: number; awayTeamId?: number };
};

/** session-only storage (reset when tab/app closes) */
function useSession(key: string, initial: string) {
  const [v, setV] = useState<string>(() =>
    typeof window === "undefined"
      ? initial
      : sessionStorage.getItem(key) ?? initial
  );
  useEffect(() => {
    sessionStorage.setItem(key, v);
  }, [key, v]);
  return [v, setV] as const;
}

export default function Page() {
  const [trackedCsv, setTrackedCsv] = useSession("cfb_tracked_csv", "Tennessee");
  const [games, setGames] = useState<WireGame[]>([]);
  const [debug, setDebug] = useState("");

  async function load() {
    try {
      const url = `/api/games?tracked=${encodeURIComponent(trackedCsv)}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      const data = await res.json();
      const list: WireGame[] = Array.isArray(data) ? data : [];
      setGames(prev => (list.length ? list : prev)); // keep last good to avoid flicker
      setDebug(`${list.length} game(s) loaded`);
    } catch (e: any) {
      setDebug(`error: ${String(e?.message || e)}`);
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
      <section className="card p-4">
        <label className="block text-sm text-zinc-400 mb-1">
          Teams to track (exact <code>School</code> names from teams.json; comma-separated)
        </label>
        <input
          className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2"
          value={trackedCsv}
          onChange={(e) => setTrackedCsv(e.target.value)}
          placeholder="Tennessee, Ohio State"
        />
        <div className="mt-2 text-xs text-zinc-500">debug: {debug}</div>
      </section>

      <section className="grid md:grid-cols-2 gap-4">
        {games.length === 0 ? (
          <p className="text-gray-400">No live games</p>
        ) : (
          games.map((g) => <GameCard key={g.id} game={g} />)
        )}
      </section>
    </div>
  );
}
