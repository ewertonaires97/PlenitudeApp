-- Validade do orçamento e sinal de confirmação.
--
-- O sinal é um fato comercial do orçamento, não um recebimento do evento: o
-- evento só nasce quando o orçamento vira 'confirmed' (create_event_when_quote_
-- confirmed), e o Financeiro só enxerga eventos com orçamento confirmado. Por
-- isso o sinal vive em quote_deposits e é lançado no caixa do evento no mesmo
-- instante em que o evento passa a existir, com quote_deposit_id ligando as duas
-- pontas. Um depósito gera no máximo um recebimento, então nada é contado duas
-- vezes e o estorno do sinal estorna o caixa.

-- Validade e sinal ----------------------------------------------------------
alter table public.quotes
  add column if not exists valid_until date,
  add column if not exists deposit_percent numeric(5,2) not null default 0
    check (deposit_percent between 0 and 100),
  add column if not exists deposited_amount numeric(12,2) not null default 0
    check (deposited_amount >= 0),
  -- Confirma o orçamento sozinho, e só quando o sinal cobre o exigido.
  add column if not exists confirmed_by_deposit boolean not null default false;

-- Valor do sinal derivado do total: recalcula sozinho quando os itens mudam,
-- sem depender de o cliente lembrar de reajustar o percentual.
alter table public.quotes
  add column if not exists deposit_amount numeric(12,2)
    generated always as (round(total * deposit_percent / 100, 2)) stored;

create index if not exists quotes_expiring_idx on public.quotes (valid_until)
  where status = 'sent';

-- Backfill: orçamentos já enviados passam a ter 20 dias de validade a partir de
-- hoje, que é o mesmo prazo padrão usado em novos orçamentos.
update public.quotes
set valid_until = current_date + 20
where valid_until is null and status in ('sent', 'expired');

