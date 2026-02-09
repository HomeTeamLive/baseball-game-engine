// src/stats/StatsReconciler.ts
import type { GameEvent } from "../types/events";
import type { GameState } from "../types/gameState";
import type { EffectiveGameRules } from "../types/gameRules";
import type { StatsState } from "../types/stats";

import { applyEvent } from "../engine/applyEvent";
import { computeStatsDelta } from "./computeStatsDelta";
import { applyStatsDelta } from "./applyStatsDelta";
import { createInitialStatsState } from "./createInitialStatsState";

import type { PAContext, TerminalPAEventName } from "./paContext";
import { chooseBatterForTerminalEvent, choosePitcherForTerminalEvent } from "./attributionRules";

export interface HalfInningKey {
  inningNumber: number;
  half: "TOP" | "BOTTOM";
}

export interface ReplayCheckpoint {
  nextEventIndex: number;
  halfInning: HalfInningKey;
  state: GameState;
  stats: StatsState;
  label: string;
}

export interface ReconcileResult {
  finalState: GameState;
  finalStats: StatsState;
  checkpoints: ReplayCheckpoint[];
}

function clone<T>(x: T): T {
  return typeof structuredClone === "function" ? structuredClone(x) : JSON.parse(JSON.stringify(x));
}

function halfInningKey(state: GameState): HalfInningKey {
  return { inningNumber: state.inning.inningNumber, half: state.inning.half };
}

function sameHalfInning(a: HalfInningKey, b: HalfInningKey): boolean {
  return a.inningNumber === b.inningNumber && a.half === b.half;
}

const TERMINAL_EVENTS = new Set<TerminalPAEventName>([
  "BIP",
  "WALK",
  "INTENTIONAL_WALK",
  "HBP",
  "STRIKEOUT",
  "DROPPED_THIRD_STRIKE",
  "CATCHER_INTERFERENCE",
]);

function isTerminalPAEvent(e: GameEvent): e is GameEvent & { name: TerminalPAEventName } {
  return TERMINAL_EVENTS.has(e.name as any);
}

export class StatsReconciler {
  private readonly initialState: GameState;
  private readonly rules: EffectiveGameRules;

  constructor(args: { initialState: GameState; rules: EffectiveGameRules }) {
    this.initialState = clone(args.initialState);
    this.rules = args.rules;
  }

  reconcileAll(events: GameEvent[], opts?: { createCheckpoints?: boolean }): ReconcileResult {
    const createCheckpoints = opts?.createCheckpoints ?? true;

    let state = clone(this.initialState);
    let stats = createInitialStatsState(state);

    let paCtx: PAContext | null = null;

    const checkpoints: ReplayCheckpoint[] = [];
    if (createCheckpoints) checkpoints.push(this.makeCheckpoint(0, state, stats, "START"));

    for (let i = 0; i < events.length; i++) {
      const e = events[i];

      if (e.name === "AT_BAT_START") {
        paCtx = {
          pa_id: (e.payload as any).pa_id,
          batter_started: (e.payload as any).batter_id,
          batter_current: (e.payload as any).batter_id,
          pitcher_started: (e.payload as any).pitcher_id,
          pitcher_current: (e.payload as any).pitcher_id,
          batterSubSnapshots: [],
          pitcherSubSnapshots: [],
          balls: state.inning.count.balls,
          strikes: state.inning.count.strikes,
        };
      } else if (paCtx) {
        paCtx.balls = state.inning.count.balls;
        paCtx.strikes = state.inning.count.strikes;

        if (e.name === "SUBSTITUTION_BATTER") {
          const p = e.payload as any;
          paCtx.batterSubSnapshots.push({
            player_out: p.player_out,
            player_in: p.player_in,
            balls: paCtx.balls,
            strikes: paCtx.strikes,
          });
          paCtx.batter_current = p.player_in;
        }

        if (e.name === "PITCHING_CHANGE") {
          const p = e.payload as any;
          paCtx.pitcherSubSnapshots.push({
            pitcher_out: p.pitcher_out,
            pitcher_in: p.pitcher_in,
            balls: paCtx.balls,
            strikes: paCtx.strikes,
          });
          paCtx.pitcher_current = p.pitcher_in;
        }
      }

      let delta = computeStatsDelta(state, e);

      if (paCtx && isTerminalPAEvent(e)) {
        const batterToCharge = chooseBatterForTerminalEvent(paCtx, e);
        const pitcherToCharge = choosePitcherForTerminalEvent(paCtx, e);
        delta = patchDeltaAttribution(delta, {
          batterToCharge,
          pitcherToCharge,
          stateBefore: state,
        });
      }

      stats = applyStatsDelta(stats, delta);

      const applied = applyEvent(state, this.rules, e);
      if (!applied.ok) {
        throw new Error(`Replay failed at event[${i}] ${e.name}: ${(applied.errors ?? []).join("; ")}`);
      }
      state = applied.state;

      if (paCtx && isTerminalPAEvent(e)) {
        paCtx.terminalEvent = e;
        paCtx = null;
      }

      if (createCheckpoints) {
        const prevHalf = checkpoints[checkpoints.length - 1]?.halfInning ?? halfInningKey(this.initialState);
        const nowHalf = halfInningKey(state);

        if (!sameHalfInning(prevHalf, nowHalf)) {
          checkpoints.push(
            this.makeCheckpoint(i + 1, state, stats, `HALF_INNING -> ${nowHalf.inningNumber} ${nowHalf.half}`)
          );
        }
      }
    }

    return { finalState: state, finalStats: stats, checkpoints };
  }

  reconcileFromNearestCheckpoint(events: GameEvent[], editedEventIndex: number): ReconcileResult {
    return this.reconcileAll(events, { createCheckpoints: true });
  }

  private makeCheckpoint(nextEventIndex: number, state: GameState, stats: StatsState, label: string): ReplayCheckpoint {
    return {
      nextEventIndex,
      halfInning: halfInningKey(state),
      state: clone(state),
      stats: clone(stats),
      label,
    };
  }
}

function patchDeltaAttribution(delta: any, args: { batterToCharge: string; pitcherToCharge: string; stateBefore: GameState }) {
  const { batterToCharge, pitcherToCharge, stateBefore } = args;

  const batterOriginal = stateBefore.pa.batter.playerId;
  const pitcherOriginal = stateBefore.pa.pitcherId;

  if (batterOriginal === batterToCharge && pitcherOriginal === pitcherToCharge) return delta;

  if (!delta || typeof delta !== "object" || !delta.players) return delta;

  function moveSection(fromId: string, toId: string, sectionKey: "batting" | "pitching") {
    const from = delta.players?.[fromId]?.[sectionKey];
    if (!from) return;

    delta.players[toId] ??= {};
    delta.players[toId][sectionKey] ??= {};

    for (const [k, v] of Object.entries(from)) {
      if (typeof v === "number") {
        delta.players[toId][sectionKey][k] = (delta.players[toId][sectionKey][k] ?? 0) + v;
      }
    }

    for (const k of Object.keys(from)) {
      if (typeof from[k] === "number") from[k] = 0;
    }
  }

  if (batterOriginal !== batterToCharge) moveSection(batterOriginal, batterToCharge, "batting");

  if (pitcherOriginal !== pitcherToCharge) moveSection(pitcherOriginal, pitcherToCharge, "pitching");

  return delta;
}
