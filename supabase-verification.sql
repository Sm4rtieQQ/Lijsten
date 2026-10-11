-- ============================================================================
-- Lijstjes — E-mailverificatie (Supabase)
--
-- VERVANGT supabase-invites.sql. Voer dit VOLLEDIGE script één keer uit in de
-- Supabase SQL Editor (SQL Editor > New query > plak > Run). Het script is
-- idempotent: je mag het veilig opnieuw draaien.
--
-- WAT DIT SCRIPT DOET
--   1. Haalt het uitnodigingssysteem volledig weg (trigger, functies, tabellen).
--   2. Zet de grendel op e-mailbevestiging: `public.is_email_confirmed()`.
--   3. Zet de RLS-policies van lists/list_items opnieuw, mét die grendel.
--   4. Bevat onderaan de checklist en het e-mailtemplate voor "Confirm signup".
--
-- WAAROM
--   Er is open registratie: iedereen mag een account aanmaken. Maar een account
--   is pas bruikbaar NA bevestiging van het e-mailadres. Dat wordt op twee
--   plekken afgedwongen: Supabase-instelling "Confirm email" (geen sessie zonder
--   bevestiging) én de RLS-policies hieronder (defense in depth).
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. UITNODIGINGSSYSTEEM VERWIJDEREN
--    Zonder deze stap blijft de trigger `enforce_invite_on_signup` op auth.users
--    staan en faalt ELKE registratie met de fout `no_active_invite`.
-- ---------------------------------------------------------------------------
drop trigger if exists on_auth_user_created_invite on auth.users;
drop function if exists public.enforce_invite_on_signup();
drop function if exists public.claim_invite(text);
drop table if exists public.invite_claims;
drop table if exists public.invites;


-- ---------------------------------------------------------------------------
-- 2. GRENDEL: is het e-mailadres van deze gebruiker bevestigd?
--
--    `security definer` is nodig omdat een gewone `authenticated`-rol
--    `auth.users` niet mag lezen. De functie geeft alleen een boolean terug en
--    lekt dus niets: hij kijkt uitsluitend naar de eigen `auth.uid()`.
-- ---------------------------------------------------------------------------
create or replace function public.is_email_confirmed()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from auth.users u
    where u.id = auth.uid()
      and u.email_confirmed_at is not null
  );
$$;

revoke all on function public.is_email_confirmed() from public;
grant execute on function public.is_email_confirmed() to authenticated;


-- ---------------------------------------------------------------------------
-- 3. RLS-POLICIES OPNIEUW (met de grendel)
--    Dezelfde policies als in supabase-schema.sql, nu met
--    `and public.is_email_confirmed()` eraan vast.
-- ---------------------------------------------------------------------------
alter table public.lists enable row level security;
alter table public.list_items enable row level security;

drop policy if exists "lists_select_own" on public.lists;
drop policy if exists "lists_insert_own" on public.lists;
drop policy if exists "lists_update_own" on public.lists;
drop policy if exists "lists_delete_own" on public.lists;
drop policy if exists "items_select_own" on public.list_items;
drop policy if exists "items_insert_own" on public.list_items;
drop policy if exists "items_update_own" on public.list_items;
drop policy if exists "items_delete_own" on public.list_items;

create policy "lists_select_own" on public.lists
  for select to authenticated
  using (owner_id = auth.uid() and public.is_email_confirmed());

create policy "lists_insert_own" on public.lists
  for insert to authenticated
  with check (owner_id = auth.uid() and public.is_email_confirmed());

create policy "lists_update_own" on public.lists
  for update to authenticated
  using (owner_id = auth.uid() and public.is_email_confirmed())
  with check (owner_id = auth.uid() and public.is_email_confirmed());

create policy "lists_delete_own" on public.lists
  for delete to authenticated
  using (owner_id = auth.uid() and public.is_email_confirmed());

create policy "items_select_own" on public.list_items
  for select to authenticated
  using (exists (
    select 1 from public.lists
    where lists.id = list_items.list_id
      and lists.owner_id = auth.uid()
      and public.is_email_confirmed()
  ));

create policy "items_insert_own" on public.list_items
  for insert to authenticated
  with check (exists (
    select 1 from public.lists
    where lists.id = list_items.list_id
      and lists.owner_id = auth.uid()
      and public.is_email_confirmed()
  ));

create policy "items_update_own" on public.list_items
  for update to authenticated
  using (exists (
    select 1 from public.lists
    where lists.id = list_items.list_id
      and lists.owner_id = auth.uid()
      and public.is_email_confirmed()
  ))
  with check (exists (
    select 1 from public.lists
    where lists.id = list_items.list_id
      and lists.owner_id = auth.uid()
      and public.is_email_confirmed()
  ));

