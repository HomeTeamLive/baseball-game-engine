// src/engine/applyEvent.ts

import type { GameState, TeamState, BaseKey, TeamSide, DefensePos, PlayerId } from "../types/gameState";
import type { GameEvent } from "../types/events";
import type { EffectiveGameRules } from "../types/gameRules";
import type { PitchResult } from "../types/pitch";
import type { BipFinalDestination, EventBaseKey } from "../types/bip";

import { validateEvent } from "./validateEvent";
import {
  isoNow,
  clamp,
  normalizeCount,
  recordRun,
  resetCountForNewPa,
  startNextPlateAppearance,
  advanceHalfInningIfNeeded,
  maybeEndGameOnWalkOff,
} from "./invariants";

import type { StatsDelta } from "../types/stats";
import { emptyDelta } from "../types/stats";
import { computeStatsDelta } from "../stats/computeStatsDelta";

export type ApplyResult =
  | { ok: true; state: GameState; statsDelta: StatsDelta }
  | { ok: false; state: GameState; statsDelta: StatsDelta; errors: string[] };


function advanceHalfInningWithLob(state: GameState, rules: EffectiveGameRules, delta: StatsDelta) {
  if (state.inning.outs >= rules.outsPerInning && state.gameStatus !== "FINAL") {
    const lob = [state.bases["1B"], state.bases["2B"], state.bases["3B"]].filter(Boolean).length;
    if (lob > 0) {
      const key = `teams.${state.offense}.batting.LOB`;
      delta.inc[key] = (delta.inc[key] ?? 0) + lob;
    }
  }
  advanceHalfInningIfNeeded(state, rules);
}

function forceAdvanceOnAwardedFirst(state: GameState, rules: EffectiveGameRules, batterId: string) {
  const r1 = state.bases["1B"];
  const r2 = state.bases["2B"];
  const r3 = state.bases["3B"];

  if (!r1) {
    state.bases["1B"] = batterId;
    return;
  }
  if (!r2) {
    state.bases["2B"] = r1;
    state.bases["1B"] = batterId;
    return;
  }
  if (!r3) {
    state.bases["3B"] = r2;
    state.bases["2B"] = r1;
    state.bases["1B"] = batterId;
    return;
  }

  state.bases["3B"] = r2;
  state.bases["2B"] = r1;
  state.bases["1B"] = batterId;
  recordRun(state, state.offense, 1);
}

function applyPitchResult(state: GameState, rules: EffectiveGameRules, result: PitchResult) {
  state.pa.pitchCountInPa += 1;

  switch (result) {
    case "BALL":
    case "PITCH_CLOCK_BALL":
      state.inning.count.balls += 1;
      break;

    case "CALLED_STRIKE":
    case "SWINGING_STRIKE":
    case "PITCH_CLOCK_STRIKE":
      state.inning.count.strikes += 1;
      break;

    case "FOUL":
    case "FOUL_TIP":
      state.inning.count.strikes = clamp(
        state.inning.count.strikes + 1,
        0,
        Math.max(0, rules.strikesForOut - 1)
      );
      break;

    case "HBP":
      forceAdvanceOnAwardedFirst(state, rules, state.pa.batter.playerId);
      resetCountForNewPa(state, rules);
      startNextPlateAppearance(state, rules);
      return;
  }

  if (state.inning.count.balls >= rules.ballsForWalk) {
    forceAdvanceOnAwardedFirst(state, rules, state.pa.batter.playerId);
    resetCountForNewPa(state, rules);
    startNextPlateAppearance(state, rules);
    return;
  }

  if (state.inning.count.strikes >= rules.strikesForOut) {
    state.inning.outs += 1;
    resetCountForNewPa(state, rules);
    startNextPlateAppearance(state, rules);
    return;
  }

  normalizeCount(state, rules);
}

function eventBaseKeyToFinalDestination(base: EventBaseKey): BipFinalDestination {
  if (base === "HOME") return "HOME";
  if (base === "1B") return "1B";
  if (base === "2B") return "2B";
  if (base === "3B") return "3B";
  return "STAYS";
}

function resolveDestinationToBases(state: GameState, participantId: string, final: BipFinalDestination) {
  if (state.bases["1B"] === participantId) delete state.bases["1B"];
  if (state.bases["2B"] === participantId) delete state.bases["2B"];
  if (state.bases["3B"] === participantId) delete state.bases["3B"];

  if (final === "1B") state.bases["1B"] = participantId;
  if (final === "2B") state.bases["2B"] = participantId;
  if (final === "3B") state.bases["3B"] = participantId;
}

