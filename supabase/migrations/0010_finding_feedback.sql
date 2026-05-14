-- Per-finding feedback from the inspector. Drives two things:
--   1) Quality signal the AI receives on the next Coach turn — "the inspector
--      thumbs-up'd findings #1 and #3, thumbs-down'd #2", so the model can
--      double down on what's working and stop emitting the bad calls.
--   2) Aggregate analytics later (which categories of findings get downvoted
--      most, where the model is overcalling, etc.).
--
-- Stored as a smallint (1 = liked / good call, -1 = disliked / wrong call,
-- null = no feedback). Lighter than a separate table and matches the
-- one-finding-one-rating shape exactly.

alter table public.findings
  add column if not exists user_rating       smallint
    check (user_rating in (-1, 1));

alter table public.findings
  add column if not exists user_feedback_note text;

-- Index supports "show me everything the inspector thumbs-downed this week"
-- on the admin dashboard later.
create index if not exists findings_user_rating_idx
  on public.findings(user_rating)
  where user_rating is not null;
