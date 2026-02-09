// src/types/pitch.ts
import type { PlayerId } from "./gameState";

export type PitchResult =
  | "BALL"
  | "CALLED_STRIKE"
  | "SWINGING_STRIKE"
  | "FOUL"
  | "FOUL_TIP"
  | "HBP"
  | "IN_PLAY"
  | "PITCH_CLOCK_BALL"
  | "PITCH_CLOCK_STRIKE";

export interface PitchEventPayload {
  pa_id: string;
  pitcher_id: PlayerId;
  batter_id: PlayerId;
  result: PitchResult;

  pitch_metrics_id?: string | null;

  notes?: string | null;
}
