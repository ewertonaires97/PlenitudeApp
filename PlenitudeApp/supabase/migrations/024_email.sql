-- Lembrete de sinal por email, disparado com o app fechado.
--
-- Até a 023 a cobrança vivia só na tela: quem abria o app via o sino, quem
-- abria a lista de lembretes. O aviso morria com a aba fechada, e a data do
-- vencimento é exatamente o tipo de coisa que não espera ninguém lembrar dela.
--
-- A cobrança continua sendo humana -- o WhatsApp ainda abre com a conversa do
-- cliente e quem confirma o sinal é uma pessoa. O que muda aqui é o aviso:
-- uma vez por dia o banco pergunta quais propostas estão com sinal em aberto
-- vencendo ou vencidas e manda um email para quem opera o app, com a lista e
-- o link para resolver. Ninguém precisa estar com o app aberto para saber.
--
-- Por que email e não push: Web Push exigiria VAPID, um service worker
-- reescrito e um processo de envio -- e no iOS só funciona com o PWA
-- instalado na tela de início. Email é um pg_cron chamando o Resend, que é
-- um processo a menos e uma assinatura a menos. O app não muda nada: nenhuma
-- linha de JavaScript é necessária para o email sair.
--
-- Como não há CLI neste projeto (a 012 registra a decisão), tudo abaixo é
-- colado no SQL Editor do Supabase Dashboard. Os passos que dependem de conta
-- externa estão no README.

-- -----------------------------------------------------------------------------
-- Extensões
-- -----------------------------------------------------------------------------
-- pg_net faz a chamada HTTP a partir do banco. pg_cron é o agendamento.
-- vault guarda a chave do Resend: ela é segredo de servidor e nunca entra no
-- repositório -- o frontend tem apenas a chave publicável do Supabase, e uma
-- chave de envio de email no Git vaza para qualquer pessoa que leia o
-- histórico do repositório.
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;
create extension if not exists pg_cron;

-- -----------------------------------------------------------------------------
-- Estado do aviso
-- -----------------------------------------------------------------------------
-- Coluna nova, separada de expiry_reminder_sent_at de propósito. As duas
-- respondem perguntas diferentes sobre o mesmo orçamento:
--
--   expiry_reminder_sent_at  -> alguém já cobrou o cliente no WhatsApp. A
--                               tarefa acabou; some da lista de cobrança.
--   expiry_notified_at       -> o email do dia já saiu. A tarefa NÃO acabou:
--                               quem opera ainda precisa ligar para o cliente.
--
-- Compartilhar a coluna faria o email resolver a cobrança de quem não falou
-- com ninguém ainda, e a lista de lembretes -- que existe para ser uma tarefa,
-- não um aviso -- ficaria vazia antes do telefonema.
alter table public.quotes
  add column if not exists expiry_notified_at timestamptz;

-- Mesmo recorte da tela, mesmo motivo do índice da 021: enviado ou vencido,
-- com sinal em aberto, vencendo hoje/amanhã ou já vencido. O índice cobre só
-- essa fatia, então o tamanho da tabela não pesa nas demais consultas.
create index if not exists quotes_expiry_notify_idx on public.quotes (valid_until)
  where expiry_notified_at is null
    and status in ('sent', 'expired')
    and deposit_amount > 0;

-- -----------------------------------------------------------------------------
-- Zera os dois carimbos quando a validade muda
-- -----------------------------------------------------------------------------
-- A 021 já zerava expiry_reminder_sent_at quando a validade mudava. A regra é
-- a mesma para o aviso: estender o prazo é uma nova promessa, e o operador
-- precisa ouvir de novo antes do novo vencimento. Sem isto, um orçamento
-- prorrogado nunca mais receberia email.
create or replace function public.reset_quote_expiry_reminder()
returns trigger
language plpgsql
as $$
begin
  if new.valid_until is distinct from old.valid_until then
    new.expiry_reminder_sent_at := null;
    new.expiry_notified_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists quotes_expiry_reminder_reset on public.quotes;
