// src/description/describeEvent.ts
import type { GameState, DefensePos, PlayerId, BaseKey } from "../types/gameState";
import type { EffectiveGameRules } from "../types/gameRules";
import type { GameEvent } from "../types/events";
import type {
  BIPPayload,
  BipBatterResult,
  BattedBallType,
  BipOutDetail,
  BipError,
  BipRunAttribution,
  YesNoLater,
  EarnedStatus,
  EventBaseKey,
  BatterOutSubType,
} from "../types/bip";

export type EventDescription = {
  short: string;
  long: string;
};

type DescribeArgs = {
  stateBefore: GameState;
  event: GameEvent;
  rules?: EffectiveGameRules;  
};

function pid(pid: PlayerId): string {
  return `{${pid}}`;
}

function posToText(pos: DefensePos): string {
  return String(pos);
}

function baseToText(b: BaseKey | EventBaseKey): string {
  switch (b) {
    case "1B":
      return "1B";
    case "2B":
      return "2B";
    case "3B":
      return "3B";
    case "HOME":
      return "home";
    default:
      return String(b);
  }
}

function battedBallTypeToText(t?: BattedBallType | null): string | null {
  if (!t) return null;
  switch (t) {
    case "GB":
      return "ground ball";
    case "FB":
      return "fly ball";
    case "LD":
      return "line drive";
    case "PU":
      return "pop up";
    case "BUNT":
      return "bunt";
    case "OTHER":
      return "ball in play";
    default:
      return String(t);
  }
}

function batterResultVerb(r: BipBatterResult): string {
  switch (r) {
    case "1B":
      return "singles";
    case "2B":
      return "doubles";
    case "3B":
      return "triples";
    case "HR":
      return "homers";
    case "GROUND_RULE_DOUBLE":
      return "hits a ground-rule double";
    case "AUTOMATIC_DOUBLE":
      return "hits an automatic double";
    case "ROE":
      return "reaches on error";
    case "FC":
      return "reaches on a fielder’s choice";
    case "OUT":
      return "is out";
    default:
      return String(r);
  }
}

function batterResultNoun(r: BipBatterResult): string {
  switch (r) {
    case "1B":
      return "single";
    case "2B":
      return "double";
    case "3B":
      return "triple";
    case "HR":
      return "home run";
    case "GROUND_RULE_DOUBLE":
      return "ground-rule double";
    case "AUTOMATIC_DOUBLE":
      return "automatic double";
    case "ROE":
      return "reached on error";
    case "FC":
      return "fielder’s choice";
    case "OUT":
      return "out";
    default:
      return String(r);
  }
}

function chainText(out: BipOutDetail): string | null {
  const parts: string[] = [];
  if (out.assists?.length) {
    for (const a of out.assists) parts.push(posToText(a.pos));
  }
  if (out.putout_by) parts.push(posToText(out.putout_by.pos));
  return parts.length ? parts.join("–") : null;
}

function outHowText(out: BipOutDetail): string {
  switch (out.how) {
    case "FORCE":
      return "forced out";
    case "TAG":
      return "tagged out";
    case "FLY":
      return "out on a fly ball";
    default:
      return String(out.how);
  }
}

function joinSentences(parts: Array<string | null | undefined>): string {
  return parts
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .map((p) => (/[.!?]$/.test(p) ? p : `${p}.`))
    .join(" ");
}

function listClauses(clauses: string[]): string {
  if (clauses.length === 0) return "";
  if (clauses.length === 1) return clauses[0];
  if (clauses.length === 2) return `${clauses[0]} and ${clauses[1]}`;
  return `${clauses.slice(0, -1).join(", ")}, and ${clauses[clauses.length - 1]}`;
}

function inferScorersFromDestinations(payload: BIPPayload): PlayerId[] {
  return payload.destinations
    .filter((d) => d.final === "HOME")
    .map((d) => d.participant_id);
}

function earnedText(e: EarnedStatus): string {
  switch (e) {
    case "EARNED":
      return "earned";
    case "UNEARNED":
      return "unearned";
    case "DECIDE_LATER":
      return "earned status TBD";
    default:
      return String(e);
  }
}

