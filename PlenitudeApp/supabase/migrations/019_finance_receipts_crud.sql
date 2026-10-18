create or replace function public.assert_event_finance_receipt_balance(
  target_event_id uuid,
  target_receipt_id uuid,
  target_replacement_amount numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
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

  perform 1 from public.events where id = target_event_id for update;
  if not found then raise exception 'Evento não encontrado.'; end if;

  select coalesce(sum(amount), 0) into collected_after
  from public.event_finance_receipts
  where event_id = target_event_id
    and voided_at is null
    and (target_receipt_id is null or id <> target_receipt_id);
  collected_after := collected_after + coalesce(target_replacement_amount, 0);

  select coalesce(sum(amount), 0) into costs_total
  from public.event_finance_costs where event_id = target_event_id;
  operating_after := collected_after - costs_total;

  select * into setting from public.event_finance_settings where event_id = target_event_id;
  tithe_after := case
    when coalesce(setting.tithe_mode, 'percentage') = 'fixed' then coalesce(setting.tithe_fixed_amount, 0)
    else round(greatest(0, operating_after) * coalesce(setting.tithe_percent, 10) / 100, 2)
  end;
  if tithe_after > greatest(0, operating_after) then
    raise exception 'A alteração deixaria o dízimo acima do resultado disponível após custos.';
  end if;
  distributable_after := greatest(0, operating_after - tithe_after);

  select coalesce(sum(percentage), 0) into percentage_total
  from public.event_finance_allocations
  where event_id = target_event_id and calculation_mode = 'percentage';
  select coalesce(sum(fixed_amount), 0) into fixed_total
  from public.event_finance_allocations
  where event_id = target_event_id and calculation_mode = 'fixed';
  if round(distributable_after * percentage_total / 100, 2) + fixed_total > distributable_after + 0.01 then
    raise exception 'A alteração deixaria os repasses acima do saldo. Ajuste custos ou divisão antes de continuar.';
  end if;
end;
$$;

create or replace function public.save_event_finance_receipt(
  target_receipt_id uuid,
  target_event_id uuid,
  target_amount numeric,
  target_received_on date,
  target_payment_method text,
  target_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  receipt_event_id uuid;
  receipt_voided_at timestamptz;
begin
  if not public.can_manage_finance() then
    raise exception 'Apenas gestores, administradores e proprietários podem editar o Financeiro.';
  end if;
  if target_event_id is null or target_amount is null or target_amount <= 0
     or target_received_on is null
      or target_payment_method is null
      or target_payment_method not in ('pix', 'cash', 'card', 'transfer', 'other') then
    raise exception 'Informe valores válidos para o recebimento.';
  end if;

  if target_receipt_id is not null then
    select event_id, voided_at into receipt_event_id, receipt_voided_at
    from public.event_finance_receipts where id = target_receipt_id for update;
    if not found then raise exception 'Recebimento não encontrado.'; end if;
    if receipt_event_id <> target_event_id then raise exception 'O recebimento não pertence a este evento.'; end if;
    if receipt_voided_at is not null then raise exception 'Recebimentos estornados não podem ser editados.'; end if;
  end if;

  perform public.assert_event_finance_receipt_balance(target_event_id, target_receipt_id, target_amount);

  if target_receipt_id is null then
    insert into public.event_finance_receipts (event_id, amount, received_on, payment_method, notes, created_by)
    values (target_event_id, target_amount, target_received_on, target_payment_method, target_notes, auth.uid());
  else
    update public.event_finance_receipts
    set amount = target_amount,
        received_on = target_received_on,
        payment_method = target_payment_method,
        notes = target_notes
    where id = target_receipt_id;
  end if;
end;
$$;

create or replace function public.delete_event_finance_receipt(target_receipt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  receipt_event_id uuid;
  receipt_voided_at timestamptz;
begin
  if not public.can_manage_finance() then
    raise exception 'Apenas gestores, administradores e proprietários podem editar o Financeiro.';
  end if;
  select event_id, voided_at into receipt_event_id, receipt_voided_at
  from public.event_finance_receipts where id = target_receipt_id for update;
  if not found then raise exception 'Recebimento não encontrado.'; end if;
  if receipt_voided_at is not null then raise exception 'Recebimentos estornados não podem ser excluídos.'; end if;

  perform public.assert_event_finance_receipt_balance(receipt_event_id, target_receipt_id, null);
  delete from public.event_finance_receipts where id = target_receipt_id;
end;
$$;

revoke insert on public.event_finance_receipts from authenticated;
revoke all on function public.assert_event_finance_receipt_balance(uuid, uuid, numeric) from public;
revoke all on function public.save_event_finance_receipt(uuid, uuid, numeric, date, text, text) from public;
revoke all on function public.delete_event_finance_receipt(uuid) from public;
grant execute on function public.save_event_finance_receipt(uuid, uuid, numeric, date, text, text) to authenticated;
grant execute on function public.delete_event_finance_receipt(uuid) to authenticated;