function moveRunnerOnBases(state: GameState, runnerId: string, from: BaseKey, to: BaseKey) {
  if (state.bases[from] === runnerId) delete (state.bases as any)[from];
  state.bases[to] = runnerId;
}

function removeRunnerFromBase(state: GameState, runnerId: string, at: BaseKey) {
  if (state.bases[at] === runnerId) delete (state.bases as any)[at];
}

function applyRunnerOnlyDestinations(state: GameState, destinations: Array<any>) {
  state.bases = {};

  for (const dest of destinations) {
    const pid = dest.participant_id;
    const final: BipFinalDestination = dest.final;

    if (final === "HOME" || final === "OUT") continue;

    if (final === "STAYS") {
      const backTo = eventBaseKeyToFinalDestination(dest.from as EventBaseKey);
      if (backTo === "1B" || backTo === "2B" || backTo === "3B") resolveDestinationToBases(state, pid, backTo);
      continue;
    }

    resolveDestinationToBases(state, pid, final);
  }
}



function findLineupSlotIndexByActivePlayer(state: GameState, teamSide: TeamSide, playerId: string): number | null {
  const lineup = state.teams[teamSide].lineup;
  for (let i = 0; i < lineup.slots.length; i++) {
    const slot = lineup.slots[i];
    const active = slot.occupants[slot.activeOccupantIndex];
    if (active?.playerId === playerId) return i;
  }
  return null;
}

function findDefensePosByPlayer(state: GameState, teamSide: TeamSide, playerId: string): DefensePos | null {
  const def = state.teams[teamSide].onField.defense;
  for (const [pos, pid] of Object.entries(def)) {
    if (pid === playerId) return pos as DefensePos;
  }
  return null;
}

function applyPitchingChange(
  state: GameState,
  payload: { teamSide: TeamSide; pitcher_in: PlayerId; pitcher_out: PlayerId },
  eventId: string
) {
  const { teamSide, pitcher_in, pitcher_out } = payload;

  state.teams[teamSide].onField.defense["P"] = pitcher_in;

  const pitchers = state.teams[teamSide].onField.pitchers;


  const outOcc = pitchers.find((p) => p.playerId === pitcher_out && !p.exitedEventId);
  if (outOcc) outOcc.exitedEventId = eventId;


  const inOccActive = pitchers.find((p) => p.playerId === pitcher_in && !p.exitedEventId);
  if (!inOccActive) {
    pitchers.push({
      playerId: pitcher_in,
      enteredEventId: eventId,
      replacedPlayerId: pitcher_out,
    });
  }


  if (state.defense === teamSide) {
    state.pa.pitcherId = pitcher_in;
  }
}

function findActiveLineupSlotIndex(team: TeamState, playerId: PlayerId): number {
  return team.lineup.slots.findIndex((s) => s.occupants[s.activeOccupantIndex]?.playerId === playerId);
}

function applyLineupSubstitution(
  state: GameState,
  payload: { teamSide: TeamSide; player_in: PlayerId; player_out: PlayerId },
  eventId: string,
  subType: "SUB" | "PH" | "PR"
) {
  const { teamSide, player_in, player_out } = payload;
  const team = state.teams[teamSide];

  const slotIndex = findActiveLineupSlotIndex(team, player_out);
  if (slotIndex < 0) return; 
  
  const slot = team.lineup.slots[slotIndex];
  const active = slot.occupants[slot.activeOccupantIndex];
  if (active) active.exitedEventId = eventId;

  slot.occupants.push({
    playerId: player_in,
    enteredEventId: eventId,
    replacedPlayerId: player_out,
    subType,
    role: "SUB",
    position: null,
  });

  slot.activeOccupantIndex = slot.occupants.length - 1;

  if (state.pa.batter.teamSide === teamSide && state.pa.batter.playerId === player_out) {
    state.pa.batter.playerId = player_in;
  }
}

function applyRunnerSubstitution(
  state: GameState,
  payload: { teamSide: TeamSide; player_in: PlayerId; player_out: PlayerId },
  eventId: string
) {
  const { player_in, player_out } = payload;

  (["1B", "2B", "3B"] as BaseKey[]).forEach((b) => {
    if (state.bases[b] === player_out) state.bases[b] = player_in;
  });

  applyLineupSubstitution(state, payload, eventId, "PR");
}

