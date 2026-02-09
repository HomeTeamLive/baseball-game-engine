// src/stats/paContext.ts
import type { GameEvent } from "../types/events";
import type { PlayerId } from "../types/gameState";

export type TerminalPAEventName =
  | "BIP"
  | "WALK"
  | "INTENTIONAL_WALK"
  | "HBP"
  | "STRIKEOUT"
  | "DROPPED_THIRD_STRIKE"
  | "CATCHER_INTERFERENCE";

export interface PAContext {
  pa_id: string;

  batter_started: PlayerId;
  batter_current: PlayerId;

  pitcher_started: PlayerId;
  pitcher_current: PlayerId;

  // Count right BEFORE the substitution event happens 
  batterSubSnapshots: Array<{
    player_out: PlayerId;
    player_in: PlayerId;
    balls: number;
    strikes: number;
  }>;

  pitcherSubSnapshots: Array<{
    pitcher_out: PlayerId;
    pitcher_in: PlayerId;
    balls: number;
    strikes: number;
  }>;


  balls: number;
  strikes: number;

  terminalEvent?: GameEvent; 
}
