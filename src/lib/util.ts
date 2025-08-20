// src/lib/util.ts

export function statusLabel(g: any) {
  const status = (g?.status || "").toString();
  const period = g?.period ?? g?.currentPeriod ?? g?.quarter ?? "";
  const clock  = g?.clock ?? g?.displayClock ?? g?.time ?? "";
  if (/final/i.test(status)) return "Final";
  if (/in_progress|live/i.test(status)) return (period ? `Q${period} ` : "") + (clock || "");
  if (/scheduled|pre/i.test(status)) return "Scheduled";
  return (period ? `Q${period} ` : "") + (clock || status || "");
}

export function toGame(raw: any) {
  return {
    id: raw.id || raw.gameId || raw.game_id,
    startTime: raw.startDate || raw.start_time || raw.start,
    status: statusLabel(raw),
    homeTeam: raw.homeTeam || raw.home_team || raw.home,
    awayTeam: raw.awayTeam || raw.away_team || raw.away,
    homePoints: Number(raw.homePoints ?? raw.home_points ?? raw.home_score ?? 0),
    awayPoints: Number(raw.awayPoints ?? raw.away_points ?? raw.away_score ?? 0),
    period: raw.period ?? raw.currentPeriod ?? raw.quarter ?? undefined,
    clock: raw.clock ?? raw.displayClock ?? raw.time ?? undefined
  };
}
