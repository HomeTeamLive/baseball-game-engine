// src/engine/validateEvent.ts
import type { GameState, TeamSide, DefensePos, BaseKey } from "../types/gameState";
import type { GameEvent } from "../types/events";
import type { EffectiveGameRules } from "../types/gameRules";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

function err(errors: string[], message: string) {
  errors.push(message);
}

 
const SUPPORTED_EVENTS = new Set<GameEvent["name"]>([
  "GAME_STARTED",
  "GAME_PAUSED",
  "GAME_RESUMED",
  "GAME_FINAL",

  "LINEUP_SET",

  "AT_BAT_START",
  "INNING_ADVANCE",

  "PITCH",
  "BIP",
  "WALK",
  "INTENTIONAL_WALK",
  "HBP",
  "STRIKEOUT",

  "STOLEN_BASE",
  "CAUGHT_STEALING",
  "PICKOFF",

  "BALK",
  "WILD_PITCH",
  "PASSED_BALL",
  "DEFENSIVE_INDIFFERENCE",
  "APPEAL_PLAY",

  "CATCHER_INTERFERENCE",
  "DROPPED_THIRD_STRIKE",

  "RUN_SCORED",
  "ERROR_CHARGED",

  "SUBSTITUTION_BATTER",
  "SUBSTITUTION_RUNNER",
  "SUBSTITUTION_FIELDER",
  "PITCHING_CHANGE",
]);

function baseOccupiedBy(state: GameState, base: BaseKey) {
  return state.bases[base];
}

function isOnRoster(state: GameState, teamSide: TeamSide, playerId: string): boolean {
  return (state.roster?.[teamSide] ?? []).includes(playerId);
}

function requireKeys(errors: string[], obj: any, keys: string[], ctx: string) {
  for (const k of keys) {
    if (obj?.[k] === undefined) err(errors, `${ctx}: missing required field '${k}'`);
  }
}

function isString(x: any): x is string {
  return typeof x === "string" && x.length > 0;
}

function isBaseKey(x: any): x is BaseKey {
  return x === "1B" || x === "2B" || x === "3B";
}

function isEventBaseKey(x: any): boolean {
  return x === "HOME" || x === "1B" || x === "2B" || x === "3B";
}

function isFinalDest(x: any): boolean {
  return x === "STAYS" || x === "1B" || x === "2B" || x === "3B" || x === "HOME" || x === "OUT";
}

function isOutNumber(x: any): boolean {
  return x === 1 || x === 2 || x === 3;
}

function isDefensePos(x: any): boolean {
  return typeof x === "string" && x.length > 0;
}

function validateRunsArray(errors: string[], runs: any, ctx: string) {
  if (runs === undefined) return;   
  if (runs === null) return; 

  if (!Array.isArray(runs)) {
    err(errors, `${ctx}: runs must be an array or null if provided`);
    return;
  }

  for (const r of runs) {
    if (!r || typeof r !== "object") {
      err(errors, `${ctx}: runs entries must be objects`);
      continue;
    }
    if (!isString(r.runner_id)) err(errors, `${ctx}: runs.runner_id must be string`);
    if (!isString(r.rbi)) err(errors, `${ctx}: runs.rbi required (YES|NO|DECIDE_LATER)`);
    if (!isString(r.earned)) err(errors, `${ctx}: runs.earned required (EARNED|UNEARNED|DECIDE_LATER)`);
    if (r.charged_pitcher_id !== undefined && r.charged_pitcher_id !== null && !isString(r.charged_pitcher_id)) {
      err(errors, `${ctx}: runs.charged_pitcher_id must be string|null if provided`);
    }
  }
}

