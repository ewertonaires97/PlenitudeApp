-- Lembrete de sinal na véspera do vencimento da proposta.
--
-- A cobrança continua derivada da data, como a migration 020: não há job no
-- servidor e nada é agendado. O que esta migration guarda é apenas a marca de
-- que o lembrete já saiu, porque sem ela o app reabriria a cobrança do mesmo
-- orçamento toda vez que alguém abre a lista de orçamentos.
--
-- O carimbo é zerado quando a validade muda de propósito: estender o prazo é
-- uma nova promessa, e o cliente precisa ouvir de novo antes do novo vencimento.

alter table public.quotes
  add column if not exists expiry_reminder_sent_at timestamptz;

-- A tela de lembretes consulta exatamente esta faixa: enviado, vence amanhã e
-- sinal em aberto. O índice cobre só ela, então o tamanho da tabela não pesa nas
-- demais consultas de orçamento.
create index if not exists quotes_reminder_pending_idx on public.quotes (valid_until)
  where status = 'sent'
    and expiry_reminder_sent_at is null
    and deposit_amount > 0;

-- Prorrogar a validade reabre a cobrança. Registrar o lembreme é o que fecha a
-- pendência, então ele acompanha a validade e não a data em que foi enviado.
create or replace function public.reset_quote_expiry_reminder()
returns trigger
language plpgsql
as $$
begin
  if new.valid_until is distinct from old.valid_until then
    new.expiry_reminder_sent_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists quotes_expiry_reminder_reset on public.quotes;
create trigger quotes_expiry_reminder_reset before update on public.quotes
  for each row execute function public.reset_quote_expiry_reminder();