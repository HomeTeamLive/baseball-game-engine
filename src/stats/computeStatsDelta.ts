// src/stats/computeStatsDelta.ts
import type { GameState, PlayerId, TeamSide } from "../types/gameState";
import type { GameEvent } from "../types/events";
import type { PitchResult } from "../types/pitch";
import type { StatsDelta } from "../types/stats";
import { emptyDelta } from "../types/stats";
import type { BipRunAttribution, YesNoLater, EarnedStatus } from "../types/bip";

function inc(delta: StatsDelta, path: string, amount: number) {
  if (!amount) return;
  delta.inc[path] = (delta.inc[path] ?? 0) + amount;
}

function pPath(
  pid: PlayerId,
  group: "batting" | "running" | "fielding" | "pitching",
  stat: string
) {
  return `players.${pid}.${group}.${stat}`;
}

function tPath(
  side: TeamSide,
  group: "batting" | "running" | "fielding" | "pitching",
  stat: string
) {
  return `teams.${side}.${group}.${stat}`;
}

function pitchCountsAsPitch(payload: any): boolean {
  if (typeof payload?.count_as_pitch === "boolean") return payload.count_as_pitch;
  return true;
}

function isStrikeResult(r: PitchResult): boolean {
  return r === "CALLED_STRIKE" || r === "SWINGING_STRIKE" || r === "PITCH_CLOCK_STRIKE";
}

function isBallResult(r: PitchResult): boolean {
  return r === "BALL" || r === "PITCH_CLOCK_BALL";
}

function tbForBatterResult(br: string): number {
  if (br === "1B") return 1;
  if (br === "2B" || br === "GROUND_RULE_DOUBLE" || br === "AUTOMATIC_DOUBLE") return 2;
  if (br === "3B") return 3;
  if (br === "HR") return 4;
  return 0;
}

function yes(rbi: YesNoLater): boolean {
  return rbi === "YES";
}
function earned(e: EarnedStatus): boolean {
  return e === "EARNED";
}

function countRuns(
  runs?: BipRunAttribution[] | null,
  destinations?: any[] | null
): number {
  if (runs && runs.length) return runs.length;
  if (destinations && destinations.length) return destinations.filter((d) => d?.final === "HOME").length;
  return 0;
}

function rbiFromRuns(runs?: BipRunAttribution[] | null): number {
  if (!runs || !runs.length) return 0;
  return runs.reduce((acc, r) => acc + (yes(r.rbi) ? 1 : 0), 0);
}

function runsChargedToPitcher(
  runs: BipRunAttribution[] | null | undefined,
  pitcherId: PlayerId
): number {
  if (!runs || !runs.length) return 0;
  return runs.reduce((acc, r) => {
    const charged = r.charged_pitcher_id ?? pitcherId;
    return acc + (charged === pitcherId ? 1 : 0);
  }, 0);
}

function earnedRunsChargedToPitcher(
  runs: BipRunAttribution[] | null | undefined,
  pitcherId: PlayerId
): number {
  if (!runs || !runs.length) return 0;
  return runs.reduce((acc, r) => {
    const charged = r.charged_pitcher_id ?? pitcherId;
    const isEr = earned(r.earned);
    return acc + (charged === pitcherId && isEr ? 1 : 0);
  }, 0);
}

function creditPutoutAndAssists(
  delta: StatsDelta,
  defenseTeam: TeamSide,
  putout_by?: { player_id: PlayerId } | null,
  assists?: Array<{ player_id: PlayerId }> | null
) {
  if (putout_by?.player_id) {
    inc(delta, pPath(putout_by.player_id, "fielding", "PO"), 1);
    inc(delta, tPath(defenseTeam, "fielding", "PO"), 1);
  }

  if (assists && assists.length > 0) {
    for (const a of assists) {
      if (!a?.player_id) continue;
      inc(delta, pPath(a.player_id, "fielding", "A"), 1);
      inc(delta, tPath(defenseTeam, "fielding", "A"), 1);
    }
  }
}

