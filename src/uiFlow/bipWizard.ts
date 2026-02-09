// src/uiFlow/bipWizard.ts
import type { GameState, BaseKey, PlayerId, DefensePos } from "../types/gameState";
import type { EffectiveGameRules } from "../types/gameRules";
import type { PitchResult } from "../types/pitch";
import type { BipFinalDestination, EventBaseKey, BipRunAttribution, EarnedStatus, YesNoLater } from "../types/bip";



export type BipWizardStep =
  | "BIP_BATTER_RESULT"
  | "BIP_OUTS_RECORDED"
  | "BIP_OUT_DETAILS"
  | "BIP_ERRORS"
  | "BIP_RUNNER_DESTINATIONS"
  | "BIP_RUNS_ATTRIBUTION"
  | "BIP_REVIEW_CONFIRM";


export type BipDraft = {
  addErrorChecked?: boolean;
  pitch?: { result: PitchResult; count_as_pitch?: boolean };

  batter_result?: string;
  ball_fielded_to?: DefensePos;
  batted_ball_type?: string;
  outsRecorded?: 0 | 1 | 2 | 3;

  outs?: Array<{
    outIndex: number; 
    who_out?: "BATTER" | "R1" | "R2" | "R3"; 
    how?: "FORCE" | "TAG" | "FLY_OUT" | "K" | string;
    putout_pos?: DefensePos;
    assist_positions?: DefensePos[];
  }>;

  errors?: Array<{
    errorType?: "THROWING" | "FIELDING" | "CATCHING";
    errorPos?: DefensePos;
  }>;

  destinations?: Array<{
    participant_id: PlayerId;
    from: EventBaseKey; 
    final: BipFinalDestination; 
    advance_reason?: "ON_HIT" | "ON_ERROR" | "ON_THROW" | "TAG_UP" | "FIELDERS_CHOICE";
    which_error_index?: number; 
    which_out_index?: number; 
  }>;

  runs?: Array<BipRunAttribution> | null;
};


export type BipWizardContext = {
  requiredParticipants: Array<{
    participant_id: PlayerId;
    from: EventBaseKey;
    label: string; 
  }>;
  startedBases: Partial<Record<BaseKey, PlayerId>>;
  batterId: PlayerId;

 
  defensePitchersInGameOrInning: PlayerId[];
};


export type BipBatterResultUiPolicy = {
  
  showAddErrorCheckbox: boolean;
  errorsImplicitlyRequired: boolean;
};

export function getBipBatterResultUiPolicy(draft: BipDraft): BipBatterResultUiPolicy {
  const reachedOnError = draft.batter_result === "ROE";
  return {
    showAddErrorCheckbox: !reachedOnError,
    errorsImplicitlyRequired: reachedOnError,
  };
}

export function normalizeBipDraft(draft: BipDraft): BipDraft {
  if (draft.batter_result === "ROE") {
    return { ...draft, addErrorChecked: false };
  }
  return draft;
}

function startedRunners(state: GameState): Partial<Record<BaseKey, PlayerId>> {
  return {
    "1B": state.bases["1B"],
    "2B": state.bases["2B"],
    "3B": state.bases["3B"],
  };
}

function computeRequiredParticipants(state: GameState): BipWizardContext["requiredParticipants"] {
  const batterId = state.pa.batter.playerId;
  const list: BipWizardContext["requiredParticipants"] = [
    { participant_id: batterId, from: "HOME", label: "Batter" },
  ];

  const r = startedRunners(state);
  if (r["1B"]) list.push({ participant_id: r["1B"]!, from: "1B", label: "Runner from 1B" });
  if (r["2B"]) list.push({ participant_id: r["2B"]!, from: "2B", label: "Runner from 2B" });
  if (r["3B"]) list.push({ participant_id: r["3B"]!, from: "3B", label: "Runner from 3B" });

  return list;
}

function requiresBallContactDetails(br?: string): boolean {
  return br === "1B" || br === "2B" || br === "3B";
}

