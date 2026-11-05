-- Completa a 002_menus.sql, que criou menus e menu_services mas nao aplicou
-- as duas Instructions que alteram a tabela quotes.
alter table public.quotes
  add column if not exists menu_id uuid references public.menus(id) on delete set null;

create index if not exists quotes_menu_id_idx on public.quotes(menu_id);

-- Cardapio passa a pertencer a um servico. A coluna substitui a consulta em
-- menu_services feita no carregamento dos cardapios.
alter table public.menus
  add column if not exists service_id uuid references public.services(id) on delete set null;

-- Migrar os vinculos ja cadastrados na tabela de ligacao para a nova coluna.
update public.menus m
set service_id = links.service_id
from (
  select distinct on (menu_id) menu_id, service_id
  from public.menu_services
  order by menu_id, sort_order, service_id
) links
where m.id = links.menu_id
  and m.service_id is null;

create index if not exists menus_service_id_idx on public.menus(service_id);
