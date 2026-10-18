create table if not exists public.event_finance_costs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  amount numeric(12,2) not null check (amount > 0),
  incurred_on date not null default current_date,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists event_finance_costs_event_idx
on public.event_finance_costs(event_id, incurred_on);

alter table public.event_finance_costs enable row level security;

drop policy if exists "finance managers can manage event costs" on public.event_finance_costs;
create policy "finance managers can manage event costs"
on public.event_finance_costs for all to authenticated
using (public.can_manage_finance()) with check (public.can_manage_finance());

revoke all on public.event_finance_costs from anon, authenticated;
grant select, insert, update, delete on public.event_finance_costs to authenticated;

drop trigger if exists event_finance_costs_updated_at on public.event_finance_costs;
create trigger event_finance_costs_updated_at
before update on public.event_finance_costs
for each row execute function public.set_updated_at();

-- A divisão considera receita depois dos custos operacionais: primeiro custos,
-- depois dízimo, depois rateio da equipe. Redefine a RPC criada na migration 017.
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
  costs_total numeric(12,2);
  operating_result numeric(12,2);
  tithe numeric(12,2);
  distributable numeric(12,2);
  percentage_total numeric(9,4);
  fixed_total numeric(12,2);
  payout_total numeric(12,2);
begin
  if not public.can_manage_finance() then
    raise exception 'Apenas gestores, administradores e proprietários podem editar o Financeiro.';
  end if;
  if target_event_id is null or target_tithe_mode not in ('percentage', 'fixed') then
    raise exception 'Evento ou modo de dízimo inválido.';
  end if;
  if target_tithe_percent is null or target_tithe_percent < 0 or target_tithe_percent > 100
     or target_tithe_fixed_amount is null or target_tithe_fixed_amount < 0 then
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
  select coalesce(sum(amount), 0) into costs_total
  from public.event_finance_costs where event_id = target_event_id;
  operating_result := collected - costs_total;

  tithe := case when target_tithe_mode = 'percentage'
    then round(greatest(0, operating_result) * target_tithe_percent / 100, 2)
    else target_tithe_fixed_amount end;
  if tithe > greatest(0, operating_result) then
    raise exception 'O dízimo não pode exceder o resultado disponível após custos.';
  end if;
  distributable := greatest(0, operating_result - tithe);

  select coalesce(sum((entry->>'percentage')::numeric), 0)
    into percentage_total
  from jsonb_array_elements(coalesce(target_allocations, '[]'::jsonb)) as shares(entry)
  where coalesce(entry->>'calculation_mode', 'percentage') = 'percentage';
  select coalesce(sum((entry->>'fixed_amount')::numeric), 0)
    into fixed_total
  from jsonb_array_elements(coalesce(target_allocations, '[]'::jsonb)) as shares(entry)
  where coalesce(entry->>'calculation_mode', 'percentage') = 'fixed';

  payout_total := round(distributable * percentage_total / 100, 2) + fixed_total;
  if percentage_total > 100 or payout_total > distributable + 0.01 then
    raise exception 'A divisão da equipe excede o saldo após custos e dízimo.';
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
  costs_total numeric(12,2);
  operating_after numeric(12,2);
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
  select coalesce(sum(amount), 0) into costs_total
  from public.event_finance_costs where event_id = receipt.event_id;
  operating_after := collected_after - costs_total;

  select * into setting from public.event_finance_settings where event_id = receipt.event_id;
  tithe_after := case
    when coalesce(setting.tithe_mode, 'percentage') = 'fixed' then coalesce(setting.tithe_fixed_amount, 0)
    else round(greatest(0, operating_after) * coalesce(setting.tithe_percent, 10) / 100, 2)
  end;
  if tithe_after > greatest(0, operating_after) then
    raise exception 'O estorno deixaria o dízimo acima do resultado disponível após custos.';
  end if;
  distributable_after := greatest(0, operating_after - tithe_after);

  select coalesce(sum(percentage), 0) into percentage_total
  from public.event_finance_allocations
  where event_id = receipt.event_id and calculation_mode = 'percentage';
  select coalesce(sum(fixed_amount), 0) into fixed_total
  from public.event_finance_allocations
  where event_id = receipt.event_id and calculation_mode = 'fixed';
  if round(distributable_after * percentage_total / 100, 2) + fixed_total > distributable_after + 0.01 then
    raise exception 'O estorno deixaria os repasses acima do saldo. Ajuste custos ou divisão antes de estornar.';
  end if;

  update public.event_finance_receipts set voided_at = now() where id = target_receipt_id;
end;
$$;

revoke all on function public.void_event_finance_receipt(uuid) from public;
grant execute on function public.void_event_finance_receipt(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'event_finance_costs'
  ) then
    alter publication supabase_realtime add table public.event_finance_costs;
  end if;
end;
$$;
