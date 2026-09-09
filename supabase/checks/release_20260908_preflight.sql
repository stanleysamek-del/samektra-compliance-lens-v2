-- READ ONLY. Run on staging first. Existing migrations through 0027 are required.
SELECT name, to_regclass('public.' || name) AS installed_relation
FROM unnest(ARRAY['profiles','organizations','organization_members','inspections','photos','findings',
 'finding_comments','inspection_sections','inspection_checklist_items','analysis_jobs','ai_calls',
 'facilities','facility_plans','plan_pins','assets']) AS name;
SELECT name,to_regprocedure('public.' || name) AS installed_function
FROM unnest(ARRAY['can_write_inspection(uuid)','can_access_inspection(uuid)','can_write_facility(uuid)',
 'can_access_facility(uuid)','is_org_member(uuid)']) AS name;
-- Any rows below need deliberate review before migration 0032's unique index.
SELECT asset_id,count(*) AS existing_device_pins FROM public.plan_pins
WHERE kind='device' AND asset_id IS NOT NULL GROUP BY asset_id HAVING count(*)>1;
-- Verify historical administrator accounts independently. This release blocks new self-promotion.
SELECT user_id FROM public.profiles WHERE is_admin=true;
