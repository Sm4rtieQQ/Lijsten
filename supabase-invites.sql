-- ============================================================================
-- Lijstjes — Uitnodigingsregistratie (Supabase)
--
-- GEBRUIK
--   1. Open je Supabase-project > SQL Editor > plak DIT VOLLEDIGE script > Run.
--      Het script is idempotent: veilig om opnieuw uit te voeren.
--   2. Ga daarna naar Authentication > URL Configuration en zet Site URL en
--      Redirect URLs op het app-schema (zie onderaan "CHECKLIST"). Nodig voor de
--      herstelmail van een wachtwoord; voor de registratie zelf niet.
--   3. Maak per gebruiker één uitnodiging aan met blok 6 van dit script en stuur
--      de registratielink naar die persoon.
--
-- MODEL IN ÉÉN ZIN
--   Een account kan alleen ontstaan als er een uitnodiging bestaat die (a) nog
--   niet gebruikt is, (b) niet verlopen is en (c) via de registratiepagina
--   expliciet is "opgeëist" met het token uit de link. Dat wordt afgedwongen in
--   de database (trigger op auth.users) — niet in de app.
--
--   Gekozen variant: één uitnodiging = één account, geldig 7 dagen, en
--   e-mailbevestiging staat UIT (zie checklist onderaan).
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. TABEL invites — alleen beheer door de beheerder
--    De app krijgt hier geen rechten op (zie revoke onderaan).
-- ---------------------------------------------------------------------------
create table if not exists public.invites (
  id         uuid primary key default gen_random_uuid(),
  token      text not null unique,                       -- 32 willekeurige hex-tekens
  email      text not null check (email = lower(email)),  -- altijd kleine letters
  note       text,                                        -- vrij veld, bv. "Martin"
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  used_at    timestamptz,                                -- eenmalig: gevuld bij signup
  used_by    uuid references auth.users(id) on delete set null
);

create index if not exists invites_email_idx on public.invites (email);
-- Hulpindex voor "welke uitnodigingen zijn nog bruikbaar".
create index if not exists invites_open_idx
  on public.invites (expires_at) where used_at is null;

alter table public.invites enable row level security;
-- GEEN policies: anon/authenticated mogen de tabel niet lezen of schrijven.
-- Supabase geeft standaard rechten aan anon/authenticated; die halen we hier weg.
revoke all on table public.invites from anon, authenticated;


-- ---------------------------------------------------------------------------
-- 2. TABEL invite_claims — kortlevend "bewijs" dat iemand het token heeft
--
--    Waarom een aparte tabel? Zonder deze stap zou een kwaadwillende die een
--    uitnodigings-e-mailadres kent (en dus geen token heeft) gewoon een account
--    kunnen aanmaken op dat adres en de uitnodiging verbranden. De RPC in stap 3
--    legt daarom eerst vast dát er met een geldig token is opgeëist, en de
--    trigger in stap 4 eist dat bewijs pas binnen 15 minuten.
-- ---------------------------------------------------------------------------
create table if not exists public.invite_claims (
  token      text primary key references public.invites (token) on delete cascade,
  claimed_at timestamptz not null default now()
);

alter table public.invite_claims enable row level security;
revoke all on table public.invite_claims from anon, authenticated;