function validateOutsArray(errors: string[], outs: any, ctx: string) {
  if (outs === undefined) return; 
  if (outs === null) return;

  if (!Array.isArray(outs)) {
    err(errors, `${ctx}: outs must be an array if provided`);
    return;
  }

  for (const o of outs) {
    if (!o || typeof o !== "object") {
      err(errors, `${ctx}: outs entries must be objects`);
      continue;
    }
    if (!isOutNumber(o.out_number)) err(errors, `${ctx}: outs.out_number must be 1|2|3`);
    if (!isString(o.runner_id)) err(errors, `${ctx}: outs.runner_id must be string`);
    if (!isEventBaseKey(o.where)) err(errors, `${ctx}: outs.where must be HOME|1B|2B|3B`);

    if (!o.putout_by || typeof o.putout_by !== "object") {
      err(errors, `${ctx}: outs.putout_by is required`);
    } else {
      if (!isString(o.putout_by.player_id)) err(errors, `${ctx}: outs.putout_by.player_id required`);
      if (!isDefensePos(o.putout_by.pos)) err(errors, `${ctx}: outs.putout_by.pos required`);
    }

    if (o.assists !== undefined && o.assists !== null) {
      if (!Array.isArray(o.assists)) {
        err(errors, `${ctx}: outs.assists must be an array if provided`);
      } else {
        for (const a of o.assists) {
          if (!a || typeof a !== "object") {
            err(errors, `${ctx}: outs.assists entries must be objects`);
            continue;
          }
          if (!isString(a.player_id)) err(errors, `${ctx}: outs.assists.player_id required`);
          if (!isDefensePos(a.pos)) err(errors, `${ctx}: outs.assists.pos required`);
        }
      }
    }
  }
}

 
function validateDestinationsForAllCurrentRunners(
  errors: string[],
  state: GameState,
  destinations: any,
  ctx: string
) {
  if (!Array.isArray(destinations)) {
    err(errors, `${ctx}: destinations must be an array`);
    return;
  }

  const current: Array<{ base: BaseKey; runner_id: string }> = [];
  if (state.bases["1B"]) current.push({ base: "1B", runner_id: state.bases["1B"] });
  if (state.bases["2B"]) current.push({ base: "2B", runner_id: state.bases["2B"] });
  if (state.bases["3B"]) current.push({ base: "3B", runner_id: state.bases["3B"] });

  const currentIds = new Set(current.map((x) => x.runner_id));

  const byPid = new Map<string, any>();
  for (const d of destinations) {
    if (!d || typeof d !== "object") {
      err(errors, `${ctx}: destination entries must be objects`);
      continue;
    }
    const pid = d.participant_id;
    if (!isString(pid)) {
      err(errors, `${ctx}: destination.participant_id must be a string`);
      continue;
    }

    if (!isEventBaseKey(d.from)) err(errors, `${ctx}: destination.from must be HOME|1B|2B|3B`);
    if (!isFinalDest(d.final)) err(errors, `${ctx}: destination.final must be STAYS|1B|2B|3B|HOME|OUT`);

    if (d.from === "HOME") err(errors, `${ctx}: destinations must not include from=HOME for runner-only events`);

    if (byPid.has(pid)) err(errors, `${ctx}: runner '${pid}' appears more than once in destinations`);
    byPid.set(pid, d);

    if (!currentIds.has(pid)) err(errors, `${ctx}: destination includes runner '${pid}' who was not on base`);
  }

   for (const r of current) {
    const d = byPid.get(r.runner_id);
    if (!d) {
      err(errors, `${ctx}: missing destination for runner '${r.runner_id}' on ${r.base}`);
      continue;
    }
    if (d.from !== r.base) {
      err(errors, `${ctx}: runner '${r.runner_id}' must have from='${r.base}' (got '${d.from}')`);
    }
  }

  const occupied = new Map<"1B" | "2B" | "3B", string>();
  for (const d of destinations) {
    const final = d?.final;
    const pid = d?.participant_id;
    if (!isString(pid)) continue;
    if (final === "1B" || final === "2B" || final === "3B") {
      if (occupied.has(final)) err(errors, `${ctx}: multiple runners cannot end on ${final}`);
      else occupied.set(final, pid);
    }
  }
}

