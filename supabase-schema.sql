-- Voer dit script uit in de SQL Editor van je Supabase-project.
-- Het script is idempotent: veilig om opnieuw uit te voeren.
-- Voor gebruik op meerdere apparaten meldt de app in met hetzelfde e-mailaccount.

create table if not exists public.lists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 160),
  done boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

-- Voor bestaande databases waar `lists.position` nog ontbreekt (idempotent).
alter table public.lists add column if not exists position integer not null default 0;

alter table public.lists enable row level security;
alter table public.list_items enable row level security;

-- Helpers voor RLS: een lijst "bezit" de gebruiker.
create index if not exists lists_owner_id_idx on public.lists (owner_id);
create index if not exists list_items_list_id_idx on public.list_items (list_id);

-- ---- Grendel op e-mailbevestiging (AGENTS.md §7.6) ----
-- Alleen een gebruiker met een bevestigd e-mailadres mag iets lezen/schrijven.
-- Security definer omdat `authenticated` `auth.users` niet mag lezen; de functie
-- geeft alleen een boolean terug en lekt niets.
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

-- ---- RLS-beleid: gesplitst per operatie (select/insert/update/delete) ----
-- Gebruikers kunnen uitsluitend hun EIGEN lijsten/items zien en bewerken.
-- De client filtert daarnaast expliciet op `owner_id = auth.uid()`;
-- RLS is de tweede verdedigingslaag (defense in depth).

drop policy if exists "Users manage their own lists" on public.lists;
drop policy if exists "Users manage items in their own lists" on public.list_items;

drop policy if exists "lists_select_own" on public.lists;
drop policy if exists "lists_insert_own" on public.lists;
drop policy if exists "lists_update_own" on public.lists;
drop policy if exists "lists_delete_own" on public.lists;

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

drop policy if exists "items_select_own" on public.list_items;
drop policy if exists "items_insert_own" on public.list_items;
drop policy if exists "items_update_own" on public.list_items;
drop policy if exists "items_delete_own" on public.list_items;

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

-- Schakel in Authentication > Providers > Email in, zet "Confirm email" AAN en
-- kies een passend e-mailbeleid. Zie supabase-verification.sql voor de volledige
-- checklist en het e-mailtemplate.