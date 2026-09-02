/**
 * Built-in inspection checklist templates.
 *
 * Built-ins live in CODE, not the database — versioned in git, no seed
 * drift, instantly available in every environment. Custom templates
 * (user/org-authored) live in the checklist_templates table (migration
 * 0022). Both shapes are identical; attaching either to an inspection
 * SNAPSHOTS its questions into inspection_checklist_items, so template
 * edits never rewrite historical inspections.
 *
 * The flagship healthcare template is generalized from a real hospital
 * LS/EOC smoke-compartment round (iAuditor format: lettered sections,
 * Yes/No/N.A. questions, numbered deficiencies filed under questions).
 *
 * `match` terms drive the AI pre-fill: when photo analysis produces a
 * finding, the matcher (lib/checklists/match.ts) scores each open
 * question's terms against the finding text and marks the best hit "no"
 * with answered_by_ai=true. Questions the AI can't judge from a photo
 * (process/people questions) deliberately carry no terms.
 */

export type TemplateItem = {
  q: string;
  /** Code reference shown next to the question (e.g. "NFPA 80 §5.2"). */
  ref?: string;
  /** Lower-case substrings the AI-prefill matcher scores against finding text. */
  match?: string[];
};

export type TemplateSection = {
  code: string;
  title: string;
  items: TemplateItem[];
};

export type ChecklistTemplate = {
  /** Built-ins use "builtin:<slug>"; DB customs use their row uuid. */
  id: string;
  name: string;
  description: string;
  occupancy: string;
  sections: TemplateSection[];
};

