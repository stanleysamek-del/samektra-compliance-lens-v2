-- Paid AI is opt-in after verified payment; signup NEVER grants paid usage.
BEGIN;
-- Profiles are self-editable, so protect the administrator column at the DB boundary.
CREATE OR REPLACE FUNCTION public.protect_profile_admin() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF current_user IN ('anon','authenticated') AND
   ((TG_OP = 'INSERT' AND NEW.is_admin) OR
    (TG_OP = 'UPDATE' AND NEW.is_admin IS DISTINCT FROM OLD.is_admin)) THEN
   RAISE EXCEPTION 'Administrator status can only be changed by an operator' USING ERRCODE = '42501';
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS profiles_protect_admin ON public.profiles;
CREATE TRIGGER profiles_protect_admin BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_admin();

CREATE TABLE IF NOT EXISTS public.ai_entitlements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
 organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
 plan text NOT NULL CHECK (plan IN ('pro','facility','healthcare')),
 active_until timestamptz NOT NULL,
 monthly_credits integer NOT NULL CHECK (monthly_credits > 0),
 monthly_budget_usd numeric NOT NULL CHECK (monthly_budget_usd > 0),
 payment_reference text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((user_id IS NULL) <> (organization_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_entitlements_user ON public.ai_entitlements(user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ai_entitlements_org ON public.ai_entitlements(organization_id) WHERE organization_id IS NOT NULL;
ALTER TABLE public.ai_entitlements ENABLE ROW LEVEL SECURITY;
-- No browser writes. Only payment webhooks/operator service-role access may grant a plan.
DROP POLICY IF EXISTS ai_entitlements_own_read ON public.ai_entitlements;
CREATE POLICY ai_entitlements_own_read ON public.ai_entitlements FOR SELECT TO authenticated
 USING (user_id = auth.uid() OR (organization_id IS NOT NULL AND public.is_org_member(organization_id)));

CREATE TABLE IF NOT EXISTS public.ai_usage_reservations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 entitlement_id uuid NOT NULL REFERENCES public.ai_entitlements(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id),
 tier text NOT NULL CHECK (tier IN ('default','deep')),
 credits integer NOT NULL,
 reserved_usd numeric NOT NULL CHECK (reserved_usd >= 0),
 settled boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_usage_period ON public.ai_usage_reservations(entitlement_id,created_at);
CREATE INDEX IF NOT EXISTS ai_usage_global ON public.ai_usage_reservations(created_at);
ALTER TABLE public.ai_usage_reservations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_usage_own_read ON public.ai_usage_reservations;
CREATE POLICY ai_usage_own_read ON public.ai_usage_reservations FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.reserve_paid_ai(_user_id uuid, _org_id uuid, _tier text,
 _global_daily_cap numeric DEFAULT 25)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.ai_entitlements; units integer; amount numeric; used_units integer;
 used_usd numeric; reservation uuid;
BEGIN
 IF _user_id IS NULL OR _tier NOT IN ('default','deep') THEN
   RETURN jsonb_build_object('ok',false,'error','Invalid AI request'); END IF;
 -- Serialize checks and reservations so concurrent calls cannot overspend the cap.
 PERFORM pg_advisory_xact_lock(20829001);
 -- A viewer never borrows an organization's paid entitlement.
 IF _org_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.organization_members
   WHERE organization_id = _org_id AND user_id = _user_id AND role IN ('admin','member')) THEN
   RETURN jsonb_build_object('ok',false,'error','Read-only access does not include paid AI'); END IF;
 SELECT * INTO e FROM public.ai_entitlements
 WHERE active_until > now() AND ((_org_id IS NOT NULL AND organization_id = _org_id)
   OR (_org_id IS NULL AND user_id = _user_id)) LIMIT 1;
 IF e.id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','Paid AI requires an active plan. Free tools and manual inspections remain available.'); END IF;
 IF _tier = 'deep' AND e.plan = 'pro' THEN
   RETURN jsonb_build_object('ok',false,'error','Advanced analysis is included with Facility and Healthcare plans.'); END IF;
 units := CASE WHEN _tier = 'deep' THEN 5 ELSE 1 END;
 -- Conservative holds; actual successful cost releases unused allowance.
 amount := CASE WHEN _tier = 'deep' THEN 2.00 ELSE 0.75 END;
 SELECT coalesce(sum(credits),0), coalesce(sum(reserved_usd),0) INTO used_units,used_usd
 FROM public.ai_usage_reservations WHERE entitlement_id = e.id
 AND created_at >= date_trunc('month',now());
 IF used_units + units > e.monthly_credits OR used_usd + amount > e.monthly_budget_usd THEN
   RETURN jsonb_build_object('ok',false,'error','Monthly AI allowance reached. Your records and manual tools remain available.'); END IF;
 IF _global_daily_cap IS NULL OR _global_daily_cap <= 0 OR
   (SELECT coalesce(sum(reserved_usd),0) FROM public.ai_usage_reservations
     WHERE created_at >= now() - interval '24 hours') + amount > _global_daily_cap THEN
   RETURN jsonb_build_object('ok',false,'error','AI is temporarily paused by the spending limit. Please try later.'); END IF;
 INSERT INTO public.ai_usage_reservations(entitlement_id,user_id,tier,credits,reserved_usd)
 VALUES(e.id,_user_id,_tier,units,amount) RETURNING id INTO reservation;
 RETURN jsonb_build_object('ok',true,'reservationId',reservation,'plan',e.plan);
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_paid_ai(uuid,uuid,text,numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_paid_ai(uuid,uuid,text,numeric) TO service_role;

CREATE OR REPLACE FUNCTION public.settle_paid_ai(_id uuid,_cost numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF _cost IS NULL OR _cost < 0 THEN RAISE EXCEPTION 'Invalid cost'; END IF;
 UPDATE public.ai_usage_reservations SET reserved_usd = _cost, settled = true
 WHERE id = _id AND NOT settled;
END;
$$;
REVOKE ALL ON FUNCTION public.settle_paid_ai(uuid,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.settle_paid_ai(uuid,numeric) TO service_role;
-- Gemini has been supported by code but was absent from the original DB check.
ALTER TABLE public.ai_calls DROP CONSTRAINT IF EXISTS ai_calls_provider_check;
ALTER TABLE public.ai_calls ADD CONSTRAINT ai_calls_provider_check CHECK(provider IN ('anthropic','openai','google'));
COMMIT;
