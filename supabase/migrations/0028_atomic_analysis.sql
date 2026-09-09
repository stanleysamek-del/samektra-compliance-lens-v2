-- Apply after 0027, before deploying the matching application.
-- Every save either commits all findings/checklists/photo metadata or none.
BEGIN;
CREATE OR REPLACE FUNCTION public.save_photo_analysis(
  _photo_id uuid, _analysis jsonb, _replace boolean DEFAULT false,
  _expected_analyzed_at timestamptz DEFAULT null
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  p public.photos;
  parent_id uuid;
  parent_status text;
  preserved integer;
  inserted_rows jsonb := '[]'::jsonb;
  v jsonb;
  new_id uuid;
BEGIN
  SELECT inspection_id INTO parent_id FROM public.photos WHERE id = _photo_id;
  IF parent_id IS NULL THEN RAISE EXCEPTION 'Photo not found' USING ERRCODE = 'P0002'; END IF;
  IF current_user <> 'service_role' AND NOT public.can_write_inspection(parent_id) THEN
    RAISE EXCEPTION 'You do not have permission to edit this inspection' USING ERRCODE = '42501';
  END IF;
  -- Consistent lock order with finalization and new-photo insertion.
  SELECT status INTO parent_status FROM public.inspections WHERE id = parent_id FOR UPDATE;
  SELECT * INTO p FROM public.photos WHERE id = _photo_id FOR UPDATE;
  IF parent_status IS DISTINCT FROM 'in_progress' THEN
    RAISE EXCEPTION 'Inspection is finalized. Reopen it before analyzing.' USING ERRCODE = 'P0001';
  END IF;
  IF p.inspection_id IS DISTINCT FROM parent_id THEN
    RAISE EXCEPTION 'Photo moved during analysis. Please retry.' USING ERRCODE = '40001';
  END IF;
  IF NOT _replace AND p.analyzed_at IS NOT NULL THEN
    UPDATE public.photos SET analysis_status = 'done', analysis_error = null WHERE id = p.id;
    RETURN jsonb_build_object('findingsCount', (SELECT count(*) FROM public.findings WHERE photo_id = p.id),
      'preservedCount', 0, 'insertedFindings', '[]'::jsonb, 'alreadySaved', true);
  END IF;
  IF _replace AND p.analyzed_at IS DISTINCT FROM _expected_analyzed_at THEN
    RAISE EXCEPTION 'A newer analysis was saved. Refresh before trying again.' USING ERRCODE = '40001';
  END IF;
  IF jsonb_typeof(_analysis->'violations') IS DISTINCT FROM 'array'
     OR jsonb_typeof(_analysis->'whatToLookFor') IS DISTINCT FROM 'array'
     OR jsonb_typeof(_analysis->'notVisible') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid analysis result' USING ERRCODE = '22023';
  END IF;

  -- Preserve every finding with inspector input or links to workflow records.
  -- This also repairs partially-saved legacy attempts without duplicating rows.
  DELETE FROM public.findings f WHERE f.photo_id = p.id
    AND NOT coalesce(f.edited, false)
    AND f.user_rating IS NULL AND f.user_feedback_note IS NULL
    AND f.assigned_to IS NULL AND f.assigned_email IS NULL AND f.assigned_at IS NULL
    AND f.assigned_by IS NULL AND coalesce(f.cap_status, 'open') = 'open'
    AND f.cap_target_date IS NULL AND f.action_closed_at IS NULL
    AND f.closure_photo_id IS NULL AND f.closure_note IS NULL
    AND f.manager_corrective_action IS NULL AND f.manager_followup_comments IS NULL
    AND f.lsra_severity IS NULL AND f.lsra_impact IS NULL AND f.lsra_risk_level IS NULL
    AND f.priority = 'medium'
    AND NOT EXISTS (SELECT 1 FROM public.finding_comments c WHERE c.finding_id = f.id)
    AND NOT EXISTS (SELECT 1 FROM public.plan_pins pin WHERE pin.finding_id = f.id)
    AND NOT EXISTS (SELECT 1 FROM public.inspection_checklist_items ci WHERE ci.finding_id = f.id);
  SELECT count(*) INTO preserved FROM public.findings WHERE photo_id = p.id;

  FOR v IN SELECT value FROM jsonb_array_elements(_analysis->'violations') LOOP
    IF EXISTS (SELECT 1 FROM public.findings f WHERE f.photo_id = p.id
       AND lower(btrim(f.title)) = lower(btrim(v->>'title'))) THEN CONTINUE; END IF;
    INSERT INTO public.findings (inspection_id, photo_id, created_by, title, category, code,
      severity, description, location, remediation, "references",
      bbox_x1, bbox_y1, bbox_x2, bbox_y2, ai_confidence)
    VALUES (p.inspection_id, p.id, coalesce(auth.uid(), p.created_by), v->>'title',
      v->>'category', v->>'code', v->>'severity', v->>'description', v->>'location', v->>'remediation',
      ARRAY(SELECT jsonb_array_elements_text(coalesce(v->'references','[]'::jsonb))),
      (v->'coordinates'->>'x1')::real, (v->'coordinates'->>'y1')::real,
      (v->'coordinates'->>'x2')::real, (v->'coordinates'->>'y2')::real,
      (v->>'confidence')::real) RETURNING id INTO new_id;
    inserted_rows := inserted_rows || jsonb_build_array(jsonb_build_object(
      'id', new_id, 'title', v->>'title', 'description', v->>'description', 'code', v->>'code'));
  END LOOP;
  DELETE FROM public.what_to_look_for WHERE photo_id = p.id;
  INSERT INTO public.what_to_look_for (photo_id, inspection_id, item, details)
    SELECT p.id, p.inspection_id, value->>'item', value->>'details'
    FROM jsonb_array_elements(_analysis->'whatToLookFor');

  -- A model omitting an item is not proof the condition was verified.
  -- Keep open/resolved/skipped punch-list history; add only new questions.
  INSERT INTO public.not_visible (photo_id, inspection_id, item, reason)
    SELECT p.id, p.inspection_id, n.value->>'item', n.value->>'reason'
    FROM jsonb_array_elements(_analysis->'notVisible') n
    WHERE NOT EXISTS (SELECT 1 FROM public.not_visible old WHERE old.photo_id = p.id
      AND lower(btrim(old.item)) = lower(btrim(n.value->>'item')));

  UPDATE public.photos SET raw_analysis = _analysis,
    width = nullif(_analysis->'image'->>'width','')::integer,
    height = nullif(_analysis->'image'->>'height','')::integer,
    analyzed_at = clock_timestamp(), analysis_status = 'done', analysis_error = null
    WHERE id = p.id;
  RETURN jsonb_build_object('findingsCount', (SELECT count(*) FROM public.findings WHERE photo_id = p.id),
    'preservedCount', preserved, 'insertedFindings', inserted_rows, 'alreadySaved', false);
END;
$$;
REVOKE ALL ON FUNCTION public.save_photo_analysis(uuid,jsonb,boolean,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_photo_analysis(uuid,jsonb,boolean,timestamptz) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_inspection_status_checked(_inspection_id uuid, _status text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE existing text;
BEGIN
  IF _status NOT IN ('in_progress','completed') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  IF NOT public.can_write_inspection(_inspection_id) THEN
    RAISE EXCEPTION 'You do not have permission to edit this inspection' USING ERRCODE = '42501';
  END IF;
  SELECT status INTO existing FROM public.inspections WHERE id = _inspection_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inspection not found' USING ERRCODE = 'P0002'; END IF;
  IF _status = 'completed' AND (
    EXISTS (SELECT 1 FROM public.photos WHERE inspection_id = _inspection_id AND analysis_status IS DISTINCT FROM 'done')
    OR EXISTS (SELECT 1 FROM public.analysis_jobs WHERE inspection_id = _inspection_id AND status IN ('queued','running'))
  ) THEN RAISE EXCEPTION 'Finish photo analysis first. Wait for queued photos, and retry or remove failed photos.'; END IF;
  UPDATE public.inspections SET status = _status WHERE id = _inspection_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inspection could not be changed' USING ERRCODE = '42501'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_inspection_status_checked(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_inspection_status_checked(uuid,text) TO authenticated;

-- New captures serialize with finalization; a late upload cannot enter a locked report.
CREATE OR REPLACE FUNCTION public.guard_photo_capture() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE parent_status text;
BEGIN
  SELECT status INTO parent_status FROM public.inspections WHERE id = NEW.inspection_id FOR UPDATE;
  IF parent_status IS DISTINCT FROM 'in_progress' THEN
    RAISE EXCEPTION 'Inspection is finalized. Reopen it before adding photos.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS photos_guard_capture ON public.photos;
CREATE TRIGGER photos_guard_capture BEFORE INSERT ON public.photos
FOR EACH ROW EXECUTE FUNCTION public.guard_photo_capture();
-- Direct REST status updates must obey the same finalization guard.
CREATE OR REPLACE FUNCTION public.guard_inspection_finalization() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF NEW.status='completed' AND OLD.status IS DISTINCT FROM NEW.status AND (
  EXISTS(SELECT 1 FROM public.photos WHERE inspection_id=NEW.id AND analysis_status IS DISTINCT FROM 'done') OR
  EXISTS(SELECT 1 FROM public.analysis_jobs WHERE inspection_id=NEW.id AND status IN ('queued','running'))
 ) THEN RAISE EXCEPTION 'Finish photo analysis first. Wait for queued photos, and retry or remove failed photos.'; END IF;
 RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS inspections_guard_finalization ON public.inspections;
CREATE TRIGGER inspections_guard_finalization BEFORE UPDATE OF status ON public.inspections
FOR EACH ROW EXECUTE FUNCTION public.guard_inspection_finalization();
COMMIT;
