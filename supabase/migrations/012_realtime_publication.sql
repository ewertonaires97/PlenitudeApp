-- Migração 012: Habilita o Supabase Realtime em todas as tabelas do app
--
-- PROBLEMA QUE ESTA MIGRAÇÃO RESOLVE:
-- A publication `supabase_realtime` do Supabase é criada VAZIA por padrão.
-- Nenhuma tabela entra automaticamente nela. Sem esta migração, qualquer
-- `postgres_changes` assinado no cliente fica conectado, responde SUBSCRIBED
-- e nunca recebe nenhum evento — o app "parece" sincronizado mas não é.
--
-- Idempotente: pode ser executada quantas vezes for necessário.
-- Aplicar no SQL Editor do Supabase Dashboard (o projeto não usa a CLI).

-- ─── 1. Réplica completa (inclui valores antigos em UPDATE/DELETE) ──────────
-- Sem isso, o payload de DELETE e o campo `old` de UPDATE vêm incompletos,
-- o que impede atualizar a tela apenas com o payload recebido.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles',
    'clients',
    'services',
    'service_materials',
    'inventory_items',
    'inventory_movements',
    'inventory_categories',
    'inventory_images',
    'inventory_category_links',
    'quotes',
    'quote_items',
    'menus',
    'menu_services',
    'menu_images',
    'menu_categories',
    'menu_category_links',
    'events',
    'event_tables',
    'guests',
    'ceremonial_activities',
    'ceremonialistas'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'Tabela public.% não existe – ignorada.', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
  END LOOP;
END
$$;

-- ─── 2. Publicação das tabelas no canal de realtime ───────────────────────
-- O block só adiciona as tabelas que ainda não estão na publication,
-- evitando o erro "table is already member of publication" ao reexecutar.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    -- Cadastros
    'profiles',
    'clients',
    'services',
    'service_materials',
    -- Catálogo de menus
    'menus',
    'menu_services',
    'menu_images',
    'menu_categories',
    'menu_category_links',
    -- Estoque
    'inventory_items',
    'inventory_movements',
    'inventory_categories',
    'inventory_images',
    'inventory_category_links',
    -- Orçamentos
    'quotes',
    'quote_items',
    -- Eventos
    'events',
    'event_tables',
    'guests',
    -- Cerimonial
    'ceremonial_activities',
    'ceremonialistas'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'Tabela public.% não existe – ignorada.', t;
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      RAISE NOTICE 'public.% publicada no supabase_realtime.', t;
    ELSE
      RAISE NOTICE 'public.% já está publicada – ignorada.', t;
    END IF;
  END LOOP;
END
$$;

-- ─── 3. Verificação ────────────────────────────────────────────────────────
-- Deve listar todas as tabelas acima. Se alguma faltar, o realtime daquela
-- tabela não chega aos clientes.
DO $$
DECLARE
  faltando text;
BEGIN
  SELECT string_agg(t, ', ')
    INTO faltando
  FROM unnest(ARRAY[
    'clients', 'services', 'service_materials',
    'inventory_items', 'inventory_movements',
    'inventory_categories', 'inventory_images', 'inventory_category_links',
    'quotes', 'quote_items',
    'menus', 'menu_services', 'menu_images',
    'menu_categories', 'menu_category_links',
    'events', 'event_tables', 'guests',
    'ceremonial_activities', 'ceremonialistas'
  ]) AS t
  WHERE to_regclass('public.' || t) IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    );

  IF faltando IS NULL THEN
    RAISE NOTICE 'Realtime OK – todas as tabelas publicadas em supabase_realtime.';
  ELSE
    RAISE WARNING 'Realtime INCOMPLETO – sem publicação: %', faltando;
  END IF;
END
$$;

-- ─── Fim da migração ─────────────────────────────────────────────────────