function rbiText(r: YesNoLater): string {
  switch (r) {
    case "YES":
      return "RBI credited";
    case "NO":
      return "no RBI";
    case "DECIDE_LATER":
      return "RBI decision TBD";
    default:
      return String(r);
  }
}




function describeBip(stateBefore: GameState, p: BIPPayload): EventDescription {
  const batter = pid(p.batter_id);

  const bbType = battedBallTypeToText(p.batted_ball?.type ?? null);
  const fieldedBy = p.batted_ball?.fielded_by ? posToText(p.batted_ball.fielded_by) : null;

  let mainClause = "";
  if (p.batter_result === "OUT") {
    const batterOut = p.outs.find((o) => o.runner_id === p.batter_id);
    if (batterOut) {
      const chain = chainText(batterOut);
      const where = baseToText(batterOut.where);
      mainClause = `${batter} is ${outHowText(batterOut)} at ${where}${chain ? ` (${chain})` : ""}`;
    } else {
      if (p.batter_out_subtype === "SAC_FLY") {
        mainClause = `${batter} hits a sacrifice fly`;
      } else if (p.batter_out_subtype === "SAC_BUNT") {
        mainClause = `${batter} lays down a sacrifice bunt`;
      } else {
        mainClause = `${batter} is out`;
      }
    }
  } else if (p.batter_result === "ROE") {
    const errPos = p.errors?.[0]?.fielder_pos ? posToText(p.errors[0].fielder_pos) : null;
    mainClause = `${batter} reaches on error${errPos ? ` (${errPos})` : ""}`;
  } else if (p.batter_result === "FC") {
    mainClause = `${batter} reaches on a fielder’s choice`;
  } else if (p.batter_result === "GROUND_RULE_DOUBLE" || p.batter_result === "AUTOMATIC_DOUBLE") {
    const extra = bbType ? `${bbType}` : "ball in play";
    mainClause = `${batter} ${batterResultVerb(p.batter_result)} (${extra})`;
  } else {
    const verb = batterResultVerb(p.batter_result);
    if (p.batter_result === "HR") {
      mainClause = `${batter} hits a home run`;
    } else {
      const extraBits: string[] = [];
      if (bbType) extraBits.push(bbType);
      if (fieldedBy) extraBits.push(`to ${fieldedBy}`);
      const extra = extraBits.length ? ` (${extraBits.join(" ")})` : "";
      mainClause = `${batter} ${verb}${extra}`;
    }
  }

  const otherOuts = p.outs.filter((o) => o.runner_id !== p.batter_id);
  const outClauses: string[] = otherOuts.map((o) => {
    const runner = pid(o.runner_id);
    const chain = chainText(o);
    const where = baseToText(o.where);
    return `${runner} ${outHowText(o)} at ${where}${chain ? ` (${chain})` : ""}`;
  });

  const errors = (p.errors ?? null) || [];
  const errorClauses: string[] = errors.map((e: BipError) => {
    const impacts = e.impacts?.length ? `; impacts: ${e.impacts.join(", ")}` : "";
    return `${e.type.toLowerCase()} error by ${posToText(e.fielder_pos)}${impacts}`;
  });

  const scorers: PlayerId[] = Array.isArray(p.runs) && p.runs.length > 0
    ? p.runs.map((r) => r.runner_id)
    : inferScorersFromDestinations(p);

  const scoreClauses: string[] = scorers.map((rid) => `${pid(rid)} scores`);

  const attributionClauses: string[] = [];
  if (Array.isArray(p.runs) && p.runs.length > 0) {
    for (const r of p.runs) {
      const runner = pid(r.runner_id);
      const charged = r.charged_pitcher_id ? pid(r.charged_pitcher_id) : null;

      const parts: string[] = [];
      parts.push(`${runner}: ${rbiText(r.rbi)}`);
      if (charged) parts.push(`run charged to ${charged} (${earnedText(r.earned)})`);
      else parts.push(`${earnedText(r.earned)}`);

      attributionClauses.push(parts.join("; "));
    }
  }

  const short = joinSentences([
    mainClause,
    scoreClauses.length ? listClauses(scoreClauses) : null,
  ]);

  const long = joinSentences([
    mainClause,
    outClauses.length ? `Outs: ${listClauses(outClauses)}` : null,
    errorClauses.length ? `Errors: ${listClauses(errorClauses)}` : null,
    scoreClauses.length ? listClauses(scoreClauses) : null,
    attributionClauses.length ? `Attribution: ${listClauses(attributionClauses)}` : null,
    p.notes ? `Notes: ${p.notes}` : null,
  ]);

  return { short, long };
}



