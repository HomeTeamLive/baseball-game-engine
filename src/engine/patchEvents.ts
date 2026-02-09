// src/engine/patchEvents.ts
import type { GameEvent } from "../types/events";
import type { GameState, EventId, PlayerId, TeamSide } from "../types/gameState";
import type { EffectiveGameRules } from "../types/gameRules";
import type { StatsState } from "../types/stats";

import { applyEvent } from "./applyEvent";
import { applyStatsDelta } from "../stats/applyStatsDelta";

function emptyPlayerBatting() {
  return {
    PA: 0,
    AB: 0,
    H: 0,
    "2B": 0,
    "3B": 0,
    HR: 0,
    HR_SOLO: 0,
    HR_2RUN: 0,
    HR_GRANDSLAM: 0,
    R: 0,
    RBI: 0,
    BB: 0,
    IBB: 0,
    HBP: 0,
    SO: 0,
    SF: 0,
    SH: 0,
    ROE: 0,
    FC: 0,
    GIDP: 0,
    DP: 0,
    TB: 0,
  };
}

function emptyPlayerRunning() {
  return { SB: 0, CS: 0, PO: 0, POA: 0 };
}

function emptyPlayerFielding() {
  return { PO: 0, A: 0, E: 0, DP: 0, TP: 0, PB: 0, WP: 0 };
}

function emptyPlayerPitching() {
  return {
    OUTS_PITCHED: 0,
    BF: 0,
    H: 0,
    R: 0,
    ER: 0,
    BB: 0,
    IBB: 0,
    HBP: 0,
    SO: 0,
    HR: 0,
    HR_SOLO: 0,
    HR_2RUN: 0,
    HR_GRANDSLAM: 0,
    WP: 0,
    BK: 0,
    PK: 0,
    PKA: 0,
    PITCHES: 0,
    STRIKES: 0,
    BALLS: 0,
  };
}

function emptyTeamBatting() {
  return {
    PA: 0,
    AB: 0,
    H: 0,
    "2B": 0,
    "3B": 0,
    HR: 0,
    HR_SOLO: 0,
    HR_2RUN: 0,
    HR_GRANDSLAM: 0,
    R: 0,
    RBI: 0,
    BB: 0,
    HBP: 0,
    SO: 0,
    LOB: 0,
    GIDP: 0,
    DP: 0,
  };
}
function emptyTeamRunning() {
  return { SB: 0, CS: 0, PO: 0, POA: 0 };
}
function emptyTeamFielding() {
  return { PO: 0, A: 0, E: 0, DP: 0, TP: 0 };
}
function emptyTeamPitching() {
  return {
    OUTS_PITCHED: 0,
    BF: 0,
    H: 0,
    R: 0,
    ER: 0,
    BB: 0,
    SO: 0,
    HR: 0,
    HR_SOLO: 0,
    HR_2RUN: 0,
    HR_GRANDSLAM: 0,
    WP: 0,
    BK: 0,
    PK: 0,
    PKA: 0,
    PITCHES: 0,
    STRIKES: 0,
    BALLS: 0,
  };
}

export function createEmptyStatsStateFromState(initial: GameState): StatsState {
  const players: StatsState["players"] = {};
  const teams: StatsState["teams"] = {
    HOME: {
      teamSide: "HOME",
      batting: emptyTeamBatting(),
      running: emptyTeamRunning(),
      fielding: emptyTeamFielding(),
      pitching: emptyTeamPitching(),
    },
    AWAY: {
      teamSide: "AWAY",
      batting: emptyTeamBatting(),
      running: emptyTeamRunning(),
      fielding: emptyTeamFielding(),
      pitching: emptyTeamPitching(),
    },
  };

  const addPlayer = (pid: PlayerId, side: TeamSide) => {
    if (players[pid]) return;
    players[pid] = {
      playerId: pid,
      teamSide: side,
      batting: emptyPlayerBatting(),
      running: emptyPlayerRunning(),
      fielding: emptyPlayerFielding(),
      pitching: emptyPlayerPitching(),
    };
  };

  for (const side of ["HOME", "AWAY"] as const) {
    for (const pid of initial.roster?.[side] ?? []) addPlayer(pid, side);

    // also include players in lineup/onField if they aren't in roster list
    const lineupSlots = initial.teams?.[side]?.lineup?.slots ?? [];
    for (const slot of lineupSlots) {
      for (const occ of slot.occupants ?? []) addPlayer(occ.playerId, side);
    }
    const onField = initial.teams?.[side]?.onField?.defense;
    if (onField) {
      for (const pid of Object.values(onField)) addPlayer(pid, side);
    }
  }

  return { players, teams };
}


export type RebuildResult =
  | { ok: true; state: GameState; stats: StatsState }
  | {
      ok: false;
      state: GameState;
      stats: StatsState;
      errors: string[];
      failedEventId?: EventId;
    };

