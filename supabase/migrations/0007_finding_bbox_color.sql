-- Per-finding bbox color override. NULL means "use the severity-default
-- color" (the existing behavior — red for High/Medium, green for Low).
-- A non-null hex string overrides that default for visual customization
-- without changing the finding's severity.
alter table public.findings
  add column if not exists bbox_color text;