export function validateEvent(state: GameState, rules: EffectiveGameRules, event: GameEvent): ValidationResult {
  const errors: string[] = [];

  if (!event || typeof event !== "object") {
    return { ok: false, errors: ["event must be an object"] };
  }

  if (!SUPPORTED_EVENTS.has(event.name)) {
    return { ok: false, errors: [`Unsupported event '${event.name}' (engine cannot apply it yet)`] };
  }

  if (!event.eventId || typeof event.eventId !== "string") err(errors, "event.eventId must be a string");
  //lineupset on pre game statu
  if (
    state.gameStatus === "PRE_GAME" &&
    event.name !== "GAME_STARTED" &&
    event.name !== "GAME_FINAL" &&
    event.name !== "LINEUP_SET" 
  ) {
    return { ok: false, errors: [`Event '${event.name}' is not allowed while gameStatus is PRE_GAME`] };
  }

   if (state.gameStatus === "FINAL") {
    return { ok: false, errors: [`Event '${event.name}' is not allowed while gameStatus is FINAL`] };
  }


  if (
      state.gameStatus === "PAUSED" &&
      event.name !== "GAME_RESUMED" &&
      event.name !== "GAME_FINAL"
    ) {
      return { ok: false, errors: [`Event '${event.name}' is not allowed while gameStatus is PAUSED`] };
    }


  if (
    event.name === "GAME_STARTED" ||
    event.name === "GAME_PAUSED" ||
    event.name === "GAME_RESUMED" ||
    event.name === "GAME_FINAL" 
    
  ) {
    return { ok: errors.length === 0, errors };
  }

  if (event.name === "LINEUP_SET") {
    requireKeys(errors, event.payload, ["teamSide", "slots"], "LINEUP_SET.payload");

    const teamSide = (event.payload as any)?.teamSide;
    const slots = (event.payload as any)?.slots;

    if (teamSide !== "HOME" && teamSide !== "AWAY") {
      err(errors, "LINEUP_SET: teamSide must be 'HOME' or 'AWAY'");
      return { ok: errors.length === 0, errors };
    }

    if (!Array.isArray(slots)) {
      err(errors, "LINEUP_SET: slots must be an array");
      return { ok: errors.length === 0, errors };
    }

    
    const seenSlots = new Set<number>();
    const seenPlayers = new Set<string>();

    for (const s of slots) {
      requireKeys(errors, s, ["slot", "player_id"], "LINEUP_SET.slots[]");

      const slot = (s as any)?.slot;
      const playerId = (s as any)?.player_id;

      if (typeof slot !== "number" || slot < 1 || slot > 10) err(errors, `LINEUP_SET: invalid slot '${slot}' (must be 1..10)`);
      if (typeof playerId !== "string") err(errors, "LINEUP_SET: player_id must be a string");

      if (typeof slot === "number") {
        if (seenSlots.has(slot)) err(errors, `LINEUP_SET: duplicate slot '${slot}'`);
        seenSlots.add(slot);
      }

      if (typeof playerId === "string") {
        if (seenPlayers.has(playerId)) err(errors, `LINEUP_SET: duplicate player_id '${playerId}' in lineup`);
        seenPlayers.add(playerId);

        if (!isOnRoster(state, teamSide, playerId)) {
          err(errors, `LINEUP_SET: player_id '${playerId}' is not on ${teamSide} roster`);
        }
      }
    }

    for (let i = 1; i <= 9; i++) {
      if (!seenSlots.has(i)) err(errors, `LINEUP_SET: missing required starter slot '${i}'`);
    }

    return { ok: errors.length === 0, errors };
  }

  if (event.name === "DEFENSE_SET") {
    requireKeys(errors, event.payload, ["teamSide", "defense"], "DEFENSE_SET.payload");

    const teamSide = (event.payload as any)?.teamSide;
    const defense = (event.payload as any)?.defense;

    if (teamSide !== "HOME" && teamSide !== "AWAY") {
      err(errors, "DEFENSE_SET: teamSide must be 'HOME' or 'AWAY'");
      return { ok: errors.length === 0, errors };
    }

    if (defense === null || typeof defense !== "object" || Array.isArray(defense)) {
      err(errors, "DEFENSE_SET: defense must be an object mapping positions -> playerId");
      return { ok: errors.length === 0, errors };
    }

    const REQUIRED: DefensePos[] = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];
    const seenPlayers = new Set<string>();

    for (const pos of REQUIRED) {
      const pid = (defense as any)?.[pos];
      if (typeof pid !== "string" || !pid.length) {
        err(errors, `DEFENSE_SET: missing required position '${pos}'`);
        continue;
      }

      if (!isOnRoster(state, teamSide, pid)) {
        err(errors, `DEFENSE_SET: player '${pid}' at ${pos} is not on ${teamSide} roster`);
      }

      if (seenPlayers.has(pid)) err(errors, `DEFENSE_SET: player '${pid}' assigned to multiple fielding positions`);
      seenPlayers.add(pid);
    }

    const dhPid = (defense as any)?.["DH"];
    if (dhPid !== undefined) {
      if (typeof dhPid !== "string") err(errors, "DEFENSE_SET: DH must be a string if provided");
      else if (!isOnRoster(state, teamSide, dhPid)) err(errors, `DEFENSE_SET: DH '${dhPid}' is not on ${teamSide} roster`);
    }

    return { ok: errors.length === 0, errors };
  }

  if (event.name === "AT_BAT_START") {
    requireKeys(errors, event.payload, ["pa_id", "batter_id", "pitcher_id"], "AT_BAT_START.payload");

    const batterId = (event.payload as any)?.batter_id;
    const pitcherId = (event.payload as any)?.pitcher_id;

    if (typeof batterId === "string" && !isOnRoster(state, state.offense, batterId)) {
      err(errors, `AT_BAT_START: batter_id '${batterId}' is not on offense roster`);
    }

    if (typeof pitcherId === "string" && !isOnRoster(state, state.defense, pitcherId)) {
      err(errors, `AT_BAT_START: pitcher_id '${pitcherId}' is not on defense roster`);
    }

    return { ok: errors.length === 0, errors };
  }

  if (event.name === "INNING_ADVANCE") {
    requireKeys(errors, event.payload, ["to_inning_number", "to_half"], "INNING_ADVANCE.payload");
    const inn = (event.payload as any)?.to_inning_number;
    const half = (event.payload as any)?.to_half;
    if (typeof inn !== "number" || inn < 1) err(errors, "INNING_ADVANCE: to_inning_number must be >= 1");
    if (half !== "TOP" && half !== "BOTTOM") err(errors, "INNING_ADVANCE: to_half must be TOP or BOTTOM");
    return { ok: errors.length === 0, errors };
  }

  if (event.name === "PITCH") {
    requireKeys(errors, event.payload, ["result"], "PITCH.payload");
    if (typeof (event.payload as any)?.result !== "string") err(errors, "PITCH: result must be a string");
    return { ok: errors.length === 0, errors };
  }

  function validateBatterPitcher(payload: any, ctx: string) {
    const batterId = payload?.batter_id;
    const pitcherId = payload?.pitcher_id;

    if (typeof batterId !== "string") err(errors, `${ctx}: batter_id must be a string`);
    if (typeof pitcherId !== "string") err(errors, `${ctx}: pitcher_id must be a string`);

    if (typeof batterId === "string" && batterId !== state.pa.batter.playerId) {
      err(errors, `${ctx}: batter_id '${batterId}' must equal current PA batter '${state.pa.batter.playerId}'`);
    }

    if (typeof pitcherId === "string" && pitcherId !== state.pa.pitcherId) {
      err(errors, `${ctx}: pitcher_id '${pitcherId}' must equal current PA pitcher '${state.pa.pitcherId}'`);
    }
  }

  if (
    event.name === "WALK" ||
    event.name === "INTENTIONAL_WALK" ||
    event.name === "HBP" ||
    event.name === "STRIKEOUT" ||
    event.name === "CATCHER_INTERFERENCE"
  ) {
    requireKeys(errors, event.payload, ["batter_id", "pitcher_id"], `${event.name}.payload`);
    validateBatterPitcher(event.payload, event.name);
    return { ok: errors.length === 0, errors };
  }

  if (event.name === "DROPPED_THIRD_STRIKE") {
    requireKeys(errors, event.payload, ["batter_id", "pitcher_id", "batter_safe"], "DROPPED_THIRD_STRIKE.payload");
    validateBatterPitcher(event.payload, "DROPPED_THIRD_STRIKE");

    const batterSafe = (event.payload as any)?.batter_safe;
    if (typeof batterSafe !== "boolean") err(errors, "DROPPED_THIRD_STRIKE: batter_safe must be boolean");

    // Count must be at exactly (strikesForOut - 1) strikes, for this to be valid
    if (state.inning.count.strikes !== rules.strikesForOut - 1) {
      err(errors, `DROPPED_THIRD_STRIKE: count must be at ${rules.strikesForOut - 1} strikes (got ${state.inning.count.strikes})`);
    }

    // If batter_safe, 1B must be empty (or 2 outs)
    if (batterSafe === true && state.bases["1B"] && state.inning.outs < 2) {
      err(errors, "DROPPED_THIRD_STRIKE: batter cannot reach 1B — 1B is occupied and less than 2 outs");
    }

    if ((event.payload as any)?.destinations) {
      validateDestinationsForAllCurrentRunners(errors, state, (event.payload as any).destinations, "DROPPED_THIRD_STRIKE.payload");
    }
    validateRunsArray(errors, (event.payload as any)?.runs, "DROPPED_THIRD_STRIKE.payload.runs");

    return { ok: errors.length === 0, errors };
  }

  if (event.name === "RUN_SCORED") {
    requireKeys(errors, event.payload, ["teamSide", "runner_id"], "RUN_SCORED.payload");
    return { ok: errors.length === 0, errors };
  }

  if (event.name === "ERROR_CHARGED") {
    requireKeys(errors, event.payload, ["teamSide"], "ERROR_CHARGED.payload");
    return { ok: errors.length === 0, errors };
  }

  if (event.name === "STOLEN_BASE" || event.name === "DEFENSIVE_INDIFFERENCE") {
    requireKeys(errors, event.payload, ["runner_id", "from", "to"], `${event.name}.payload`);
    const runnerId = (event.payload as any)?.runner_id;
    const from = (event.payload as any)?.from as BaseKey;
    const to = (event.payload as any)?.to as any;

    if (typeof runnerId !== "string") err(errors, `${event.name}: runner_id must be a string`);
    if (!["1B", "2B", "3B"].includes(from)) err(errors, `${event.name}: from must be 1B/2B/3B`);
    if (!["1B", "2B", "3B", "HOME"].includes(to)) err(errors, `${event.name}: to must be 1B/2B/3B/HOME`);

    if (typeof runnerId === "string" && from && baseOccupiedBy(state, from) !== runnerId) {
      err(errors, `${event.name}: runner '${runnerId}' is not actually on base '${from}'`);
    }

    if (to !== "HOME" && baseOccupiedBy(state, to as any)) {
      err(errors, `${event.name}: target base '${to}' is already occupied`);
    }

    return { ok: errors.length === 0, errors };
  }

  if (event.name === "CAUGHT_STEALING") {
    requireKeys(errors, event.payload, ["runner_id", "from", "to"], "CAUGHT_STEALING.payload");
    const runnerId = (event.payload as any)?.runner_id;
    const from = (event.payload as any)?.from as BaseKey;
    const to = (event.payload as any)?.to as any;

    if (typeof runnerId !== "string") err(errors, "CAUGHT_STEALING: runner_id must be a string");
    if (!["1B", "2B", "3B"].includes(from)) err(errors, "CAUGHT_STEALING: from must be 1B/2B/3B");
    if (!["1B", "2B", "3B", "HOME"].includes(to)) err(errors, "CAUGHT_STEALING: to must be 1B/2B/3B/HOME");

    if (typeof runnerId === "string" && from && baseOccupiedBy(state, from) !== runnerId) {
      err(errors, `CAUGHT_STEALING: runner '${runnerId}' is not actually on base '${from}'`);
    }

    return { ok: errors.length === 0, errors };
  }

  if (event.name === "PICKOFF") {
    requireKeys(errors, event.payload, ["runner_id", "at_base", "is_out"], "PICKOFF.payload");
    const runnerId = (event.payload as any)?.runner_id;
    const at = (event.payload as any)?.at_base as BaseKey;
    const isOut = (event.payload as any)?.is_out;

    if (typeof runnerId !== "string") err(errors, "PICKOFF: runner_id must be a string");
    if (!["1B", "2B", "3B"].includes(at)) err(errors, "PICKOFF: at_base must be 1B/2B/3B");
    if (typeof isOut !== "boolean") err(errors, "PICKOFF: is_out must be boolean");

    if (typeof runnerId === "string" && at && baseOccupiedBy(state, at) !== runnerId) {
      err(errors, `PICKOFF: runner '${runnerId}' is not actually on base '${at}'`);
    }

    return { ok: errors.length === 0, errors };
  }

  if (event.name === "BALK") {
    if (!event.payload || typeof event.payload !== "object") err(errors, "BALK.payload must be an object");
    requireKeys(errors, event.payload, ["pitcher_id"], "BALK.payload");

    const pitcherId = (event.payload as any)?.pitcher_id;
    if (!isString(pitcherId)) err(errors, "BALK.payload.pitcher_id must be string");

    validateRunsArray(errors, (event.payload as any)?.runs, "BALK.payload.runs");

    return { ok: errors.length === 0, errors };
  }

  if (event.name === "WILD_PITCH") {
    if (!event.payload || typeof event.payload !== "object") err(errors, "WILD_PITCH.payload must be an object");
    requireKeys(errors, event.payload, ["pitcher_id"], "WILD_PITCH.payload");
    const pitcherId = (event.payload as any)?.pitcher_id;
    if (!isString(pitcherId)) err(errors, "WILD_PITCH.payload.pitcher_id must be string");

    const destinations = (event.payload as any)?.destinations;
    if (destinations !== undefined) {
      validateDestinationsForAllCurrentRunners(errors, state, destinations, "WILD_PITCH.payload");
      validateOutsArray(errors, (event.payload as any)?.outs, "WILD_PITCH.payload.outs");
      validateRunsArray(errors, (event.payload as any)?.runs, "WILD_PITCH.payload.runs");
    }

    return { ok: errors.length === 0, errors };
  }

  if (event.name === "PASSED_BALL") {
    if (!event.payload || typeof event.payload !== "object") err(errors, "PASSED_BALL.payload must be an object");
    requireKeys(errors, event.payload, ["catcher_id"], "PASSED_BALL.payload");
    const catcherId = (event.payload as any)?.catcher_id;
    if (!isString(catcherId)) err(errors, "PASSED_BALL.payload.catcher_id must be string");

    const destinations = (event.payload as any)?.destinations;
    if (destinations !== undefined) {
      validateDestinationsForAllCurrentRunners(errors, state, destinations, "PASSED_BALL.payload");
      validateOutsArray(errors, (event.payload as any)?.outs, "PASSED_BALL.payload.outs");
      validateRunsArray(errors, (event.payload as any)?.runs, "PASSED_BALL.payload.runs");
    }

    return { ok: errors.length === 0, errors };
  }

  if (event.name === "APPEAL_PLAY") {
    if (!event.payload || typeof event.payload !== "object") err(errors, "APPEAL_PLAY.payload must be an object");
    requireKeys(errors, event.payload, ["runner_id", "at_base", "is_out"], "APPEAL_PLAY.payload");

    const rid = (event.payload as any)?.runner_id;
    const at = (event.payload as any)?.at_base;
    const isOut = (event.payload as any)?.is_out;

    if (!isString(rid)) err(errors, "APPEAL_PLAY.payload.runner_id must be string");
    if (!isBaseKey(at)) err(errors, "APPEAL_PLAY.payload.at_base must be 1B|2B|3B");
    if (typeof isOut !== "boolean") err(errors, "APPEAL_PLAY.payload.is_out must be boolean");

    if (errors.length === 0 && isOut === true) {
      if (state.bases[at as BaseKey] !== rid) {
        err(errors, `APPEAL_PLAY: runner '${rid}' is not currently on ${at}`);
      }
    }

    return { ok: errors.length === 0, errors };
  }

  if (event.name === "PITCHING_CHANGE") {
    requireKeys(errors, event.payload, ["pitcher_in", "pitcher_out"], "PITCHING_CHANGE.payload");

    const pin = (event.payload as any)?.pitcher_in;
    const pout = (event.payload as any)?.pitcher_out;

    if (!isString(pin)) err(errors, "PITCHING_CHANGE: pitcher_in must be a string");
    if (!isString(pout)) err(errors, "PITCHING_CHANGE: pitcher_out must be a string");

    if (isString(pin) && !isOnRoster(state, state.defense, pin)) {
      err(errors, `PITCHING_CHANGE: pitcher_in '${pin}' must be on defense roster`);
    }

    return { ok: errors.length === 0, errors };
  }

  if (
    event.name === "SUBSTITUTION_BATTER" ||
    event.name === "SUBSTITUTION_RUNNER" ||
    event.name === "SUBSTITUTION_FIELDER"
  ) {
    if (!event.payload || typeof event.payload !== "object") err(errors, `${event.name}: payload must be an object`);
    return { ok: errors.length === 0, errors };
  }

  if (event.name === "BIP") {
    requireKeys(errors, event.payload, ["batter_result", "destinations", "outs"], "BIP.payload");

    const destinations: any[] = (event.payload as any)?.destinations ?? [];
    const outs: any[] = (event.payload as any)?.outs ?? [];

    if (!Array.isArray(destinations) || destinations.length === 0)
      err(errors, "BIP: destinations must be a non-empty array");
    if (!Array.isArray(outs)) err(errors, "BIP: outs must be an array");

    const required = new Map<string, { from: "HOME" | BaseKey }>();
    required.set(state.pa.batter.playerId, { from: "HOME" });

    (["1B", "2B", "3B"] as BaseKey[]).forEach((b) => {
      const pid = state.bases[b];
      if (pid) required.set(pid, { from: b });
    });

    const seen = new Set<string>();
    for (const d of destinations) {
      const pid = d?.participant_id;
      const from = d?.from;
      const final = d?.final;

      if (typeof pid !== "string") {
        err(errors, "BIP: each destination must include participant_id:string");
        continue;
      }

      if (seen.has(pid)) err(errors, `BIP: participant '${pid}' appears more than once in destinations`);
      seen.add(pid);

      const okFinal = ["STAYS", "1B", "2B", "3B", "HOME", "OUT"].includes(final);
      if (!okFinal) err(errors, `BIP: invalid final destination '${final}' for participant '${pid}'`);

      if (typeof from !== "string") err(errors, `BIP: destination.from must be a string for participant '${pid}'`);

      if (pid === state.pa.batter.playerId && from !== "HOME") {
        err(errors, `BIP: batter destination.from must be HOME`);
      }

      const req = required.get(pid);
      if (final === "STAYS" && req && from !== req.from) {
        err(errors, `BIP: participant '${pid}' cannot STAY on '${from}' (expected '${req.from}')`);
      }
    }

    for (const [pid] of required.entries()) {
      if (!seen.has(pid)) err(errors, `BIP: missing destination for required participant '${pid}'`);
    }

    if (outs.length > rules.outsPerInning - state.inning.outs) {
      err(errors, "BIP: outs exceed remaining outs in half-inning");
    }

    const finalBaseToPid = new Map<string, string>();
    for (const d of destinations) {
      const final = d?.final;
      const pid = d?.participant_id;
      if (typeof pid !== "string") continue;
      if (final === "1B" || final === "2B" || final === "3B") {
        if (finalBaseToPid.has(final)) {
          err(errors, `BIP: multiple participants end at '${final}' (${finalBaseToPid.get(final)} and ${pid})`);
        } else {
          finalBaseToPid.set(final, pid);
        }
      }
    }

    return { ok: errors.length === 0, errors };
  }

  return { ok: errors.length === 0, errors };
}
