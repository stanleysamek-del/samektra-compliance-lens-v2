-- Repeat inspections from an existing inspection's checklist, never its answers.
BEGIN;
CREATE TABLE IF NOT EXISTS public.inspection_schedules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 source_inspection_id uuid NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
 created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 160),
 cadence text NOT NULL CHECK(cadence IN ('daily','weekly','monthly','quarterly','annual')),
 next_due date NOT NULL,
 anchor_day integer NOT NULL CHECK(anchor_day BETWEEN 1 AND 31),
 enabled boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.inspection_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS schedules_read ON public.inspection_schedules;
CREATE POLICY schedules_read ON public.inspection_schedules FOR SELECT TO authenticated
 USING(public.can_access_inspection(source_inspection_id));
DROP POLICY IF EXISTS schedules_write ON public.inspection_schedules;
CREATE POLICY schedules_write ON public.inspection_schedules FOR ALL TO authenticated
 USING(public.can_write_inspection(source_inspection_id))
 WITH CHECK(public.can_write_inspection(source_inspection_id));
CREATE TABLE IF NOT EXISTS public.inspection_schedule_runs (
 schedule_id uuid NOT NULL REFERENCES public.inspection_schedules(id) ON DELETE CASCADE,
 due_on date NOT NULL,
 inspection_id uuid REFERENCES public.inspections(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(schedule_id,due_on)
);
ALTER TABLE public.inspection_schedule_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS schedule_runs_read ON public.inspection_schedule_runs;
CREATE POLICY schedule_runs_read ON public.inspection_schedule_runs FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.inspection_schedules s WHERE s.id=schedule_id AND public.can_access_inspection(s.source_inspection_id)));
DROP POLICY IF EXISTS schedule_runs_write ON public.inspection_schedule_runs;
CREATE POLICY schedule_runs_write ON public.inspection_schedule_runs FOR INSERT TO authenticated
 WITH CHECK(EXISTS(SELECT 1 FROM public.inspection_schedules s WHERE s.id=schedule_id AND public.can_write_inspection(s.source_inspection_id)));

CREATE OR REPLACE FUNCTION public.start_scheduled_inspection(_schedule_id uuid,_expected_due date)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE s public.inspection_schedules; source public.inspections; new_id uuid; next_month date; following date;
BEGIN
 SELECT * INTO s FROM public.inspection_schedules WHERE id=_schedule_id FOR UPDATE;
 IF NOT FOUND OR NOT public.can_write_inspection(s.source_inspection_id) THEN
  RAISE EXCEPTION 'Schedule is unavailable or read-only' USING ERRCODE='42501'; END IF;
 SELECT inspection_id INTO new_id FROM public.inspection_schedule_runs WHERE schedule_id=s.id AND due_on=_expected_due;
 IF new_id IS NOT NULL THEN RETURN new_id; END IF;
 IF NOT s.enabled OR s.next_due > current_date OR s.next_due IS DISTINCT FROM _expected_due THEN
  RAISE EXCEPTION 'This occurrence is not due. Refresh your schedule.'; END IF;
 SELECT * INTO source FROM public.inspections WHERE id=s.source_inspection_id;
 INSERT INTO public.inspections(created_by,facility_name,facility_address,facility_id,organization_id,
  location,inspector_name,manager_assigned,manager_assigned_email,date_of_inspection,status)
 VALUES(auth.uid(),source.facility_name,source.facility_address,source.facility_id,source.organization_id,
  source.location,source.inspector_name,source.manager_assigned,source.manager_assigned_email,current_date,'in_progress')
 RETURNING id INTO new_id;
 INSERT INTO public.inspection_checklist_items(inspection_id,template_ref,template_name,section_code,
  section_title,sort,question,code_ref,match_terms)
 SELECT new_id,template_ref,template_name,section_code,section_title,sort,question,code_ref,match_terms
 FROM public.inspection_checklist_items WHERE inspection_id=source.id;
 INSERT INTO public.inspection_sections(inspection_id,name,sort_order)
 SELECT new_id,name,sort_order FROM public.inspection_sections WHERE inspection_id=source.id;
 INSERT INTO public.inspection_schedule_runs(schedule_id,due_on,inspection_id) VALUES(s.id,s.next_due,new_id);
 IF s.cadence IN ('daily','weekly') THEN following:=s.next_due + CASE WHEN s.cadence='daily' THEN 1 ELSE 7 END;
 ELSE
  next_month := (date_trunc('month',s.next_due) + make_interval(months=>CASE s.cadence WHEN 'monthly' THEN 1 WHEN 'quarterly' THEN 3 ELSE 12 END))::date;
  following := next_month + least(s.anchor_day,extract(day from next_month + interval '1 month - 1 day')::integer)-1;
 END IF;
 UPDATE public.inspection_schedules SET next_due=following WHERE id=s.id;
 RETURN new_id;
END;
$$;
REVOKE ALL ON FUNCTION public.start_scheduled_inspection(uuid,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_scheduled_inspection(uuid,date) TO authenticated;
COMMIT;
