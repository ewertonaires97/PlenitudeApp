-- Um cardapio pode participar de varios servicos (N:N).
-- O vinculo passa a morer em menu_services, que ja existia desde a 002 e estava
-- sem uso. A coluna menus.service_id, criada pela 010, e removida depois de
-- copiar os dados para a tabela de ligacao, para nao sobrar fonte duplicada.

create table if not exists public.menu_services (
  menu_id uuid not null references public.menus(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  sort_order integer not null default 0,
  primary key (menu_id, service_id)
);

-- Leva para menu_services os vinculos hoje gravados em menus.service_id.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'menus' and column_name = 'service_id'
  ) then
    execute $mig$
      insert into public.menu_services (menu_id, service_id)
      select id, service_id from public.menus where service_id is not null
      on conflict (menu_id, service_id) do nothing
    $mig$;
    execute 'drop index if exists public.menus_service_id_idx';
    execute 'alter table public.menus drop column if exists service_id';
  end if;
end
$$;

alter table public.menu_services enable row level security;

drop policy if exists "authenticated users can manage menu services" on public.menu_services;
create policy "authenticated users can manage menu services"
on public.menu_services for all to authenticated using (true) with check (true);

create index if not exists menu_services_service_id_idx on public.menu_services(service_id);
