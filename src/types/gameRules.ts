// src/types/gameRules.ts
export type Mode = "BASEBALL" | "SOFTBALL";

export type TieBreakerType = "NONE" | "GHOST_RUNNER" | "INTERNATIONAL_TIE_BREAKER";

export type TieBreakerStartBase = "2B" | "3B";

export type GhostRunnerIdentity = "LAST_BATTER_PREV_INNING" | "PLAYER_OF_CHOICE";

export interface LeagueSettings {
  innings: number; 

  ballsForWalk: number;
  strikesForOut: number;
  outsPerInning: number;

  startingBalls: number;
  startingStrikes: number;

  playExtraInnings: boolean;
  allowTieGames: boolean;

  tieBreaker: {
    type: TieBreakerType;

    startInning?: number //innings + 1;

    runnerStartsOn?: TieBreakerStartBase;
    runnerIs?: GhostRunnerIdentity;

    scoring?: {
      earnedRunForPitcher?: boolean;
      countsAsRunForRunner?: boolean;
      countsAsRbiForBatter?: boolean;
    };
  };
}

export interface GameSettingsOverride {
  innings?: number;

  ballsForWalk?: number;
  strikesForOut?: number;
  outsPerInning?: number;

  startingBalls?: number;
  startingStrikes?: number;

  playExtraInnings?: boolean;
  allowTieGames?: boolean;

  tieBreaker?: Partial<LeagueSettings["tieBreaker"]>;
}

export interface EffectiveGameRules {
  innings: number;

  ballsForWalk: number;
  strikesForOut: number;
  outsPerInning: number;

  startingBalls: number;
  startingStrikes: number;

  playExtraInnings: boolean;
  allowTieGames: boolean;

  tieBreaker: {
    type: TieBreakerType;
    startInning?: number;

    runnerStartsOn?: TieBreakerStartBase;
    runnerIs?: GhostRunnerIdentity;

    scoring?: {
      earnedRunForPitcher?: boolean;
      countsAsRunForRunner?: boolean;
      countsAsRbiForBatter?: boolean;
    };
  };
}

function applyInternationalTieBreakerDefaults(rules: EffectiveGameRules): EffectiveGameRules {
  const startInning = rules.innings + 1;

  return {
    ...rules,
    tieBreaker: {
      ...rules.tieBreaker,
      type: "INTERNATIONAL_TIE_BREAKER",
      startInning,
      runnerStartsOn: rules.tieBreaker.runnerStartsOn ?? "2B",
      runnerIs: rules.tieBreaker.runnerIs ?? "LAST_BATTER_PREV_INNING",
      scoring: {
        earnedRunForPitcher: rules.tieBreaker.scoring?.earnedRunForPitcher ?? false,
        countsAsRunForRunner: rules.tieBreaker.scoring?.countsAsRunForRunner ?? true,
        countsAsRbiForBatter: rules.tieBreaker.scoring?.countsAsRbiForBatter ?? true,
      },
    },
  };
}


export function resolveGameRules(
  league: LeagueSettings,
  game?: GameSettingsOverride
): EffectiveGameRules {
  const mergedTieBreaker = {
    ...league.tieBreaker,
    ...(game?.tieBreaker ?? {}),
    scoring: {
      ...(league.tieBreaker.scoring ?? {}),
      ...((game?.tieBreaker?.scoring as any) ?? {}),
    },
  };

  let rules: EffectiveGameRules = {
    innings: game?.innings ?? league.innings,

    ballsForWalk: game?.ballsForWalk ?? league.ballsForWalk,
    strikesForOut: game?.strikesForOut ?? league.strikesForOut,
    outsPerInning: game?.outsPerInning ?? league.outsPerInning,

    startingBalls: game?.startingBalls ?? league.startingBalls,
    startingStrikes: game?.startingStrikes ?? league.startingStrikes,

    playExtraInnings: game?.playExtraInnings ?? league.playExtraInnings,
    allowTieGames: game?.allowTieGames ?? league.allowTieGames,

    tieBreaker: mergedTieBreaker,
  };

  if (rules.tieBreaker.type === "INTERNATIONAL_TIE_BREAKER") {
    rules = applyInternationalTieBreakerDefaults(rules);
  }

  if (rules.tieBreaker.type === "NONE") {
    rules.tieBreaker = { type: "NONE" };
  }

  return rules;
}
