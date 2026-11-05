-- Migração 013: Cerimonial — marcação de serviço, modelos padrão e reordenação
--
-- Três mudanças independentes, todas aplicadas pelo mesmo arquivo:
--   1. services.is_ceremonial: marca explicitamente quais serviços alimentam o
--      módulo de Cerimonial, para o dropdown de evento ativo poder filtrar.
--   2. Tabelas de modelo padrão: roteiros reutilizáveis que o usuário cria uma
--      vez e copia para qualquer evento novo.
--   3. RPCs de reordenação e cópia: a coluna `unique (event_id, position)` de
--      ceremonial_activities impede reordenar com UPDATE sequencial (ver nota
--      no final). Estas funções resolvem dentro do banco, em uma transação.
--
-- Idempotente: pode ser executada quantas vezes for necessário.


-- ═══════════════════════════════════════════════════════════════════════════
-- 1. SERVIÇO DE CERIMONIAL
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'services' AND column_name = 'is_ceremonial'
  ) THEN
    ALTER TABLE public.services ADD COLUMN is_ceremonial boolean not null default false;
    RAISE NOTICE 'Coluna services.is_ceremonial criada.';
  END IF;
END
$$;

-- Backfill: `category` e `name` são texto livre e sem normalização, então
-- Procura por 'cerimonial' no começo de qualquer palavra. Cobre "Cerimonial",
-- "cerimonial", "Cerimônia" não (essa fica de fora de propósito, é outra
-- palavra) e "Recepção / Cerimonial".
UPDATE public.services
SET is_ceremonial = true
WHERE is_ceremonial = false
  AND (
    name ILIKE '%cerimonial%'
    OR category ILIKE '%cerimonial%'
  );

-- Índice parcial: o filtro do dropdown busca apenas os serviços marcados, que
-- são uma fração pequena da tabela.
CREATE INDEX IF NOT EXISTS services_is_ceremonial_idx
  ON public.services(is_ceremonial)
  WHERE is_ceremonial;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. MODELOS PADRÃO DE ROTEIRO
-- ═══════════════════════════════════════════════════════════════════════════

-- Um modelo padrão é um roteiro sem evento, guardado pelo usuário e
-- reaproveitado. event_id fica nulo em ceremonial_template_activities para que
-- o modelo não dependa de nenhum evento existir.
CREATE TABLE IF NOT EXISTS public.ceremonial_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

CREATE TABLE IF NOT EXISTS public.ceremonial_template_activities (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.ceremonial_templates(id) on delete cascade,
  position integer not null check (position > 0),
  title text not null,
  description text,
  responsible text,
  scheduled_time time,
  status public.activity_status not null default 'pending',
  unique (template_id, position)
);

CREATE INDEX IF NOT EXISTS idx_template_activities_template_id
  ON public.ceremonial_template_activities(template_id);

ALTER TABLE public.ceremonial_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ceremonial_template_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_users_can_manage_ceremonial_templates" ON public.ceremonial_templates;
CREATE POLICY "authenticated_users_can_manage_ceremonial_templates"
  ON public.ceremonial_templates
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_users_can_manage_template_activities" ON public.ceremonial_template_activities;
CREATE POLICY "authenticated_users_can_manage_template_activities"
  ON public.ceremonial_template_activities
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- O trigger set_updated_at foi criado na 001. Tabelas novas precisam do seu
-- próprio disparo, porque o trigger não se propaga sozinho.
DROP TRIGGER IF EXISTS ceremonial_templates_updated_at ON public.ceremonial_templates;
CREATE TRIGGER ceremonial_templates_updated_at
  BEFORE UPDATE ON public.ceremonial_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. REORDENAÇÃO DO ROTEIRO
-- ═══════════════════════════════════════════════════════════════════════════
-- Por que uma função e não dois UPDATEs no navegador:
--
--   ceremonial_activities tem `unique (event_id, position)`. Para trocar duas
--   atividades de lugar, o primeiro UPDATE já esbarra na posição que a segunda
--   ainda ocupa, e a operação inteira falha. Como o cliente do supabase-js
--   resolve com { error } em vez de lançar exceção, esse erro é engolido e a
--   tela simplesmente recarrega sem ter mudado nada.
--
--   A reordenação acontece em duas fases dentro da função, e por isso ela é
--   atômica: ou a ordem inteira é gravada, ou nada muda — nunca uma lista com
--   duas atividades na mesma posição.
--
--   A fase 1 soma um deslocamento grande às posições. Isso respeita o CHECK
--   `position > 0` e, como nenhuma atividade real fica na faixa alta, também
--   não colide com o índice único. A fase 2 grava os números definitivos.

create or replace function public.reorder_ceremonial_activities(
  target_event_id uuid,
  ordered_ids uuid[]
)
returns integer
language plpgsql
as $$
declare
  temp_offset constant integer := 1000000;
  affected integer := 0;
  activity_id uuid;
  final_order integer;