-- Sinal ---------------------------------------------------------------------
create table if not exists public.quote_deposits (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  paid_on date not null default current_date,
  payment_method text not null default 'pix'
    check (payment_method in ('pix', 'cash', 'card', 'transfer', 'other')),
  notes text,
  voided_at timestamptz,
  -- Instante em que o sinal entrou no caixa do evento; trava contra duplicata.
  posted_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists quote_deposits_quote_idx on public.quote_deposits (quote_id);

alter table public.event_finance_receipts
  add column if not exists quote_deposit_id uuid unique
    references public.quote_deposits(id) on delete set null;

-- A coluna já é unique: um depósito ativo, no máximo um recebimento vinculado.
drop index if exists event_finance_receipts_deposit_idx;

drop trigger if exists quote_deposits_updated_at on public.quote_deposits;
create trigger quote_deposits_updated_at before update on public.quote_deposits
  for each row execute function public.set_updated_at();

-- Um único trigger faz as três coisas em ordem: atualiza o total pago, fecha o
-- orçamento quando o sinal cobre o exigido e lança o que ainda não foi lançado.
-- Disparar junto evita depender da ordem alfabética entre dois triggers.
create or replace function public.apply_quote_deposit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_quote uuid := coalesce(new.quote_id, old.quote_id);
  quote_row public.quotes%rowtype;
  target_event uuid;
  paid numeric(12,2);
  pending record;
begin
  select * into quote_row from public.quotes where id = target_quote;
  if not found then return coalesce(new, old); end if;

  select coalesce(sum(amount), 0) into paid
  from public.quote_deposits
  where quote_id = target_quote and voided_at is null;

  update public.quotes set deposited_amount = paid where id = target_quote;

  -- O sinal cobre o exigido: o orçamento confirma e o evento nasce.
  if quote_row.deposit_amount > 0
     and paid + 0.01 >= quote_row.deposit_amount
     and quote_row.status in ('draft', 'sent', 'expired') then
    if quote_row.event_date is null then
      raise exception 'Informe a data do evento antes de registrar o sinal.';
    end if;
    update public.quotes
    set status = 'confirmed', confirmed_by_deposit = true
    where id = target_quote;
    select * into quote_row from public.quotes where id = target_quote;
  end if;

  -- Perdeu a cobertura do sinal e tinha sido o próprio sinal que confirmou:
  -- volta para enviado. O evento já criado é preservado de propósito, porque
  -- pode ter custos e rateio vinculados a ele.
  if quote_row.confirmed_by_deposit
     and (quote_row.deposit_amount <= 0 or paid + 0.01 < quote_row.deposit_amount) then
    update public.quotes
    set status = 'sent', confirmed_by_deposit = false
    where id = target_quote and status = 'confirmed';
  end if;

  select id into target_event from public.events where quote_id = target_quote;

  -- Só existe caixa a partir do evento. Cada depósito vira um recebimento, com a
  -- própria data e forma de pagamento, o que preserva a trilha de parcelas.
  if target_event is not null then
    for pending in
      select id, amount, paid_on, payment_method
      from public.quote_deposits
      where quote_id = target_quote and voided_at is null and posted_at is null
      order by paid_on, created_at
    loop
      insert into public.event_finance_receipts
        (event_id, amount, received_on, payment_method, notes, quote_deposit_id, created_by)
      values
        (target_event, pending.amount, pending.paid_on, pending.payment_method,
         'Sinal do orçamento #' || lpad(quote_row.quote_number::text, 4, '0'),
         pending.id, auth.uid());
      update public.quote_deposits set posted_at = now() where id = pending.id;
    end loop;
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function public.refresh_quote_expiry()
returns trigger
language plpgsql
as $$
begin
  -- Prorrogou a validade depois de vencida: volta a valer.
  if new.status = 'expired' and new.valid_until >= current_date then
    update public.quotes set status = 'sent' where id = new.id and status = 'expired';
  -- Venceu sem sinal completo. Só o que já foi enviado ao cliente expira; o
  -- rascunho é material de trabalho interno e continua editável.
  elsif new.status = 'sent'
        and new.valid_until is not null and new.valid_until < current_date
        and new.deposit_amount > 0 and new.deposited_amount + 0.01 < new.deposit_amount then
    update public.quotes set status = 'expired' where id = new.id and status = 'sent';
  end if;
  return new;
end;
$$;

drop trigger if exists quote_deposits_apply on public.quote_deposits;
create trigger quote_deposits_apply after insert or update or delete on public.quote_deposits
  for each row execute function public.apply_quote_deposit();

-- AFTER para não disputar o NEW com create_event_when_quote_confirmed, que é
-- BEFORE e também escreve em quotes.
drop trigger if exists quotes_expiry on public.quotes;
create trigger quotes_expiry after update on public.quotes
  for each row execute function public.refresh_quote_expiry();

-- API -----------------------------------------------------------------------
create or replace function public.register_quote_deposit(
  target_quote_id uuid,
  target_amount numeric,
  target_paid_on date,
  target_payment_method text,
  target_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  quote_row public.quotes%rowtype;
  deposit_id uuid;
  paid_after numeric(12,2);
begin
  select * into quote_row from public.quotes where id = target_quote_id for update;
  if not found then raise exception 'Orçamento não encontrado.'; end if;
  if quote_row.status = 'cancelled' then
    raise exception 'Orçamentos cancelados não aceitam sinal.';
  end if;
  if target_amount is null or target_amount <= 0 or target_paid_on is null
     or target_payment_method is null
     or target_payment_method not in ('pix', 'cash', 'card', 'transfer', 'other') then
    raise exception 'Informe valor, data e forma de pagamento válidos para o sinal.';
  end if;

  insert into public.quote_deposits
    (quote_id, amount, paid_on, payment_method, notes, created_by)
  values
    (target_quote_id, target_amount, target_paid_on, target_payment_method,
     nullif(btrim(target_notes), ''), auth.uid())
  returning id into deposit_id;

  select coalesce(sum(amount), 0) into paid_after
  from public.quote_deposits
  where quote_id = target_quote_id and voided_at is null;

  return deposit_id;
end;
$$;

create or replace function public.void_quote_deposit(target_deposit_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  deposit_row public.quote_deposits%rowtype;
  linked_event uuid;
begin
  select * into deposit_row from public.quote_deposits where id = target_deposit_id for update;
  if not found then raise exception 'Sinal não encontrado.'; end if;
  if deposit_row.voided_at is not null then return; end if;

  if deposit_row.posted_at is not null then
    select event_id into linked_event
    from public.event_finance_receipts where quote_deposit_id = target_deposit_id;
    -- Estornar o sinal não pode deixar a divisão da equipe acima do saldo. A
    -- verificação é a mesma do Financeiro, com um caminho próprio para quem
    -- opera orçamentos sem permissão financeira: nesse caso o estorno é
    -- recusado com uma mensagem que diz o que falta, em vez de vazar erro de
    -- permissão do módulo de origem.
    if linked_event is not null then
      if public.can_manage_finance() then
        perform public.assert_event_finance_receipt_balance(linked_event, null, -deposit_row.amount);
      else
        raise exception 'Este sinal já entrou no Financeiro do evento. Estorná-lo exige permissão de Financeiro.';
      end if;
    end if;
    update public.event_finance_receipts set voided_at = now()
    where quote_deposit_id = target_deposit_id and voided_at is null;
  end if;

  update public.quote_deposits set voided_at = now() where id = target_deposit_id;
end;
$$;

-- Expiração é derivada da data, não agendada: o app chama ao abrir a lista, o
-- que mantém o estado correto sem depender de nenhum job no servidor.
create or replace function public.expire_overdue_quotes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  update public.quotes q
  set status = 'expired'
  where q.status = 'sent'
    and q.valid_until is not null and q.valid_until < current_date
    and q.deposit_amount > 0 and q.deposited_amount + 0.01 < q.deposit_amount;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on public.quote_deposits from anon, authenticated;
grant select on public.quote_deposits to authenticated;
revoke all on function public.register_quote_deposit(uuid, numeric, date, text, text) from public;
revoke all on function public.void_quote_deposit(uuid) from public;
revoke all on function public.expire_overdue_quotes() from public;
grant execute on function public.register_quote_deposit(uuid, numeric, date, text, text) to authenticated;
grant execute on function public.void_quote_deposit(uuid) to authenticated;
grant execute on function public.expire_overdue_quotes() to authenticated;

-- RLS -----------------------------------------------------------------------
alter table public.quote_deposits enable row level security;

drop policy if exists "authenticated users can manage quote deposits" on public.quote_deposits;
create policy "authenticated users can manage quote deposits" on public.quote_deposits
  for all to authenticated using (true) with check (true);

-- Realtime ------------------------------------------------------------------
do $$
declare
  table_name text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'create publication supabase_realtime';
  end if;
  foreach table_name in array array['quote_deposits'] loop
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
