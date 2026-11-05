-- Migração 007: Módulo de Cerimonista - Tabela de equipe e campo de chegada

-- Adicionar tabela de cerimonistas (equipe que trabalha nos eventos)
CREATE TABLE IF NOT EXISTS public.ceremonialistas (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  name text not null,
  whatsapp text,
  email text,
  specialty text check (specialty in ('coordenacao', 'andamento', 'logistica', 'decoracao', 'som_iluminacao', 'alimentacao', 'outros')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

ALTER TABLE public.ceremonialistas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated users can manage ceremonialistas" ON public.ceremonialistas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER ceremonialistas_updated_at BEFORE UPDATE ON public.ceremonialistas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX ceremonialistas_event_id_idx ON public.ceremonialistas(event_id);

-- Adicionar campo arrived_at na tabela guests para controle de chegada
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'guests' AND column_name = 'arrived_at') THEN
    ALTER TABLE public.guests ADD COLUMN arrived_at timestamptz;
  END IF;
END
$$;