begin
  if target_event_id is null or ordered_ids is null then
    return 0;
  end if;

  -- Fase 1: empurra as atividades informadas para uma faixa livre.
  foreach activity_id in array ordered_ids loop
    update public.ceremonial_activities
       set position = position + temp_offset
     where id = activity_id
       and event_id = target_event_id
       and position < temp_offset;
  end loop;

  -- Fase 2: grava as posições finais na ordem recebida. unnest WITH
  -- ORDINALITY devolve o índice (1..N) que substitui a posição original.
  for activity_id, final_order in
    select id, ord from unnest(ordered_ids) with ordinality as ordered(id, ord)
  loop
    update public.ceremonial_activities
       set position = final_order
     where id = activity_id
       and event_id = target_event_id;
  end loop;

  select count(*) into affected
  from public.ceremonial_activities
  where event_id = target_event_id
    and id = any(ordered_ids);

  return affected;
end;
$$;

revoke all on function public.reorder_ceremonial_activities(uuid, uuid[]) from public;
grant execute on function public.reorder_ceremonial_activities(uuid, uuid[]) to authenticated;


-- Renumera as atividades de 1..N seguindo a ordem atual.
--
-- Por que existe: excluir um momento do meio deixa um buraco na sequência
-- (1, 2, 4). A posição exibida na tela passaria a pular um número e, pior,
-- um novo momento calculado como length + 1 colidiria com a posição 4 já
-- ocupada. Chamar esta função depois da exclusão fecha o buraco.

create or replace function public.pack_ceremonial_activities(target_event_id uuid)
returns integer
language plpgsql
as $$
declare
  temp_offset constant integer := 1000000;
  activity_id uuid;
  final_order integer;
  total integer := 0;
begin
  if target_event_id is null then
    return 0;
  end if;

  foreach activity_id in array array(
    select id from public.ceremonial_activities
     where event_id = target_event_id
     order by position, id
  ) loop
    update public.ceremonial_activities
       set position = position + temp_offset
     where id = activity_id
       and position < temp_offset;
  end loop;

  for activity_id, final_order in
    select id, ord from unnest(
      array(
        select id from public.ceremonial_activities
         where event_id = target_event_id
         order by position + temp_offset, id
      )
    ) with ordinality as ordered(id, ord)
  loop
    update public.ceremonial_activities
       set position = final_order
     where id = activity_id
       and event_id = target_event_id;
  end loop;

  select count(*) into total
  from public.ceremonial_activities
  where event_id = target_event_id;

  return total;
end;
$$;

revoke all on function public.pack_ceremonial_activities(uuid) from public;
grant execute on function public.pack_ceremonial_activities(uuid) to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. COPIAR MODELO PADRÃO PARA UM EVENTO
-- ═══════════════════════════════════════════════════════════════════════════
-- `replace_activity` decide o que acontece com o roteiro que já existe:
--   false -> as atividades do modelo entram depois das atuais (modo padrão)
--   true  -> o roteiro do evento é apagado e fica só o modelo

create or replace function public.copy_ceremonial_template(
  source_template_id uuid,
  target_event_id uuid,
  replace_activity boolean default false
)
returns integer
language plpgsql
as $$
declare
  inserted_count integer := 0;
  next_position integer := 0;
begin
  if source_template_id is null or target_event_id is null then
    return 0;
  end if;

  if not exists (select 1 from public.ceremonial_templates where id = source_template_id) then
    raise exception 'Modelo padrão não encontrado.';
  end if;

  if replace_activity then
    delete from public.ceremonial_activities where event_id = target_event_id;
    next_position := 1;
  else
    select coalesce(max(position), 0) + 1 into next_position
    from public.ceremonial_activities
    where event_id = target_event_id;
  end if;

  insert into public.ceremonial_activities
    (event_id, position, title, description, responsible, scheduled_time, status)
  select
    target_event_id,
    next_position + tpl.position - 1,
    tpl.title,
    tpl.description,
    tpl.responsible,
    tpl.scheduled_time,
    'pending'
  from public.ceremonial_template_activities tpl
  where tpl.template_id = source_template_id
  order by tpl.position;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.copy_ceremonial_template(uuid, uuid, boolean) from public;
grant execute on function public.copy_ceremonial_template(uuid, uuid, boolean) to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. PUBLICAR AS TABELAS NO REALTIME
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ceremonial_templates', 'ceremonial_template_activities']
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'Tabela public.% não existe – ignorada.', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      RAISE NOTICE 'public.% publicada no supabase_realtime.', t;
    ELSE
      RAISE NOTICE 'public.% já está publicada – ignorada.', t;
    END IF;
  END LOOP;
END
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- FIM DA MIGRAÇÃO
-- ═══════════════════════════════════════════════════════════════════════════
