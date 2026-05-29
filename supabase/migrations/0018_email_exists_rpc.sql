-- Lookup helper for the forgot-password flow.
--
-- The app talks to Supabase with the ANON key under RLS, which cannot read
-- auth.users. This SECURITY DEFINER function lets the (anonymous) reset form
-- ask "is there an account for this email?" so the UI can say "no account
-- found" and point the visitor to sign-up.
--
-- TRADEOFF: this intentionally enables account enumeration on the password-
-- reset form (a deliberate product decision — surface unknown emails instead
-- of the privacy-preserving "we sent a link if it exists" message).

create or replace function public.email_exists(p_email text)
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from auth.users
    where lower(email) = lower(trim(p_email))
  );
$$;

-- Only expose the boolean check; never the table.
revoke all on function public.email_exists(text) from public;
grant execute on function public.email_exists(text) to anon, authenticated;
