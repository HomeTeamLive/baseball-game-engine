// src/stats/attributionRules.ts
import type { PlayerId } from "../types/gameState";
import type { GameEvent } from "../types/events";
import type { PAContext } from "./paContext";

/**
 * Batter mid-PA substitution rule (Official Scorer guidance):
 * If a batter is replaced with 2 strikes and the PA ends in a strikeout,
 * charge the strikeout + time at bat to the original batter.
 * Otherwise, the competing (sub) batter gets the result.
 *
 */
export function chooseBatterForTerminalEvent(ctx: PAContext, terminalEvent: GameEvent): PlayerId {
  const current = ctx.batter_current;

  if (ctx.batterSubSnapshots.length === 0) return current;

  if (terminalEvent.name === "STRIKEOUT") {
    const original = ctx.batter_started;

    const originalWasSubbedAtTwoStrikes = ctx.batterSubSnapshots.some(
      (s) => s.player_out === original && s.strikes === 2
    );

    if (originalWasSubbedAtTwoStrikes) return original;
  }

  return current;
}

/**
 * Pitcher mid-PA substitution rule for WALKS (Official Scorer Rule 9.16(h)):
 *
 * If the count is 2-0, 2-1, 3-0, 3-1, or 3-2 at the time of the pitching change,
 * and the batter later receives a base on balls, the walk (and batter) is charged
 * to the preceding pitcher (the one removed), not the relief pitcher. 
 *
 * Any other action by the batter (hit, out, HBP, etc.) is charged to the relief pitcher. 
 * And if the count is NOT one of those “decided advantage” counts, it’s charged to the relief pitcher. 
 * */
export function choosePitcherForTerminalEvent(ctx: PAContext, terminalEvent: GameEvent): PlayerId {
  const relief = ctx.pitcher_current;

  // Only the WALK outcome has the count-based exception.
  const isWalk =
    terminalEvent.name === "WALK" || terminalEvent.name === "INTENTIONAL_WALK";

  if (!isWalk) return relief;

  if (ctx.pitcherSubSnapshots.length === 0) return relief;

  const lastChange = ctx.pitcherSubSnapshots[ctx.pitcherSubSnapshots.length - 1];

  const decidedAdvantage =
    (lastChange.balls === 2 && lastChange.strikes === 0) || // 2-0
    (lastChange.balls === 2 && lastChange.strikes === 1) || // 2-1
    (lastChange.balls === 3 && lastChange.strikes === 0) || // 3-0
    (lastChange.balls === 3 && lastChange.strikes === 1) || // 3-1
    (lastChange.balls === 3 && lastChange.strikes === 2);   // 3-2

  if (decidedAdvantage) {
    // Charge walk to the pitcher who left (preceding pitcher)
    return lastChange.pitcher_out;
  }

  return relief;
}
