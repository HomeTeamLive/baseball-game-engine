// src/types/bip.ts
import type { DefensePos, PlayerId } from "./gameState";


export type EventBaseKey = "HOME" | "1B" | "2B" | "3B";


export type BipAdvanceReason =
  | "ON_HIT"
  | "ON_ERROR"
  | "ON_THROW"
  | "TAG_UP"
  | "FIELDERS_CHOICE";


export type BipFinalDestination = "STAYS" | "1B" | "2B" | "3B" | "HOME" | "OUT";


export interface BipParticipantDestination {
  participant_id: PlayerId;
  from: EventBaseKey;
  final: BipFinalDestination;

  out_number?: 1 | 2 | 3;

  reason?: BipAdvanceReason;
}


export type BipOutHow = "FORCE" | "TAG" | "FLY";

export interface BipFielderRef {
  pos: DefensePos;
  player_id: PlayerId;
}


export interface BipOutDetail {
  out_number: 1 | 2 | 3;
  runner_id: PlayerId; 
  how: BipOutHow;
  where: EventBaseKey;

  putout_by: BipFielderRef;
  assists?: BipFielderRef[];
}


export type BipErrorType = "THROWING" | "FIELDING" | "CATCHING";

export type BipErrorImpact =
  | "BATTER_REACHED_SAFELY"
  | "BATTER_EXTRA_BASE"
  | "RUNNER_EXTRA_BASE"
  | "RUN_SCORED";

export interface BipError {
  type: BipErrorType;

  fielder_pos: DefensePos;

  impacts: BipErrorImpact[];

  notes?: string | null;
}


export type YesNoLater = "YES" | "NO" | "DECIDE_LATER";
export type EarnedStatus = "EARNED" | "UNEARNED" | "DECIDE_LATER";

export interface BipRunAttribution {
  runner_id: PlayerId;
  rbi: YesNoLater;
  earned: EarnedStatus;
  charged_pitcher_id?: PlayerId | null;
}


export type BipBatterResult =
  | "1B"
  | "2B"
  | "3B"
  | "HR"
  | "GROUND_RULE_DOUBLE"
  | "AUTOMATIC_DOUBLE"

  | "ROE"
  | "FC"

  | "OUT";

export type BatterOutSubType = "NONE" | "SAC_FLY" | "SAC_BUNT";


export type BattedBallType = "GB" | "FB" | "LD" | "PU" | "BUNT" | "OTHER";

export interface BattedBallDescriptor {
  type?: BattedBallType;
  fielded_by?: DefensePos;
  description?: string | null; 
}


export interface BIPPayload {
  pa_id: string;
  batter_id: PlayerId;

  batter_result: BipBatterResult;
  batter_out_subtype?: BatterOutSubType | null;
  batted_ball?: BattedBallDescriptor | null;

  outs: BipOutDetail[];

  errors?: BipError[] | null;

  destinations: BipParticipantDestination[];

  runs?: BipRunAttribution[] | null;

  pitch_metrics_id?: string | null;
  batted_ball_metrics_id?: string | null;

  notes?: string | null;
}
