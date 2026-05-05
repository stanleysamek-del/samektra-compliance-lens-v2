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
