-- Read-only, cumulative owner allowance totals. Includes unresolved holds.
SELECT e.plan,e.monthly_budget_usd AS limit_usd,8 AS warning_usd,
 coalesce(sum(r.reserved_usd),0) AS used_usd,
 coalesce(sum(r.reserved_usd) FILTER (WHERE r.settled),0) AS spent_usd,
 coalesce(sum(r.reserved_usd) FILTER (WHERE NOT r.settled),0) AS held_usd
FROM public.ai_entitlements e
LEFT JOIN public.ai_usage_reservations r ON r.entitlement_id=e.id
WHERE e.user_id='7c76f250-fae7-4012-92c2-0606f24d30bf'
 AND e.payment_reference='operator-owner-complimentary'
GROUP BY e.id,e.plan,e.monthly_budget_usd;
