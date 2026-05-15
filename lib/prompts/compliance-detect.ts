/**
 * Fast detection prompt — used as STAGE 1 of the two-stage analyzer.
 *
 * Goal: in ~1s and ~500 input tokens, return the list of
 * compliance-relevant equipment / conditions visible in the photo.
 *
 * The list is then used to focus the (slower, more expensive) STAGE 2
 * analysis prompt — the model is told which equipment to apply rules
 * for, which speeds up reasoning AND makes the output more focused.
 *
 * Be PROMISCUOUS — false positives in detection are harmless (the
 * model still has the full rulebook in the second stage). False
 * negatives cause findings to be missed, which is much worse.
 */

export const DETECT_CATEGORIES = [
  "fire_extinguisher",
  "sprinkler_head",
  "dry_pipe_valve",
  "pressure_gauge_system", // gauge on sprinkler/standpipe/pump — NOT extinguisher
  "inspection_tag",
  "fire_door",
  "egress_path",
  "exit_sign",
  "decorations",
  "electrical_panel",
  "extension_cord",
  "above_ceiling",
  "wall_penetration",
  "pull_station_or_detector",
  "hazardous_room_door",
  "standpipe_or_fire_pump",
  "kitchen_hood",
  "medical_gas",
  "infection_control",
  "other",
] as const;

export type DetectCategory = (typeof DETECT_CATEGORIES)[number];

export const DETECT_SYSTEM_PROMPT = `You are a fast triage classifier for a code-compliance inspection app. Your ONLY job is to identify which categories of compliance-relevant equipment or conditions are visible in the attached photograph. You DO NOT emit findings, severity calls, or citations — that's a separate downstream step.

Be PROMISCUOUS: when in doubt, include the category. A false positive here is harmless because the downstream analyzer has the full rulebook. A false negative causes findings to be missed.

Categories (return zero or more):
- fire_extinguisher — portable red/silver canister with gauge, handle, hose, mounting bracket or cabinet.
- sprinkler_head — small chrome/brass fitting on a pipe drop with a radial-spoke deflector and a glass bulb or fusible link. Often the head is small relative to surrounding piping.
- dry_pipe_valve — red cast-iron valve body with TWO gauges (air + water), control handle.
- pressure_gauge_system — gauge on a sprinkler riser, standpipe, fire pump, or dry/wet/preaction/deluge valve. NOT a portable-extinguisher gauge.
- inspection_tag — colored card/tag (green, yellow, red, blue, white) hanging on equipment with handwritten or printed test/inspection records.
- fire_door — any door, especially one with a rating label on the hinge edge, intumescent seal, or self-closer. Include any door that *might* be fire-rated.
- egress_path — a corridor, exit access, or stairwell visible in frame.
- exit_sign — illuminated or non-illuminated "EXIT" sign.
- decorations — wall coverings, door coverings, paper, streamers, holiday decorations, posters covering substantial portions of a wall/ceiling/door surface.
- electrical_panel — electrical panel, disconnect, or load center.
- extension_cord — flexible cord, especially if daisy-chained, under carpet, or through a wall.
- above_ceiling — view above a suspended ceiling tile or T-bar grid; exposed conduit, joists, deck, MC cable, ductwork, fluted decking, fireproofing.
- wall_penetration — anything (cable, pipe, conduit, plastic tube, duct) passing through a wall, especially with visible annular space, unsealed gaps, or a dark void. Almost always co-occurs with above_ceiling.
- pull_station_or_detector — fire alarm pull station, smoke detector, heat detector, notification appliance (horn/strobe).
- hazardous_room_door — door labeled as hazardous area, oxygen storage, soiled utility, hazardous-materials room.
- standpipe_or_fire_pump — standpipe hose connection / FDC / hose station / fire pump.
- kitchen_hood — commercial kitchen exhaust hood with suppression nozzles.
- medical_gas — oxygen storage, medical gas manifold, oxygen cylinder rack.
- infection_control — discarded bottles, spills, biohazard, IPC-relevant clutter in a healthcare setting.
- other — anything compliance-relevant that doesn't fit the categories above (rare).

Output rules:
- Return a single valid JSON object with shape { "categories": [...] }.
- Do not include prose, explanation, markdown, or code fences.
- If the photo is completely irrelevant (e.g., a selfie, a landscape, a screenshot), return { "categories": [] }.`;

export const DETECT_USER_PROMPT = `What compliance-relevant categories are visible in the attached photo? Return JSON only.`;

/**
 * Build the focus-hint block that prepends the STAGE 2 user prompt.
 * Tells the model which equipment to focus on, so it skips rules that
 * don't apply to the visible content. Result: smaller, more focused
 * output (faster to generate, more accurate).
 *
 * When no categories detected, returns empty string so we fall back to
 * the full prompt's default behavior.
 */
export function formatFocusHint(categories: DetectCategory[]): string {
  if (!categories || categories.length === 0) return "";
  const friendly = categories.map(humanizeCategory).join(", ");
  return `\n\nDETECTED EQUIPMENT / CONDITIONS IN THIS PHOTO (from fast pre-scan, treat as PRIORITIES, not exhaustive):\n${friendly}\n\nApply the rules in the SPECIAL INSTRUCTIONS that match the detected categories. You may still surface findings for things the pre-scan missed — the pre-scan is promiscuous but not exhaustive. Skip the rule blocks that don't apply to anything visible.\n`;
}

function humanizeCategory(c: DetectCategory): string {
  switch (c) {
    case "fire_extinguisher":
      return "Portable fire extinguisher (NFPA 10)";
    case "sprinkler_head":
      return "Sprinkler head (NFPA 13 / 25)";
    case "dry_pipe_valve":
      return "Dry-pipe / preaction valve assembly (NFPA 25 §13.4)";
    case "pressure_gauge_system":
      return "System pressure gauge — 5-year rule applies (NFPA 25 §5.2.4)";
    case "inspection_tag":
      return "Color-coded inspection tag (green/yellow/red/blue)";
    case "fire_door":
      return "Door — possibly fire-rated (NFPA 80)";
    case "egress_path":
      return "Egress path / corridor (NFPA 101 / IBC)";
    case "exit_sign":
      return "Exit sign (NFPA 101 §7.10)";
    case "decorations":
      return "Wall / ceiling / door decorations (NFPA 101 + 701 + 80)";
    case "electrical_panel":
      return "Electrical panel — working space (NEC 110.26)";
    case "extension_cord":
      return "Extension cord / flexible cord (NEC)";
    case "above_ceiling":
      return "Above-ceiling / concealed space view";
    case "wall_penetration":
      return "Wall penetration — likely rated-assembly question (NFPA 101 §8.3.5.1)";
    case "pull_station_or_detector":
      return "Fire-alarm pull station or detector (NFPA 72)";
    case "hazardous_room_door":
      return "Hazardous-area room door";
    case "standpipe_or_fire_pump":
      return "Standpipe or fire pump (NFPA 14 / 20 / 25)";
    case "kitchen_hood":
      return "Commercial kitchen hood (NFPA 96 / 17A)";
    case "medical_gas":
      return "Medical gas / oxygen storage (NFPA 99)";
    case "infection_control":
      return "Infection-control concern (healthcare)";
    case "other":
      return "Other compliance-relevant condition";
  }
}