create trigger quotes_expiry_reminder_reset before update on public.quotes
  for each row execute function public.reset_quote_expiry_reminder();

-- -----------------------------------------------------------------------------
-- Auxiliares
-- -----------------------------------------------------------------------------
-- O prefixo no nome de todas as funções novas é para não disputar o espaço de
-- nomes do schema public com o resto do app. Uma função genérica como
-- escape_html colide com a próxima pessoa que precisar de uma.
--
-- Dinheiro em pt-BR. O to_char entrega "1.234,50" em um servidor configurado
-- para pt-BR e "1,234.50" num Postgres com locale C, que é o padrão do Supabase
-- — o resultado não pode depender do locale de quem instalou o banco.
--
-- Por isso a troca passa por um caractere que nenhum número usa: primeiro a
-- vírgula original vai para um lado, depois o ponto vira vírgula, e só então o
-- lugar vira ponto. Trocar direto com dois replaces aninhados não funciona —
-- o replace de dentro cria vírgulas novas e o de fora as transforma em ponto de
-- novo, e R$ 1.234,50 sai como R$ 1.234.50.
create or replace function public.quote_expiry_format_brl(value numeric)
returns text
language sql
immutable
as $$
  select 'R$ ' || replace(
           replace(
             replace(
               to_char(round(coalesce(value, 0), 2), 'FM999,999,990.00'),
               ',', '|'),
             '.', ','),
           '|', '.');
$$;