export function computeStatsDelta(prevState: GameState, event: GameEvent): StatsDelta {
  const delta = emptyDelta();

  const stateBatterId = prevState.pa.batter.playerId;
  const statePitcherId = prevState.pa.pitcherId;

  const offenseTeam: TeamSide = prevState.offense;
  const defenseTeam: TeamSide = prevState.defense;

  const currentPitcherId = prevState.teams[defenseTeam].onField.defense["P"];
  const currentCatcherId = prevState.teams[defenseTeam].onField.defense["C"];

  switch (event.name) {
    case "PITCH": {
      const result: PitchResult = event.payload.result;
      const counts = pitchCountsAsPitch(event.payload);

      if (counts) {
        inc(delta, pPath(statePitcherId, "pitching", "PITCHES"), 1);
        inc(delta, tPath(defenseTeam, "pitching", "PITCHES"), 1);
      }

      if (counts && isStrikeResult(result)) {
        inc(delta, pPath(statePitcherId, "pitching", "STRIKES"), 1);
        inc(delta, tPath(defenseTeam, "pitching", "STRIKES"), 1);
      }

      if (counts && isBallResult(result)) {
        inc(delta, pPath(statePitcherId, "pitching", "BALLS"), 1);
        inc(delta, tPath(defenseTeam, "pitching", "BALLS"), 1);
      }

      const currentBalls = prevState.inning?.count?.balls ?? 0;
      const currentStrikes = prevState.inning?.count?.strikes ?? 0;
      const ballsForWalk = 4; 
      const strikesForOut = 3; 

      const willAutoWalk = isBallResult(result) && (currentBalls + 1) >= ballsForWalk;
      const willAutoStrikeout = isStrikeResult(result) && (currentStrikes + 1) >= strikesForOut;

      if (willAutoWalk) {
        inc(delta, pPath(stateBatterId, "batting", "PA"), 1);
        inc(delta, tPath(offenseTeam, "batting", "PA"), 1);

        inc(delta, pPath(statePitcherId, "pitching", "BF"), 1);
        inc(delta, tPath(defenseTeam, "pitching", "BF"), 1);

        inc(delta, pPath(stateBatterId, "batting", "BB"), 1);
        inc(delta, tPath(offenseTeam, "batting", "BB"), 1);

        inc(delta, pPath(statePitcherId, "pitching", "BB"), 1);
        inc(delta, tPath(defenseTeam, "pitching", "BB"), 1);

        const r3 = prevState.bases["3B"];
        const r2 = prevState.bases["2B"];
        const r1 = prevState.bases["1B"];
        if (r3 && r2 && r1) {
          inc(delta, pPath(r3, "batting", "R"), 1);
          inc(delta, tPath(offenseTeam, "batting", "R"), 1);
          inc(delta, pPath(stateBatterId, "batting", "RBI"), 1);
          inc(delta, tPath(offenseTeam, "batting", "RBI"), 1);
          inc(delta, pPath(statePitcherId, "pitching", "R"), 1);
          inc(delta, tPath(defenseTeam, "pitching", "R"), 1);
          inc(delta, pPath(statePitcherId, "pitching", "ER"), 1);
          inc(delta, tPath(defenseTeam, "pitching", "ER"), 1);
        }
      }

      if (willAutoStrikeout) {
        inc(delta, pPath(stateBatterId, "batting", "PA"), 1);
        inc(delta, tPath(offenseTeam, "batting", "PA"), 1);

        inc(delta, pPath(stateBatterId, "batting", "AB"), 1);
        inc(delta, tPath(offenseTeam, "batting", "AB"), 1);

        inc(delta, pPath(statePitcherId, "pitching", "BF"), 1);
        inc(delta, tPath(defenseTeam, "pitching", "BF"), 1);

        inc(delta, pPath(stateBatterId, "batting", "SO"), 1);
        inc(delta, tPath(offenseTeam, "batting", "SO"), 1);

        inc(delta, pPath(statePitcherId, "pitching", "SO"), 1);
        inc(delta, tPath(defenseTeam, "pitching", "SO"), 1);

        inc(delta, pPath(statePitcherId, "pitching", "OUTS_PITCHED"), 1);
        inc(delta, tPath(defenseTeam, "pitching", "OUTS_PITCHED"), 1);
      }

      return delta;
    }

    case "WALK":
    case "INTENTIONAL_WALK":
    case "HBP":
    case "STRIKEOUT":
    case "CATCHER_INTERFERENCE": {
      const p: any = event.payload;

      const batterId: PlayerId = p?.batter_id ?? stateBatterId;
      const pitcherId: PlayerId = p?.pitcher_id ?? statePitcherId;

      inc(delta, pPath(batterId, "batting", "PA"), 1);
      inc(delta, tPath(offenseTeam, "batting", "PA"), 1);

      inc(delta, pPath(pitcherId, "pitching", "BF"), 1);
      inc(delta, tPath(defenseTeam, "pitching", "BF"), 1);

      if (event.name === "CATCHER_INTERFERENCE") {
        inc(delta, pPath(batterId, "batting", "BB"), 1);
        inc(delta, tPath(offenseTeam, "batting", "BB"), 1);

        inc(delta, tPath(defenseTeam, "fielding", "E"), 1);
        return delta;
      }

      if (event.name === "WALK" || event.name === "INTENTIONAL_WALK") {
        inc(delta, pPath(batterId, "batting", "BB"), 1);
        inc(delta, tPath(offenseTeam, "batting", "BB"), 1);

        inc(delta, pPath(pitcherId, "pitching", "BB"), 1);
        inc(delta, tPath(defenseTeam, "pitching", "BB"), 1);

        if (event.name === "INTENTIONAL_WALK") {
          inc(delta, pPath(batterId, "batting", "IBB"), 1);
          inc(delta, pPath(pitcherId, "pitching", "IBB"), 1);
        }
      }

      if (event.name === "HBP") {
        inc(delta, pPath(batterId, "batting", "HBP"), 1);
        inc(delta, tPath(offenseTeam, "batting", "HBP"), 1);

        inc(delta, pPath(pitcherId, "pitching", "HBP"), 1);
        inc(delta, tPath(defenseTeam, "pitching", "HBP"), 1);
      }

      if (event.name === "STRIKEOUT") {
        inc(delta, pPath(batterId, "batting", "AB"), 1);
        inc(delta, tPath(offenseTeam, "batting", "AB"), 1);

        inc(delta, pPath(batterId, "batting", "SO"), 1);
        inc(delta, tPath(offenseTeam, "batting", "SO"), 1);

        inc(delta, pPath(pitcherId, "pitching", "SO"), 1);
        inc(delta, tPath(defenseTeam, "pitching", "SO"), 1);

        inc(delta, pPath(pitcherId, "pitching", "OUTS_PITCHED"), 1);
        inc(delta, tPath(defenseTeam, "pitching", "OUTS_PITCHED"), 1);
      }

      if (event.name !== "STRIKEOUT") {
        const r3 = prevState.bases["3B"];
        const r2 = prevState.bases["2B"];
        const r1 = prevState.bases["1B"];
        if (r3 && r2 && r1) {
          inc(delta, pPath(r3, "batting", "R"), 1);
          inc(delta, tPath(offenseTeam, "batting", "R"), 1);
          inc(delta, pPath(batterId, "batting", "RBI"), 1);
          inc(delta, tPath(offenseTeam, "batting", "RBI"), 1);
          inc(delta, pPath(pitcherId, "pitching", "R"), 1);
          inc(delta, tPath(defenseTeam, "pitching", "R"), 1);
          inc(delta, pPath(pitcherId, "pitching", "ER"), 1);
          inc(delta, tPath(defenseTeam, "pitching", "ER"), 1);
        }
      }

      return delta;
    }

    case "DROPPED_THIRD_STRIKE": {
      const p: any = event.payload;
      const batterId: PlayerId = p?.batter_id ?? stateBatterId;
      const pitcherId: PlayerId = p?.pitcher_id ?? statePitcherId;

      inc(delta, pPath(batterId, "batting", "PA"), 1);
      inc(delta, tPath(offenseTeam, "batting", "PA"), 1);
      inc(delta, pPath(batterId, "batting", "AB"), 1);
      inc(delta, tPath(offenseTeam, "batting", "AB"), 1);
      inc(delta, pPath(batterId, "batting", "SO"), 1);
      inc(delta, tPath(offenseTeam, "batting", "SO"), 1);

      inc(delta, pPath(pitcherId, "pitching", "BF"), 1);
      inc(delta, tPath(defenseTeam, "pitching", "BF"), 1);
      inc(delta, pPath(pitcherId, "pitching", "SO"), 1);
      inc(delta, tPath(defenseTeam, "pitching", "SO"), 1);

      inc(delta, pPath(pitcherId, "pitching", "PITCHES"), 1);
      inc(delta, tPath(defenseTeam, "pitching", "PITCHES"), 1);
      inc(delta, pPath(pitcherId, "pitching", "STRIKES"), 1);
      inc(delta, tPath(defenseTeam, "pitching", "STRIKES"), 1);

      if (!p.batter_safe) {
        inc(delta, pPath(pitcherId, "pitching", "OUTS_PITCHED"), 1);
        inc(delta, tPath(defenseTeam, "pitching", "OUTS_PITCHED"), 1);

        creditPutoutAndAssists(delta, defenseTeam, p.putout_by ?? null, p.assists ?? null);
      }

      const runs = p.runs;
      const destinations = p.destinations;
      const runsScored = countRuns(runs, destinations);
      if (runsScored > 0) {
        inc(delta, tPath(offenseTeam, "batting", "R"), runsScored);

        if (Array.isArray(runs) && runs.length > 0) {
          const rCharged = runsChargedToPitcher(runs, pitcherId);
          const erCharged = earnedRunsChargedToPitcher(runs, pitcherId);
          if (rCharged > 0) {
            inc(delta, pPath(pitcherId, "pitching", "R"), rCharged);
            inc(delta, tPath(defenseTeam, "pitching", "R"), rCharged);
          }
          if (erCharged > 0) {
            inc(delta, pPath(pitcherId, "pitching", "ER"), erCharged);
            inc(delta, tPath(defenseTeam, "pitching", "ER"), erCharged);
          }
          for (const r of runs) {
            if (r.runner_id) inc(delta, pPath(r.runner_id, "batting", "R"), 1);
          }
        } else if (Array.isArray(destinations)) {
          for (const d of destinations) {
            if (d?.final === "HOME" && d?.participant_id) {
              inc(delta, pPath(d.participant_id, "batting", "R"), 1);
            }
          }
        }
      }

      return delta;
    }


    case "STOLEN_BASE": {
      const { runner_id } = event.payload;

      inc(delta, pPath(runner_id, "running", "SB"), 1);
      inc(delta, tPath(offenseTeam, "running", "SB"), 1);
      return delta;
    }

    case "CAUGHT_STEALING": {
      const { runner_id, putout_by, assists } = event.payload;

      inc(delta, pPath(runner_id, "running", "CS"), 1);
      inc(delta, tPath(offenseTeam, "running", "CS"), 1);

      inc(delta, pPath(currentPitcherId, "pitching", "OUTS_PITCHED"), 1);
      inc(delta, tPath(defenseTeam, "pitching", "OUTS_PITCHED"), 1);

      creditPutoutAndAssists(delta, defenseTeam, putout_by ?? null, assists ?? null);

      return delta;
    }

    case "PICKOFF": {
      const { runner_id, is_out, putout_by, assists } = event.payload;

      inc(delta, pPath(currentPitcherId, "pitching", "PKA"), 1);
      inc(delta, tPath(defenseTeam, "pitching", "PKA"), 1);

      inc(delta, pPath(runner_id, "running", "POA"), 1);
      inc(delta, tPath(offenseTeam, "running", "POA"), 1);

      inc(delta, pPath(currentCatcherId, "running", "POA"), 1);
      inc(delta, tPath(defenseTeam, "running", "POA"), 1);

      if (is_out) {
        inc(delta, pPath(currentPitcherId, "pitching", "PK"), 1);
        inc(delta, tPath(defenseTeam, "pitching", "PK"), 1);

        inc(delta, pPath(runner_id, "running", "PO"), 1);
        inc(delta, tPath(offenseTeam, "running", "PO"), 1);

        inc(delta, pPath(currentPitcherId, "pitching", "OUTS_PITCHED"), 1);
        inc(delta, tPath(defenseTeam, "pitching", "OUTS_PITCHED"), 1);

        creditPutoutAndAssists(delta, defenseTeam, putout_by ?? null, assists ?? null);
      }

      return delta;
    }

    case "APPEAL_PLAY": {
      const { runner_id, is_out } = event.payload;

      if (is_out) {
        inc(delta, pPath(runner_id, "running", "PO"), 1);
        inc(delta, tPath(offenseTeam, "running", "PO"), 1);

        inc(delta, pPath(currentPitcherId, "pitching", "OUTS_PITCHED"), 1);
        inc(delta, tPath(defenseTeam, "pitching", "OUTS_PITCHED"), 1);
      }
      return delta;
    }

        case "BALK": {
      const { pitcher_id, runs } = event.payload as any;
      const pid = pitcher_id ?? currentPitcherId;

      inc(delta, pPath(pid, "pitching", "BK"), 1);
      inc(delta, tPath(defenseTeam, "pitching", "BK"), 1);

      const inferred = prevState.bases["3B"] ? 1 : 0;
      const runsScored = Array.isArray(runs) && runs.length > 0 ? runs.length : inferred;

      if (runsScored > 0) {
        inc(delta, tPath(offenseTeam, "batting", "R"), runsScored);

        if (Array.isArray(runs) && runs.length > 0) {
          const rCharged = runsChargedToPitcher(runs, pid);
          const erCharged = earnedRunsChargedToPitcher(runs, pid);

          if (rCharged > 0) {
            inc(delta, pPath(pid, "pitching", "R"), rCharged);
            inc(delta, tPath(defenseTeam, "pitching", "R"), rCharged);
          }
          if (erCharged > 0) {
            inc(delta, pPath(pid, "pitching", "ER"), erCharged);
            inc(delta, tPath(defenseTeam, "pitching", "ER"), erCharged);
          }

          for (const r of runs) {
            if (r.runner_id) inc(delta, pPath(r.runner_id, "batting", "R"), 1);
          }
        } else if (prevState.bases["3B"]) {
          inc(delta, pPath(prevState.bases["3B"], "batting", "R"), 1);

          inc(delta, pPath(pid, "pitching", "R"), runsScored);
          inc(delta, tPath(defenseTeam, "pitching", "R"), runsScored);

          inc(delta, pPath(pid, "pitching", "ER"), runsScored);
          inc(delta, tPath(defenseTeam, "pitching", "ER"), runsScored);
        }
      }

      return delta;
    }

    case "WILD_PITCH": {
      const { pitcher_id, destinations, outs, runs } = event.payload as any;
      const pid = pitcher_id ?? currentPitcherId;

      inc(delta, pPath(pid, "pitching", "WP"), 1);
      inc(delta, tPath(defenseTeam, "pitching", "WP"), 1);

      const outsAdded = (outs?.length ?? 0) as number;
      if (outsAdded > 0) {
        inc(delta, pPath(pid, "pitching", "OUTS_PITCHED"), outsAdded);
        inc(delta, tPath(defenseTeam, "pitching", "OUTS_PITCHED"), outsAdded);
      }

      const runsScored = countRuns(runs, destinations);
      if (runsScored > 0) {
        inc(delta, tPath(offenseTeam, "batting", "R"), runsScored);

        if (Array.isArray(runs) && runs.length > 0) {
          const rCharged = runsChargedToPitcher(runs, pid);
          const erCharged = earnedRunsChargedToPitcher(runs, pid);

          if (rCharged > 0) {
            inc(delta, pPath(pid, "pitching", "R"), rCharged);
            inc(delta, tPath(defenseTeam, "pitching", "R"), rCharged);
          }
          if (erCharged > 0) {
            inc(delta, pPath(pid, "pitching", "ER"), erCharged);
            inc(delta, tPath(defenseTeam, "pitching", "ER"), erCharged);
          }

          for (const r of runs) {
            if (r.runner_id) inc(delta, pPath(r.runner_id, "batting", "R"), 1);
          }
        } else {
          inc(delta, pPath(pid, "pitching", "R"), runsScored);
          inc(delta, tPath(defenseTeam, "pitching", "R"), runsScored);

          inc(delta, pPath(pid, "pitching", "ER"), runsScored);
          inc(delta, tPath(defenseTeam, "pitching", "ER"), runsScored);

          if (Array.isArray(destinations)) {
            for (const d of destinations) {
              if (d?.final === "HOME" && d?.participant_id) {
                inc(delta, pPath(d.participant_id, "batting", "R"), 1);
              }
            }
          }
        }
      }

      return delta;
    }

    case "PASSED_BALL": {
      const { catcher_id, destinations, outs, runs } = event.payload as any;
      const cid = catcher_id ?? currentCatcherId;

      inc(delta, pPath(cid, "fielding", "PB"), 1);

      const outsAdded = (outs?.length ?? 0) as number;
      if (outsAdded > 0) {
        inc(delta, pPath(currentPitcherId, "pitching", "OUTS_PITCHED"), outsAdded);
        inc(delta, tPath(defenseTeam, "pitching", "OUTS_PITCHED"), outsAdded);
      }

      const runsScored = countRuns(runs, destinations);
      if (runsScored > 0) {
        inc(delta, tPath(offenseTeam, "batting", "R"), runsScored);

        if (Array.isArray(runs) && runs.length > 0) {
          const rCharged = runsChargedToPitcher(runs, currentPitcherId);
          const erCharged = earnedRunsChargedToPitcher(runs, currentPitcherId);

          if (rCharged > 0) {
            inc(delta, pPath(currentPitcherId, "pitching", "R"), rCharged);
            inc(delta, tPath(defenseTeam, "pitching", "R"), rCharged);
          }
          if (erCharged > 0) {
            inc(delta, pPath(currentPitcherId, "pitching", "ER"), erCharged);
            inc(delta, tPath(defenseTeam, "pitching", "ER"), erCharged);
          }

          for (const r of runs) {
            if (r.runner_id) inc(delta, pPath(r.runner_id, "batting", "R"), 1);
          }
        } else {
          inc(delta, pPath(currentPitcherId, "pitching", "R"), runsScored);
          inc(delta, tPath(defenseTeam, "pitching", "R"), runsScored);

          inc(delta, pPath(currentPitcherId, "pitching", "ER"), runsScored);
          inc(delta, tPath(defenseTeam, "pitching", "ER"), runsScored);

          if (Array.isArray(destinations)) {
            for (const d of destinations) {
              if (d?.final === "HOME" && d?.participant_id) {
                inc(delta, pPath(d.participant_id, "batting", "R"), 1);
              }
            }
          }
        }
      }

      return delta;
    }


    case "DEFENSIVE_INDIFFERENCE":
      return delta;


    case "BIP": {
      const p = event.payload;
      const batterId: PlayerId = p.batter_id;
      const pitcherId: PlayerId = prevState.pa.pitcherId;

      inc(delta, pPath(batterId, "batting", "PA"), 1);
      inc(delta, tPath(offenseTeam, "batting", "PA"), 1);

      inc(delta, pPath(pitcherId, "pitching", "BF"), 1);
      inc(delta, tPath(defenseTeam, "pitching", "BF"), 1);

      const br = p.batter_result;
      const outSubtype = p.batter_out_subtype ?? "NONE";

      const isHit =
        br === "1B" ||
        br === "2B" ||
        br === "3B" ||
        br === "HR" ||
        br === "GROUND_RULE_DOUBLE" ||
        br === "AUTOMATIC_DOUBLE";

      const isOut = br === "OUT";
      const isRoe = br === "ROE";
      const isFc = br === "FC";

      if (isHit) {
        inc(delta, pPath(batterId, "batting", "AB"), 1);
        inc(delta, tPath(offenseTeam, "batting", "AB"), 1);
      } else if (isOut) {
        if (outSubtype === "SAC_FLY") {
          inc(delta, pPath(batterId, "batting", "SF"), 1);
        } else if (outSubtype === "SAC_BUNT") {
          inc(delta, pPath(batterId, "batting", "SH"), 1);
        } else {
          inc(delta, pPath(batterId, "batting", "AB"), 1);
          inc(delta, tPath(offenseTeam, "batting", "AB"), 1);
        }
      } else if (isRoe) {
        inc(delta, pPath(batterId, "batting", "AB"), 1);
        inc(delta, tPath(offenseTeam, "batting", "AB"), 1);
        inc(delta, pPath(batterId, "batting", "ROE"), 1);
      } else if (isFc) {
        inc(delta, pPath(batterId, "batting", "AB"), 1);
        inc(delta, tPath(offenseTeam, "batting", "AB"), 1);
        inc(delta, pPath(batterId, "batting", "FC"), 1);
      }

      if (isHit) {
        inc(delta, pPath(batterId, "batting", "H"), 1);
        inc(delta, tPath(offenseTeam, "batting", "H"), 1);

        inc(delta, pPath(pitcherId, "pitching", "H"), 1);
        inc(delta, tPath(defenseTeam, "pitching", "H"), 1);

        const tb = tbForBatterResult(br);
        inc(delta, pPath(batterId, "batting", "TB"), tb);

        if (br === "2B" || br === "GROUND_RULE_DOUBLE" || br === "AUTOMATIC_DOUBLE") {
          inc(delta, pPath(batterId, "batting", "2B"), 1);
          inc(delta, tPath(offenseTeam, "batting", "2B"), 1);
        } else if (br === "3B") {
          inc(delta, pPath(batterId, "batting", "3B"), 1);
          inc(delta, tPath(offenseTeam, "batting", "3B"), 1);
        } else if (br === "HR") {
          inc(delta, pPath(batterId, "batting", "HR"), 1);
          inc(delta, tPath(offenseTeam, "batting", "HR"), 1);

          inc(delta, pPath(pitcherId, "pitching", "HR"), 1);
          inc(delta, tPath(defenseTeam, "pitching", "HR"), 1);

          const runnersOnForHr = [prevState.bases["1B"], prevState.bases["2B"], prevState.bases["3B"]].filter(Boolean).length;
          const totalHrRuns = 1 + runnersOnForHr;
          if (totalHrRuns === 1) {
            inc(delta, pPath(batterId, "batting", "HR_SOLO"), 1);
            inc(delta, tPath(offenseTeam, "batting", "HR_SOLO"), 1);
            inc(delta, pPath(pitcherId, "pitching", "HR_SOLO"), 1);
            inc(delta, tPath(defenseTeam, "pitching", "HR_SOLO"), 1);
          } else if (totalHrRuns === 2) {
            inc(delta, pPath(batterId, "batting", "HR_2RUN"), 1);
            inc(delta, tPath(offenseTeam, "batting", "HR_2RUN"), 1);
            inc(delta, pPath(pitcherId, "pitching", "HR_2RUN"), 1);
            inc(delta, tPath(defenseTeam, "pitching", "HR_2RUN"), 1);
          } else if (totalHrRuns === 4) {
            inc(delta, pPath(batterId, "batting", "HR_GRANDSLAM"), 1);
            inc(delta, tPath(offenseTeam, "batting", "HR_GRANDSLAM"), 1);
            inc(delta, pPath(pitcherId, "pitching", "HR_GRANDSLAM"), 1);
            inc(delta, tPath(defenseTeam, "pitching", "HR_GRANDSLAM"), 1);
          }
        }
      }

      const outsAdded = p.outs.length;
      if (outsAdded > 0) {
        inc(delta, pPath(pitcherId, "pitching", "OUTS_PITCHED"), outsAdded);
        inc(delta, tPath(defenseTeam, "pitching", "OUTS_PITCHED"), outsAdded);

        for (const out of p.outs) {
          creditPutoutAndAssists(delta, defenseTeam, out.putout_by ?? null, out.assists ?? null);
        }

        if (outsAdded >= 2) {
          const dpFielderIds = new Set<string>();
          for (const out of p.outs) {
            if (out.putout_by?.player_id) dpFielderIds.add(out.putout_by.player_id);
            if (out.assists) for (const a of out.assists) { if (a.player_id) dpFielderIds.add(a.player_id); }
          }
          for (const fid of dpFielderIds) {
            inc(delta, pPath(fid, "fielding", "DP"), 1);
          }
          inc(delta, tPath(defenseTeam, "fielding", "DP"), 1);

          inc(delta, pPath(batterId, "batting", "DP"), 1);
          inc(delta, tPath(offenseTeam, "batting", "DP"), 1);

          const batterIsOut = p.outs.some(o => o.runner_id === batterId);
          const isGroundBall = p.batted_ball?.type === "GB" || p.batted_ball?.type === "BUNT";
          if (batterIsOut && isGroundBall) {
            inc(delta, pPath(batterId, "batting", "GIDP"), 1);
            inc(delta, tPath(offenseTeam, "batting", "GIDP"), 1);
          }
        }
        if (outsAdded >= 3) {
          const tpFielderIds = new Set<string>();
          for (const out of p.outs) {
            if (out.putout_by?.player_id) tpFielderIds.add(out.putout_by.player_id);
            if (out.assists) for (const a of out.assists) { if (a.player_id) tpFielderIds.add(a.player_id); }
          }
          for (const fid of tpFielderIds) {
            inc(delta, pPath(fid, "fielding", "TP"), 1);
          }
          inc(delta, tPath(defenseTeam, "fielding", "TP"), 1);
        }
      }

      if (p.errors && p.errors.length > 0) {
        inc(delta, tPath(defenseTeam, "fielding", "E"), p.errors.length);
        for (const e of p.errors) {
          if (e.fielder_pos) {
            const fielderId = prevState.teams[defenseTeam].onField.defense[e.fielder_pos];
            if (fielderId) {
              inc(delta, pPath(fielderId, "fielding", "E"), 1);
            }
          }
        }
      }

      const runsScored = countRuns(p.runs, p.destinations);
      if (runsScored > 0) {
        inc(delta, tPath(offenseTeam, "batting", "R"), runsScored);

        if (p.runs && p.runs.length > 0) {
          const rCharged = runsChargedToPitcher(p.runs, pitcherId);
          const erCharged = earnedRunsChargedToPitcher(p.runs, pitcherId);

          if (rCharged > 0) {
            inc(delta, pPath(pitcherId, "pitching", "R"), rCharged);
            inc(delta, tPath(defenseTeam, "pitching", "R"), rCharged);
          }
          if (erCharged > 0) {
            inc(delta, pPath(pitcherId, "pitching", "ER"), erCharged);
            inc(delta, tPath(defenseTeam, "pitching", "ER"), erCharged);
          }

          const rbi = rbiFromRuns(p.runs);
          if (rbi > 0) {
            inc(delta, pPath(batterId, "batting", "RBI"), rbi);
            inc(delta, tPath(offenseTeam, "batting", "RBI"), rbi);
          }

          for (const run of p.runs) {
            if (run.runner_id) {
              inc(delta, pPath(run.runner_id, "batting", "R"), 1);
            }
          }
        } else {
          for (const d of p.destinations) {
            if (d.final === "HOME" && d.participant_id) {
              inc(delta, pPath(d.participant_id, "batting", "R"), 1);
            }
          }
        }
      }

      return delta;
    }

    default:
      return delta;
  }
}
