// src/uiFlow/editBipWizard.ts
import type { GameState, PlayerId, DefensePos } from "../types/gameState";
import type { EffectiveGameRules } from "../types/gameRules";
import type {
  BIPPayload,
  BipBatterResult,
  BipError,
  BipOutDetail,
  BipParticipantDestination,
  BipRunAttribution,
  EventBaseKey,
  BipFinalDestination,
} from "../types/bip";

/**
 * STRICT edit wizard for an existing BIP.
 *
 * Locked (immutable):
 *  - destinations (who ended on which base / who scored)
 *  - outs identity (who was out, out_number, where)
 *  - outsRecorded and batterFinal derived from original
 *
 * Editable:
 *  - batter_result classification (only if consistent with locked batterFinal)
 *  - out attribution (how / putout / assists) WITHOUT changing outs identity
 *  - errors metadata (fielder/impact) WITHOUT changing destinations
 *  - runs attribution (RBI / earned / charged pitcher) 
 */

export type BipEditWizardStep =
  | "BIP_EDIT_SCORING"
  | "BIP_EDIT_OUT_ATTRIBUTION"
  | "BIP_EDIT_ERRORS"
  | "BIP_EDIT_RUNS_ATTRIBUTION"
  | "BIP_EDIT_REVIEW_CONFIRM";

export type LockedBipOutcome = {
  destinations: BipParticipantDestination[];
  outs: Array<Pick<BipOutDetail, "out_number" | "runner_id" | "where">>;
  outsRecorded: 0 | 1 | 2 | 3;

  batterId: PlayerId;
  batterFinal: BipFinalDestination;
};

export type BipEditDraft = {
  batter_result?: BipBatterResult;
  batter_out_subtype?: BIPPayload["batter_out_subtype"] | null;

  batted_ball?: BIPPayload["batted_ball"] | null;

  outs?: Array<{
    out_number: 1 | 2 | 3;
    runner_id: PlayerId;
    where: EventBaseKey;

    how?: BipOutDetail["how"];
    putout_by?: { pos: DefensePos; player_id: PlayerId };
    assists?: Array<{ pos: DefensePos; player_id: PlayerId }>;
  }>;

  errors?: BipError[] | null;

  runs?: Array<BipRunAttribution> | null;
};


export function buildLockedBipOutcome(stateBefore: GameState, original: BIPPayload): LockedBipOutcome {
  const batterId = stateBefore.pa.batter.playerId;

  const batterDest = original.destinations.find((d) => d.participant_id === batterId && d.from === "HOME");
  const batterFinal = batterDest?.final ?? "STAYS";

  const outsRecorded = (original.outs?.length ?? 0) as 0 | 1 | 2 | 3;

  return {
    destinations: original.destinations,
    outs: (original.outs ?? []).map((o) => ({
      out_number: o.out_number,
      runner_id: o.runner_id,
      where: o.where,
    })),
    outsRecorded,
    batterId,
    batterFinal,
  };
}

export function buildInitialBipEditDraftFromOriginal(original: BIPPayload): BipEditDraft {
  return {
    batter_result: original.batter_result,
    batter_out_subtype: original.batter_out_subtype ?? null,
    batted_ball: original.batted_ball ?? null,
    outs: (original.outs ?? []).map((o) => ({
      out_number: o.out_number,
      runner_id: o.runner_id,
      where: o.where,
      how: o.how,
      putout_by: o.putout_by,
      assists: o.assists ?? [],
    })),
    errors: original.errors ?? null,
    runs: original.runs ?? null,
  };
}


function outsIdentitySignature(outs: Array<Pick<BipOutDetail, "out_number" | "runner_id" | "where">>) {
  const rows = outs
    .map((o) => ({ out_number: o.out_number, runner_id: o.runner_id, where: o.where }))
    .sort((a, b) => a.out_number - b.out_number);
  return JSON.stringify(rows);
}

function lockedScorers(locked: LockedBipOutcome): PlayerId[] {
  const res: PlayerId[] = [];
  for (const d of locked.destinations) {
    if (d.final === "HOME") res.push(d.participant_id);
  }
  return res;
}

function anyRunScoredLocked(locked: LockedBipOutcome): boolean {
  return locked.destinations.some((d) => d.final === "HOME");
}


export function allowedBatterResultsForLockedFinal(final: BipFinalDestination): BipBatterResult[] {
  switch (final) {
    case "OUT":
      return ["OUT"];
    case "1B":
      return ["1B", "ROE", "FC"];
    case "2B":
      return ["2B", "GROUND_RULE_DOUBLE", "AUTOMATIC_DOUBLE", "ROE"];
    case "3B":
      return ["3B", "ROE"];
    case "HOME":
      return ["HR", "ROE"];
    case "STAYS":
    default:
      return ["OUT"];
  }
}


