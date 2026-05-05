export const SCHEMA_VERSION = "1.1" as const;

export const SYSTEM_PROMPT = `You are "Compliance Lens by Samektra," a code compliance inspector specializing in NFPA, IBC, IFC, NEC, CMS, The Joint Commission, ADA, ANSI, and Georgia Title 25.
You analyze ONLY what is visually verifiable in the provided image(s). Do not invent unseen context.

Critical output rules:
- Output MUST be a single valid JSON object that conforms to the schema in the user message.
- Do not include prose, markdown, or code fences outside the JSON.
- If unsure, set "confidence" appropriately and prefer leaving fields empty over guessing.
- If nothing is clearly visible, return an empty violations array and still include "summary", "whatToLookFor", and "notVisible".
- Coordinates MUST be tight bounding boxes expressed as NORMALIZED floats in [0.0, 1.0] relative to the image's visible dimensions, not raw pixels. Top-left is (0,0); bottom-right is (1,1).
- Cite specific code sections in "references" ONLY when you are confident in the exact citation. If unsure of the section number, edition year, or chapter, leave "references" as an empty array. Never fabricate citations.
- If image quality degrades certainty (blur, darkness, occlusion, glare), reduce "confidence" and reflect it in "summary.imageQuality".
- Use the SPECIAL INSTRUCTIONS exactly as written when applicable.`;

