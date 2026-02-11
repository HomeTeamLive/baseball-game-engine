// src/types/events.ts
import type { EventId, GameId, PlayerId, TeamSide, BaseKey, DefensePos } from "./gameState";
import type { BIPPayload, BipParticipantDestination, BipOutDetail, BipRunAttribution } from "./bip";
import type { PitchEventPayload } from "./pitch";

export type EventName =
  | "GAME_STARTED"
  | "GAME_PAUSED"
  | "GAME_RESUMED"
  | "GAME_FINAL"
  | "LINEUP_SET"
  | "DEFENSE_SET"
  | "INNING_ADVANCE"
  | "AT_BAT_START"
  | "PITCH"
  | "BIP"
  | "WALK"
  | "INTENTIONAL_WALK"
  | "HBP"
  | "STRIKEOUT"
  | "DROPPED_THIRD_STRIKE"
  | "STOLEN_BASE"
  | "CAUGHT_STEALING"
  | "PICKOFF"
  | "BALK"
  | "WILD_PITCH"
  | "PASSED_BALL"
  | "DEFENSIVE_INDIFFERENCE"
  | "APPEAL_PLAY"
  | "CATCHER_INTERFERENCE"
  | "RUN_SCORED"
  | "ERROR_CHARGED"
  | "SUBSTITUTION_BATTER"
  | "SUBSTITUTION_RUNNER"
  | "SUBSTITUTION_FIELDER"
  | "PITCHING_CHANGE";

export interface GameEventBase<N extends EventName, P> {
  eventId: EventId;
  gameId: GameId;
  name: N;
  payload: P;
  createdIso: string;
  createdBy?: string;
}

export interface AtBatStartPayload {
  pa_id: string;
  batter_id: PlayerId;
  pitcher_id: PlayerId;
}

export interface LineupSetSlot {
  slot: number;
  player_id: PlayerId;
  position?: DefensePos | null;
}

export interface LineupSetPayload {
  teamSide: TeamSide;
  slots: LineupSetSlot[];
}

export interface DefenseSetPayload {
  teamSide: TeamSide;
  defense: Partial<Record<DefensePos, PlayerId>>;
}

export interface InningAdvancePayload {
  to_inning_number: number;
  to_half: "TOP" | "BOTTOM";
}

export interface WalkPayload {
  pa_id: string;
  batter_id: PlayerId;
  pitcher_id: PlayerId;
}

export interface StrikeoutPayload {
  pa_id: string;
  batter_id: PlayerId;
  pitcher_id: PlayerId;
  notes?: string | null;
}


export interface DroppedThirdStrikePayload {
  pa_id: string;
  batter_id: PlayerId;
  pitcher_id: PlayerId;

  batter_safe: boolean;
  putout_by?: { pos: DefensePos; player_id: PlayerId } | null;
  assists?: Array<{ pos: DefensePos; player_id: PlayerId }> | null;
  destinations?: BipParticipantDestination[] | null;
  runs?: BipRunAttribution[] | null;
  notes?: string | null;
}

export interface StolenBasePayload {
  runner_id: PlayerId;
  from: BaseKey;
  to: BaseKey;
}

export interface CaughtStealingPayload {
  runner_id: PlayerId;
  from: BaseKey;
  to: BaseKey;
  putout_by?: { pos: DefensePos; player_id: PlayerId } | null;
  assists?: Array<{ pos: DefensePos; player_id: PlayerId }> | null;
}

export interface PickoffPayload {
  runner_id: PlayerId;
  at_base: BaseKey;
  is_out: boolean;
  putout_by?: { pos: DefensePos; player_id: PlayerId } | null;
  assists?: Array<{ pos: DefensePos; player_id: PlayerId }> | null;
}

export interface BalkPayload {
  pitcher_id: PlayerId;
  runs?: BipRunAttribution[] | null;
  notes?: string | null;
}

export interface WildPitchPayload {
  pitcher_id: PlayerId;
  destinations: BipParticipantDestination[];
  outs?: BipOutDetail[];
  runs?: BipRunAttribution[] | null;
  notes?: string | null;
}

export interface PassedBallPayload {
  catcher_id: PlayerId;
  destinations: BipParticipantDestination[];
  outs?: BipOutDetail[];
  runs?: BipRunAttribution[] | null;

  notes?: string | null;
}

export interface DefensiveIndifferencePayload {
  runner_id: PlayerId;
  from: BaseKey;
  to: BaseKey;
}

export interface AppealPlayPayload {
  runner_id: PlayerId;
  at_base: BaseKey;
  is_out: boolean;
  notes?: string | null;
}

export interface CatcherInterferencePayload {
  batter_id: PlayerId;
  catcher_id: PlayerId;
  pa_id: string;
  notes?: string | null;
}

export interface RunScoredPayload {
  teamSide: TeamSide;
  runner_id: PlayerId;
  notes?: string | null;
}

export interface ErrorChargedPayload {
  teamSide: TeamSide;
  fielder_pos?: DefensePos | null;
  notes?: string | null;
}

export interface SubstitutionPayload {
  teamSide: TeamSide;
  player_in: PlayerId;
  player_out: PlayerId;
  notes?: string | null;
}

export interface PitchingChangePayload {
  teamSide: TeamSide;
  pitcher_in: PlayerId;
  pitcher_out: PlayerId;
  notes?: string | null;
}



export type GameEvent =
  | GameEventBase<"GAME_STARTED", {}>
  | GameEventBase<"GAME_PAUSED", {}>
  | GameEventBase<"GAME_RESUMED", {}>
  | GameEventBase<"GAME_FINAL", {}>

  | GameEventBase<"LINEUP_SET", LineupSetPayload>
  | GameEventBase<"DEFENSE_SET", DefenseSetPayload>

  | GameEventBase<"INNING_ADVANCE", InningAdvancePayload>
  | GameEventBase<"AT_BAT_START", AtBatStartPayload>

  | GameEventBase<"PITCH", PitchEventPayload>

  | GameEventBase<"BIP", BIPPayload>

  | GameEventBase<"WALK", WalkPayload>
  | GameEventBase<"INTENTIONAL_WALK", WalkPayload>
  | GameEventBase<"HBP", WalkPayload>
  | GameEventBase<"STRIKEOUT", StrikeoutPayload>
  | GameEventBase<"DROPPED_THIRD_STRIKE", DroppedThirdStrikePayload>

  | GameEventBase<"STOLEN_BASE", StolenBasePayload>
  | GameEventBase<"CAUGHT_STEALING", CaughtStealingPayload>
  | GameEventBase<"PICKOFF", PickoffPayload>
  | GameEventBase<"BALK", BalkPayload>
  | GameEventBase<"WILD_PITCH", WildPitchPayload>
  | GameEventBase<"PASSED_BALL", PassedBallPayload>
  | GameEventBase<"DEFENSIVE_INDIFFERENCE", DefensiveIndifferencePayload>
  | GameEventBase<"APPEAL_PLAY", AppealPlayPayload>
  | GameEventBase<"CATCHER_INTERFERENCE", CatcherInterferencePayload>

  | GameEventBase<"RUN_SCORED", RunScoredPayload>
  | GameEventBase<"ERROR_CHARGED", ErrorChargedPayload>

  | GameEventBase<"SUBSTITUTION_BATTER", SubstitutionPayload>
  | GameEventBase<"SUBSTITUTION_RUNNER", SubstitutionPayload>
  | GameEventBase<"SUBSTITUTION_FIELDER", SubstitutionPayload>
  | GameEventBase<"PITCHING_CHANGE", PitchingChangePayload>;