-- ---------------------------------------------------------------------------
-- 3. RPC claim_invite(token) — de registratiepagina roept deze aan
--
--    Werkt als volgt:
--      - token onbekend / gebruikt / verlopen  -> valid = false
--      - token geldig                          -> valid = true + het e-mailadres
--                                                 waarvoor het token geldt
--      - er wordt een claim (max. 1 per token) weggeschreven; claims ouder dan
--        15 minuten worden opgeschoond
--    Dit is een security definer functie (dus ze omzeilt RLS) maar ALLES wat ze
--    retourneert is al op dit moment openbaar: alleen een geldig token levert de
--    email op. Er komt dus geen gevoelige informatie buiten.
-- ---------------------------------------------------------------------------
create or replace function public.claim_invite(in_token text)
returns table (valid boolean, email text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.invites%rowtype;
begin
  -- Oude claims opruimen.
  delete from public.invite_claims c
   where c.claimed_at < now() - interval '15 minutes';

  select i.* into v_row
    from public.invites i
   where i.token = in_token
     and i.used_at is null
     and i.expires_at > now()
   limit 1;

  if v_row.id is null then
    return query select false, null::text, null::timestamptz;
    return;
  end if;

  -- Eén claim per token; een tweede aanroep (bv. bij herladen van de pagina)
  -- is daarmee een no-op.
  insert into public.invite_claims (token, claimed_at)
  values (v_row.token, now())
  on conflict (token) do update set claimed_at = public.invite_claims.claimed_at;

  return query select true, v_row.email, v_row.expires_at;
end;
$$;

revoke all on function public.claim_invite(text) from public;
grant execute on function public.claim_invite(text) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- 4. TRIGGER op auth.users — de echte poortwachter
--
--    Elke poging om een account aan te maken (ongeacht van welke client of
--    welke key) loopt langs deze trigger. Geen geldige, net opgeëiste
--    uitnodiging voor dít e-mailadres? Dan wordt de insert geweigerd met de
--    fout `no_active_invite`.
--
--    Let op: dit gebeurt binnen dezelfde transactie als het aanmaken van het
--    account. Lukt het aanmaken daarna niet (bv. databasefout), dan wordt ook
--    het verbruik van de uitnodiging teruggedraaid — je verbrandt dus geen
--    uitnodiging door een mislukte poging.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_invite_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(coalesce(new.email, ''));
  v_token text;
begin
  select c.token into v_token
    from public.invite_claims c
    join public.invites i on i.token = c.token
   where i.email = v_email
     and i.used_at is null
     and i.expires_at > now()
     and c.claimed_at > now() - interval '15 minutes'
   order by c.claimed_at desc
   limit 1;

  if v_token is null then
    raise exception 'no_active_invite'
      using hint = 'Vraag een uitnodiging aan bij de beheerder.';
  end if;

  update public.invites
     set used_at = now(),
         used_by = new.id
   where token = v_token;

  delete from public.invite_claims where token = v_token;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_invite on auth.users;
create trigger on_auth_user_created_invite
  before insert on auth.users
  for each row execute function public.enforce_invite_on_signup();


-- ---------------------------------------------------------------------------
-- 5. ZELF-TEST (optioneel, na stap 1)
--    Controleer dat een onbekend token afkeurt. Gebruik `begin ... rollback;`
--    zodat er niets achterblijft.
-- ---------------------------------------------------------------------------
begin;
  -- Verwacht: valid = false (token bestaat niet)
  select * from public.claim_invite('bestaat-niet');
rollback;

-- Overzicht van alle uitnodigingen (alleen zichtbaar voor jou als beheerder):
-- select token, email, note, created_at, expires_at, used_at, used_by
--   from public.invites order by created_at desc;


-- ---------------------------------------------------------------------------
-- 6. UITNODIGING MAKEN — voer dit per gebruiker één keer uit.
--
--    Pas hieronder 'naam@voorbeeld.nl' aan, dan Run. De query geeft de token en
--    de volledige registratielink terug; stuur die link naar de persoon.
--    De link werkt tot expires_at (standaard 7 dagen, zie stap 1).
-- ---------------------------------------------------------------------------
insert into public.invites (token, email, note, expires_at)
values (
  encode(gen_random_bytes(16), 'hex'),   -- onleesbaar token
  'naam@voorbeeld.nl',                   -- <- e-mailadres van de gebruiker
  'toelating via mail',                  -- <- vrij notitieveld
  now() + interval '7 days'              -- <- geldigheid
)
returning
  'com.lijstjes.app://invite?token=' || token as registratielink,
  email,
  expires_at;
-- ^^^ De link opent de Android-app via een deep link. Het scheme staat in
--     android/app/src/main/res/values/strings.xml als `custom_url_scheme`
--     en is gekoppeld aan het package name `com.lijstjes.app`.
--
--     Er is dus GEEN webadres nodig. Let op:
--     - De link werkt pas op het apparaat waar de app geïnstalleerd is.
--     - Op het bureaublad van een computer doet `com.lijstjes.app://` niets.
--       Gebruik voor webtesten de handmatige variant: open de app met
--       `?invite=<token>` in de browser (zie task_02.md, A4).
--     - In WhatsApp of mail kunnen de tekens worden omgezet; stuur de link
--       als platte tekst en niet als " klikbare kaart".


-- ---------------------------------------------------------------------------
-- 7. BEHEER — nuttige beheervragen
-- ---------------------------------------------------------------------------

-- 7a. Alle uitnodigingen met hun status
-- select token, email, note,
--        expires_at,
--        case when used_at is not null then 'gebruikt op ' || used_at::date
--             when expires_at < now()  then 'verlopen'
--             else 'open' end as status
--   from public.invites order by created_at desc;

-- 7b. Een uitnodiging INTREKKEN (bijvoorbeeld: toch geen toegang)
-- update public.invites set used_at = now() where token = '<token>';

-- 7c. Een uitnodiging VERLENGEN (bijv. 14 dagen extra)
-- update public.invites
--    set expires_at = now() + interval '14 days', used_at = null
--  where token = '<token>';

-- 7d. Opruimen van verlopen/gebruikte uitnodigingen (privacy)
-- delete from public.invites
--  where used_at is not null or expires_at < now() - interval '30 days';


-- ============================================================================
-- CHECKLIST in Supabase (Authentication)
--
-- [ ] Providers > Email: AAN.
-- [ ] "Allow new users to sign up": AAN laten staan. De poortwachter is de
--     trigger uit stap 4, niet deze toggle. Staat hij uit, dan kan niemand meer
--     een account aanmaken, ook niet met een geldig token.
-- [ ] "Confirm email" (e-mailbevestiging): op UIT zetten (gekozen variant A).
--       Dan is de gebruiker na het aanmaken direct ingelogd en is er geen
--       bevestigingsmail nodig. De uitnodigingslink is daarmee het enige bewijs
--       van toegang: mail hem dus uitsluitend naar het echte adres van die persoon
--       en deel hem niet in een groepsbericht of kanaal waar anderen mee lezen.
--       Consequentie: er is geen "verstuur opnieuw"-knop in de app nodig. Blijkt
--       een registratie toch mislukken, dan maak je gewoon een nieuwe uitnodiging
--       (blok 6 hieronder).
-- [ ] URL Configuration > Site URL: `com.lijstjes.app://`
--       LET OP: dit is NIET het adres van een webpagina. De app is een Android-
--       app zonder webhost; de uitnodigingslink is een deep link met eigen
--       scheme. Supabase ondersteunt custom schemes expliciet voor mobiel.
-- [ ] URL Configuration > Redirect URLs: `com.lijstjes.app://`
--       Vul deze lijst óók in, ook al werkt het waarschijnlijk al met alleen de
--       Site URL: Supabase valt terug op de Site URL wanneer de gevraagde
--       redirect niet in de allow-list staat. Door de regel hier expliciet te
--       zetten is het niet afhankelijk van die terugval.
--       Alleen nodig voor de HERSTELMAAL van een wachtwoord. De registratie
--       zelf gebruikt geen redirect: "Confirm email" staat uit, dus `signUp`
--       geeft direct een sessie terug.
-- [ ] Emailing > SMTP: **bewust niet in te stellen.**
--     Er wordt GEEN eigen SMTP-provider gezet. Gevolg hiervan: de herstelmail
--     ("Wachtwoord vergeten?") gaat via de standaardaflevering van Supabase,
--     met een harde limiet van enkele mails per uur en een hoge kans op spam.
--     Beide zijn onbekend en dus onbetrouwbaar. Wie zijn wachtwoord kwijt is,
--     vraagt de beheerder om een nieuw account of om een nieuw wachtwoord.
--     Er zijn verder geen bevestigingsmails, want "Confirm email" staat uit.
-- ============================================================================