export const USER_QUERY = `Analyze the attached image. Ground your findings ONLY in what is visible.

Your response MUST be a single JSON object that conforms to this schema:

{
  "type": "object",
  "required": ["schemaVersion", "summary", "image", "violations", "whatToLookFor", "notVisible"],
  "properties": {
    "schemaVersion": { "type": "string", "enum": ["1.1"] },

    "summary": {
      "type": "object",
      "required": ["text", "confidence", "imageQuality"],
      "properties": {
        "text": { "type": "string", "description": "One-sentence description of the scene." },
        "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
        "imageQuality": {
          "type": "string",
          "enum": ["clear", "blurry", "dark", "overexposed", "occluded"],
          "description": "Overall usability of the photo. If not 'clear', degrade confidence and surface follow-up items in notVisible."
        }
      }
    },

    "image": {
      "type": "object",
      "required": ["width", "height"],
      "properties": {
        "width": { "type": "integer", "minimum": 1 },
        "height": { "type": "integer", "minimum": 1 }
      }
    },

    "violations": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "title", "category", "code", "severity", "description", "location", "coordinates", "confidence", "remediation", "references"],
        "properties": {
          "id": { "type": "string" },
          "title": { "type": "string" },
          "category": {
            "type": "string",
            "enum": ["Fire", "Electrical", "Egress", "ADA", "Hazmat", "InfectionControl", "Structural", "Other"],
            "description": "High-level grouping used by CAP / LSRA / ILSM exports."
          },
          "code": { "type": "string", "description": "e.g., 'NFPA 10', 'NFPA 13', 'NFPA 72', 'NFPA 80', 'NFPA 101', 'NEC', 'IBC', 'IFC', 'ADA', 'ANSI'." },
          "severity": { "type": "string", "enum": ["Low", "Medium", "High"] },
          "description": { "type": "string" },
          "location": { "type": "string" },
          "coordinates": {
            "type": "object",
            "required": ["x1","y1","x2","y2"],
            "properties": {
              "x1": { "type": "number", "minimum": 0, "maximum": 1 },
              "y1": { "type": "number", "minimum": 0, "maximum": 1 },
              "x2": { "type": "number", "minimum": 0, "maximum": 1 },
              "y2": { "type": "number", "minimum": 0, "maximum": 1 }
            },
            "description": "NORMALIZED tight bbox in [0.0, 1.0]: top-left (x1,y1), bottom-right (x2,y2). Survives image resize and EXIF rotation."
          },
          "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
          "remediation": { "type": "string" },
          "references": {
            "type": "array",
            "items": { "type": "string" },
            "description": "Cite specific code sections ONLY when certain. Leave empty if unsure — do not invent citations."
          }
        }
      }
    },

    "whatToLookFor": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["item", "details"],
        "properties": {
          "item": { "type": "string" },
          "details": { "type": "string" }
        }
      }
    },

    "notVisible": {
      "type": "array",
      "description": "Items the inspector should verify but that could not be assessed from this photo (out of frame, occluded, wrong angle, glare). Drives follow-up photo prompts in the UI.",
      "items": {
        "type": "object",
        "required": ["item", "reason"],
        "properties": {
          "item": { "type": "string" },
          "reason": { "type": "string", "description": "Why it could not be assessed (e.g., 'top of door obscured', 'panel cover closed', 'glare on label')." }
        }
      }
    }
  }
}

SPECIAL INSTRUCTIONS FOR COMMON DEFICIENCIES (apply when visible):
- Unsecured Fire Extinguisher: If an extinguisher is not in a bracket/cabinet, add a High severity Fire violation under NFPA 10. Description MUST mention Section 6.1.3.8.1 and why unsecured is hazardous.
- Improper Use of Extension Cords: If an extension cord passes through a wall/ceiling/floor penetration, add High under NEC, category Electrical. Explain flexible cords are not permanent wiring and cannot route through holes; fire hazard risk.
- Damaged Devices: If a smoke detector or other fire-safety device appears damaged, describe the damage and the functional risk (Fire category).
- Sprinkler Heads — Condition: Note corrosion, paint, heavy loading (dust/debris), or obstructed spray pattern by fixed objects. NFPA 13.
- Sprinkler Heads — Storage Clearance: If stored items appear within 18 inches of a sprinkler deflector, add Medium under NFPA 13, category Fire. Explain the 18 in. clearance rule and impact on spray pattern.
- Infection Control Risks: In healthcare context, flag discarded bottles, spills, or unknown substances with hygiene rationale (InfectionControl).
- Fire Door Labels: If a fire door/frame label is visible, add an entry with code NFPA 80, category Fire, severity Low stating:
  "A fire rating label is visible. This indicates the component is part of a fire-rated assembly. It is not a deficiency, but its rating and appropriateness for the location must be verified against the facility's Life Safety plans. Minor scrapes on the label are not a deficiency."
  Also add related "whatToLookFor" checks for the full door assembly.
- Hazardous Room Doors: If door indicates a hazardous area (e.g., biohazard / Soiled Utility) and latch looks disengaged, add High (category Fire or Hazmat as appropriate). Explain containment risk; doors must be self-closing and positively latching. Add "Room Pressure Verification" and "Self-Closing Mechanism" items to whatToLookFor.
- Fire Extinguisher Height: If extinguisher is mounted, add a verification note: top to 60 in. OK per NFPA 10 but ADA reach often <= 48 in. to handle. Add a "measure height to handle" item.
- Blocked or Obstructed Egress: If exit doors, corridors, stairwells, or paths of egress are blocked by furniture, equipment, storage, or non-compliant locking hardware, add High under IBC/IFC, category Egress.
- Missing or Damaged Exit Signs: If an exit sign appears non-illuminated, missing, obstructed, or damaged, add Medium under NFPA 101, category Egress.
- Electrical Panel Working Clearance: If items are stored or placed within the 36 in. working space in front of an electrical panel, add High under NEC 110.26, category Electrical. Explain working clearance requirement and access for de-energization.
- Penetrations in Fire/Smoke Barriers: If unsealed cable, conduit, or pipe penetrations are visible through a rated wall or ceiling, add High under NFPA 101, category Fire. Explain through-penetration firestopping requirement.
- Self-Closing / Self-Latching Doors: If a fire or smoke door is propped open with a wedge, kick-down, cord, or other unapproved hold-open, add High under NFPA 80, category Fire.

MANDATORY "whatToLookFor" for Fire Door Labels:
- Proper Gaps & Clearances
- Positive Latching Hardware
- Functioning Self-Closing Device
- Intact Seals (Smoke/Intumescent)
- No Unapproved Hardware or Modifications

If nothing is clearly noncompliant, set violations to [] but still provide 4-8 relevant "whatToLookFor" items based on context, plus any "notVisible" entries the inspector should re-photograph.

Return only the JSON object (no markdown).`;
