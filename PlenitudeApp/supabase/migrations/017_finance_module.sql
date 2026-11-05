-- Financeiro: acesso gerencial, recebimentos e divisão da receita por evento.

insert into public.app_permissions (key, label, description, icon, sort_order)
values ('financeiro', 'Financeiro', 'Receitas recebidas, dízimo e divisão da equipe por evento.', 'landmark', 11)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.app_role_permissions (role_code, permission)
values ('gestor', 'financeiro')
on conflict do nothing;

-- Proprietários, administradores e gestores sempre têm acesso ao Financeiro,
-- inclusive quando alguém definiu permissões específicas para o perfil gestor.
create or replace function public.effective_permissions(
  target_role text,
  target_permissions text[],
  target_active boolean
)
returns text[]
language sql
stable
as $$
  select case
    when target_active is false then array[]::text[]
    when target_role in ('owner', 'admin') then array(select ap.key from public.app_permissions ap order by ap.sort_order)
    when target_role = 'gestor' and target_permissions is not null then
      array(select distinct permission_item from unnest(target_permissions || array['financeiro']::text[]) as permissions(permission_item) order by permission_item)
    when target_permissions is not null then
      array(select permission_item from unnest(target_permissions) as permissions(permission_item) where permission_item <> 'financeiro')
    else array(select rp.permission from public.app_role_permissions rp where rp.role_code = target_role and rp.permission <> 'financeiro')
  end;
$$;

create or replace function public.can_manage_finance()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.active is true
      and p.role in ('owner', 'admin', 'gestor')
  );
$$;

