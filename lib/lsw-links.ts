/**
 * LifeSafetyWiki deep links — deterministic, no network.
 *
 * A finding's `code` ("NFPA 13 §17.1.3", "NEC 110.26 / NEC 408.36",
 * "NFPA 101 (2012) 19.3.6.3", "IFC §1031.2") becomes a link straight into
 * the matching section of LifeSafetyWiki's decoded-standard reader, which
 * accepts `?q=<section>` and opens on that section. Standards LSW hasn't
 * decoded by section fall back to the topic hub article. Anything
 * unrecognized yields no link — never a guessed URL.
 *
 * Pure function: safe in client components, server components, and the
 * PDF export alike. The live "learn more" article suggestions are a
 * separate, fetch-based layer (lib/lsw-reference.ts).
 */

export const LSW_BASE = "https://www.lifesafetywiki.com";

export type LswLink = { label: string; url: string };

// NFPA standards LSW has decoded section-by-section (each has a
// /tools/nfpa<N>-decoded reader that honors ?q=).
const DECODED_NFPA = new Set([
  "10", "13", "14", "17", "17A", "58", "72", "80", "96", "99", "101", "2001",
]);

function decodedToolPath(standard: string, section: string | null, edition2012: boolean): string {
  const base =
    standard === "101" && edition2012
      ? "/tools/nfpa101-2012-decoded"
      : `/tools/nfpa${standard.toLowerCase()}-decoded`;
  return section ? `${base}?q=${encodeURIComponent(section)}` : base;
}

/**
 * Split a code string on the separators the AI uses between multiple
 * citations (" / ", ";", ","), then parse each piece.
 */
export function lswLinksForCitation(code: string | null | undefined): LswLink[] {
  if (!code) return [];
  const out: LswLink[] = [];
  const seen = new Set<string>();
  const push = (label: string, path: string) => {
    const url = path.startsWith("http") ? path : `${LSW_BASE}${path}`;
    if (seen.has(url)) return;
    seen.add(url);
    out.push({ label, url });
  };

  // Carry the standard forward across "§7.2.2, §10.2.6" style lists.
  let lastStandard: { kind: "nfpa" | "ifc" | "ada"; num: string; ed2012: boolean } | null = null;

  for (const rawPiece of code.split(/\s*(?:\/|;|,)\s*/)) {
    const piece = rawPiece.trim();
    if (!piece) continue;

    // NFPA <num> [(2012)] [§]<section>
    let m = /^NFPA\s*(\d+[A-Z]?)\s*(\((\d{4})\))?\s*(?:§|section|sec\.?)?\s*([\d][\d.]*)?/i.exec(piece);
    if (m) {
      const num = m[1].toUpperCase();
      const ed2012 = m[3] === "2012";
      const section = m[4] ? m[4].replace(/\.$/, "") : null;
      lastStandard = { kind: "nfpa", num, ed2012 };
      if (DECODED_NFPA.has(num)) {
        push(`NFPA ${num}${section ? ` §${section}` : ""}`, decodedToolPath(num, section, ed2012));
      } else if (num === "25") {
        push("NFPA 25 ITM table", "/tools/nfpa25-itm");
      } else if (num === "70") {
        push("NEC basics", "/wiki/nec-basics");
      } else if (num === "70E") {
        push("NFPA 70E", "/wiki/nfpa-70e");
      } else if (num === "110") {
        push("NFPA 110 generators", "/wiki/nfpa-110");
      }
      continue;
    }

    // IFC / IBC [§]<section>
    m = /^(IFC|IBC)\s*(?:§|section|sec\.?)?\s*([\d][\d.]*)?/i.exec(piece);
    if (m) {
      const which = m[1].toUpperCase();
      const section = m[2] ? m[2].replace(/\.$/, "") : null;
      if (which === "IFC") {
        lastStandard = { kind: "ifc", num: "IFC", ed2012: false };
        push(`IFC${section ? ` §${section}` : ""}`, section ? `/tools/ifc-decoded?q=${encodeURIComponent(section)}` : "/tools/ifc-decoded");
      } else {
        push("IBC", "/wiki/ibc");
      }
      continue;
    }

    // NEC <article>[.<section>]
    m = /^NEC\s*(?:§|article|art\.?)?\s*([\d][\d.()A-Za-z]*)?/i.exec(piece);
    if (m) {
      push(m[1] ? `NEC ${m[1]}` : "NEC basics", "/wiki/nec-basics");
      continue;
    }

    // OSHA 29 CFR 1910.xxx / 1926.xxx
    m = /^(?:OSHA\s*)?(?:29\s*CFR\s*)?(19(?:10|26))\.([\d.()A-Za-z]+)/i.exec(piece);
    if (m) {
      push(`OSHA ${m[1]}.${m[2]}`, "/knowledge-base/osha");
      continue;
    }
    if (/^OSHA/i.test(piece)) {
      push("OSHA hub", "/knowledge-base/osha");
      continue;
    }

    // ADA / 2010 ADA Standards §<section>
    m = /^(?:2010\s*)?ADA(?:\s*Standards)?\s*(?:§|section|sec\.?)?\s*([\d][\d.]*)?/i.exec(piece);
    if (m) {
      const section = m[1] ? m[1].replace(/\.$/, "") : null;
      lastStandard = { kind: "ada", num: "ADA", ed2012: false };
      push(`ADA${section ? ` §${section}` : ""}`, section ? `/tools/ada-decoded?q=${encodeURIComponent(section)}` : "/tools/ada-decoded");
      continue;
    }

    // Bare "§10.2.6" continuing the previous standard.
    m = /^(?:§|section|sec\.?)\s*([\d][\d.]*)/i.exec(piece);
    if (m && lastStandard) {
      const section = m[1].replace(/\.$/, "");
      if (lastStandard.kind === "nfpa" && DECODED_NFPA.has(lastStandard.num)) {
        push(`NFPA ${lastStandard.num} §${section}`, decodedToolPath(lastStandard.num, section, lastStandard.ed2012));
      } else if (lastStandard.kind === "ifc") {
        push(`IFC §${section}`, `/tools/ifc-decoded?q=${encodeURIComponent(section)}`);
      } else if (lastStandard.kind === "ada") {
        push(`ADA §${section}`, `/tools/ada-decoded?q=${encodeURIComponent(section)}`);
      }
      continue;
    }

    // Healthcare K-tags ("K-0321", "K321")
    m = /^K-?0?(\d{3})\b/i.exec(piece);
    if (m) {
      push(`K-tag K-0${m[1]}`, `/tools/nfpa101-2012-decoded?q=${encodeURIComponent(`K-0${m[1]}`)}`);
      continue;
    }
  }

  return out;
}