create policy "items_delete_own" on public.list_items
  for delete to authenticated
  using (exists (
    select 1 from public.lists
    where lists.id = list_items.list_id
      and lists.owner_id = auth.uid()
      and public.is_email_confirmed()
  ));


-- ---------------------------------------------------------------------------
-- 4. ZELF-TEST (optioneel)
--    Verwacht: de twee `drop ...`-regels slagen zonder fout (bewijs dat het
--    uitnodigingssysteem weg is).
-- ---------------------------------------------------------------------------
select count(*) as resterende_uitnodigingstabellen
  from information_schema.tables
 where table_schema = 'public'
   and table_name in ('invites', 'invite_claims');   -- verwacht: 0

select routine_name
  from information_schema.routines
 where routine_schema = 'public'
   and routine_name in ('claim_invite', 'enforce_invite_on_signup');  -- verwacht: 0 rijen


-- ============================================================================
-- CHECKLIST in Supabase (Authentication)
--
-- [ ] 1. Providers > Email: AAN.
-- [ ] 2. "Allow new users to sign up": AAN. (Er is geen poortwachter meer in de
--        database; de drempel is nu de e-mailbevestiging.)
-- [ ] 3. "Confirm email": **AAN**. Dit is de kern van de nieuwe flow:
--          - signUp geeft GEEN sessie terug;
--          - inloggen zonder bevestiging wordt server-side geweigerd
--            (foutcode `email_not_confirmed`, de app toont daar een NL-tekst
--            voor en verwijst naar de verificatiepagina).
--        Zet dit pas AAN als de code is uitgerold (anders kan niemand meer
--        inloggen zonder de verificatiepagina).
-- [ ] 4. URL Configuration > Site URL: `com.lijstjes.app://`
--        LET OP: dit is GEEN webadres. De app is een Android-app zonder webhost;
--        de bevestigings- en herstellink komen binnen via een deep link met
--        eigen scheme (custom_url_scheme in strings.xml).
-- [ ] 5. URL Configuration > Redirect URLs: voeg beide toe:
--          com.lijstjes.app://          (Android-app)
--          http://localhost:5173        (alleen voor webtesten met `npm run dev`)
--        De app gebruikt native `com.lijstjes.app://` en op het web de origin
--        van de dev-server.
-- [ ] 6. Emailing > SMTP: **bewust GEEN eigen SMTP-provider.** De bevestigings-
--        en herstelmail gaan via de standaardaflevering van Supabase: enkele
--        mails per uur en een reële kans op spam. De resend-knop in de app houdt
--        daarom 60 seconden cooldown aan. Beloof in de UI nooit dat de mail
--        aankomt.
-- ============================================================================


-- ============================================================================
-- E-MAILTEMPLATE — "Confirm signup"
--
-- Authentication > Email Templates > "Confirm signup".
-- Pas het onderwerp en de body hieronder aan. `{{ .ConfirmationURL }}` is de
-- knop-link en MOET blijven staan; die stuurt de gebruiker naar
-- `com.lijstjes.app://#access_token=...&type=signup`.
--
-- Onderwerp:
--   Bevestig je Lijstjes-account
--
-- Body (HTML, inline CSS omdat e-mailclients geen <style> ondersteunen):
-- ----------------------------------------------------------------------------
-- <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
--        style="background:#f7f1e8;padding:32px 0;font-family:'DM Sans',Arial,sans-serif;">
--   <tr>
--     <td align="center">
--       <table role="presentation" width="480" cellpadding="0" cellspacing="0"
--              style="max-width:480px;background:#ffffff;border:1px solid #eadfd0;border-radius:22px;padding:34px 30px;">
--         <tr><td style="font-size:13px;font-weight:700;letter-spacing:.14em;color:#b06a3a;">LIJSTJES</td></tr>
--         <tr><td style="padding-top:8px;font-family:'Playfair Display',Georgia,serif;font-size:26px;color:#33261c;">Bevestig je account</td></tr>
--         <tr><td style="padding-top:14px;font-size:15px;line-height:1.6;color:#6b5a4c;">
--           Je hebt een account aangevraagd voor <strong>{{ .Email }}</strong>.
--           Klik op de knop om je e-mailadres te bevestigen.
--         </td></tr>
--         <tr><td style="padding-top:24px;">
--           <a href="{{ .ConfirmationURL }}"
--              style="display:inline-block;padding:14px 22px;border-radius:11px;background:#e66d35;color:#ffffff;font-weight:700;text-decoration:none;">
--             Account bevestigen
--           </a>
--         </td></tr>
--         <tr><td style="padding-top:20px;font-size:13px;line-height:1.6;color:#8a7a6c;">
--           Werkt de knop niet? Open de app en vraag via de verificatiepagina een
--           nieuwe link aan. Heb je dit niet aangevraagd? Dan kun je deze mail
--           negeren.
--         </td></tr>
--       </table>
--     </td>
--   </tr>
-- </table>
-- ============================================================================
