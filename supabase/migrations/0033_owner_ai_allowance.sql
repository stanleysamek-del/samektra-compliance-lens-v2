-- Owner-authorized complimentary AI. Other administrators do not inherit this grant.
-- This allowance is cumulative, not reset monthly. Global pause still applies.
BEGIN;
CREATE OR REPLACE FUNCTION public.ensure_owner_ai_entitlement(_user_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE entitlement uuid;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM auth.users u JOIN public.profiles p ON p.user_id=u.id
   WHERE u.id=_user_id AND lower(u.email)='stanley.samek@proton.me'
   AND u.email_confirmed_at IS NOT NULL AND p.is_admin=true) THEN RETURN NULL; END IF;
 PERFORM pg_advisory_xact_lock(20829001);
 INSERT INTO public.ai_entitlements(user_id,plan,active_until,monthly_credits,monthly_budget_usd,payment_reference)
 VALUES(_user_id,'healthcare','9999-12-31T00:00:00Z',10000,10,'operator-owner-complimentary')
 ON CONFLICT(user_id) WHERE user_id IS NOT NULL DO NOTHING;
 SELECT id INTO entitlement FROM public.ai_entitlements WHERE user_id=_user_id;
 RETURN entitlement;
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_owner_ai_entitlement(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_owner_ai_entitlement(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_paid_ai(_user_id uuid, _org_id uuid, _tier text,
 _global_daily_cap numeric DEFAULT 25)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.ai_entitlements; units integer; amount numeric; used_units integer;
 used_usd numeric; reservation uuid; owner_entitlement uuid; cumulative boolean;
BEGIN
 IF _user_id IS NULL OR _tier IS NULL OR _tier NOT IN ('default','deep') THEN
   RETURN jsonb_build_object('ok',false,'error','Invalid AI request'); END IF;
 PERFORM pg_advisory_xact_lock(20829001);
 IF _org_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.organization_members
   WHERE organization_id = _org_id AND user_id = _user_id AND role IN ('admin','member')) THEN
   RETURN jsonb_build_object('ok',false,'error','Read-only access does not include paid AI'); END IF;
 owner_entitlement := public.ensure_owner_ai_entitlement(_user_id);
 SELECT * INTO e FROM public.ai_entitlements
 WHERE active_until > now() AND (id=owner_entitlement OR
   (_org_id IS NOT NULL AND organization_id=_org_id) OR (_org_id IS NULL AND user_id=_user_id))
 ORDER BY (id=owner_entitlement) DESC NULLS LAST LIMIT 1;
 IF e.id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','Paid AI requires an active plan. Free tools and manual inspections remain available.'); END IF;
 cumulative := e.payment_reference='operator-owner-complimentary';
 IF cumulative AND owner_entitlement IS NULL THEN
   RETURN jsonb_build_object('ok',false,'error','Owner AI access is no longer authorized.'); END IF;
 IF _tier='deep' AND e.plan='pro' THEN
   RETURN jsonb_build_object('ok',false,'error','Advanced analysis is included with Facility and Healthcare plans.'); END IF;
 units := CASE WHEN _tier='deep' THEN 5 ELSE 1 END;
 amount := CASE WHEN _tier='deep' THEN 2.00 ELSE 0.75 END;
 SELECT coalesce(sum(credits),0),coalesce(sum(reserved_usd),0) INTO used_units,used_usd
 FROM public.ai_usage_reservations WHERE entitlement_id=e.id
 AND (cumulative OR created_at>=date_trunc('month',now()));
 IF used_units+units>e.monthly_credits OR used_usd+amount>e.monthly_budget_usd THEN
   RETURN jsonb_build_object('ok',false,'error',CASE WHEN cumulative
     THEN 'Owner AI allowance reached. Review spending before raising the $10 allowance.'
     ELSE 'Monthly AI allowance reached. Your records and manual tools remain available.' END); END IF;
 IF _global_daily_cap IS NULL OR _global_daily_cap<=0 OR
   (SELECT coalesce(sum(reserved_usd),0) FROM public.ai_usage_reservations
    WHERE created_at>=now()-interval '24 hours')+amount>_global_daily_cap THEN
   RETURN jsonb_build_object('ok',false,'error','AI is temporarily paused by the spending limit. Please try later.'); END IF;
 INSERT INTO public.ai_usage_reservations(entitlement_id,user_id,tier,credits,reserved_usd)
 VALUES(e.id,_user_id,_tier,units,amount) RETURNING id INTO reservation;
 RETURN jsonb_build_object('ok',true,'reservationId',reservation,'plan',e.plan);
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_paid_ai(uuid,uuid,text,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_paid_ai(uuid,uuid,text,numeric) TO service_role;

-- No grant if the verified owner/admin account does not exist yet; first use retries.
SELECT public.ensure_owner_ai_entitlement(id) FROM auth.users
 WHERE lower(email)='stanley.samek@proton.me' AND email_confirmed_at IS NOT NULL;

-- Sum the entire authorized allowance in SQL (including all team members and
-- unresolved holds). PostgREST row limits must not understate spending.
CREATE OR REPLACE FUNCTION public.ai_allowance_summary(_org_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.ai_entitlements; owner_id uuid; cumulative boolean;
 spent numeric; held numeric; credits integer;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE='42501'; END IF;
 IF _org_id IS NOT NULL AND NOT public.is_org_member(_org_id) THEN
   RAISE EXCEPTION 'Not a member' USING ERRCODE='42501'; END IF;
 owner_id := public.ensure_owner_ai_entitlement(auth.uid());
 SELECT * INTO e FROM public.ai_entitlements WHERE id=owner_id OR
  (_org_id IS NULL AND user_id=auth.uid()) OR (_org_id IS NOT NULL AND organization_id=_org_id)
 ORDER BY (id=owner_id) DESC NULLS LAST LIMIT 1;
 IF e.id IS NULL THEN RETURN jsonb_build_object('active',false); END IF;
 cumulative := e.payment_reference='operator-owner-complimentary';
 SELECT coalesce(sum(reserved_usd) FILTER (WHERE settled),0),
  coalesce(sum(reserved_usd) FILTER (WHERE NOT settled),0),coalesce(sum(r.credits),0)
 INTO spent,held,credits FROM public.ai_usage_reservations r WHERE entitlement_id=e.id
 AND (cumulative OR created_at>=date_trunc('month',now()));
 RETURN jsonb_build_object('active',e.active_until>now() AND (NOT cumulative OR owner_id IS NOT NULL),
  'plan',e.plan,'ownerAllowance',cumulative,'spent',spent,'held',held,'used',spent+held,
  'limit',e.monthly_budget_usd,'warningAt',e.monthly_budget_usd*0.8,
  'credits',credits,'creditLimit',e.monthly_credits);
END;
$$;
REVOKE ALL ON FUNCTION public.ai_allowance_summary(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ai_allowance_summary(uuid) TO authenticated;
COMMIT;
