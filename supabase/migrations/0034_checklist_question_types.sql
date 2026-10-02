-- 0034: checklist question types, required questions, show-if logic.
--
-- Templates (built-in code + checklist_templates.sections jsonb) gain
-- optional per-question fields; attaching a template snapshots them onto
-- inspection_checklist_items, so these columns hold the snapshot plus the
-- answers for the new types:
--
--   item_key      stable key of the template question ("A1-3" or the
--                 template's own id) — what show_if refers to
--   response_type 'yesno' (Yes/No/N.A., the only scored type), 'text', 'number'
--   unit          display unit for number answers ("psi", "in")
--   required      must be answered (when visible) before finalize
--   show_if       {"item": "<item_key>", "equals": "yes"|"no"|"na"} — the
--                 question only applies when that answer is given
--   value_text    answer for 'text'
--   value_number  answer for 'number'
--
-- Additive and idempotent: existing rows become yes/no, not required,
-- always shown — exactly today's behavior. RLS on the table is unchanged.

alter table public.inspection_checklist_items
  add column if not exists item_key      text,
  add column if not exists response_type text not null default 'yesno',
  add column if not exists unit          text,
  add column if not exists required      boolean not null default false,
  add column if not exists show_if       jsonb,
  add column if not exists value_text    text,
  add column if not exists value_number  numeric;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'icl_items_response_type_check'
      and conrelid = 'public.inspection_checklist_items'::regclass
  ) then
    alter table public.inspection_checklist_items
      add constraint icl_items_response_type_check
      check (response_type in ('yesno', 'text', 'number'));
  end if;

  -- Yes/No/N.A. lives in `answer`; text/number answers live in value_*.
  -- Keep each type to its own column so scoring can never mix them.
  if not exists (
    select 1 from pg_constraint
    where conname = 'icl_items_answer_matches_type_check'
      and conrelid = 'public.inspection_checklist_items'::regclass
  ) then
    alter table public.inspection_checklist_items
      add constraint icl_items_answer_matches_type_check
      check (
        (response_type = 'yesno' and value_text is null and value_number is null)
        or (response_type = 'text' and answer is null and value_number is null)
        or (response_type = 'number' and answer is null and value_text is null)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'icl_items_value_text_length_check'
      and conrelid = 'public.inspection_checklist_items'::regclass
  ) then
    alter table public.inspection_checklist_items
      add constraint icl_items_value_text_length_check
      check (value_text is null or length(value_text) <= 4000);
  end if;
end $$;

-- show_if lookups resolve within one inspection by key.
create index if not exists icl_items_inspection_key_idx
  on public.inspection_checklist_items(inspection_id, item_key)
  where item_key is not null;
