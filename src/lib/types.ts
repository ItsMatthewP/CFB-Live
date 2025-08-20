// src/types.ts
export type Game = {
  /** Stable identifier you can use as a React key. Always a string. */
  id: string;

  homeTeam: string;
  awayTeam: string;
  homeChar6?: string;
  awayChar6?: string;

  homePoints: number;
  awayPoints: number;

  /** e.g., "2nd 5:00" | "Final" | "Scheduled" */
  status: string;

  period?: number | null;
  clock?: string;
  startTimeEpoch: number;
};