function describeSimplePa(
  eventName: string,
  batter_id: PlayerId,
  pitcher_id?: PlayerId | null,
  extra?: string | null
): EventDescription {
  const batter = pid(batter_id);
  const pitcher = pitcher_id ? pid(pitcher_id) : null;

  const base = pitcher ? `${batter} ${eventName.toLowerCase()} vs ${pitcher}` : `${batter} ${eventName.toLowerCase()}`;
  const short = joinSentences([extra ? `${base} (${extra})` : base]);
  const long = short;
  return { short, long };
}

function describeEventInternal(stateBefore: GameState, event: GameEvent): EventDescription {
  switch (event.name) {
    case "BIP":
      return describeBip(stateBefore, event.payload);

    case "AT_BAT_START": {
      const batter = pid(event.payload.batter_id);
      const pitcher = pid(event.payload.pitcher_id);
      const short = joinSentences([`At-bat starts: ${batter} vs ${pitcher}`]);
      return { short, long: short };
    }

    case "PITCH": {

      const short = joinSentences([`Pitch: ${String(event.payload.result).toLowerCase().replace(/_/g, " ")}`]);
      return { short, long: short };
    }

    case "WALK":
      return describeSimplePa("walks", event.payload.batter_id, event.payload.pitcher_id);

    case "INTENTIONAL_WALK":
      return describeSimplePa("is intentionally walked", event.payload.batter_id, event.payload.pitcher_id);

    case "HBP":
      return describeSimplePa("is hit by pitch", event.payload.batter_id, event.payload.pitcher_id);

    case "STRIKEOUT":
      return describeSimplePa("strikes out", event.payload.batter_id, event.payload.pitcher_id, event.payload.notes ?? null);

    case "DROPPED_THIRD_STRIKE": {
      const batter = pid(event.payload.batter_id);
      if (event.payload.batter_safe) {
        const short = joinSentences([`${batter} reaches 1B on dropped third strike`]);
        const long = joinSentences([short, event.payload.notes ? `Notes: ${event.payload.notes}` : null]);
        return { short, long };
      } else {
        const po = event.payload.putout_by ? posToText(event.payload.putout_by.pos) : "unknown";
        const a = event.payload.assists?.length
          ? ` (${event.payload.assists.map(x => posToText(x.pos)).join("–")})`
          : "";
        const short = joinSentences([`${batter} strikes out on dropped third strike, thrown out (PO: ${po}${a})`]);
        const long = joinSentences([short, event.payload.notes ? `Notes: ${event.payload.notes}` : null]);
        return { short, long };
      }
    }

    case "CATCHER_INTERFERENCE": {
      const batter = pid(event.payload.batter_id);
      const catcher = pid(event.payload.catcher_id);
      const short = joinSentences([`${batter} reaches on catcher interference by ${catcher}`]);
      const long = joinSentences([short, event.payload.notes ? `Notes: ${event.payload.notes}` : null]);
      return { short, long };
    }

    case "STOLEN_BASE": {
      const r = pid(event.payload.runner_id);
      const short = joinSentences([`${r} steals ${baseToText(event.payload.to)}`]);
      return { short, long: short };
    }

    case "CAUGHT_STEALING": {
      const r = pid(event.payload.runner_id);
      const to = baseToText(event.payload.to);
      const po = event.payload.putout_by ? `${posToText(event.payload.putout_by.pos)}` : "unknown fielder";
      const a = event.payload.assists?.length
        ? `assists: ${event.payload.assists.map((x) => posToText(x.pos)).join("–")}`
        : null;
      const short = joinSentences([`${r} is caught stealing ${to} (PO: ${po}${a ? `; ${a}` : ""})`]);
      return { short, long: short };
    }

    case "PICKOFF": {
      const r = pid(event.payload.runner_id);
      const at = baseToText(event.payload.at_base);
      if (!event.payload.is_out) {
        const short = joinSentences([`Pickoff attempt at ${at} on ${r} (safe)`]);
        return { short, long: short };
      }
      const po = event.payload.putout_by ? `${posToText(event.payload.putout_by.pos)}` : "unknown fielder";
      const a = event.payload.assists?.length
        ? `assists: ${event.payload.assists.map((x) => posToText(x.pos)).join("–")}`
        : null;
      const short = joinSentences([`${r} is picked off at ${at} (PO: ${po}${a ? `; ${a}` : ""})`]);
      return { short, long: short };
    }

    case "BALK": {
      const p = pid(event.payload.pitcher_id);
      const short = joinSentences([`${p} balk`]);
      const long = joinSentences([short, event.payload.notes ? `Notes: ${event.payload.notes}` : null]);
      return { short, long };
    }

    case "WILD_PITCH": {
      const p = pid(event.payload.pitcher_id);
      const short = joinSentences([`Wild pitch by ${p}`]);
      const long = joinSentences([short, event.payload.notes ? `Notes: ${event.payload.notes}` : null]);
      return { short, long };
    }

    case "PASSED_BALL": {
      const c = pid(event.payload.catcher_id);
      const short = joinSentences([`Passed ball charged to ${c}`]);
      const long = joinSentences([short, event.payload.notes ? `Notes: ${event.payload.notes}` : null]);
      return { short, long };
    }

    case "DEFENSIVE_INDIFFERENCE": {
      const r = pid(event.payload.runner_id);
      const short = joinSentences([`${r} advances on defensive indifference to ${baseToText(event.payload.to)}`]);
      return { short, long: short };
    }

    case "APPEAL_PLAY": {
      const r = pid(event.payload.runner_id);
      const at = baseToText(event.payload.at_base);
      const short = joinSentences([
        event.payload.is_out ? `${r} is out on appeal at ${at}` : `Appeal play at ${at} on ${r} (safe)`,
      ]);
      const long = joinSentences([short, event.payload.notes ? `Notes: ${event.payload.notes}` : null]);
      return { short, long };
    }

    case "INNING_ADVANCE": {
      const short = joinSentences([`Inning advances to ${event.payload.to_half} ${event.payload.to_inning_number}`]);
      return { short, long: short };
    }

    case "RUN_SCORED": {
      const r = pid(event.payload.runner_id);
      const short = joinSentences([`${r} scores`]);
      const long = joinSentences([short, event.payload.notes ? `Notes: ${event.payload.notes}` : null]);
      return { short, long };
    }

    case "ERROR_CHARGED": {
      const pos = event.payload.fielder_pos ? posToText(event.payload.fielder_pos) : "unknown position";
      const short = joinSentences([`Error charged (${pos})`]);
      const long = joinSentences([short, event.payload.notes ? `Notes: ${event.payload.notes}` : null]);
      return { short, long };
    }

    case "SUBSTITUTION_BATTER":
    case "SUBSTITUTION_RUNNER":
    case "SUBSTITUTION_FIELDER": {
      const pin = pid(event.payload.player_in);
      const pout = pid(event.payload.player_out);
      const short = joinSentences([`Substitution: ${pin} in for ${pout}`]);
      const long = joinSentences([short, event.payload.notes ? `Notes: ${event.payload.notes}` : null]);
      return { short, long };
    }

    case "PITCHING_CHANGE": {
      const pin = pid(event.payload.pitcher_in);
      const pout = pid(event.payload.pitcher_out);
      const short = joinSentences([`Pitching change: ${pin} replaces ${pout}`]);
      const long = joinSentences([short, event.payload.notes ? `Notes: ${event.payload.notes}` : null]);
      return { short, long };
    }

    case "GAME_STARTED":
    case "GAME_PAUSED":
    case "GAME_RESUMED":
    case "GAME_FINAL": {
      const short = joinSentences([event.name.replace(/_/g, " ").toLowerCase()]);
      return { short, long: short };
    }

    default: {
      const short = joinSentences([`Event: ${(event as any).name}`]);
      return { short, long: short };
    }
  }
}




export function describeEvent(args: DescribeArgs): EventDescription {
  return describeEventInternal(args.stateBefore, args.event);
}
