// src/stats/createInitialStatsState.ts
import type { GameState, PlayerId, TeamSide } from "../types/gameState";
import type {
  PlayerStats,
  StatsState,
  TeamStats,
  PlayerBattingStats,
  PlayerRunningStats,
  PlayerFieldingStats,
  PlayerPitchingStats,
  TeamBattingStats,
  TeamRunningStats,
  TeamFieldingStats,
  TeamPitchingStats,
} from "../types/stats";


function zerosPlayerBatting(): PlayerBattingStats {
  return {
    PA: 0,
    AB: 0,
    H: 0,
    "2B": 0,
    "3B": 0,
    HR: 0,
    HR_SOLO: 0,
    HR_2RUN: 0,
    HR_GRANDSLAM: 0,
    R: 0,
    RBI: 0,
    BB: 0,
    IBB: 0,
    HBP: 0,
    SO: 0,
    SF: 0,
    SH: 0,
    ROE: 0,
    FC: 0,
    GIDP: 0,
    DP: 0,
    TB: 0,
  };
}

function zerosPlayerRunning(): PlayerRunningStats {
  return { SB: 0, CS: 0, PO: 0, POA: 0 };
}

function zerosPlayerFielding(): PlayerFieldingStats {
  return { PO: 0, A: 0, E: 0, DP: 0, TP: 0, PB: 0, WP: 0 };
}

function zerosPlayerPitching(): PlayerPitchingStats {
  return {
    OUTS_PITCHED: 0,
    BF: 0,
    H: 0,
    R: 0,
    ER: 0,
    BB: 0,
    IBB: 0,
    HBP: 0,
    SO: 0,
    HR: 0,
    HR_SOLO: 0,
    HR_2RUN: 0,
    HR_GRANDSLAM: 0,
    WP: 0,
    BK: 0,
    PK: 0,
    PKA: 0,
    PITCHES: 0,
    STRIKES: 0,
    BALLS: 0,
  };
}


function zerosTeamBatting(): TeamBattingStats {
  return {
    PA: 0,
    AB: 0,
    H: 0,
    "2B": 0,
    "3B": 0,
    HR: 0,
    HR_SOLO: 0,
    HR_2RUN: 0,
    HR_GRANDSLAM: 0,
    R: 0,
    RBI: 0,
    BB: 0,
    HBP: 0,
    SO: 0,
    LOB: 0,
    GIDP: 0,
    DP: 0,
  };
}

function zerosTeamRunning(): TeamRunningStats {
  return { SB: 0, CS: 0, PO: 0, POA: 0 };
}

function zerosTeamFielding(): TeamFieldingStats {
  return { PO: 0, A: 0, E: 0, DP: 0, TP: 0 };
}

function zerosTeamPitching(): TeamPitchingStats {
  return {
    OUTS_PITCHED: 0,
    BF: 0,
    H: 0,
    R: 0,
    ER: 0,
    BB: 0,
    SO: 0,
    HR: 0,
    HR_SOLO: 0,
    HR_2RUN: 0,
    HR_GRANDSLAM: 0,
    WP: 0,
    BK: 0,
    PK: 0,
    PKA: 0,
    PITCHES: 0,
    STRIKES: 0,
    BALLS: 0,
  };
}

function makeTeamStats(teamSide: TeamSide): TeamStats {
  return {
    teamSide,
    batting: zerosTeamBatting(),
    running: zerosTeamRunning(),
    fielding: zerosTeamFielding(),
    pitching: zerosTeamPitching(),
  };
}

function makePlayerStats(playerId: PlayerId, teamSide: TeamSide): PlayerStats {
  return {
    playerId,
    teamSide,
    batting: zerosPlayerBatting(),
    running: zerosPlayerRunning(),
    fielding: zerosPlayerFielding(),
    pitching: zerosPlayerPitching(),
  };
}


export function createInitialStatsState(state: GameState): StatsState {
  const players: Record<PlayerId, PlayerStats> = {} as any;

  const homeRoster = state.roster?.HOME ?? [];
  const awayRoster = state.roster?.AWAY ?? [];

  for (const pid of homeRoster) players[pid] = makePlayerStats(pid, "HOME");
  for (const pid of awayRoster) players[pid] = makePlayerStats(pid, "AWAY");

  return {
    players,
    teams: {
      HOME: makeTeamStats("HOME"),
      AWAY: makeTeamStats("AWAY"),
    },
  };
}
