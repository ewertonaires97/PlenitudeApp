-- Migração 009: Módulo Cerimonial – arrivals + equipe (ceremonialistas)
-- Corrige erros de schema cache para arrived_at e tabela ceremonialistas.

-- ─── 1. Coluna arrived_at na tabela guests ──────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'guests'
      AND column_name  = 'arrived_at'
  ) THEN
    ALTER TABLE public.guests ADD COLUMN arrived_at timestamptz;
    RAISE NOTICE 'Coluna arrived_at adicionada à tabela guests.';
  ELSE
    RAISE NOTICE 'Coluna arrived_at já existe em guests.';
  END IF;
END
$$;

-- Índice para consultas rápidas de convidados chegados por evento
CREATE INDEX IF NOT EXISTS idx_guests_event_id ON public.guests(event_id);

-- ─── 2. Tabela ceremonialistas (equipe do evento) ──────────────────────
CREATE TABLE IF NOT EXISTS public.ceremonialistas (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  name text not null,
  whatsapp text,
  email text,
  specialty text check (specialty in (
    'coordenacao', 'andamento', 'logistica', 'decoracao',
    'som_iluminacao', 'alimentacao', 'recepcao', 'outros'
  )),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

ALTER TABLE public.ceremonialistas ENABLE ROW LEVEL SECURITY;

-- Trigger automático em updated_at
CREATE TRIGGER ceremonialistas_updated_at
  BEFORE UPDATE ON public.ceremonialistas
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Índices
CREATE INDEX IF NOT EXISTS idx_ceremonialistas_event_id
  ON public.ceremonialistas(event_id);

-- Políticas RLS
DROP POLICY IF EXISTS "authenticated_users_can_manage_ceremonialistas" ON public.ceremonialistas;
CREATE POLICY "authenticated_users_can_manage_ceremonialistas"
  ON public.ceremonialistas
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ─── Fim da migração ───────────────────────────────────────────────────