function applyFielderSubstitution(
  state: GameState,
  payload: { teamSide: TeamSide; player_in: PlayerId; player_out: PlayerId },
  eventId: string
) {
  const { teamSide, player_in, player_out } = payload;

  const defense = state.teams[teamSide].onField.defense;
  let replacedPos: DefensePos | null = null;

  (Object.keys(defense) as DefensePos[]).forEach((pos) => {
    if (defense[pos] === player_out) {
      defense[pos] = player_in;
      replacedPos = pos;
    }
  });


  const slotIndex = findActiveLineupSlotIndex(state.teams[teamSide], player_out);
  if (slotIndex >= 0) {
    applyLineupSubstitution(state, payload, eventId, "SUB");
    const slot = state.teams[teamSide].lineup.slots[slotIndex];
    const occ = slot.occupants[slot.activeOccupantIndex];
    if (occ && replacedPos) occ.position = replacedPos;
  }
}





export function applyEvent(state: GameState, rules: EffectiveGameRules, event: GameEvent): ApplyResult {
  const v = validateEvent(state, rules, event);
  if (!v.ok) return { ok: false, state, statsDelta: emptyDelta(), errors: v.errors };

  const statsDelta = computeStatsDelta(state, event);

  const next: GameState = structuredClone(state);

  next.appliedEventIds.push(event.eventId);
  next.lastEventId = event.eventId;
  next.lastUpdatedIso = isoNow();

  switch (event.name) {
    case "GAME_STARTED":
      next.gameStatus = "IN_PROGRESS";
      return { ok: true, state: next, statsDelta };

    case "LINEUP_SET": {
      const teamSide = event.payload.teamSide;
      const slots = event.payload.slots;

      const nextSlots = Array.from({ length: 10 }, (_, i) => {
        const slot = (i + 1) as any;
        const found = Array.isArray(slots) ? slots.find((s: any) => s?.slot === slot) : undefined;
        return {
          slot,
          activeOccupantIndex: 0,
          occupants: found
            ? [
                {
                  playerId: found.player_id,
                  enteredEventId: event.eventId,
                  subType: "NONE" as const,
                  role: "STARTER" as const,
                  position: found.position ?? null,
                },
              ]
            : [],
        };
      });

      next.teams[teamSide].lineup.slots = nextSlots as any;
      next.teams[teamSide].lineup.nextBatterIndex = 0;

      if (teamSide === next.offense && (!next.pa.batter.playerId || next.pa.batter.playerId === "_")) {
        const p0 = (nextSlots[0]?.occupants?.[0] as any)?.playerId;
        if (typeof p0 === "string" && p0.length) {
          next.pa.batter = { teamSide, slot: 1, playerId: p0 } as any;
        }
      }

      return { ok: true, state: next, statsDelta };
    }

    case "DEFENSE_SET": {
      const teamSide = event.payload.teamSide;
      const defensePatch = event.payload.defense ?? {};

      const current = next.teams[teamSide].onField.defense as any;
      for (const [pos, pid] of Object.entries(defensePatch)) {
        if (typeof pid === "string") current[pos] = pid;
      }

      // P  pitcher
      const pitcherId = current["P"];
      if (typeof pitcherId === "string" && pitcherId.length && pitcherId !== "_") {
        if (!next.teams[teamSide].onField.pitchers.length) {
          next.teams[teamSide].onField.pitchers.push({ playerId: pitcherId, enteredEventId: event.eventId } as any);
        } else {
          next.teams[teamSide].onField.pitchers[0].playerId = pitcherId;
        }
      }

      if (teamSide === next.defense && (!next.pa.pitcherId || next.pa.pitcherId === "_")) {
        if (typeof pitcherId === "string" && pitcherId.length) {
          next.pa.pitcherId = pitcherId;
        }
      }

      return { ok: true, state: next, statsDelta };
    }

    case "GAME_PAUSED":
      next.gameStatus = "PAUSED";
      return { ok: true, state: next, statsDelta };

    case "GAME_RESUMED":
      next.gameStatus = "IN_PROGRESS";
      return { ok: true, state: next, statsDelta };

    case "GAME_FINAL":
      next.gameStatus = "FINAL";
      return { ok: true, state: next, statsDelta };

    case "AT_BAT_START":
      next.pa.atBatId = event.payload.pa_id;
      next.pa.batter.playerId = event.payload.batter_id;
      next.pa.pitcherId = event.payload.pitcher_id;
      resetCountForNewPa(next, rules);
      return { ok: true, state: next, statsDelta };

    case "INNING_ADVANCE":
      next.inning.inningNumber = event.payload.to_inning_number;
      next.inning.half = event.payload.to_half;
      next.inning.outs = 0;
      next.bases = {};
      resetCountForNewPa(next, rules);
      return { ok: true, state: next, statsDelta };

    case "PITCH":
      applyPitchResult(next, rules, event.payload.result);
      advanceHalfInningWithLob(next, rules, statsDelta);
      return { ok: true, state: next, statsDelta };

    case "WALK":
    case "INTENTIONAL_WALK": {
      const batterId = event.payload.batter_id;
      forceAdvanceOnAwardedFirst(next, rules, batterId);
      resetCountForNewPa(next, rules);
      startNextPlateAppearance(next, rules);
      return { ok: true, state: next, statsDelta };
    }

    case "HBP": {
      const batterId = event.payload.batter_id;
      forceAdvanceOnAwardedFirst(next, rules, batterId);
      resetCountForNewPa(next, rules);
      startNextPlateAppearance(next, rules);
      return { ok: true, state: next, statsDelta };
    }

    case "CATCHER_INTERFERENCE": {
      const batterId = event.payload.batter_id;

      forceAdvanceOnAwardedFirst(next, rules, batterId);

      next.teams[next.defense].score.errors += 1;

      resetCountForNewPa(next, rules);
      startNextPlateAppearance(next, rules);
      return { ok: true, state: next, statsDelta };
    }

    case "STRIKEOUT":
      next.inning.outs += 1;
      resetCountForNewPa(next, rules);
      startNextPlateAppearance(next, rules);
      advanceHalfInningWithLob(next, rules, statsDelta);
      return { ok: true, state: next, statsDelta };

    case "DROPPED_THIRD_STRIKE": {
      const p = event.payload;

      next.pa.pitchCountInPa += 1;

      if (p.batter_safe) {
        next.bases["1B"] = p.batter_id;
      } else {
        next.inning.outs += 1;
      }

      if (Array.isArray(p.destinations) && p.destinations.length > 0) {
        applyRunnerOnlyDestinations(next, p.destinations);

        let scored = 0;
        if (Array.isArray(p.runs) && p.runs.length > 0) scored = p.runs.length;
        else scored = p.destinations.filter((d: any) => d.final === "HOME").length;

        if (scored > 0) {
          recordRun(next, next.offense, scored);
          maybeEndGameOnWalkOff(next, rules);
        }
      }

      resetCountForNewPa(next, rules);
      startNextPlateAppearance(next, rules);
      advanceHalfInningWithLob(next, rules, statsDelta);
      return { ok: true, state: next, statsDelta };
    }

    case "STOLEN_BASE": {
      const { runner_id, from, to } = event.payload;
      moveRunnerOnBases(next, runner_id, from, to);
      return { ok: true, state: next, statsDelta };
    }

    case "DEFENSIVE_INDIFFERENCE": {
      const { runner_id, from, to } = event.payload;
      moveRunnerOnBases(next, runner_id, from, to);
      return { ok: true, state: next, statsDelta };
    }

    case "CAUGHT_STEALING": {
      const { runner_id, from } = event.payload;
      removeRunnerFromBase(next, runner_id, from);
      next.inning.outs += 1;
      advanceHalfInningWithLob(next, rules, statsDelta);
      return { ok: true, state: next, statsDelta };
    }

    case "PICKOFF": {
      const { runner_id, at_base, is_out } = event.payload;
      if (is_out) {
        removeRunnerFromBase(next, runner_id, at_base);
        next.inning.outs += 1;
        advanceHalfInningWithLob(next, rules, statsDelta);
      }
      return { ok: true, state: next, statsDelta };
    }

    case "BALK": {
      const r1 = next.bases["1B"];
      const r2 = next.bases["2B"];
      const r3 = next.bases["3B"];

      let scored = 0;

      if (r3) {
        scored += 1;
      }

      next.bases = {};

      if (r2) next.bases["3B"] = r2;
      if (r1) next.bases["2B"] = r1;

      if (scored > 0) {
        const payloadRuns = (event.payload as any).runs;
        const runCount = Array.isArray(payloadRuns) && payloadRuns.length > 0 ? payloadRuns.length : scored;

        recordRun(next, next.offense, runCount);
        maybeEndGameOnWalkOff(next, rules);
      }

      return { ok: true, state: next, statsDelta };
    }

    case "WILD_PITCH": {
      const p: any = event.payload;

      const outsAdded = (p.outs?.length ?? 0) as number;
      if (outsAdded > 0) {
        next.inning.outs = clamp(next.inning.outs + outsAdded, 0, rules.outsPerInning);
      }

      applyRunnerOnlyDestinations(next, p.destinations);

      let scored = 0;
      if (Array.isArray(p.runs) && p.runs.length > 0) scored = p.runs.length;
      else scored = p.destinations.filter((d: any) => d.final === "HOME").length;

      if (scored > 0) {
        recordRun(next, next.offense, scored);
        maybeEndGameOnWalkOff(next, rules);
      }

      if (outsAdded > 0) {
        advanceHalfInningWithLob(next, rules, statsDelta);
      }

      return { ok: true, state: next, statsDelta };
    }

    case "PASSED_BALL": {
      const p: any = event.payload;

      const outsAdded = (p.outs?.length ?? 0) as number;
      if (outsAdded > 0) {
        next.inning.outs = clamp(next.inning.outs + outsAdded, 0, rules.outsPerInning);
      }

      applyRunnerOnlyDestinations(next, p.destinations);

      let scored = 0;
      if (Array.isArray(p.runs) && p.runs.length > 0) scored = p.runs.length;
      else scored = p.destinations.filter((d: any) => d.final === "HOME").length;

      if (scored > 0) {
        recordRun(next, next.offense, scored);
        maybeEndGameOnWalkOff(next, rules);
      }

      if (outsAdded > 0) {
        advanceHalfInningWithLob(next, rules, statsDelta);
      }

      return { ok: true, state: next, statsDelta };
    }
    //Ignore appeal for now. As engine won't be able to properly adjust game state from previous event. Future add on down t he line

 /*
    case "APPEAL_PLAY": {
     
      const p: any = event.payload;
      if (p.is_out) {
        removeRunnerFromBase(next, p.runner_id, p.at_base);
        next.inning.outs = clamp(next.inning.outs + 1, 0, rules.outsPerInning);
        advanceHalfInningWithLob(next, rules, statsDelta);
      }
      return { ok: true, state: next, statsDelta };

     
    }
 */
    case "RUN_SCORED": {
      const { teamSide } = event.payload;
      recordRun(next, teamSide, 1);
      maybeEndGameOnWalkOff(next, rules);
      return { ok: true, state: next, statsDelta };
    }

    case "ERROR_CHARGED": {
      const { teamSide } = event.payload;
      next.teams[teamSide].score.errors += 1;
      return { ok: true, state: next, statsDelta };
    }

    case "PITCHING_CHANGE": {
      applyPitchingChange(next, event.payload, event.eventId);
      return { ok: true, state: next, statsDelta };
    }

    case "SUBSTITUTION_BATTER": {
      applyLineupSubstitution(next, event.payload, event.eventId, "PH");
      return { ok: true, state: next, statsDelta };
    }

    case "SUBSTITUTION_RUNNER": {
      applyRunnerSubstitution(next, event.payload, event.eventId);
      return { ok: true, state: next, statsDelta };
    }

    case "SUBSTITUTION_FIELDER": {
      applyFielderSubstitution(next, event.payload, event.eventId);
      return { ok: true, state: next, statsDelta };
    }

    case "BIP": {
      const outsAdded = event.payload.outs.length;
      next.inning.outs = clamp(next.inning.outs + outsAdded, 0, rules.outsPerInning);

      const br = event.payload.batter_result;
      if (
        br === "1B" ||
        br === "2B" ||
        br === "3B" ||
        br === "HR" ||
        br === "GROUND_RULE_DOUBLE" ||
        br === "AUTOMATIC_DOUBLE"
      ) {
        next.teams[next.offense].score.hits += 1;
      }

      if (event.payload.errors && event.payload.errors.length > 0) {
        next.teams[next.defense].score.errors += event.payload.errors.length;
      }

      next.bases = {};
      for (const dest of event.payload.destinations) {
        const pid = dest.participant_id;
        const final = dest.final;

        if (final === "HOME" || final === "OUT") continue;

        if (final === "STAYS") {
          const backTo = eventBaseKeyToFinalDestination(dest.from as EventBaseKey);
          if (backTo === "1B" || backTo === "2B" || backTo === "3B") {
            resolveDestinationToBases(next, pid, backTo);
          }
          continue;
        }

        resolveDestinationToBases(next, pid, final);
      }

      let scored = 0;
      if (event.payload.runs && event.payload.runs.length > 0) scored = event.payload.runs.length;
      else scored = event.payload.destinations.filter((d) => d.final === "HOME").length;

      if (scored > 0) {
        recordRun(next, next.offense, scored);
        maybeEndGameOnWalkOff(next, rules);
      }

      resetCountForNewPa(next, rules);
      startNextPlateAppearance(next, rules);
      advanceHalfInningWithLob(next, rules, statsDelta);

      return { ok: true, state: next, statsDelta };
    }

    default:
      return { ok: true, state: next, statsDelta };
  }
}
