// src/stats/derivedStats.ts
//ignore

import type { PlayerBattingStats, PlayerPitchingStats, PlayerFieldingStats } from "../types/stats";


/** Batting average: H / AB. Returns 0 if no at-bats. */
export function battingAverage(s: Pick<PlayerBattingStats, "H" | "AB">): number {
  return s.AB === 0 ? 0 : s.H / s.AB;
}

/** On-base percentage: (H + BB + HBP) / (AB + BB + HBP + SF). */
export function onBasePercentage(s: Pick<PlayerBattingStats, "H" | "BB" | "HBP" | "AB" | "SF">): number {
  const denom = s.AB + s.BB + s.HBP + s.SF;
  return denom === 0 ? 0 : (s.H + s.BB + s.HBP) / denom;
}

/** Slugging percentage: TB / AB. */
export function sluggingPercentage(s: Pick<PlayerBattingStats, "TB" | "AB">): number {
  return s.AB === 0 ? 0 : s.TB / s.AB;
}

/** OPS: OBP + SLG. */
export function ops(s: Pick<PlayerBattingStats, "H" | "BB" | "HBP" | "AB" | "SF" | "TB">): number {
  return onBasePercentage(s) + sluggingPercentage(s);
}

/** Isolated power: SLG - AVG = (TB - H) / AB. */
export function isolatedPower(s: Pick<PlayerBattingStats, "H" | "AB" | "TB">): number {
  return s.AB === 0 ? 0 : (s.TB - s.H) / s.AB;
}

/** Batting average on balls in play: (H - HR) / (AB - SO - HR + SF). */
export function babip(s: Pick<PlayerBattingStats, "H" | "HR" | "AB" | "SO" | "SF">): number {
  const denom = s.AB - s.SO - s.HR + s.SF;
  return denom <= 0 ? 0 : (s.H - s.HR) / denom;
}

/** All key batting rates in one call. */
export function computeBattingRates(s: PlayerBattingStats) {
  return {
    AVG: battingAverage(s),
    OBP: onBasePercentage(s),
    SLG: sluggingPercentage(s),
    OPS: ops(s),
    ISO: isolatedPower(s),
    BABIP: babip(s),
  };
}





/** Convert OUTS_PITCHED to innings (e.g. 7 outs → 2.1 display, 2.333 numeric). */
export function inningsPitched(s: Pick<PlayerPitchingStats, "OUTS_PITCHED">): number {
  return s.OUTS_PITCHED / 3;
}

/** Innings pitched as display string (e.g. 7 outs → "2.1"). */
export function inningsPitchedDisplay(s: Pick<PlayerPitchingStats, "OUTS_PITCHED">): string {
  const full = Math.floor(s.OUTS_PITCHED / 3);
  const remainder = s.OUTS_PITCHED % 3;
  return `${full}.${remainder}`;
}

/** ERA: (ER / OUTS_PITCHED) * 27 = ER per 9 innings. */
export function era(s: Pick<PlayerPitchingStats, "ER" | "OUTS_PITCHED">): number {
  return s.OUTS_PITCHED === 0 ? 0 : (s.ER * 27) / s.OUTS_PITCHED;
}

/** WHIP: (BB + H) / IP. */
export function whip(s: Pick<PlayerPitchingStats, "BB" | "H" | "OUTS_PITCHED">): number {
  const ip = s.OUTS_PITCHED / 3;
  return ip === 0 ? 0 : (s.BB + s.H) / ip;
}

/** K/9: (SO / IP) * 9. */
export function kPer9(s: Pick<PlayerPitchingStats, "SO" | "OUTS_PITCHED">): number {
  return s.OUTS_PITCHED === 0 ? 0 : (s.SO * 27) / s.OUTS_PITCHED;
}

/** BB/9: (BB / IP) * 9. */
export function bbPer9(s: Pick<PlayerPitchingStats, "BB" | "OUTS_PITCHED">): number {
  return s.OUTS_PITCHED === 0 ? 0 : (s.BB * 27) / s.OUTS_PITCHED;
}

/** K/BB ratio. */
export function kBbRatio(s: Pick<PlayerPitchingStats, "SO" | "BB">): number {
  return s.BB === 0 ? (s.SO > 0 ? Infinity : 0) : s.SO / s.BB;
}

/** HR/9: (HR / IP) * 9. */
export function hrPer9(s: Pick<PlayerPitchingStats, "HR" | "OUTS_PITCHED">): number {
  return s.OUTS_PITCHED === 0 ? 0 : (s.HR * 27) / s.OUTS_PITCHED;
}

/** Strike percentage: STRIKES / PITCHES. */
export function strikePercentage(s: Pick<PlayerPitchingStats, "STRIKES" | "PITCHES">): number {
  return s.PITCHES === 0 ? 0 : s.STRIKES / s.PITCHES;
}

/** All key pitching rates in one call. */
export function computePitchingRates(s: PlayerPitchingStats) {
  return {
    IP: inningsPitchedDisplay(s),
    ERA: era(s),
    WHIP: whip(s),
    K9: kPer9(s),
    BB9: bbPer9(s),
    KBB: kBbRatio(s),
    HR9: hrPer9(s),
    STRIKE_PCT: strikePercentage(s),
  };
}





/** Fielding percentage: (PO + A) / (PO + A + E). */
export function fieldingPercentage(s: Pick<PlayerFieldingStats, "PO" | "A" | "E">): number {
  const total = s.PO + s.A + s.E;
  return total === 0 ? 1 : (s.PO + s.A) / total;
}

/** All key fielding rates in one call. */
export function computeFieldingRates(s: PlayerFieldingStats) {
  return {
    FPCT: fieldingPercentage(s),
  };
}
