/**
 * Healthcare-style audit-section classifier.
 *
 * The customer's EOC/LS Inspection report is structured as a checklist with
 * numbered sub-sections (A1 Fire Doors, A2 Fire-Rated Walls, A3 Fire Alarm
 * and Sprinkler, A4 Rooms, A5 Corridors, A6 General, B Safety Management,
 * C Security Management). Our AI emits free-form findings with broader
 * categories (Fire / Electrical / Egress / …), so to match the report
 * format we keyword-classify each finding into the most appropriate
 * sub-section.
 *
 * The mapping is deliberately conservative — when a finding could belong to
 * several sub-sections, we pick the most-cited primary one (e.g. anything
 * about a sprinkler valve goes to A3 even if the title also mentions a
 * fire door).
 */

export type AuditSection = {
  /** Letter code, e.g. "A1", "A6", "B", "C". */
  code: string;
  /** Display title shown as the section header. */
  title: string;
};

export const AUDIT_SECTIONS: AuditSection[] = [
  { code: "A1", title: "Fire Doors" },
  { code: "A2", title: "Fire-Rated Walls, Ceilings, and Floors" },
  { code: "A3", title: "Fire Alarm and Sprinkler Systems" },
  { code: "A4", title: "Rooms" },
  { code: "A5", title: "Corridors" },
  { code: "A6", title: "General" },
  { code: "B",  title: "Safety Management" },
  { code: "C",  title: "Security Management" },
  { code: "Z",  title: "Other Findings" },
];

const SECTION_BY_CODE: Record<string, AuditSection> = Object.fromEntries(
  AUDIT_SECTIONS.map((s) => [s.code, s]),
);

export type FindingForClassification = {
  title: string;
  category: string; // our AI's enum: Fire | Electrical | Egress | ADA | Hazmat | InfectionControl | Structural | Other
  code?: string | null;
  description?: string | null;
};

/** Pick the best audit-section code for a finding. */
export function classifyToSection(f: FindingForClassification): AuditSection {
  const hay = [
    f.title ?? "",
    f.description ?? "",
    f.code ?? "",
  ]
    .join(" ")
    .toLowerCase();

  // ---- A1: Fire Doors ----
  if (
    /(fire[- ]?(rated )?door|fire door|smoke door|self[- ]?clos|door latch|positive latch|undercut|door clearance|door label|door frame|door rating|door hardware|door sweep|door gasket|smoke seal|intumescent seal|vision panel)/.test(hay)
  ) {
    return SECTION_BY_CODE.A1;
  }

  // ---- A2: Fire-Rated Walls, Ceilings, and Floors ----
  if (
    /(penetration|annular|firestop|fire[- ]?stop|rated wall|fire[- ]?rated wall|smoke (barrier|compartment|partition)|scab patch|wall stencil|wall identif|stencil|fire wall|fire barrier|membrane|listed system|nfpa 101 .?8\.3|astm e814|ul 1479)/.test(hay)
  ) {
    return SECTION_BY_CODE.A2;
  }

  // ---- A3: Fire Alarm and Sprinkler Systems ----
  if (
    /(sprinkler|escutcheon|deflector|pull station|fire alarm|smoke detector|notification appliance|riser|standpipe|dry[- ]?pipe|wet[- ]?pipe|preaction|deluge|fire pump|trip test|nfpa 13|nfpa 14|nfpa 25|nfpa 72)/.test(hay)
  ) {
    return SECTION_BY_CODE.A3;
  }

  // ---- A5: Corridors ----
  if (
    /(corridor|dead[- ]?end|egress width|egress path|exit access|projection into|exit corridor|cross[- ]?corridor)/.test(hay)
  ) {
    return SECTION_BY_CODE.A5;
  }

  // ---- A4: Rooms ----
  if (
    /(patient (sleeping )?room|waiting area|trash|linen|hazardous (area|room)|patient bathroom|operating room|exam room)/.test(hay)
  ) {
    return SECTION_BY_CODE.A4;
  }

  // ---- B: Safety Management ----
  if (
    /(eyewash|ceiling tile|needle box|nurse call|power strip|relocatable power|extension cord|trip hazard|housekeeping|clutter)/.test(hay)
  ) {
    return SECTION_BY_CODE.B;
  }

  // ---- C: Security Management ----
  if (/(security|access control|id badge|surveillance|weapon)/.test(hay)) {
    return SECTION_BY_CODE.C;
  }

  // ---- A6: General (covers extinguishers, exit signs, electrical panels, ADA reach, decorations, generic life-safety) ----
  if (
    /(extinguisher|exit sign|exit lighting|electrical panel|nec 110|nfpa 10|decoration|nfpa 701|ada|reach range|mounting height|signage|pull cord|fire blanket)/.test(hay)
  ) {
    return SECTION_BY_CODE.A6;
  }

  // Fall back via our broad category if the keyword pass missed it.
  switch (f.category) {
    case "Fire":
      return SECTION_BY_CODE.A6;
    case "Egress":
      return SECTION_BY_CODE.A5;
    case "Electrical":
      return SECTION_BY_CODE.A6;
    case "ADA":
      return SECTION_BY_CODE.A6;
    case "Hazmat":
    case "InfectionControl":
      return SECTION_BY_CODE.B;
    case "Structural":
      return SECTION_BY_CODE.A2;
    default:
      return SECTION_BY_CODE.Z;
  }
}

/** Group a list of items by audit section, preserving AUDIT_SECTIONS order. */
export function groupBySection<T extends FindingForClassification>(
  items: T[],
): Array<{ section: AuditSection; items: T[] }> {
  const buckets = new Map<string, T[]>();
  for (const s of AUDIT_SECTIONS) buckets.set(s.code, []);
  for (const it of items) {
    const sec = classifyToSection(it);
    buckets.get(sec.code)!.push(it);
  }
  return AUDIT_SECTIONS.filter((s) => (buckets.get(s.code) ?? []).length > 0).map(
    (s) => ({ section: s, items: buckets.get(s.code) ?? [] }),
  );
}
