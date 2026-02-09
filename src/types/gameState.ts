// src/types/gameState.ts
export type TeamSide = "HOME" | "AWAY";
export type InningHalf = "TOP" | "BOTTOM";
export type BaseKey = "1B" | "2B" | "3B";
export type InningNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | number;

export type GameStatus =
  | "PRE_GAME"
  | "IN_PROGRESS"
  | "PAUSED"
  | "FINAL"
  | "SUSPENDED";

export type DefensePos =
  | "P"
  | "C"
  | "1B"
  | "2B"
  | "3B"
  | "SS"
  | "LF"
  | "CF"
  | "RF"
  | "DH";

export type LineupSlotNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type LineupRole = "STARTER" | "SUB" | "PITCHER";
export type SubType = "NONE" | "SUB" | "PH" | "PR";

export type PlayerId = string;
export type TeamId = string;
export type GameId = string;
export type EventId = string;
export type AtBatId = string;
export type RulesetId = string;

export interface GameState {
  version: 1;
  meta: GameMeta;
  offense: TeamSide;
  defense: TeamSide;
  bases: BasesState;
  pa: PlateAppearanceState;
  teams: Record<TeamSide, TeamState>;
  gameStatus: GameStatus;
  roster: Record<TeamSide, PlayerId[]>;
  inning: InningState;
  appliedEventIds: EventId[];
  lastEventId?: EventId;
  lastUpdatedIso: string;
  linescore: Record<TeamSide, LineScore>;
}

export interface TeamState {
  teamId: TeamId;
  lineup: LineupState;
  onField: OnFieldState;
  score: TeamScore;
}

export interface GameMeta {
  gameId: GameId;
  startTimeIso: string;
  createdBy: string;
}

export interface InningState {
  inningNumber: number;
  half: InningHalf;
  outs: number;
  count: PitchCount;
}

export interface PitchCount {
  balls: number;
  strikes: number;
}

export interface BasesState {
  "1B"?: PlayerId;
  "2B"?: PlayerId;
  "3B"?: PlayerId;
}

export interface PlateAppearanceState {
  atBatId: AtBatId;
  batter: {
    teamSide: TeamSide;
    slot: LineupSlotNumber;
    playerId: PlayerId;
  };
  pitcherId: PlayerId;
  pitchCountInPa: number;
}

export interface TeamScore {
  runs: number;
  hits: number;
  errors: number;
  lob: number;
}

export interface LineupState {
  nextBatterIndex: number;
  slots: LineupSlot[];
}

export interface LineupSlot {
  slot: LineupSlotNumber;
  activeOccupantIndex: number;
  occupants: LineupOccupant[];
}

export interface LineupOccupant {
  playerId: PlayerId;
  enteredEventId?: EventId;
  exitedEventId?: EventId;
  subType: SubType;
  replacedPlayerId?: PlayerId;
  role: LineupRole;
  position?: DefensePos | null;
}

export interface PitcherOccupant {
  playerId: PlayerId;
  enteredEventId?: EventId;
  exitedEventId?: EventId;
  replacedPlayerId?: PlayerId;
}

export interface OnFieldState {
  defense: Record<DefensePos, PlayerId>;
  pitchers: PitcherOccupant[];
}

export interface LineScore {
  runsByInning: Record<InningNumber, number | null>;
}
