-- ==========================================================================
-- Plenitude Realizações - Migração 010: Habilitar Supabase Realtime
-- Configura replicação e adiciona todas as tabelas à publicação supabase_realtime
-- ==========================================================================

-- 1. Configurar REPLICA IDENTITY FULL para que eventos de UPDATE e DELETE
-- contenham todos os dados das linhas anteriores e atuais.
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'profiles',
    'clients',
    'services',
    'service_materials',
    'menus',
    'menu_services',
    'menu_images',
    'menu_categories',
    'menu_category_links',
    'inventory_items',
    'inventory_images',
    'inventory_categories',
    'inventory_category_links',
    'inventory_movements',
    'quotes',
    'quote_items',
    'events',
    'ceremonial_activities',
    'event_tables',
    'guests',
    'ceremonialistas'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL;', tbl);
    END IF;
  END LOOP;
END $$;

-- 2. Garantir que a publicação supabase_realtime existe
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

-- 3. Adicionar todas as tabelas à publicação supabase_realtime de forma segura
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'profiles',
    'clients',
    'services',
    'service_materials',
    'menus',
    'menu_services',
    'menu_images',
    'menu_categories',
    'menu_category_links',
    'inventory_items',
    'inventory_images',
    'inventory_categories',
    'inventory_category_links',
    'inventory_movements',
    'quotes',
    'quote_items',
    'events',
    'ceremonial_activities',
    'event_tables',
    'guests',
    'ceremonialistas'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      BEGIN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I;', tbl);
      EXCEPTION
        WHEN duplicate_object THEN
          -- Tabela já está na publicação, continuar normalmente
          NULL;
        WHEN OTHERS THEN
          -- Trata qualquer outro aviso
          RAISE NOTICE 'Aviso ao adicionar tabela % na publicação realtime: %', tbl, SQLERRM;
      END;
    END IF;
  END LOOP;
END $$;
