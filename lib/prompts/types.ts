export type Severity = "Low" | "Medium" | "High";

export type ViolationCategory =
  | "Fire"
  | "Electrical"
  | "Egress"
  | "ADA"
  | "Hazmat"
  | "InfectionControl"
  | "Structural"
  | "Other";

export type ImageQuality = "clear" | "blurry" | "dark" | "overexposed" | "occluded";

export type NormalizedBBox = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type Violation = {
  id: string;
  title: string;
  category: ViolationCategory;
  code: string;
  severity: Severity;
  description: string;
  location: string;
  coordinates: NormalizedBBox;
  confidence: number;
  remediation: string;
  references: string[];
};

export type WhatToLookForItem = {
  item: string;
  details: string;
};

export type NotVisibleItem = {
  item: string;
  reason: string;
};

/**
 * Optional follow-up question the model can emit when it genuinely
 * needs the inspector to clarify something before it can produce a
 * confident finding. Used in the Coach the AI flow — when present,
 * the UI renders it as a chip-style answer prompt instead of
 * (or in addition to) the normal findings update.
 *
 * The model is instructed to use this SPARINGLY — only when the
 * answer would materially change the call.
 */
export type ClarifyingQuestion = {
  question: string;
  /** Why answering this changes the analysis. One sentence. */
  rationale?: string;
  /** Discrete answer chips. Empty/omitted = free-text input. */
  options?: string[];
};

export type ComplianceAnalysis = {
  schemaVersion: "1.1";
  summary: {
    text: string;
    confidence: number;
    imageQuality: ImageQuality;
  };
  image: {
    width: number;
    height: number;
  };
  violations: Violation[];
  whatToLookFor: WhatToLookForItem[];
  notVisible: NotVisibleItem[];
  /** Phase 3 of Coach the AI — AI asks one clarifying question back. */
  clarifyingQuestion?: ClarifyingQuestion;
};

export type InspectionMetadata = {
  facilityName: string;
  facilityAddress: string;
  inspectorName: string;
  managerAssigned: string;
  dateOfInspection: string;
  dateAssigned: string;
  location: string;
};
