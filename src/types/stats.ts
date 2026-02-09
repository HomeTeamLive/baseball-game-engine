// src/types/stats.ts

import type { PlayerId, TeamSide } from "./gameState";

export interface StatsState {
  players: Record<PlayerId, PlayerStats>;
  teams: Record<TeamSide, TeamStats>;
}

export interface PlayerStats {
  playerId: PlayerId;
  teamSide: TeamSide;
  batting: PlayerBattingStats;
  running: PlayerRunningStats;
  fielding: PlayerFieldingStats;
  pitching: PlayerPitchingStats;
}

export interface PlayerBattingStats {
  PA: number;
  AB: number;
  H: number;
  "2B": number;
  "3B": number;
  HR: number;
  HR_SOLO: number;
  HR_2RUN: number;
  HR_GRANDSLAM: number;
  R: number;
  RBI: number;
  BB: number;
  IBB: number;
  HBP: number;
  SO: number;
  SF: number;
  SH: number;
  ROE: number;
  FC: number;
  GIDP: number;
  DP: number;
  TB: number;
}

export interface PlayerRunningStats {
  SB: number;
  CS: number;
  PO: number;
  POA: number;
}

export interface PlayerFieldingStats {
  PO: number;
  A: number;
  E: number;
  DP: number;
  TP: number;
  PB: number;
  WP: number;
}

export interface PlayerPitchingStats {
  OUTS_PITCHED: number;
  BF: number;
  H: number;
  R: number;
  ER: number;
  BB: number;
  IBB: number;
  HBP: number;
  SO: number;
  HR: number;
  HR_SOLO: number;
  HR_2RUN: number;
  HR_GRANDSLAM: number;
  WP: number;
  BK: number;
  PK: number;
  PKA: number;
  PITCHES: number;
  STRIKES: number;
  BALLS: number;
}

export interface TeamStats {
  teamSide: TeamSide;
  batting: TeamBattingStats;
  running: TeamRunningStats;
  fielding: TeamFieldingStats;
  pitching: TeamPitchingStats;
}

export interface TeamBattingStats {
  PA: number;
  AB: number;
  H: number;
  "2B": number;
  "3B": number;
  HR: number;
  HR_SOLO: number;
  HR_2RUN: number;
  HR_GRANDSLAM: number;
  R: number;
  RBI: number;
  BB: number;
  HBP: number;
  SO: number;
  LOB: number;
  GIDP: number;
  DP: number;
}

export interface TeamRunningStats {
  SB: number;
  CS: number;
  PO: number;
  POA: number;
}

export interface TeamFieldingStats {
  PO: number;
  A: number;
  E: number;
  DP: number;
  TP: number;
}

export interface TeamPitchingStats {
  OUTS_PITCHED: number;
  BF: number;
  H: number;
  R: number;
  ER: number;
  BB: number;
  SO: number;
  HR: number;
  HR_SOLO: number;
  HR_2RUN: number;
  HR_GRANDSLAM: number;
  WP: number;
  BK: number;
  PK: number;
  PKA: number;
  PITCHES: number;
  STRIKES: number;
  BALLS: number;
}

export type StatPath = string; 
export type StatValueDelta = number;

export interface StatsDelta {
  inc: Record<StatPath, StatValueDelta>;
  set?: Record<StatPath, number>;
  notes?: string[];
}

export function emptyDelta(): StatsDelta {
  return { inc: {} };
}