create table if not exists public.event_finance_settings (
  event_id uuid primary key references public.events(id) on delete cascade,
  tithe_mode text not null default 'percentage' check (tithe_mode in ('percentage', 'fixed')),
  tithe_percent numeric(7,4) not null default 10 check (tithe_percent between 0 and 100),
  tithe_fixed_amount numeric(12,2) not null default 0 check (tithe_fixed_amount >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.event_finance_receipts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  received_on date not null default current_date,
  payment_method text not null default 'pix' check (payment_method in ('pix', 'cash', 'card', 'transfer', 'other')),
  notes text,
  voided_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.event_finance_allocations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  ceremonialista_id uuid references public.ceremonialistas(id) on delete set null,
  participant_name text not null,
  calculation_mode text not null default 'percentage' check (calculation_mode in ('percentage', 'fixed')),
  percentage numeric(7,4) not null default 0 check (percentage between 0 and 100),
  fixed_amount numeric(12,2) not null default 0 check (fixed_amount >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists event_finance_receipts_event_idx on public.event_finance_receipts(event_id, received_on);
create index if not exists event_finance_allocations_event_idx on public.event_finance_allocations(event_id, sort_order);

alter table public.event_finance_settings enable row level security;
alter table public.event_finance_receipts enable row level security;
alter table public.event_finance_allocations enable row level security;

drop policy if exists "finance managers can read event finance settings" on public.event_finance_settings;
create policy "finance managers can read event finance settings"
on public.event_finance_settings for select to authenticated using (public.can_manage_finance());

drop policy if exists "finance managers can read receipts" on public.event_finance_receipts;
create policy "finance managers can read receipts"
on public.event_finance_receipts for select to authenticated using (public.can_manage_finance());
drop policy if exists "finance managers can add receipts" on public.event_finance_receipts;
create policy "finance managers can add receipts"
on public.event_finance_receipts for insert to authenticated with check (public.can_manage_finance());
drop policy if exists "finance managers can void receipts" on public.event_finance_receipts;

drop policy if exists "finance managers can read allocations" on public.event_finance_allocations;
create policy "finance managers can read allocations"
on public.event_finance_allocations for select to authenticated using (public.can_manage_finance());

revoke all on function public.can_manage_finance() from public;
grant execute on function public.can_manage_finance() to authenticated;
revoke all on public.event_finance_settings, public.event_finance_receipts, public.event_finance_allocations from anon, authenticated;
grant select on public.event_finance_settings, public.event_finance_allocations to authenticated;
grant select, insert on public.event_finance_receipts to authenticated;

-- A substituição atômica evita deixar divisão parcial salva. Percentuais incidem
-- sobre o valor recebido depois do dízimo; valores fixos usam o mesmo saldo.
create or replace function public.save_event_finance(
  target_event_id uuid,
  target_tithe_mode text,
  target_tithe_percent numeric,
  target_tithe_fixed_amount numeric,
  target_allocations jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  collected numeric(12,2);
  tithe numeric(12,2);
  distributable numeric(12,2);
  percentage_total numeric(9,4);
  fixed_total numeric(12,2);
  payout_total numeric(12,2);
begin
  if not public.can_manage_finance() then
    raise exception 'Apenas gestores, administradores e proprietários podem editar o Financeiro.';
  end if;
  if target_tithe_mode not in ('percentage', 'fixed') then
    raise exception 'Modo de dízimo inválido.';
  end if;
  if target_tithe_percent < 0 or target_tithe_percent > 100 or target_tithe_fixed_amount < 0 then
    raise exception 'Informe valores válidos para o dízimo.';
  end if;
  if not exists (select 1 from public.events where id = target_event_id) then
    raise exception 'Evento não encontrado.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(target_allocations, '[]'::jsonb)) as shares(entry)
    where nullif(entry->>'ceremonialista_id', '') is not null
      and not exists (
        select 1 from public.ceremonialistas c
        where c.id = (entry->>'ceremonialista_id')::uuid
          and (c.event_id = target_event_id or c.event_id is null)
      )
  ) then
    raise exception 'Uma pessoa selecionada não pertence à equipe deste evento.';
  end if;

  select coalesce(sum(amount), 0) into collected
  from public.event_finance_receipts
  where event_id = target_event_id and voided_at is null;

  tithe := case when target_tithe_mode = 'percentage'
    then round(collected * target_tithe_percent / 100, 2)
    else target_tithe_fixed_amount end;
  distributable := collected - tithe;
  if distributable < 0 then raise exception 'O dízimo não pode exceder o valor recebido.'; end if;

  select coalesce(sum((entry->>'percentage')::numeric), 0),
         coalesce(sum((entry->>'fixed_amount')::numeric), 0)
    into percentage_total, fixed_total
  from jsonb_array_elements(coalesce(target_allocations, '[]'::jsonb)) as shares(entry)
  where coalesce(entry->>'calculation_mode', 'percentage') = 'percentage';

  select coalesce(sum((entry->>'fixed_amount')::numeric), 0)
    into fixed_total
  from jsonb_array_elements(coalesce(target_allocations, '[]'::jsonb)) as shares(entry)
  where coalesce(entry->>'calculation_mode', 'percentage') = 'fixed';

  payout_total := round(distributable * percentage_total / 100, 2) + fixed_total;
  if percentage_total > 100 or payout_total > distributable + 0.01 then
    raise exception 'A divisão da equipe excede o saldo após o dízimo.';
  end if;

  insert into public.event_finance_settings (event_id, tithe_mode, tithe_percent, tithe_fixed_amount, updated_at, updated_by)
  values (target_event_id, target_tithe_mode, target_tithe_percent, target_tithe_fixed_amount, now(), auth.uid())
  on conflict (event_id) do update set
    tithe_mode = excluded.tithe_mode,
    tithe_percent = excluded.tithe_percent,
    tithe_fixed_amount = excluded.tithe_fixed_amount,
    updated_at = now(),
    updated_by = auth.uid();

  delete from public.event_finance_allocations where event_id = target_event_id;
  insert into public.event_finance_allocations (
    event_id, ceremonialista_id, participant_name, calculation_mode, percentage, fixed_amount, sort_order
  )
  select target_event_id,
         nullif(entry->>'ceremonialista_id', '')::uuid,
         btrim(entry->>'participant_name'),
         coalesce(entry->>'calculation_mode', 'percentage'),
         coalesce((entry->>'percentage')::numeric, 0),
         coalesce((entry->>'fixed_amount')::numeric, 0),
         coalesce((entry->>'sort_order')::integer, 0)
  from jsonb_array_elements(coalesce(target_allocations, '[]'::jsonb)) as shares(entry)
  where nullif(btrim(entry->>'participant_name'), '') is not null;
end;
$$;

revoke all on function public.save_event_finance(uuid, text, numeric, numeric, jsonb) from public;
grant execute on function public.save_event_finance(uuid, text, numeric, numeric, jsonb) to authenticated;

create or replace function public.void_event_finance_receipt(target_receipt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  receipt public.event_finance_receipts;
  setting public.event_finance_settings;
  collected_after numeric(12,2);
  tithe_after numeric(12,2);
  distributable_after numeric(12,2);
  percentage_total numeric(9,4);
  fixed_total numeric(12,2);
begin
  if not public.can_manage_finance() then
    raise exception 'Apenas gestores, administradores e proprietários podem editar o Financeiro.';
  end if;
  select * into receipt from public.event_finance_receipts where id = target_receipt_id for update;
  if not found then raise exception 'Recebimento não encontrado.'; end if;
  if receipt.voided_at is not null then return; end if;

  select coalesce(sum(amount), 0) into collected_after
  from public.event_finance_receipts
  where event_id = receipt.event_id and voided_at is null and id <> target_receipt_id;

  select * into setting from public.event_finance_settings where event_id = receipt.event_id;
  tithe_after := case
    when coalesce(setting.tithe_mode, 'percentage') = 'fixed' then coalesce(setting.tithe_fixed_amount, 0)
    else round(collected_after * coalesce(setting.tithe_percent, 10) / 100, 2)
  end;
  distributable_after := collected_after - tithe_after;
  if distributable_after < 0 then
    raise exception 'O estorno deixaria o dízimo acima do total recebido.';
  end if;

  select coalesce(sum(percentage), 0), coalesce(sum(fixed_amount), 0)
    into percentage_total, fixed_total
  from public.event_finance_allocations
  where event_id = receipt.event_id and calculation_mode = 'percentage';
  select coalesce(sum(fixed_amount), 0) into fixed_total
  from public.event_finance_allocations
  where event_id = receipt.event_id and calculation_mode = 'fixed';
  if round(distributable_after * percentage_total / 100, 2) + fixed_total > distributable_after + 0.01 then
    raise exception 'O estorno deixaria os repasses acima do saldo. Ajuste a divisão antes de estornar.';
  end if;

  update public.event_finance_receipts set voided_at = now() where id = target_receipt_id;
end;
$$;

revoke all on function public.void_event_finance_receipt(uuid) from public;
grant execute on function public.void_event_finance_receipt(uuid) to authenticated;

-- Financeiro pode consultar os eventos, orçamentos e equipe necessários para
-- calcular receita recebida sem ganhar acesso às respectivas telas de edição.
drop policy if exists "finance managers can read events" on public.events;
create policy "finance managers can read events" on public.events
for select to authenticated using (public.can_manage_finance());
drop policy if exists "finance managers can read confirmed quotes" on public.quotes;
create policy "finance managers can read confirmed quotes" on public.quotes
for select to authenticated using (public.can_manage_finance());
drop policy if exists "finance managers can read quote items" on public.quote_items;
create policy "finance managers can read quote items" on public.quote_items
for select to authenticated using (public.can_manage_finance());
drop policy if exists "finance managers can read event team" on public.ceremonialistas;
create policy "finance managers can read event team" on public.ceremonialistas
for select to authenticated using (public.can_manage_finance());

drop policy if exists "finance managers can read client names" on public.clients;
create policy "finance managers can read client names" on public.clients
for select to authenticated using (public.can_manage_finance());

-- Realtime do rateio e dos recebimentos para os gestores com o painel aberto.
do $$
declare
  table_name text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'create publication supabase_realtime';
  end if;
  foreach table_name in array array[
    'event_finance_settings',
    'event_finance_receipts',
    'event_finance_allocations'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;