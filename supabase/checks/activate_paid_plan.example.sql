-- OPERATOR EXAMPLE ONLY. Not a migration. Verify payment first.
-- Replace all placeholders. Choose either a personal user or an organization, not both.
DO $$
DECLARE
 account_id uuid := NULL; -- Replace NULL with the verified payer's auth.users.id.
 verified_payment text := 'REPLACE_WITH_VERIFIED_PAYMENT_REFERENCE';
 expires_at timestamptz := NULL; -- Set the paid-through date explicitly.
 selected_plan text := 'pro'; -- pro, facility, healthcare
 credit_limit integer := 100; -- Example only; align with the purchased allowance.
 dollar_limit numeric := 5; -- Example only; align with your intended cost ceiling.
BEGIN
 IF account_id IS NULL OR expires_at IS NULL OR verified_payment LIKE 'REPLACE_%' THEN
  RAISE NOTICE 'No entitlement changed: replace placeholders after payment verification.';
  RETURN;
 END IF;
 INSERT INTO public.ai_entitlements(user_id,plan,active_until,monthly_credits,monthly_budget_usd,payment_reference)
 VALUES(account_id,selected_plan,expires_at,credit_limit,dollar_limit,verified_payment)
 ON CONFLICT(user_id) WHERE user_id IS NOT NULL DO UPDATE
 SET plan=EXCLUDED.plan,active_until=EXCLUDED.active_until,monthly_credits=EXCLUDED.monthly_credits,
 monthly_budget_usd=EXCLUDED.monthly_budget_usd,payment_reference=EXCLUDED.payment_reference;
END $$;
-- For a team purchase, replace user_id with organization_id in BOTH the insert and conflict target,
-- and use the actual organizations.id. Do not create a personal grant to bypass a viewer restriction.
-- Raising an allowance does not clear previously consumed credits or budget holds.
