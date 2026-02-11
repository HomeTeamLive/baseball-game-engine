// src/engine/createInitialState.ts
import type {
  GameId,
  GameState,
  PlayerId,
  TeamId,
  TeamSide,
  DefensePos,
  LineupSlotNumber,
} from "../types/gameState";
import type { EffectiveGameRules } from "../types/gameRules";

const DEF_POS: DefensePos[] = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH"];
const UNSET_PLAYER: PlayerId = "_";

function isoNow() {
  return new Date().toISOString();
}

function otherSide(side: TeamSide): TeamSide {
  return side === "HOME" ? "AWAY" : "HOME";
}

function makeDefense(): Record<DefensePos, PlayerId> {
  const defense = {} as Record<DefensePos, PlayerId>;
  DEF_POS.forEach((pos, idx) => {
    defense[pos] = UNSET_PLAYER;
  });
  return defense;
}

function makeLineupSlots() {
  return Array.from({ length: 10 }, (_, i) => {
    const slot = (i + 1) as LineupSlotNumber;
    return {
      slot,
      activeOccupantIndex: 0,
      occupants: [],
    };
  });
}

function makeRunsByInning(regulationInnings: number): Record<number, number | null> {
  const out: Record<number, number | null> = {};
  for (let i = 1; i <= regulationInnings; i++) out[i] = null;
  return out;
}

export function createInitialState(args: {
  gameId: GameId;
  createdBy: string;
  startTimeIso?: string;

  homeTeamId: TeamId;
  awayTeamId: TeamId;

  homeRoster: PlayerId[];
  awayRoster: PlayerId[];

  rules: EffectiveGameRules;

  offenseFirst?: TeamSide;  
}): GameState {
  const startTimeIso = args.startTimeIso ?? isoNow();
  const offenseFirst = args.offenseFirst ?? "AWAY";
  const defenseFirst = otherSide(offenseFirst);

  const homeDefense = makeDefense();
  const awayDefense = makeDefense();

  const pitcherId = defenseFirst === "HOME" ? homeDefense["P"] : awayDefense["P"];

  const homeLineupSlots = makeLineupSlots();
  const awayLineupSlots = makeLineupSlots();

  const offenseLineupSlots = offenseFirst === "HOME" ? homeLineupSlots : awayLineupSlots;
  const batterId = '_';

  return {
    version: 1,
    meta: { gameId: args.gameId, startTimeIso, createdBy: args.createdBy },

    offense: offenseFirst,
    defense: defenseFirst,

    bases: {},

    pa: {
      atBatId: "ab_1",
      batter: { teamSide: offenseFirst, slot: 1, playerId: batterId },
      pitcherId,
      pitchCountInPa: 0,
    },

    teams: {
      HOME: {
        teamId: args.homeTeamId,
        lineup: { nextBatterIndex: 0, slots: homeLineupSlots },
        onField: { defense: homeDefense, pitchers: [{ playerId: homeDefense["P"] }] },
        score: { runs: 0, hits: 0, errors: 0, lob: 0 },
      },
      AWAY: {
        teamId: args.awayTeamId,
        lineup: { nextBatterIndex: 0, slots: awayLineupSlots },
        onField: { defense: awayDefense, pitchers: [{ playerId: awayDefense["P"] }] },
        score: { runs: 0, hits: 0, errors: 0, lob: 0 },
      },
    },

    gameStatus: "PRE_GAME",

    roster: { HOME: args.homeRoster, AWAY: args.awayRoster },

    inning: {
      inningNumber: 1,
      half: "TOP",
      outs: 0,
      count: { balls: args.rules.startingBalls, strikes: args.rules.startingStrikes },
    },

    appliedEventIds: [],
    lastEventId: undefined,
    lastUpdatedIso: isoNow(),

    linescore: {
      HOME: { runsByInning: makeRunsByInning(args.rules.innings) },
      AWAY: { runsByInning: makeRunsByInning(args.rules.innings) },
    },
  };
}