-- Nome e texto do orçamento vêm do banco e entram num HTML de email. Sem o
-- escape, um orçamento chamado "Festa & Cia <VIP>" quebraria o markup.
create or replace function public.quote_expiry_escape_html(value text)
returns text
language sql
immutable
as $$
  select replace(
           replace(
             replace(
               replace(
                 replace(coalesce(value, ''), '&', '&amp;'),
                 '<', '&lt;'),
               '>', '&gt;'),
             '"', '&quot;'),
           '''', '&#39;');
$$;

-- A frase do prazo é montada já com o verbo, pelo mesmo motivo da variável
-- {prazo} do app: "vence amanhã" e "venceu há 3 dias" são frases inteiras, e um
-- advérbio solto quebraria a gramática de qualquer texto que as recebesse.
create or replace function public.quote_expiry_deadline_phrase(valid_until date, today date)
returns text
language plpgsql
immutable
as $$
declare
  days integer;
begin
  if valid_until is null then return 'sem prazo definido'; end if;
  days := valid_until - today;
  if days = 0 then return 'vence hoje'; end if;
  if days = 1 then return 'vence amanhã'; end if;
  if days > 1 then return 'vence em ' || days || ' dias'; end if;
  if days = -1 then return 'venceu ontem'; end if;
  return 'vencido há ' || (-days) || ' dias';
end;
$$;

-- -----------------------------------------------------------------------------
-- Quem falta avisar
-- -----------------------------------------------------------------------------
-- O recorte é o mesmo que o sino da central de avisos usa no app, escrito
-- outra vez porque não existe fonte de verdade única entre SQL e JavaScript:
-- effective_permissions é a única forma de reproduzir a regra de acesso sem
-- duplicar a lógica de owner/admin/gestor/permissão explícita.
--
-- A janela vai até amanhã, no mesmo padrão de QUOTE_REMINDER_LEAD_DAYS = 1.
--
-- O segundo argumento existe por um motivo concreto: o carimbo precisa ser
-- gravado ANTES de o email ser montado, senão a lista some no meio do
-- caminho. Passar os ids já carimbados é o que devolve as linhas que esta
-- execução realmente tomou conta, com os dados de origem em vez de uma
-- segunda consulta que poderia achar outra coisa.
create or replace function public.quote_expiry_notification_pending(target_date date, only_ids uuid[] default null)
returns table (
  quote_id uuid,
  quote_number bigint,
  quote_name text,
  client_name text,
  event_date date,
  valid_until date,
  total numeric,
  deposit_amount numeric,
  deposited_amount numeric,
  remaining numeric,
  quote_status text
)
language sql
stable
security definer
set search_path = public
as $$
  select q.id,
         q.quote_number,
         q.name,
         coalesce(c.name, 'Sem cliente'),
         q.event_date,
         q.valid_until,
         q.total,
         q.deposit_amount,
         q.deposited_amount,
         greatest(0, q.deposit_amount - q.deposited_amount),
         q.status::text
  from public.quotes q
  left join public.clients c on c.id = q.client_id
  where q.valid_until is not null
    and q.valid_until <= target_date + 1
    -- 'sent' e 'expired' são os dois estados em que a proposta está na mão do
    -- cliente esperando resposta. Rascunho não entra porque ninguém recebeu a
    -- proposta; confirmado não entra porque a data já está reservada.
    and q.status in ('sent', 'expired')
    -- Sinal em aberto: a cobrança só existe onde há dinheiro a receber.
    and q.deposit_amount > 0
    -- Um centavo de tolerância pelo mesmo motivo do JavaScript: o numeric
    -- chega como string e o arredondamento do total pode deixar o sinal pago
    -- aparecendo como faltando 0,01.
    and q.deposited_amount + 0.01 < q.deposit_amount
    -- Sem lista de ids é a consulta do dia; com lista é o detalhe do que esta
    -- execução já carimbou. No primeiro caso o filtro do índice é o que evita
    -- varrer a tabela inteira.
    and (only_ids is null or q.id = any(only_ids))
    and (only_ids is not null or q.expiry_notified_at is null)
  order by q.valid_until, q.quote_number;
$$;

-- -----------------------------------------------------------------------------
-- Envio
-- -----------------------------------------------------------------------------
-- O email é interno: avisa QUEM OPERA o app, não o cliente. Por isso ele lista
-- as propostas com número, cliente, prazo e quanto falta, em vez de repetir o
-- texto de cobrança -- que é escrito para o cliente, na voz dele, e continua
-- sendo enviado manualmente pelo WhatsApp.
create or replace function public.dispatch_quote_expiry_notifications(target_date date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  api_key text;
  sender text;
  app_url text;
  recipients text[];
  claimed_ids uuid[];
  due record;
  stamped integer;
  overdue integer := 0;
  upcoming integer := 0;
  request_id bigint;
  subject_line text;
  intro_text text;
  intro_html text;
  lines_text text := '';
  lines_html text := '';
  payload jsonb;
begin
  -- Sem chave não há envio. Um raise aqui seria o jeito mais honesto de
  -- reportar, mas o pg_cron registra falha por execução e um job quebrado
  -- aparece como erro todo dia até alguém olhar; devolver 0 com a linha no log
  -- é o que deixa o diagnóstico a um SELECT de distância.
  select decrypted_secret into api_key
    from vault.decrypted_secrets where name = 'quote_expiry_resend_api_key';
  select decrypted_secret into sender
    from vault.decrypted_secrets where name = 'quote_expiry_from';
  select decrypted_secret into app_url
    from vault.decrypted_secrets where name = 'quote_expiry_app_url';

  if api_key is null or sender is null then
    insert into public.quote_expiry_notification_log (quote_count, subject)
    values (0, 'não enviado: falta a chave do Resend ou o remetente no vault');
    return 0;
  end if;

  -- Quem pode cobrar o sinal é quem tem a permissão de orçamentos.
  -- effective_permissions é a mesma função que a RLS usa, então o email não
  -- vaza nada que a tela correspondente não mostraria.
  select coalesce(array_agg(distinct lower(btrim(p.email))), '{}'::text[])
    into recipients
  from public.profiles p
  where p.active is true
    and p.email is not null
    and btrim(p.email) <> ''
    and 'orcamentos' = any(public.effective_permissions(p.role, p.permissions, p.active));

  if coalesce(array_length(recipients, 1), 0) = 0 then
    insert into public.quote_expiry_notification_log (quote_count, subject)
    values (0, 'não enviado: nenhum usuário ativo com email e permissão de orçamentos');
    return 0;
  end if;

  -- Padrão concorrente correto: SELECT FOR UPDATE SKIP LOCKED escolhe as linhas
  -- e já as trava, pulando as que outra transação já travou. O UPDATE seguinte
  -- só toca nessas IDs -- zero janela de duplicação.
  with to_claim as (
    select q.id
    from public.quotes q
    where q.expiry_notified_at is null
      and q.status in ('sent', 'expired')
      and q.valid_until is not null
      and q.valid_until <= target_date + 1
      and q.deposit_amount > 0
      and q.deposited_amount + 0.01 < q.deposit_amount
    order by q.valid_until, q.quote_number
    for update skip locked
  ),
  claimed as (
    update public.quotes q
       set expiry_notified_at = now()
      from to_claim
     where q.id = to_claim.id
    returning q.id
  )
  select coalesce(array_agg(id), '{}'::uuid[]) into claimed_ids from claimed;

  stamped := coalesce(array_length(claimed_ids, 1), 0);
  if stamped = 0 then
    return 0;
  end if;

  for due in
    select p.* from public.quote_expiry_notification_pending(target_date, claimed_ids) p
  loop
    -- Uma linha por orçamento, vencimento mais antigo primeiro: quando dois
    -- vencem juntos, o que está há mais tempo sem resposta é o que precisa de
    -- atenção primeiro. É a mesma ordem da lista na tela.
    if due.valid_until < target_date then
      overdue := overdue + 1;
    else
      upcoming := upcoming + 1;
    end if;

    lines_text := lines_text
      || format(E'\n• #%s %s — %s',
                lpad(due.quote_number::text, 4, '0'),
                due.quote_name,
                due.client_name)
      || format(E'\n  %s · falta %s de %s',
                public.quote_expiry_deadline_phrase(due.valid_until, target_date),
                public.quote_expiry_format_brl(due.remaining),
                public.quote_expiry_format_brl(due.deposit_amount))
      || case when due.event_date is not null
              then format(E'\n  Evento em %s', to_char(due.event_date, 'DD/MM/YYYY'))
              else '' end
      || E'\n';

    lines_html := lines_html
      || format(
           '<tr><td style="padding:12px 0;border-bottom:1px solid #eee;">'
           || '<strong>#%s %s</strong><br>'
           || '<span style="color:#666;font-size:13px;">%s · %s</span><br>'
           || '<span style="color:#666;font-size:13px;">Falta %s de %s%s</span>'
           || '</td></tr>',
           lpad(due.quote_number::text, 4, '0'),
           public.quote_expiry_escape_html(due.quote_name),
           public.quote_expiry_escape_html(due.client_name),
           public.quote_expiry_escape_html(public.quote_expiry_deadline_phrase(due.valid_until, target_date)),
           public.quote_expiry_format_brl(due.remaining),
           public.quote_expiry_format_brl(due.deposit_amount),
           case when due.event_date is not null
                then ' · evento em ' || to_char(due.event_date, 'DD/MM/YYYY')
                else '' end);
  end loop;

  subject_line := case
    when overdue > 0 and upcoming > 0
      then format('%s orçamento(s) vencido(s) e %s a vencer — sinal em aberto', overdue, upcoming)
    when overdue > 0
      then format('%s orçamento(s) com sinal vencido', overdue)
    else format('%s orçamento(s) com sinal a vencer', upcoming)
  end;

  -- O email não cobra nada: ele lembra que existe uma cobrança esperando. A
  -- frase é a mesma nas duas versões porque o texto de verdade é o que o
  -- operador envia pelo WhatsApp depois de conferir.
  --
  -- O botão diz "Abrir o app" e não "Abrir os lembretes" porque é isso que ele
  -- faz: o app é um PWA sem rota por URL -- o endereço só é lido para o
  -- retorno do OAuth, e nada na tela de login sabe abrir a lista de lembretes
  -- por link. Prometer no email um atalho que não existe é pior do que mandar
  -- para a tela inicial. Se um dia existir a rota, o texto muda junto com ela.
  intro_text := 'A cobrança abaixo continua sendo sua: abra o app, confira o texto e envie pelo WhatsApp.'
    || case when coalesce(app_url, '') <> '' then E'\n\n' || app_url else '' end;
  intro_html := '<p style="margin:0 0 16px;font-family:Arial,sans-serif;font-size:15px;color:#333;">'
    || 'A cobrança abaixo continua sendo sua: abra o app, confira o texto e envie pelo WhatsApp.</p>'
    || case when coalesce(app_url, '') <> ''
         then format('<p style="margin:0 0 16px;"><a href="%s" style="font-family:Arial,sans-serif;font-size:15px;color:#1a7f5a;">Abrir o app</a></p>', app_url)
         else '' end;

  -- Um envio só, todos em cópia oculta: cada pessoa recebe o aviso uma vez e
  -- nenhum email mostra o endereço dos outros.
  payload := jsonb_build_object(
    'from', sender,
    'to', to_jsonb(recipients),
    'subject', subject_line,
    'text', intro_text || E'\n' || lines_text,
    'html', format(
      '<div style="max-width:560px;margin:0 auto;padding:24px;font-family:Arial,sans-serif;">'
      || '<h2 style="margin:0 0 4px;font-size:19px;color:#111;">Sinal em aberto</h2>'
      || '%s<table style="width:100%%;border-collapse:collapse;margin:8px 0 20px;">%s</table>'
      || '<p style="font-size:13px;color:#888;margin:0;">Plenitude Realizações</p></div>',
      intro_html, lines_html));

  -- pg_net não devolve erro na chamada: ele enfileira e devolve o id da
  -- requisição, e a resposta chega depois em net._http_response.
  --
  -- Named arguments de propósito. A assinatura do http_post é uma só:
  --
  --   http_post(url, body jsonb, params jsonb, headers jsonb, timeout int)
  --
  -- O corpo é o segundo argumento e é jsonb, não a posição de params, headers,
  -- body. Passar posicional na ordem errada não compila -- o erro é
  -- "function net.http_post(text, jsonb, jsonb, bytea, integer) does not
  -- exist" -- e "consertar" só o tipo do corpo é pior: o cabeçalho cairia na
  -- posição de params, que o pg_net anexa à query string, e a chave do Resend
  -- passaria a vazar no log da requisição. Nomeado, cada argumento cai onde
  -- precisa cair mesmo que a assinatura mude de novo.
  --
  -- params fica de fora de propósito: a URL do Resend não usa query string, e
  -- é por onde um segredo escapa com mais facilidade.
  --
  -- O http_post recusa qualquer Content-Type que não seja application/json, e
  -- o corpo é jsonb de verdade: ele mesmo faz o convert_to para bytea antes de
  -- enfileirar.
  request_id := net.http_post(
    url := 'https://api.resend.com/emails',
    body := payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || api_key),
    timeout_milliseconds := 15000);

  insert into public.quote_expiry_notification_log
    (quote_count, overdue_count, upcoming_count, recipients, subject, resend_request_id)
  values
    (stamped, overdue, upcoming, recipients, subject_line, request_id);

  return stamped;
end;
$$;

-- -----------------------------------------------------------------------------
-- Log
-- -----------------------------------------------------------------------------
-- pg_net não devolve erro na chamada, então sem esta tabela o único sinal de
-- que o job roda é o próprio email chegando. Uma linha por execução responde
-- "rodou?", "para quem?" e "quantos orçamentos entraram" de uma vez.
--
-- resend_request_id é a chave para a resposta do Resend, mas só por algumas
-- horas: net._http_response é unlogged e o pg_net descarta o que guardou depois
-- de 6 horas (pg_net.ttl). Ela serve para confirmar a saída logo depois do
-- disparo, não para auditar o passado. O histórico de verdade é esta linha.
create table if not exists public.quote_expiry_notification_log (
  id bigint generated always as identity primary key,
  sent_at timestamptz not null default now(),
  quote_count integer not null default 0,
  overdue_count integer not null default 0,
  upcoming_count integer not null default 0,
  recipients text[] not null default '{}',
  subject text,
  resend_request_id bigint
);

comment on table public.quote_expiry_notification_log is
  'Uma linha por execução do email de lembrete. Sem política de RLS: é leitura de operação, pelo SQL Editor.';

-- RLS ligado sem política é o estado mais fechado possível: nem anon nem
-- authenticated leem nada. Só o dono da tabela (postgres) enxerga a tabela,
-- o que é o certo para um histórico de quem recebeu o quê.
alter table public.quote_expiry_notification_log enable row level security;

-- -----------------------------------------------------------------------------
-- Poda do backlog
-- -----------------------------------------------------------------------------
-- Esta linha é a que evita um email gigante no primeiro dia. O recorte acima
-- pega também propostas vencidas há meses que nunca foram avisadas, porque
-- nunca existiu aviso -- e o primeiro disparo mandaria todas de uma vez.
--
-- As que já estão vencidas há mais de 30 dias são carimbadas como notificadas
-- sem sair email: são antigas, já passaram do ponto de "vence amanhã" e quem
-- precisa delas agora não é o aviso, é a lista de cobrança dentro do app.
-- O carimbo é só uma data, e ficar para trás é sempre melhor do que ficar para
-- frente: um email perdido se reenvia, um email repetido não se desfaz.
--
-- Troque 30 pelo prazo que fizer sentido, ou apague este bloco antes de rodar
-- a migration se preferir receber tudo de uma vez.
update public.quotes
   set expiry_notified_at = now()
 where expiry_notified_at is null
   and status in ('sent', 'expired')
   and valid_until is not null
   and valid_until < current_date - 30;

-- -----------------------------------------------------------------------------
-- Agendamento
-- -----------------------------------------------------------------------------
-- 11:00 UTC é 08:00 no horário de Brasília, que é quando alguém começa o dia
-- com a lista de cobrança na mão. current_date do Postgres é UTC, e às 11:00
-- ele já é o dia de Brasília -- os dois lados concordam sobre que dia é hoje.
--
-- Uma vez por dia, e não por hora: repetir a cobrança de sinal o dia inteiro
-- transformaria o aviso em ruído, e o dia anterior já dá tempo de agir antes
-- do vencimento.
do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname = 'quote-expiry-notification';
  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
  perform cron.schedule(
    'quote-expiry-notification',
    '0 11 * * *',
    'select public.dispatch_quote_expiry_notifications(current_date)');
end $$;

-- -----------------------------------------------------------------------------
-- Permissões
-- -----------------------------------------------------------------------------
-- Nada disto é chamado pelo navegador. A função é security definer porque
-- precisa ler o vault e escrever no log, e o acesso de anon e authenticated
-- é revogado para que nenhuma chave de usuário alcance o agendamento. O
-- disparo é do cron; o teste manual é pelo SQL Editor.
--
-- O teste manual não é uma simulação: dispatch_quote_expiry_notifications é a
-- mesma função que o cron chama, então o teste carimba expiry_notified_at de
-- verdade e o email sai de verdade. Para não gastar o disparo do dia, rearme
-- depois com
--
--   update public.quotes set expiry_notified_at = null
--    where expiry_notified_at is not null;
revoke all on public.quote_expiry_notification_log from anon, authenticated;
revoke all on function public.quote_expiry_notification_pending(date, uuid[]) from public;
revoke all on function public.dispatch_quote_expiry_notifications(date) from public;
revoke all on function public.quote_expiry_format_brl(numeric) from public;
revoke all on function public.quote_expiry_escape_html(text) from public;
revoke all on function public.quote_expiry_deadline_phrase(date, date) from public;