import { NCAA_BASE } from "@/lib/config";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const gameId = searchParams.get("gameId");
  if (!gameId) return new Response("gameId is required", { status: 400 });

  async function getJson(path: string) {
    const res = await fetch(`${NCAA_BASE}${path}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Fetch ${res.status} ${path}`);
    return res.json();
  }

  try {
    // Prefer concise scoring summary (if available), per README “Game” routes
    //   GET /game/{id}/scoring-summary   (docs)
    // Fallback: /game/{id}/play-by-play  (docs)
    // :contentReference[oaicite:4]{index=4}
    let items: any[] = [];
    try {
      const ss = await getJson(`/game/${gameId}/scoring-summary`);
      const summary = Array.isArray(ss?.summary) ? ss.summary : ss?.summary || [];
      items = summary.map((s: any) => ({
        period: Number(s?.period ?? s?.quarter ?? s?.qtr ?? 0),
        clock: s?.clock ?? s?.time ?? "",
        offense: s?.team ?? s?.offense ?? "",
        playText: s?.text ?? s?.description ?? "",
      }));
    } catch {
      const pbp = await getJson(`/game/${gameId}/play-by-play`);
      const all = (pbp?.plays || []).flatMap((q: any) => q?.actions || []);
      items = all
        .filter((p: any) =>
          p?.scoring === true ||
          /touchdown|field goal|safety|pat|xp/i.test(p?.text || p?.description || "")
        )
        .map((p: any) => ({
          period: Number(p?.period ?? p?.quarter ?? p?.qtr ?? 0),
          clock: p?.clock ?? p?.time ?? "",
          offense: p?.team ?? p?.offense ?? "",
          playText: p?.text ?? p?.description ?? "",
        }));
    }

    return Response.json(items.slice(-6), { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return new Response(String(e?.message || e), { status: 500 });
  }
}