export type BipEditValidationCode =
  | "BIP_BATTER_RESULT_REQUIRED"
  | "BIP_BATTER_RESULT_ILLEGAL_FOR_LOCKED_FINAL"
  | "BIP_OUTS_IDENTITY_CHANGED"
  | "BIP_OUT_ATTRIBUTION_INCOMPLETE"
  | "BIP_ROE_REQUIRES_ERROR"
  | "BIP_RUNS_ATTRIBUTION_INCOMPLETE";

export type BipEditValidation =
  | { ok: true; codes: []; errors: [] }
  | { ok: false; codes: BipEditValidationCode[]; errors: string[] };

function isUnsetOrLater(v: unknown): boolean {
  return v === undefined || v === null || v === "LATER";
}

function runsAttributionComplete(d: BipEditDraft, locked: LockedBipOutcome): boolean {
  if (!anyRunScoredLocked(locked)) return true;

  if (!Array.isArray(d.runs) || d.runs.length === 0) return false;

  const needed = new Set(lockedScorers(locked));
  const seen = new Set<PlayerId>();

  for (const r of d.runs) {
    if (!r?.runner_id) return false;
    if (!needed.has(r.runner_id)) return false;
    seen.add(r.runner_id);

    if (isUnsetOrLater((r as any).rbi)) return false;
    if (isUnsetOrLater((r as any).earned)) return false;
    if ((r as any).charged_pitcher_id === undefined) return false;
  }

  for (const pid of needed) if (!seen.has(pid)) return false;
  return true;
}

function requiresErrorsStep(d: BipEditDraft): boolean {
  if (d.batter_result === "ROE") return true;
  return Array.isArray(d.errors) && d.errors.length > 0;
}

export function validateBipEditDraft(args: {
  stateBefore: GameState;
  rules: EffectiveGameRules;
  locked: LockedBipOutcome;
  draft: BipEditDraft;
}): BipEditValidation {
  const errors: string[] = [];
  const codes: BipEditValidationCode[] = [];
  const { locked, draft } = args;

  if (!draft.batter_result) {
    codes.push("BIP_BATTER_RESULT_REQUIRED");
    errors.push("Batter result is required.");
  } else {
    const allowed = allowedBatterResultsForLockedFinal(locked.batterFinal);
    if (!allowed.includes(draft.batter_result)) {
      codes.push("BIP_BATTER_RESULT_ILLEGAL_FOR_LOCKED_FINAL");
      errors.push(
        `Illegal edit: batter_result '${draft.batter_result}' is not allowed when batter final is '${locked.batterFinal}'.`
      );
    }
  }

  const lockedOutSig = outsIdentitySignature(locked.outs);
  const draftOuts = Array.isArray(draft.outs) ? draft.outs : [];
  const draftOutId = draftOuts.map((o) => ({
    out_number: o.out_number,
    runner_id: o.runner_id,
    where: o.where,
  }));
  const draftOutSig = outsIdentitySignature(draftOutId as any);

  if (lockedOutSig !== draftOutSig) {
    codes.push("BIP_OUTS_IDENTITY_CHANGED");
    errors.push(
      "Illegal edit: outs identity changed (who was out / out number / where). You may only edit attribution (how/putout/assists)."
    );
  }

  if (locked.outsRecorded > 0) {
    if (!Array.isArray(draft.outs) || draft.outs.length !== locked.outsRecorded) {
      codes.push("BIP_OUT_ATTRIBUTION_INCOMPLETE");
      errors.push("Out attribution is incomplete.");
    } else {
      for (const o of draft.outs) {
        if (!o.how) {
          codes.push("BIP_OUT_ATTRIBUTION_INCOMPLETE");
          errors.push(`Out #${o.out_number}: 'how' is required.`);
        }
        if (!o.putout_by?.pos || !o.putout_by?.player_id) {
          codes.push("BIP_OUT_ATTRIBUTION_INCOMPLETE");
          errors.push(`Out #${o.out_number}: putout fielder is required.`);
        }
        if (o.assists) {
          for (const a of o.assists) {
            if (!a?.pos || !a?.player_id) {
              codes.push("BIP_OUT_ATTRIBUTION_INCOMPLETE");
              errors.push(`Out #${o.out_number}: assist fielder is invalid.`);
            }
          }
        }
      }
    }
  }

  if (draft.batter_result === "ROE") {
    if (!Array.isArray(draft.errors) || draft.errors.length === 0) {
      codes.push("BIP_ROE_REQUIRES_ERROR");
      errors.push("Reached on error requires at least one error to be recorded.");
    }
  }

  if (!runsAttributionComplete(draft, locked)) {
    codes.push("BIP_RUNS_ATTRIBUTION_INCOMPLETE");
    errors.push("Runs attribution is incomplete or does not match the runners who scored.");
  }

  if (errors.length > 0) return { ok: false, codes, errors };
  return { ok: true, codes: [], errors: [] };
}