export const BUILTIN_TEMPLATES: ChecklistTemplate[] = [
  {
    id: "builtin:healthcare-eoc",
    name: "Healthcare LS/EOC Smoke Compartment Round",
    description:
      "Full life-safety + environment-of-care round for one smoke compartment in an existing healthcare occupancy. Generalized from a working hospital audit format (NFPA 101 Ch. 19, TJC EC/LS chapters).",
    occupancy: "Healthcare",
    sections: [
      {
        code: "P",
        title: "Previous Inspection",
        items: [
          { q: "Has the previous LS/EOC inspection been reviewed?" },
          { q: "Have previous discrepancies been resolved?" },
          {
            q: "Do the facility's Life Safety drawings match current conditions?",
            ref: "LS.01.01.01 EP3",
          },
        ],
      },
      {
        code: "A1",
        title: "Fire Doors",
        items: [
          {
            q: "Are fire doors provided with positive latching?",
            ref: "NFPA 80",
            match: ["positive latch", "door latch", "not latching", "latching"],
          },
          {
            q: "Is the fire door self-closing or automatic-closing?",
            match: ["self-clos", "self clos", "door closer", "automatic clos"],
          },
          {
            q: "Are clearances for fire doors 1/8\" or less and the undercut 3/4\" or less?",
            ref: "NFPA 80 §4.8.4",
            match: ["undercut", "door clearance", "door gap", "edge gap"],
          },
          {
            q: "Is the fire door free from decorations, door stops, unprotected penetrations, and non-rated hardware?",
            match: [
              "door stop",
              "doorstop",
              "decoration",
              "non-rated hardware",
              "penetration in door",
              "hole in door",
              "penetration in top of fire door",
              "kick down",
            ],
          },
          {
            q: "Is the fire door free from damaged hardware?",
            match: ["damaged hardware", "broken hinge", "door hardware"],
          },
          {
            q: "Do the fire door and frame each have a label indicating the rating?",
            match: ["door label", "rating label", "missing label", "painted label"],
          },
          {
            q: "If the rated door has a window, does the window have fire wire and/or a fire-rated label?",
            match: ["fire wire", "wired glass", "vision panel", "glazing"],
          },
        ],
      },
      {
        code: "A2",
        title: "Fire-Rated Walls, Ceilings, and Floors",
        items: [
          {
            q: "Are penetrations in rated walls (per the facility's life safety drawings) properly sealed with fire-rated material?",
            ref: "NFPA 101 §8.3.5",
            match: [
              "penetration",
              "firestop",
              "fire stop",
              "caulk",
              "sleeve",
              "unsealed",
              "fire barrier",
              "rated wall",
              "annular space",
            ],
          },
          {
            q: "Are penetrations in floors and ceilings properly sealed with fire-rated material?",
            match: ["floor penetration", "ceiling penetration", "deck above"],
          },
        ],
      },
      {
        code: "A3",
        title: "Fire Alarm and Sprinkler Systems",
        items: [
          {
            q: "Are smoke detectors clear of supply/return diffusers (3 ft) and uncovered — including above the fire alarm panel/power supply?",
            ref: "NFPA 72",
            match: ["smoke detector", "diffuser", "detector covered", "detector taped"],
          },
          {
            q: "Does the fire alarm panel / power supply show all systems normal?",
            match: ["fire alarm panel", "trouble signal", "supervisory", "facp"],
          },
          {
            q: "Are pull stations, exit signs, exit doors, notification appliances, extinguishers, and other life-safety components unobstructed?",
            match: [
              "pull station",
              "notification appliance",
              "strobe blocked",
              "obstructed device",
            ],
          },
          {
            q: "Is the sprinkler piping free from wires, tape, or any other items not allowed per code?",
            ref: "NFPA 13 §17.1.3",
            match: [
              "sprinkler pip",
              "supported by the sprinkler",
              "hung from",
              "attached to sprinkler",
              "wires on",
              "tape on",
              "zip tie",
            ],
          },
          {
            q: "Are all sprinkler heads fitted with escutcheon plates and properly seated (1/8\" gap or less)?",
            match: ["escutcheon", "cover plate", "gap around sprinkler"],
          },
          {
            q: "Where quick-response heads are used, are all heads within the compartment quick-response?",
            match: ["quick response", "mixed sprinkler head", "head type"],
          },
          {
            q: "Is sprinkler protection provided throughout the compartment?",
            match: ["missing sprinkler", "no sprinkler coverage", "unsprinklered"],
          },
          {
            q: "Are all stored materials a minimum of 18\" below sprinkler deflectors?",
            ref: "NFPA 13 §10.2.8",
            match: ["18\"", "18 in", "deflector", "storage too close to", "stacked to ceiling"],
          },
        ],
      },
      {
        code: "A4",
        title: "Rooms",
        items: [
          {
            q: "Are waiting areas open to the corridor <600 sq ft, with smoke detection, and arranged to not obstruct exit access?",
            match: ["waiting area", "waiting room"],
          },
          {
            q: "In patient sleeping rooms >1,000 sq ft, are there two remotely located exit access doors?",
          },
          {
            q: "Are exit access doors <100 ft from any point in patient sleeping rooms?",
          },
          {
            q: "Is the travel distance from any point in the smoke compartment within 200 ft of a smoke barrier door?",
          },
          {
            q: "Is there less than 32 gallons of trash, linens, or waste in any 64 sq ft space outside of a hazardous protected room?",
            ref: "NFPA 101 §19.7.5.7",
            match: ["trash", "linen cart", "waste container", "32 gallon", "soiled"],
          },
        ],
      },
      {
        code: "A5",
        title: "Corridors",
        items: [
          {
            q: "Is the corridor constructed to limit the passage of smoke?",
            match: ["corridor wall", "smoke resist"],
          },
          { q: "Are all dead-end corridors less than 30 ft?" },
          {
            q: "Are corridors maintained free and clear of clutter and any unapproved wheeled equipment?",
            ref: "NFPA 101 §19.2.3.4",
            match: [
              "corridor storage",
              "corridor clutter",
              "blocked corridor",
              "wheeled equipment",
              "stored in the corridor",
              "in the corridor",
            ],
          },
          {
            q: "Are projections into the corridor less than 6\"?",
            match: ["projection", "protrud"],
          },
          {
            q: "Where fixed furniture is located in a corridor (min 8 ft), are all requirements of NFPA 101 §19.2.3.4(5) met?",
            match: ["fixed furniture"],
          },
          {
            q: "Is a minimum of 44\" clear width provided in corridors and passageways where patient egress is not intended?",
            match: ["clear width", "44\""],
          },
          {
            q: "Are cross-corridor doors self-closing (latching if hardware present), and are all suite boundaries self-closing and latching?",
            match: ["cross corridor", "suite door"],
          },
        ],
      },
      {
        code: "A6",
        title: "General",
        items: [
          {
            q: "Are exit signs properly illuminated?",
            match: ["exit sign", "illuminat"],
          },
          {
            q: "Is there adequate exit signage?",
            match: ["exit signage", "missing exit sign"],
          },
          {
            q: "Are fire extinguishers tagged appropriately, within annual certification, and with monthly checks?",
            ref: "NFPA 10 §7.2",
            match: ["extinguisher tag", "annual certification", "monthly check", "expired tag"],
          },
          {
            q: "Are fire extinguishers installed per code requirements and within 75 ft travel in any direction?",
            match: ["extinguisher mount", "extinguisher height", "75 ft", "missing extinguisher"],
          },
          {
            q: "Is the area free from signs of smoking?",
            match: ["smoking", "cigarette"],
          },
          {
            q: "Is the compartment in compliance with the current Life Safety Code, NFPA 101?",
          },
        ],
      },
      {
        code: "B",
        title: "Safety Management",
        items: [
          {
            q: "Are corridors, passageways, and general areas unobstructed with undamaged floors, walls, ceilings, and handrails?",
            match: ["handrail", "damaged wall", "damaged floor", "damaged ceiling", "wall damage"],
          },
          {
            q: "Are storage and equipment rooms clean and free of clutter?",
            match: ["storage room", "equipment room clutter"],
          },
          {
            q: "Are needle boxes less than 2/3 full, safely maintained, and secured?",
            match: ["needle box", "sharps"],
          },
          {
            q: "Are eyewash stations inspected weekly and the lens covers closed or covered?",
            ref: "ANSI Z358.1",
            match: ["eyewash"],
          },
          {
            q: "Are ceiling tiles clean, stain-free, and in good condition?",
            match: ["ceiling tile", "stained tile", "missing tile"],
          },
          {
            q: "Are general areas clean and clear of clutter, with furnishings, floors, walls, and ceilings in good condition?",
          },
          {
            q: "Are nurse call pull cords present and in compliance?",
            match: ["nurse call", "pull cord"],
          },
        ],
      },
      {
        code: "C",
        title: "Security Management",
        items: [
          { q: "Are employees wearing ID badges?" },
          {
            q: "Are medication carts locked, and crash cart checklists completed and up to date?",
            match: ["crash cart", "medication cart"],
          },
          {
            q: "Are mechanical, electrical, janitorial, and communication rooms and electrical panels locked, with fire alarm breakers locked out with the required red breaker cover?",
            match: ["unlocked", "room unsecured", "breaker lock", "red breaker"],
          },
          {
            q: "Are staff personal belongings properly safeguarded to prevent theft?",
          },
          {
            q: "Did MRI staff stop you at the door to Zone III and verify screening?",
          },
          {
            q: "If you were not screened, did staff provide the screening tool to complete?",
          },
        ],
      },
      {
        code: "D",
        title: "Infection Prevention",
        items: [
          {
            q: "Is clean linen covered and kept separate from soiled linen?",
            match: ["linen"],
          },
          {
            q: "Are patient refrigerators clean, free of opened/unlabeled containers, with temp checks completed?",
            match: ["refrigerator", "temp log"],
          },
          { q: "Are medication and food kept in separate refrigerators?" },
          {
            q: "Is medical waste kept in red biohazard bags or containers?",
            match: ["biohazard", "red bag", "medical waste"],
          },
          {
            q: "Are under-sink areas kept free of all storage?",
            match: ["under sink", "beneath sink", "under the sink"],
          },
          { q: "Is PPE readily available?", match: ["ppe"] },
          {
            q: "Are employees eating and drinking only in designated areas?",
          },
        ],
      },
      {
        code: "E",
        title: "Utility Management",
        items: [
          {
            q: "Are electrical outlets in good condition with wires safely maintained?",
            match: ["outlet", "receptacle", "exposed wir"],
          },
          {
            q: "Are all electrical outlets within 6 ft of a water source GFCI outlets or on a dedicated GFCI breaker?",
            match: ["gfci"],
          },
          {
            q: "Are electrical panels unobstructed and locked, with minimum clear space 30\" wide, 36\" deep, 78\" high?",
            ref: "NFPA 70 §110.26",
            match: ["electrical panel", "panel blocked", "panel clearance", "36\""],
          },
          {
            q: "Are all relocatable power taps / power strips in compliance with current guidelines?",
            match: ["power strip", "power tap", "surge protector", "daisy chain", "extension cord"],
          },
          {
            q: "Are compressed gases stored properly (empty separated from full), with no more than 12 full E-cylinders in one smoke compartment?",
            ref: "NFPA 99 §11.6.2",
            match: ["cylinder", "compressed gas", "oxygen tank", "unsecured"],
          },
          {
            q: "Are medical gas shutoff valves unobstructed and labeled to reflect the rooms they serve?",
            match: ["med gas", "medical gas", "zone valve", "shutoff valve"],
          },
        ],
      },
      {
        code: "F",
        title: "Medical Equipment Management",
        items: [
          {
            q: "Is medical equipment clean, properly inspected, and tagged with a current biomed sticker?",
            match: ["biomed", "equipment tag"],
          },
          {
            q: "Do lead aprons have an appropriate and updated identification tag?",
            match: ["lead apron"],
          },
        ],
      },
      {
        code: "G",
        title: "Hazardous Materials Management",
        items: [
          {
            q: "Are chemicals stored away from patient contact and clean items?",
            match: ["chemical storage", "chemicals stored"],
          },
          {
            q: "Are primary and/or secondary chemical containers properly labeled?",
            match: ["unlabeled container", "secondary container"],
          },
          {
            q: "Does staff know how to identify and locate Safety Data Sheets for hazardous materials?",
            match: ["sds"],
          },
        ],
      },
    ],
  },

  {
    id: "builtin:extinguisher-monthly",
    name: "Monthly Fire Extinguisher Walk",
    description:
      "The NFPA 10 §7.2 monthly quick-check for every extinguisher in the building: location, access, gauge, pin and seal, tag, and condition.",
    occupancy: "Any",
    sections: [
      {
        code: "EX",
        title: "Extinguishers",
        items: [
          {
            q: "Is each extinguisher in its designated location, visible, and unobstructed?",
            ref: "NFPA 10 §7.2.2",
            match: ["extinguisher blocked", "obstructed", "missing extinguisher", "not visible"],
          },
          {
            q: "Is the mounting correct (top ≤5 ft for units ≤40 lb; bottom ≥4\" above the floor)?",
            ref: "NFPA 10 §6.1.3",
            match: ["mounting", "extinguisher height", "on the floor"],
          },
          {
            q: "Is the pressure gauge needle in the operable (green) range?",
            match: ["gauge", "pressure", "recharge", "overcharged"],
          },
          {
            q: "Is the pull pin in place with an unbroken tamper seal?",
            match: ["pull pin", "tamper seal", "missing pin"],
          },
          {
            q: "Is the extinguisher free of physical damage, corrosion, leakage, or a clogged nozzle?",
            match: ["corrosion", "dent", "damage", "nozzle", "hose cracked"],
          },
          {
            q: "Is the annual service tag present and within date?",
            match: ["service tag", "annual", "expired tag", "no tag"],
          },
          {
            q: "Are monthly quick-check initials and dates current on the tag?",
            match: ["monthly check", "initials"],
          },
          {
            q: "Is signage provided where the extinguisher's location is not obvious?",
            match: ["extinguisher sign"],
          },
        ],
      },
    ],
  },

  {
    id: "builtin:office-walk",
    name: "Office / Business Walk-Through",
    description:
      "General safety walk for business occupancies: egress, fire protection, electrical, and housekeeping — the conditions an AHJ or insurer flags first.",
    occupancy: "Business",
    sections: [
      {
        code: "EG",
        title: "Egress & Exits",
        items: [
          {
            q: "Are exits and exit access paths unobstructed?",
            ref: "IFC §1031.2",
            match: ["blocked exit", "obstructed", "egress", "exit access"],
          },
          {
            q: "Are exit signs illuminated?",
            match: ["exit sign", "illuminat"],
          },
          {
            q: "Are exit doors operable without keys, tools, or special knowledge?",
            match: ["locked exit", "deadbolt", "double cylinder"],
          },
          {
            q: "Do emergency lights function when tested?",
            match: ["emergency light", "egress light"],
          },
        ],
      },
      {
        code: "FP",
        title: "Fire Protection",
        items: [
          {
            q: "Are extinguishers accessible, tagged, and within annual certification?",
            ref: "NFPA 10 §7.2",
            match: ["extinguisher"],
          },
          {
            q: "Is an 18\" clearance maintained below sprinkler deflectors?",
            ref: "NFPA 13 §10.2.8",
            match: ["18\"", "deflector", "storage too close"],
          },
          {
            q: "Is nothing hung from or attached to sprinkler piping?",
            ref: "NFPA 13 §17.1.3",
            match: ["sprinkler pip", "hung from", "attached to sprinkler", "zip tie"],
          },
          {
            q: "Are fire alarm devices (pull stations, strobes) unobstructed?",
            match: ["pull station", "strobe"],
          },
        ],
      },
      {
        code: "EL",
        title: "Electrical",
        items: [
          {
            q: "Are electrical panels closed, labeled, and given 36\" of clear working space?",
            ref: "NFPA 70 §110.26",
            match: ["electrical panel", "panel blocked", "36\""],
          },
          {
            q: "Are power strips and extension cords used correctly — no daisy-chaining, no permanent wiring?",
            match: ["power strip", "extension cord", "daisy chain"],
          },
          {
            q: "Are outlets and cords in good condition with no exposed wiring?",
            match: ["outlet", "exposed wir", "damaged cord"],
          },
        ],
      },
      {
        code: "HK",
        title: "Housekeeping & Storage",
        items: [
          {
            q: "Is storage orderly with aisles kept clear?",
            match: ["storage", "aisle blocked", "clutter"],
          },
          {
            q: "Are ceiling tiles in place and unstained?",
            match: ["ceiling tile", "missing tile", "stained"],
          },
          {
            q: "Are flammable liquids kept in approved cabinets?",
            ref: "NFPA 30",
            match: ["flammable", "gas can", "solvent"],
          },
          {
            q: "Are mechanical and electrical rooms free of combustible storage?",
            match: ["mechanical room", "combustible storage", "electrical room storage"],
          },
        ],
      },
    ],
  },

  {
    id: "builtin:restaurant-kitchen",
    name: "Restaurant / Commercial Kitchen Walk",
    description:
      "Kitchen-focused round for food-service occupancies: hood and suppression system, Class K coverage, egress, gas, electrical, and storage.",
    occupancy: "Restaurant",
    sections: [
      {
        code: "KS",
        title: "Hood & Suppression",
        items: [
          {
            q: "Is the suppression system's semiannual service tag current?",
            ref: "NFPA 96 §11.2 / NFPA 17A",
            match: ["suppression tag", "semi-annual", "semiannual", "ansul", "service overdue"],
          },
          {
            q: "Are nozzle caps in place, with nozzles aimed and unclogged?",
            match: ["nozzle cap", "nozzle", "grease on nozzle"],
          },
          {
            q: "Are fusible links clean and within replacement date?",
            match: ["fusible link"],
          },
          {
            q: "Is the manual pull station accessible and unobstructed, in the egress path?",
            ref: "NFPA 96 §10.4",
            match: ["pull station", "manual pull"],
          },
          {
            q: "Are the hood and filters free of grease accumulation, with all filters in place?",
            match: ["grease", "hood", "filter missing", "filters"],
          },
          {
            q: "Is the hood-cleaning service sticker current for the cooking volume?",
            ref: "NFPA 96 Table 12.4",
            match: ["hood cleaning", "cleaning sticker"],
          },
        ],
      },
      {
        code: "FP",
        title: "Fire Protection",
        items: [
          {
            q: "Is a Class K extinguisher within 30 ft of cooking appliances, with the use-after-suppression placard?",
            ref: "NFPA 10 §6.6",
            match: ["class k", "placard"],
          },
          {
            q: "Are other extinguishers tagged, current, and accessible?",
            match: ["extinguisher"],
          },
          {
            q: "Is storage kept 18\" below sprinkler deflectors?",
            match: ["18\"", "deflector"],
          },
        ],
      },
      {
        code: "EG",
        title: "Egress",
        items: [
          {
            q: "Are exits and aisles unobstructed — including the rear/kitchen exit?",
            match: ["blocked exit", "aisle", "egress", "rear exit"],
          },
          {
            q: "Are exit signs illuminated and emergency lights working?",
            match: ["exit sign", "emergency light"],
          },
        ],
      },
      {
        code: "UT",
        title: "Gas & Electrical",
        items: [
          {
            q: "Is the gas shutoff accessible, with no leaks or damaged connectors?",
            match: ["gas shutoff", "gas leak", "gas line"],
          },
          {
            q: "Are extension cords and power strips kept out of cooking/wet areas, with GFCI where required?",
            match: ["extension cord", "power strip", "gfci"],
          },
          {
            q: "Are CO2 and other compressed gas cylinders secured upright?",
            match: ["cylinder", "co2", "unsecured"],
          },
        ],
      },
      {
        code: "ST",
        title: "Storage",
        items: [
          {
            q: "Are combustibles kept away from heat sources, with chemicals labeled and separated from food?",
            match: ["combustible", "chemical", "stored next to"],
          },
        ],
      },
    ],
  },
  {
    id: "builtin:loss-control-construction",
    name: "Loss Control Survey — Construction",
    description:
      "Insurance-style loss-control walk for construction operations: management program, fall-from-height exposures, electrical, PPE, shop/warehouse, and welding. Generalized from a carrier workers'-comp survey format (Sat/Unsat → Yes/No).",
    occupancy: "Construction",
    sections: [
      {
        code: "MG",
        title: "Management Program",
        items: [
          { q: "Is a written safety program in place?" },
          { q: "Are safety meetings held at least monthly, with documentation?" },
          { q: "Are daily facility/jobsite inspections performed?" },
          { q: "Is there an accident investigation procedure that is actually used?" },
          { q: "Is the company free of OSHA citations in the last 5 years?" },
          { q: "Is a return-to-work / restriction accommodation program in place?" },
          {
            q: "Is the physicians panel posted (or designated medical facility identified, where applicable)?",
            match: ["physicians panel", "posting"],
          },
        ],
      },
      {
        code: "FH",
        title: "Fall From Height Exposures",
        items: [
          {
            q: "Is fall protection used any time a worker is six feet or more above a lower level?",
            ref: "OSHA 1926.501",
            match: ["fall protection", "harness", "tied off", "no fall protection"],
          },
          {
            q: "Roof work: personal fall protection on sloped roofs; warning lines (6 ft from edge) on flat roofs?",
            match: ["roof edge", "warning line", "sloped roof"],
          },
          {
            q: "Are unprotected wall openings (bottom ≤39\" from floor) guarded or workers protected?",
            match: ["wall opening", "window opening", "elevator shaft"],
          },
          {
            q: "Are unprotected floor and deck edges (balconies, decks) guarded?",
            match: ["floor edge", "deck edge", "balcony", "guardrail"],
          },
          {
            q: "Are floor and roof openings (stairwells, shafts, skylight/HVAC holes) covered or guarded?",
            match: ["floor opening", "roof opening", "hole cover", "skylight"],
          },
          {
            q: "Are guardrails provided where workers are over dangerous equipment, impalement hazards, or confined spaces (even below 6 ft)?",
            match: ["impalement", "over equipment"],
          },
          {
            q: "Is vertical concrete form work (basement walls, columns) protected?",
            match: ["form work", "formwork"],
          },
          {
            q: "Do stairs with smooth walls have handrails, and stairs with open sides have stair-rail systems?",
            ref: "OSHA 1926.1052",
            match: ["handrail", "stair rail", "stairs"],
          },
        ],
      },
      {
        code: "EL",
        title: "Electrical",
        items: [
          {
            q: "Is lock-out/tag-out used for machinery that cannot simply be unplugged?",
            ref: "OSHA 1910.147",
            match: ["lockout", "tagout", "loto"],
          },
          {
            q: "Are all circuits properly grounded?",
            match: ["grounded", "grounding", "ground prong"],
          },
          {
            q: "Are electrical components covered, with high-voltage equipment guarded against accidental contact?",
            match: ["exposed wiring", "open panel", "missing cover", "knockout"],
          },
          {
            q: "Are extension cords serviceable and properly used?",
            match: ["extension cord", "damaged cord", "spliced"],
          },
          {
            q: "Is ground-fault protection (GFCI) in place?",
            ref: "OSHA 1926.404",
            match: ["gfci", "ground fault"],
          },
          {
            q: "Is proper distance maintained from overhead power lines?",
            match: ["overhead power", "power line"],
          },
        ],
      },
      {
        code: "PPE",
        title: "Personal Protective Equipment",
        items: [
          {
            q: "Is eye/face protection used where hazards exist (power tools, sanding, spraying)?",
            match: ["safety glasses", "eye protection", "face shield"],
          },
          {
            q: "Is respiratory protection used where required (silica cutting, drywall sanding, fumes)?",
            ref: "OSHA 1926.1153",
            match: ["respirator", "dust mask", "silica"],
          },
          {
            q: "Is foot protection appropriate for the work (work-grade boots; steel toe where required)?",
            match: ["footwear", "tennis shoes", "steel toe"],
          },
          {
            q: "Are high-visibility vests worn around vehicles and heavy equipment?",
            match: ["high visibility", "hi-vis", "vest"],
          },
          {
            q: "Is hearing protection used in high-noise operations?",
            match: ["hearing protection", "earplug"],
          },
          {
            q: "Are hard hats worn where overhead hazards exist?",
            match: ["hard hat", "helmet"],
          },
        ],
      },
      {
        code: "MX",
        title: "Miscellaneous Exposures",
        items: [
          {
            q: "Are slip/trip/fall hazards identified with proper controls, and job-site access maintained?",
            match: ["slip", "trip", "housekeeping", "debris"],
          },
          {
            q: "Are proper lifting techniques, material-handling equipment, or job-specific procedures used?",
            match: ["lifting", "material handling"],
          },
          {
            q: "Is repetitive work mitigated with equipment changes or rest breaks where possible?",
          },
          {
            q: "Is machine guarding in place and unaltered (circular saws, table saws)?",
            ref: "OSHA 1926.300",
            match: ["guard removed", "machine guard", "blade guard", "saw"],
          },
          {
            q: "Is protruding rebar protected with caps or other means?",
            ref: "OSHA 1926.701(b)",
            match: ["rebar", "impalement cap"],
          },
          {
            q: "Is rigging performed only by workers certified in rigging?",
            match: ["rigging", "sling"],
          },
        ],
      },
      {
        code: "SW",
        title: "Shop / Warehouse",
        items: [
          {
            q: "Are all exits and pathways to exits free of obstructions?",
            match: ["blocked exit", "exit path", "obstructed"],
          },
          {
            q: "Is lighting adequate for the work and for egress?",
            match: ["lighting", "dark"],
          },
          {
            q: "Are walkways kept clear and clean?",
            match: ["walkway", "aisle"],
          },
          {
            q: "Are elevated walkways and floor edges protected with guardrails and midrails?",
            match: ["guardrail", "midrail", "elevated walkway"],
          },
          {
            q: "Are pits and floor openings covered or provided with standard handrails?",
            match: ["pit", "floor opening"],
          },
          {
            q: "Is machine point-of-operation and moving-part guarding in place?",
            match: ["point of operation", "moving parts", "unguarded"],
          },
          {
            q: "Is a lockout/tagout procedure in place where needed, with employees trained?",
            match: ["loto training"],
          },
          {
            q: "Do pressure vessels have proper safeguards, and is equipment well maintained?",
            match: ["pressure vessel", "compressor"],
          },
          {
            q: "Is hoisting equipment / overhead cranes inspected annually with trained operators?",
            match: ["crane", "hoist"],
          },
        ],
      },
      {
        code: "WD",
        title: "Welding / Torch Cutting",
        items: [
          {
            q: "Are compressed gas cylinders secured against tipping, with fuel gas and oxidizers separated by 20 ft?",
            ref: "OSHA 1926.350",
            match: ["cylinder", "unsecured", "oxygen", "acetylene"],
          },
          {
            q: "Are flash screens used to protect other employees from arc flash?",
            match: ["flash screen", "welding screen"],
          },
          {
            q: "Is proper welding PPE available and used?",
            match: ["welding hood", "welding gloves"],
          },
          {
            q: "Is ventilation effective at removing toxic fumes and gases?",
            match: ["ventilation", "fume"],
          },
        ],
      },
    ],
  },
];

export function getBuiltinTemplate(id: string): ChecklistTemplate | null {
  return BUILTIN_TEMPLATES.find((t) => t.id === id) ?? null;
}