function requiresErrorsStep(d: BipDraft): boolean {
  if (d.batter_result === "ROE") return true;

  if (d.addErrorChecked) return true;
  if (d.destinations?.some((x) => x.advance_reason === "ON_ERROR")) return true;

  return false;
}

function outsNeedDetails(d: BipDraft): boolean {
  return (d.outsRecorded ?? 0) > 0;
}

function outDetailsComplete(d: BipDraft): boolean {
  const n = d.outsRecorded ?? 0;
  if (n === 0) return true;
  if (!Array.isArray(d.outs) || d.outs.length !== n) return false;

  for (let i = 0; i < n; i++) {
    const od = d.outs[i];
    if (!od) return false;
    if (!od.who_out) return false;
    if (!od.how) return false;
    if (!od.putout_pos) return false;
  }
  return true;
}

function destinationsComplete(state: GameState, d: BipDraft): boolean {
  const required = computeRequiredParticipants(state);
  if (!Array.isArray(d.destinations)) return false;

  const byPid = new Map<PlayerId, any>();
  for (const dest of d.destinations) {
    if (!dest?.participant_id) return false;
    byPid.set(dest.participant_id, dest);
  }

  for (const req of required) {
    const dest = byPid.get(req.participant_id);
    if (!dest) return false;
    if (!dest.final) return false;
    if (!dest.from) return false;

    if (req.from === "HOME" && dest.from !== "HOME") return false;
  }

  const finals = new Map<string, PlayerId>();
  for (const dest of d.destinations) {
    if (dest.final === "1B" || dest.final === "2B" || dest.final === "3B") {
      if (finals.has(dest.final)) return false;
      finals.set(dest.final, dest.participant_id);
    }
  }

  return true;
}

function anyRunScored(d: BipDraft): boolean {
  if (Array.isArray(d.runs) && d.runs.length > 0) return true;

  if (Array.isArray(d.destinations)) return d.destinations.some((x) => x.final === "HOME");

  return false;
}

function runsAttributionComplete(d: BipDraft): boolean {
  if (!Array.isArray(d.runs) || d.runs.length === 0) return true;

  for (const r of d.runs) {
    if (!r) return false;
    if (!r.runner_id) return false;
    if (!r.rbi) return false; 
    if (!r.earned) return false; 
    if (!r.charged_pitcher_id) return false;
  }

  return true;
}


export function buildBipWizardContext(state: GameState, _rules: EffectiveGameRules): BipWizardContext {
  const requiredParticipants = computeRequiredParticipants(state);
  const startedBases = startedRunners(state);
  const batterId = state.pa.batter.playerId;

  const defensePitchersInGameOrInning: PlayerId[] = [state.pa.pitcherId];

  return { requiredParticipants, startedBases, batterId, defensePitchersInGameOrInning };
}


export function getNextBipWizardStep(
  state: GameState,
  rules: EffectiveGameRules,
  draftIn: BipDraft
): BipWizardStep {
  const draft = normalizeBipDraft(draftIn);

  if (!draft.batter_result) return "BIP_BATTER_RESULT";

  if (requiresBallContactDetails(draft.batter_result)) {
    if (!draft.ball_fielded_to || !draft.batted_ball_type) return "BIP_BATTER_RESULT";
  }

  if (draft.outsRecorded === undefined || draft.outsRecorded === null) return "BIP_OUTS_RECORDED";

  if (outsNeedDetails(draft) && !outDetailsComplete(draft)) return "BIP_OUT_DETAILS";

  if (requiresErrorsStep(draft)) {
    if (draft.errors === undefined) return "BIP_ERRORS";

    if (draft.batter_result === "ROE" && Array.isArray(draft.errors) && draft.errors.length === 0) {
      return "BIP_ERRORS";
    }
  }

  if (!destinationsComplete(state, draft)) return "BIP_RUNNER_DESTINATIONS";

  if (anyRunScored(draft)) {
    if (!Array.isArray(draft.runs)) return "BIP_RUNS_ATTRIBUTION";
    if (!runsAttributionComplete(draft)) return "BIP_RUNS_ATTRIBUTION";
  }

  return "BIP_REVIEW_CONFIRM";
}
