-- Texto do lembrete de sinal editável pela pessoa que opera o app.
--
-- A migration 021 guardava apenas *se* o lembrete já saiu. Esta guarda o
-- *conteúdo*: quem cobra é uma pessoa falando com um cliente que já tem um
-- orçamento com o nome dela, e a redação é decisão comercial. Um texto fixo no
-- JavaScript obrigaria a pessoa aconviver com a voz da empresa escrita por
-- outra pessoa, ou a editar código para mudar uma frase.
--
-- Continua sem servidor e sem agendamento: a cobrança segue derivada da data
-- (como a 020 e a 021). O que muda aqui é só de onde o texto vem.

-- -----------------------------------------------------------------------------
-- Tabela
-- -----------------------------------------------------------------------------
-- Uma linha por tipo de mensagem. A chave é texto em vez de uuid porque o
-- frontend conhece o tipo por nome ('expiry_reminder') e precisa achá-lo sem
-- fazer consulta por id: um SELECT que devolve zero linhas numa busca por chave
-- é muito mais fácil de tratar no JavaScript do que um id que não existe.
create table if not exists public.quote_message_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique,
  name text not null,
  -- Texto com variáveis no formato {chave}. Vazio significa "usar o padrão do
  -- app": assim dá para limpar o campo e voltar ao texto original sem precisar
  -- de um botão de restaurar, e o padrão continua vivo no código.
  body text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

drop trigger if exists quote_message_templates_updated_at on public.quote_message_templates;
create trigger quote_message_templates_updated_at before update on public.quote_message_templates
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Mensagem por orçamento
-- -----------------------------------------------------------------------------
-- A renegociar a data de um cliente específico, não faz sentido mudar a
-- mensagem de todo mundo. Vazio significa "usar o padrão" — a mesma regra da
-- coluna body, pelo mesmo motivo.
alter table public.quotes
  add column if not exists reminder_message text;

-- -----------------------------------------------------------------------------
-- Texto padrão
-- -----------------------------------------------------------------------------
-- Semeado como NULL de propósito: o texto padrão vive no app
-- (quoteExpiryReminderTemplate em app.js) e é ele que se aplica quando não há
-- nada no banco. Guardar uma cópia aqui duplicaria a redação em dois lugares,
-- e as duas divergiriam na primeira edição.
--
-- A frase do prazo é a variável {prazo}, e ela é montada já frases: "vence
-- amanhã", "está vencido há 2 dias". Isso é o que permite um texto só servir
-- para o orçamento que vence amanhã e para o que já venceu -- se a variável
-- devolvesse só o advérbio, uma das duas frases sairia gramaticalmente errada.
insert into public.quote_message_templates (template_key, name)
values ('expiry_reminder', 'Lembrete de sinal')
on conflict (template_key) do nothing;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
-- Ler exige o mesmo acesso de quem já vê os orçamentos; escrever exige a
-- permissão de orçamentos, que é a de quem pode cobrar. Não é uma configuração
-- de sistema como as permissões: uma empresa que não usa sinal% de 30% pode
-- simplesmente nunca abrir esta tela.
alter table public.quote_message_templates enable row level security;

drop policy if exists "orcamentos readers can read reminder templates" on public.quote_message_templates;
create policy "orcamentos readers can read reminder templates" on public.quote_message_templates
  for select to authenticated
  using (public.has_permission('orcamentos') or public.has_permission('eventos'));

drop policy if exists "orcamentos users can manage reminder templates" on public.quote_message_templates;
create policy "orcamentos users can manage reminder templates" on public.quote_message_templates
  for all to authenticated
  using (public.has_permission('orcamentos'))
  with check (public.has_permission('orcamentos'));

-- -----------------------------------------------------------------------------
-- Realtime
-- -----------------------------------------------------------------------------
-- Duas pessoas no mesmo orçamento: quem edita a mensagem no celular precisa ver
-- a versão de quem editou no computador, senão a segunda gravação sobrescreve a
-- primeira em silêncio.
do $$
declare
  table_name text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'create publication supabase_realtime';
  end if;
  foreach table_name in array array['quote_message_templates'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;
