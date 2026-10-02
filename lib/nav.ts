/**
 * App information architecture — one source for the sidebar, the phone
 * tab bar + More sheet, and the section tabs at the top of each page.
 *
 *   Home · Inspections · Actions · Assets · Analytics · Settings
 *
 * Pages keep their URLs; sections group them. A page belongs to the first
 * section whose `match` claims its path.
 */

export type NavTab = { href: string; label: string };

export type NavSection = {
  key: "home" | "inspections" | "actions" | "assets" | "analytics" | "settings";
  label: string;
  href: string;
  /** One-line description for the phone "More" sheet. */
  blurb: string;
  match: (path: string) => boolean;
  /** Sub-pages shown as tabs at the top of the section's pages. */
  tabs?: NavTab[];
};

const under = (path: string, root: string) => path === root || path.startsWith(`${root}/`);

export const NAV_SECTIONS: NavSection[] = [
  {
    key: "home",
    label: "Home",
    href: "/inspections",
    blurb: "Start, resume, what's due",
    match: (p) => p === "/inspections" || p === "/welcome",
  },
  {
    key: "inspections",
    label: "Inspections",
    href: "/inspections/history",
    blurb: "History, schedules, templates",
    match: (p) => under(p, "/inspections") || under(p, "/schedules") || under(p, "/templates"),
    tabs: [
      { href: "/inspections/history", label: "History" },
      { href: "/schedules", label: "Schedules" },
      { href: "/templates", label: "Templates" },
    ],
  },
  {
    key: "actions",
    label: "Actions",
    href: "/actions",
    blurb: "Corrective actions and findings",
    match: (p) => under(p, "/actions") || under(p, "/findings"),
    tabs: [
      { href: "/actions", label: "Actions" },
      { href: "/findings", label: "Findings" },
    ],
  },
  {
    key: "assets",
    label: "Assets",
    href: "/facilities",
    blurb: "Facilities, plans and equipment",
    match: (p) => under(p, "/facilities") || under(p, "/assets"),
    tabs: [
      { href: "/facilities", label: "Facilities" },
      { href: "/assets", label: "Equipment" },
    ],
  },
  {
    key: "analytics",
    label: "Analytics",
    href: "/dashboard",
    blurb: "Campus dashboard and trends",
    match: (p) => under(p, "/dashboard"),
  },
  {
    key: "settings",
    label: "Settings",
    href: "/profile",
    blurb: "Profile, team, AI plan",
    match: (p) =>
      under(p, "/profile") || under(p, "/team") || under(p, "/usage") || under(p, "/admin") || under(p, "/onboarding"),
    tabs: [
      { href: "/profile", label: "Profile" },
      { href: "/team", label: "Team" },
      { href: "/usage", label: "AI plan" },
    ],
  },
];

export function sectionFor(path: string): NavSection | null {
  return NAV_SECTIONS.find((s) => s.match(path)) ?? null;
}

/**
 * Tabs to show above a page: only on the section's own list pages (and
 * their sub-pages), not on an inspection's detail screen, which has its
 * own step bar.
 */
export function tabsFor(path: string): { section: NavSection; active: NavTab } | null {
  const section = sectionFor(path);
  if (!section?.tabs) return null;
  const active = section.tabs.find((t) => under(path, t.href));
  return active ? { section, active } : null;
}

/** The new-inspection flow is the primary action, not a section page. */
export const START_INSPECTION_HREF = "/inspections/new";
