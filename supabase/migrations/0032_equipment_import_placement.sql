-- Exact barcode matching within a building; never infer a physical plan position.
BEGIN;
CREATE OR REPLACE FUNCTION public.import_equipment_rows(_facility_id uuid,_rows jsonb,_overwrite boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE r jsonb; existing uuid; added integer:=0; updated integer:=0; skipped integer:=0; code text;
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(public.can_write_facility(_facility_id),false) THEN RAISE EXCEPTION 'Equipment editing permission required' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(_rows) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Import 1 to 500 rows'; END IF;
 -- Serializes imports for this building, including duplicate submissions.
 PERFORM pg_advisory_xact_lock(hashtextextended(_facility_id::text,32));
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(_rows) v GROUP BY btrim(v->>'barcode') HAVING count(*)>1) THEN RAISE EXCEPTION 'Duplicate barcodes in this import'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(_rows) LOOP
  code:=btrim(r->>'barcode');
  IF code IS NULL OR length(code) NOT BETWEEN 1 AND 160 OR code ~ '[[:cntrl:]]' OR length(coalesce(r->>'location',''))>500 OR
   length(coalesce(r->>'label',''))>160 OR length(coalesce(r->>'manufacturer',''))>160 OR length(coalesce(r->>'model',''))>160 OR length(coalesce(r->>'serial',''))>160 THEN RAISE EXCEPTION 'Invalid equipment fields'; END IF;
  IF (r->>'type') IS NULL OR (r->>'type') NOT IN ('extinguisher','emergency_light','exit_sign','fire_door','pull_station','smoke_detector','sprinkler_riser','fire_damper','eyewash','aed','other') THEN RAISE EXCEPTION 'Invalid equipment type'; END IF;
  SELECT id INTO existing FROM public.assets WHERE facility_id=_facility_id AND barcode=code FOR UPDATE;
  IF existing IS NULL THEN
   INSERT INTO public.assets(facility_id,created_by,barcode,label,type,location_text,manufacturer,model,serial)
   VALUES(_facility_id,auth.uid(),code,coalesce(nullif(btrim(r->>'label'),''),code),r->>'type',nullif(btrim(r->>'location'),''),nullif(btrim(r->>'manufacturer'),''),nullif(btrim(r->>'model'),''),nullif(btrim(r->>'serial'),''));added:=added+1;
  ELSIF _overwrite THEN
   UPDATE public.assets SET label=coalesce(nullif(btrim(r->>'label'),''),label),type=r->>'type',location_text=coalesce(nullif(btrim(r->>'location'),''),location_text),manufacturer=coalesce(nullif(btrim(r->>'manufacturer'),''),manufacturer),model=coalesce(nullif(btrim(r->>'model'),''),model),serial=coalesce(nullif(btrim(r->>'serial'),''),serial),updated_at=now() WHERE id=existing;updated:=updated+1;
  ELSE skipped:=skipped+1;
  END IF;
 END LOOP;
 RETURN jsonb_build_object('added',added,'updated',updated,'skipped',skipped);
END;$$;
REVOKE ALL ON FUNCTION public.import_equipment_rows(uuid,jsonb,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_equipment_rows(uuid,jsonb,boolean) TO authenticated;

-- Stop duplicate placement through direct REST writes as well as the RPC.
CREATE UNIQUE INDEX IF NOT EXISTS plan_pins_one_device_asset ON public.plan_pins(asset_id)
 WHERE kind='device' AND asset_id IS NOT NULL;
-- Enforce the link even for direct API writes, not just the UI action.
CREATE OR REPLACE FUNCTION public.guard_asset_pin_facility() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.asset_id IS NOT NULL AND (NEW.kind<>'device' OR NOT EXISTS(
  SELECT 1 FROM public.assets a JOIN public.facility_plans p ON p.facility_id=a.facility_id
  WHERE a.id=NEW.asset_id AND p.id=NEW.plan_id AND a.facility_id=NEW.facility_id)) THEN
  RAISE EXCEPTION 'Equipment and floor plan must belong to the same building';
 END IF; RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS guard_asset_pin_facility ON public.plan_pins;
CREATE TRIGGER guard_asset_pin_facility BEFORE INSERT OR UPDATE ON public.plan_pins FOR EACH ROW EXECUTE FUNCTION public.guard_asset_pin_facility();
CREATE OR REPLACE FUNCTION public.place_asset_on_plan(_asset_id uuid,_plan_id uuid,_x numeric,_y numeric)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE a public.assets; pin uuid;
BEGIN
 SELECT * INTO a FROM public.assets WHERE id=_asset_id FOR UPDATE;
 IF a.id IS NULL OR auth.uid() IS NULL OR NOT coalesce(public.can_write_facility(a.facility_id),false) THEN RAISE EXCEPTION 'Equipment editing permission required' USING ERRCODE='42501'; END IF;
 IF _x IS NULL OR _y IS NULL OR NOT(_x BETWEEN 0 AND 1 AND _y BETWEEN 0 AND 1) THEN RAISE EXCEPTION 'Invalid plan position'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.facility_plans WHERE id=_plan_id AND facility_id=a.facility_id) THEN RAISE EXCEPTION 'Choose a plan from this building'; END IF;
 SELECT id INTO pin FROM public.plan_pins WHERE asset_id=a.id AND kind='device' ORDER BY created_at LIMIT 1 FOR UPDATE;
 IF pin IS NULL THEN
  INSERT INTO public.plan_pins(plan_id,facility_id,kind,asset_id,x,y,label,created_by)
  VALUES(_plan_id,a.facility_id,'device',a.id,_x,_y,coalesce(a.label,a.barcode),auth.uid()) RETURNING id INTO pin;
 ELSE UPDATE public.plan_pins SET plan_id=_plan_id,x=_x,y=_y,label=coalesce(a.label,a.barcode) WHERE id=pin; END IF;
 RETURN pin;
END;$$;
REVOKE ALL ON FUNCTION public.place_asset_on_plan(uuid,uuid,numeric,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_asset_on_plan(uuid,uuid,numeric,numeric) TO authenticated;
-- A later building change must not silently invalidate an existing physical placement.
CREATE OR REPLACE FUNCTION public.guard_pinned_building_change() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.facility_id IS DISTINCT FROM OLD.facility_id AND (
  (TG_TABLE_NAME='assets' AND EXISTS(SELECT 1 FROM public.plan_pins WHERE asset_id=OLD.id)) OR
  (TG_TABLE_NAME='facility_plans' AND EXISTS(SELECT 1 FROM public.plan_pins WHERE plan_id=OLD.id AND asset_id IS NOT NULL))
 ) THEN RAISE EXCEPTION 'Remove equipment plan placements before changing the building'; END IF;
 RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS assets_guard_pinned_building ON public.assets;
CREATE TRIGGER assets_guard_pinned_building BEFORE UPDATE OF facility_id ON public.assets FOR EACH ROW EXECUTE FUNCTION public.guard_pinned_building_change();
DROP TRIGGER IF EXISTS plans_guard_pinned_building ON public.facility_plans;
CREATE TRIGGER plans_guard_pinned_building BEFORE UPDATE OF facility_id ON public.facility_plans FOR EACH ROW EXECUTE FUNCTION public.guard_pinned_building_change();
COMMIT;
