BEGIN;
CREATE TABLE IF NOT EXISTS public.asset_checks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
 created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 result text NOT NULL CHECK(result IN ('pass','fail','not_tested')),
 note text NOT NULL DEFAULT '',
 next_due date,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(result='pass' OR length(btrim(note))>0)
);
ALTER TABLE public.asset_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS asset_checks_read ON public.asset_checks;
CREATE POLICY asset_checks_read ON public.asset_checks FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.assets a WHERE a.id=asset_id AND public.can_access_facility(a.facility_id)));
DROP POLICY IF EXISTS asset_checks_insert ON public.asset_checks;
CREATE POLICY asset_checks_insert ON public.asset_checks FOR INSERT TO authenticated
 WITH CHECK(created_by=auth.uid() AND EXISTS(SELECT 1 FROM public.assets a WHERE a.id=asset_id AND public.can_write_facility(a.facility_id)));
CREATE OR REPLACE FUNCTION public.record_asset_check(_asset_id uuid,_result text,_note text,_next_due date)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE a public.assets; new_id uuid;
BEGIN
 SELECT * INTO a FROM public.assets WHERE id=_asset_id FOR UPDATE;
 IF NOT FOUND OR NOT public.can_write_facility(a.facility_id) THEN
  RAISE EXCEPTION 'Equipment is unavailable or read-only' USING ERRCODE='42501'; END IF;
 IF a.status='removed' THEN RAISE EXCEPTION 'Removed equipment cannot be inspected'; END IF;
 INSERT INTO public.asset_checks(asset_id,created_by,result,note,next_due)
 VALUES(a.id,auth.uid(),_result,btrim(coalesce(_note,'')),_next_due) RETURNING id INTO new_id;
 UPDATE public.assets SET last_inspected_at=CASE WHEN _result='not_tested' THEN last_inspected_at ELSE now() END,
  next_due_at=CASE WHEN _result='not_tested' THEN next_due_at ELSE _next_due::timestamptz END,
  updated_at=now() WHERE id=a.id;
 RETURN new_id;
END;
$$;
REVOKE ALL ON FUNCTION public.record_asset_check(uuid,text,text,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_asset_check(uuid,text,text,date) TO authenticated;
COMMIT;
