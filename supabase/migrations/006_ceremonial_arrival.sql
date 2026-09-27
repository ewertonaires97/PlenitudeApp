-- Migração: Módulo de Cerimonista e Controle de Chegada

-- Gerar número sequencial para ordens de orçamento quando não fornecido
CREATE SEQUENCE IF NOT EXISTS public.quote_number_seq;

-- Gerar número sequencial para ordens de orçamento quando não fornecido
ALTER SEQUENCE public.quote_number_seq OWNED BY public.quotes.quote_number;

-- Adicionar coluna arrived_at para controle de chegada dos convidados
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' AND table_name = 'guests' AND column_name = 'arrived_at') THEN
    ALTER TABLE public.guests ADD COLUMN arrived_at timestamptz;
  END IF;
END
$$;