export function rebuildFromEvents(args: {
  initialState: GameState;
  rules: EffectiveGameRules;
  events: GameEvent[];
  initialStats?: StatsState; 
}): RebuildResult {
  let curState: GameState = structuredClone(args.initialState);
  let curStats: StatsState = structuredClone(
    args.initialStats ?? createEmptyStatsStateFromState(curState)
  );

  for (const ev of args.events) {
    const res = applyEvent(curState, args.rules, ev);
    if (!res.ok) {
      return {
        ok: false,
        state: curState,
        stats: curStats,
        errors: res.errors,
        failedEventId: ev.eventId,
      };
    }
    curStats = applyStatsDelta(curStats, res.statsDelta);
    curState = res.state;
  }

  return { ok: true, state: curState, stats: curStats };
}


type LockedSignature = {
  offense: TeamSide;
  defense: TeamSide;
  inningNumber: number;
  half: string;
  outs: number;
  balls: number;
  strikes: number;
  bases: { "1B": string | null; "2B": string | null; "3B": string | null };
  pa: {
    atBatId: string;
    batterId: string;
    batterSlot: number;
    batterSide: TeamSide;
    pitcherId: string;
    pitchCountInPa: number;
  };
  gameStatus: string;
};

function lockedSig(state: GameState): LockedSignature {
  return {
    offense: state.offense,
    defense: state.defense,
    inningNumber: state.inning.inningNumber,
    half: state.inning.half,
    outs: state.inning.outs,
    balls: state.inning.count.balls,
    strikes: state.inning.count.strikes,
    bases: {
      "1B": state.bases["1B"] ?? null,
      "2B": state.bases["2B"] ?? null,
      "3B": state.bases["3B"] ?? null,
    },
    pa: {
      atBatId: state.pa.atBatId,
      batterId: state.pa.batter.playerId,
      batterSlot: state.pa.batter.slot,
      batterSide: state.pa.batter.teamSide,
      pitcherId: state.pa.pitcherId,
      pitchCountInPa: state.pa.pitchCountInPa,
    },
    gameStatus: state.gameStatus,
  };
}

function sameLocked(a: LockedSignature, b: LockedSignature): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export type PatchEventResult =
  | { ok: true; patchedEvents: GameEvent[]; state: GameState; stats: StatsState }
  | { ok: false; errors: string[] };

/**
 * Destructively replaces ONE event (matched by eventId) and then rebuilds state+stats.
 *
 * Guardrail:
 *   - The patched event MUST produce the same locked state transition as the original,
 *     when applied to the same pre-event state.
 *
 */
export function patchEventInLogAndRebuild(args: {
  initialState: GameState;
  rules: EffectiveGameRules;
  events: GameEvent[];
  eventId: EventId;
  replacement: GameEvent; 
  initialStats?: StatsState;
}): PatchEventResult {
  const idx = args.events.findIndex((e) => e.eventId === args.eventId);
  if (idx === -1) {
    return { ok: false, errors: [`patchEvent: eventId '${args.eventId}' not found`] };
  }

  const orig = args.events[idx];

  if (args.replacement.eventId !== orig.eventId) {
    return {
      ok: false,
      errors: [
        "patchEvent: replacement.eventId must match the original eventId (keep IDs stable)",
      ],
    };
  }

  // Rebuild up to the event BEFORE the target, to get pre-state.
  const beforeRes = rebuildFromEvents({
    initialState: args.initialState,
    rules: args.rules,
    events: args.events.slice(0, idx),
    initialStats: args.initialStats,
  });

  if (!beforeRes.ok) {
    return {
      ok: false,
      errors: [
        `patchEvent: could not rebuild pre-state. Failed at event '${beforeRes.failedEventId}': ${beforeRes.errors.join(
          "; "
        )}`,
      ],
    };
  }

  // Apply original and replacement to the SAME pre-state to compare locked transition.
  const preState = beforeRes.state;

  const origApply = applyEvent(preState, args.rules, orig);
  if (!origApply.ok) {
    return {
      ok: false,
      errors: [`patchEvent: original event invalid at replay time: ${origApply.errors.join("; ")}`],
    };
  }

  const replApply = applyEvent(preState, args.rules, args.replacement);
  if (!replApply.ok) {
    return {
      ok: false,
      errors: [`patchEvent: replacement event invalid: ${replApply.errors.join("; ")}`],
    };
  }

  const origSig = lockedSig(origApply.state);
  const replSig = lockedSig(replApply.state);

  if (!sameLocked(origSig, replSig)) {
    return {
      ok: false,
      errors: [
        "patchEvent rejected: replacement changes locked game state (bases/outs/count/inning/PA identity).",
        "Scoring edits are allowed, but state-affecting edits are not.",
      ],
    };
  }

  // Destructively overwrite and rebuild entire game.
  const patchedEvents = args.events.slice();
  patchedEvents[idx] = args.replacement;

  const rebuilt = rebuildFromEvents({
    initialState: args.initialState,
    rules: args.rules,
    events: patchedEvents,
    initialStats: args.initialStats,
  });

  if (!rebuilt.ok) {
    return {
      ok: false,
      errors: [`patchEvent: rebuild failed at '${rebuilt.failedEventId}': ${rebuilt.errors.join("; ")}`],
    };
  }

  return { ok: true, patchedEvents, state: rebuilt.state, stats: rebuilt.stats };
}