export function getNextBipEditWizardStep(args: {
  stateBefore: GameState;
  rules: EffectiveGameRules;
  locked: LockedBipOutcome;
  draft: BipEditDraft;
}): BipEditWizardStep {
  const { stateBefore, rules, locked, draft } = args;

  if (!draft.batter_result) return "BIP_EDIT_SCORING";
  const allowed = allowedBatterResultsForLockedFinal(locked.batterFinal);
  if (!allowed.includes(draft.batter_result)) return "BIP_EDIT_SCORING";

  if (locked.outsRecorded > 0) {
    const lockedSig = outsIdentitySignature(locked.outs);
    const draftOuts = Array.isArray(draft.outs) ? draft.outs : [];
    const draftSig = outsIdentitySignature(
      draftOuts.map((o) => ({ out_number: o.out_number, runner_id: o.runner_id, where: o.where })) as any
    );

    if (draftOuts.length !== locked.outsRecorded) return "BIP_EDIT_OUT_ATTRIBUTION";
    if (lockedSig !== draftSig) return "BIP_EDIT_OUT_ATTRIBUTION";
    for (const o of draftOuts) {
      if (!o.how) return "BIP_EDIT_OUT_ATTRIBUTION";
      if (!o.putout_by?.pos || !o.putout_by?.player_id) return "BIP_EDIT_OUT_ATTRIBUTION";
    }
  }

  if (requiresErrorsStep(draft)) {
    if (draft.batter_result === "ROE") {
      if (!Array.isArray(draft.errors) || draft.errors.length === 0) return "BIP_EDIT_ERRORS";
    }
    if (draft.errors === undefined) return "BIP_EDIT_ERRORS";
  }

  if (anyRunScoredLocked(locked)) {
    if (!runsAttributionComplete(draft, locked)) return "BIP_EDIT_RUNS_ATTRIBUTION";
  }

  const v = validateBipEditDraft({ stateBefore, rules, locked, draft });
  if (!v.ok) {
    if (v.codes.some((c) => c === "BIP_BATTER_RESULT_REQUIRED" || c === "BIP_BATTER_RESULT_ILLEGAL_FOR_LOCKED_FINAL")) {
      return "BIP_EDIT_SCORING";
    }
    if (v.codes.some((c) => c === "BIP_OUTS_IDENTITY_CHANGED" || c === "BIP_OUT_ATTRIBUTION_INCOMPLETE")) {
      return "BIP_EDIT_OUT_ATTRIBUTION";
    }
    if (v.codes.some((c) => c === "BIP_ROE_REQUIRES_ERROR")) {
      return "BIP_EDIT_ERRORS";
    }
    if (v.codes.some((c) => c === "BIP_RUNS_ATTRIBUTION_INCOMPLETE")) {
      return "BIP_EDIT_RUNS_ATTRIBUTION";
    }
  }

  return "BIP_EDIT_REVIEW_CONFIRM";
}


export function buildPatchedBipPayload(args: {
  stateBefore: GameState;
  rules: EffectiveGameRules;
  original: BIPPayload;
  locked: LockedBipOutcome;
  draft: BipEditDraft;
}): { ok: true; payload: BIPPayload } | { ok: false; errors: string[]; codes?: BipEditValidationCode[] } {
  const { stateBefore, rules, original, locked, draft } = args;

  const v = validateBipEditDraft({ stateBefore, rules, locked, draft });
  if (!v.ok) return { ok: false, errors: v.errors, codes: v.codes };

  const outs: BipOutDetail[] = (draft.outs ?? []).map((o) => ({
    out_number: o.out_number,
    runner_id: o.runner_id,
    where: o.where,
    how: (o.how ?? "FORCE") as any,
    putout_by: o.putout_by!,
    assists: o.assists ?? [],
  }));

  const payload: BIPPayload = {
    ...original,

    batter_result: draft.batter_result ?? original.batter_result,
    batter_out_subtype: draft.batter_out_subtype ?? null,
    batted_ball: draft.batted_ball ?? null,

    outs,

    errors: draft.errors ?? null,
    runs: draft.runs ?? null,

    destinations: locked.destinations,
  };

  return { ok: true, payload };
}
