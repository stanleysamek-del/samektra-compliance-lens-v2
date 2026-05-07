-- Per-finding bbox stroke-width override. Lets the inspector adjust the
-- visual thickness of an AI-detected bbox without affecting any other
-- finding. Stored as a real for flexibility (we use 1 / 2 / 3 today).
alter table public.findings
  add column if not exists bbox_stroke_width real not null default 2;
