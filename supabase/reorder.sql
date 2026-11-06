-- Volgorde opslaan in één request (AGENTS.md §7.3, fase 9 / V4).
--
-- Voer dit script uit in de SQL Editor van je Supabase-project, ná
-- supabase/schema.sql en supabase/verification.sql. Het is idempotent: veilig
-- om opnieuw uit te voeren.
--
-- Zonder dit script werkt de app ook: dan valt hij terug op één update per
-- item (meer verkeer, en bij een verbroken verbinding kan een volgorde half
-- opgeslagen raken). Met dit script is een herschikking één request en één
-- statement: alles of niets.
--
-- Beveiliging: beide functies draaien met de rechten van de aanroeper
-- (`security invoker`). De bestaande RLS-regels gelden dus onverkort: alleen
-- eigen lijsten en alleen met een bevestigd e-mailadres. Niet-ingelogde
-- bezoekers (`anon`) mogen ze niet aanroepen.

create or replace function public.reorder_items(
  p_list_id uuid,
  p_item_ids uuid[]
)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.list_items as li
     set position = (o.ord - 1)::integer
    from unnest(p_item_ids) with ordinality as o(id, ord)
   where li.id = o.id
     and li.list_id = p_list_id;
$$;

create or replace function public.reorder_lists(p_list_ids uuid[])
returns void
language sql
security invoker
set search_path = public
as $$
  -- Ook expliciet op de eigenaar (defense in depth, AGENTS.md §7.1).
  update public.lists as l
     set position = (o.ord - 1)::integer
    from unnest(p_list_ids) with ordinality as o(id, ord)
   where l.id = o.id
     and l.owner_id = auth.uid();
$$;

revoke all on function public.reorder_items(uuid, uuid[]) from public, anon;
revoke all on function public.reorder_lists(uuid[]) from public, anon;
grant execute on function public.reorder_items(uuid, uuid[]) to authenticated;
grant execute on function public.reorder_lists(uuid[]) to authenticated;

-- De API (PostgREST) de nieuwe functies meteen laten zien.
notify pgrst, 'reload schema';

-- Controle na het uitvoeren:
-- 1. In de app een item of lijst verslepen. In de netwerktab van de browser
--    staat dan één POST naar /rest/v1/rpc/reorder_items (of reorder_lists)
--    in plaats van een PATCH per item.
-- 2. Na herladen staat de nieuwe volgorde er nog.
