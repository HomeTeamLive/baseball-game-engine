// src/engine/invariants.ts
import type { GameState, TeamSide, PlayerId } from "../types/gameState";
import type { EffectiveGameRules } from "../types/gameRules";

/**
 * Invariants helpers:
 * - pure helpers (isoNow, clamp, otherSide)
 * - count safety
 * - linescore/score helpers
 * - inning/half/game advancement (incl end-game + extras)
 * - ITB runner placement (derived from nextBatterIndex - 1)
 *
 */

export function isoNow() {
  return new Date().toISOString();
}

export function otherSide(side: TeamSide): TeamSide {
  return side === "HOME" ? "AWAY" : "HOME";
}

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function getCurrentPitcherId(state: GameState): PlayerId {
  return state.teams[state.defense].onField.defense["P"];
}

export function normalizeCount(state: GameState, rules: EffectiveGameRules) {
  state.inning.count.balls = clamp(state.inning.count.balls, 0, Math.max(0, rules.ballsForWalk - 1));
  state.inning.count.strikes = clamp(state.inning.count.strikes, 0, Math.max(0, rules.strikesForOut - 1));
}

export function resetCountForNewPa(state: GameState, rules: EffectiveGameRules) {
  state.inning.count = { balls: rules.startingBalls, strikes: rules.startingStrikes };
  state.pa.pitchCountInPa = 0;
}


export function startNextPlateAppearance(state: GameState, rules: EffectiveGameRules) {
  const lineup = state.teams[state.offense].lineup;
  const len = lineup.slots.length;

  if (len <= 0) {
    resetCountForNewPa(state, rules);
    state.pa.pitcherId = getCurrentPitcherId(state);
    return;
  }

  lineup.nextBatterIndex = (lineup.nextBatterIndex + 1) % len;

  let skipped = 0;
  while (
    lineup.slots[lineup.nextBatterIndex].occupants.length === 0 &&
    skipped < len
  ) {
    lineup.nextBatterIndex = (lineup.nextBatterIndex + 1) % len;
    skipped++;
  }

  const slot = lineup.slots[lineup.nextBatterIndex];
  const occ = slot.occupants[slot.activeOccupantIndex];
  if (occ?.playerId) {
    state.pa.batter = {
      teamSide: state.offense,
      slot: slot.slot,
      playerId: occ.playerId,
    };
  } else {
    state.pa.batter.teamSide = state.offense;
    state.pa.batter.slot = slot.slot;
  }

  const m = /^ab_(\d+)$/.exec(state.pa.atBatId);
  if (m) state.pa.atBatId = `ab_${Number(m[1]) + 1}`;

  state.pa.pitcherId = getCurrentPitcherId(state);
  resetCountForNewPa(state, rules);
}

export function ensureLinescoreKey(state: GameState, side: TeamSide, inning: number) {
  if (state.linescore[side].runsByInning[inning] === undefined) {
    state.linescore[side].runsByInning[inning] = null;
  }
}

export function recordRun(state: GameState, side: TeamSide, add: number) {
  if (add <= 0) return;

  state.teams[side].score.runs += add;

  const inn = state.inning.inningNumber;
  ensureLinescoreKey(state, side, inn);
  const prev = state.linescore[side].runsByInning[inn] ?? 0;
  state.linescore[side].runsByInning[inn] = prev + add;
}

export function isTie(state: GameState): boolean {
  return state.teams.HOME.score.runs === state.teams.AWAY.score.runs;
}

export function homeLeads(state: GameState): boolean {
  return state.teams.HOME.score.runs > state.teams.AWAY.score.runs;
}

export function awayLeads(state: GameState): boolean {
  return state.teams.AWAY.score.runs > state.teams.HOME.score.runs;
}

export function maybeEndGameOnWalkOff(state: GameState, rules: EffectiveGameRules) {
  if (state.gameStatus === "FINAL") return;
  if (state.inning.half !== "BOTTOM") return;

  const atOrPastRegulation = state.inning.inningNumber >= rules.innings;
  if (!atOrPastRegulation) return;

  if (homeLeads(state)) {
    state.gameStatus = "FINAL";
  }
}

export function maybeApplyInternationalTieBreakerStartOfHalfInning(
  state: GameState,
  rules: EffectiveGameRules
) {
  if (rules.tieBreaker.type !== "INTERNATIONAL_TIE_BREAKER") return;
  if (!rules.playExtraInnings) return;

  const startInning = rules.tieBreaker.startInning ?? rules.innings + 1;
  if (state.inning.inningNumber < startInning) return;

  const startsOn = rules.tieBreaker.runnerStartsOn ?? "2B";
  const targetBase = startsOn === "3B" ? "3B" : "2B";

  if (state.bases[targetBase]) return;

  const lineup = state.teams[state.offense].lineup;
  const len = lineup.slots.length;
  if (len <= 0) return;

  const prevIndex = (lineup.nextBatterIndex - 1 + len) % len;
  const prevSlot = lineup.slots[prevIndex];
  const runnerId = prevSlot.occupants[prevSlot.activeOccupantIndex]?.playerId;
  if (!runnerId) return;

  state.bases[targetBase] = runnerId;
}

export function advanceHalfInningIfNeeded(state: GameState, rules: EffectiveGameRules) {
  if (state.inning.outs < rules.outsPerInning) return;
  if (state.gameStatus === "FINAL") return;

  state.bases = {};
  state.inning.outs = 0;
  resetCountForNewPa(state, rules);

  const wasTop = state.inning.half === "TOP";

  if (wasTop) {
    const isFinalRegTop = state.inning.inningNumber >= rules.innings;
    if (isFinalRegTop && !isTie(state) && homeLeads(state)) {
      state.gameStatus = "FINAL";
      return;
    }

    state.inning.half = "BOTTOM";
    state.offense = "HOME";
    state.defense = "AWAY";

    state.pa.pitcherId = getCurrentPitcherId(state);
    maybeApplyInternationalTieBreakerStartOfHalfInning(state, rules);
    return;
  }

  const finishedInning = state.inning.inningNumber;
  const finishedRegulation = finishedInning >= rules.innings;

  if (finishedRegulation) {
    if (!isTie(state)) {
      state.gameStatus = "FINAL";
      return;
    }

    if (rules.allowTieGames) {
      state.gameStatus = "FINAL";
      return;
    }

    if (!rules.playExtraInnings) {
      state.gameStatus = "FINAL";
      return;
    }
  }

  state.inning.inningNumber = finishedInning + 1;
  state.inning.half = "TOP";
  state.offense = "AWAY";
  state.defense = "HOME";

  state.pa.pitcherId = getCurrentPitcherId(state);
  maybeApplyInternationalTieBreakerStartOfHalfInning(state, rules);
}
