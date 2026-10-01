-- Migração 014: Cerimonial — reordenação de momentos do modelo padrão
--
-- A 013 criou a tabela `ceremonial_template_activities` com
-- `unique (template_id, position)` e a RPC `reorder_ceremonial_activities`
-- para o roteiro do evento. Os momentos do modelo padrão ainda eram
-- reordenados no navegador, com três UPDATEs por movimento, o que só
-- funciona porque a troca é sempre entre dois vizinhos.
--
-- Com o drag and drop o item pode ir para qualquer posição da lista, e
-- uma troca de vizinhos deixa de bastar: reordenar N itens exige N
-- escritas, e cada escrita pode falhar no meio, deixando a lista com
-- posições trocadas pela metade.
--
-- Esta RPC grava a ordem inteira em uma transação, com o mesmo desenho
-- de duas fases da 013.
--
-- Idempotente: pode ser executada quantas vezes for necessário.


-- Por que uma função e não UPDATEs no navegador:
--
--   `unique (template_id, position)` impede gravar a ordem final direto:
--   o primeiro UPDATE esbarra na posição que o vizinho ainda ocupa. Como o
--   cliente do supabase-js resolve com { error } em vez de lançar exceção,
--   esse erro é engolido e a tela recarrega sem ter mudado nada.
--
--   A fase 1 soma um deslocamento grande às posições, o que respeita o CHECK
--   `position > 0` e não colide com o índice único porque nenhuma atividade
--   real fica na faixa alta. A fase 2 grava os números definitivos. Dentro
--   da função isso é atômico: ou a ordem inteira é gravada, ou nada muda.

create or replace function public.reorder_ceremonial_template_activities(
  target_template_id uuid,
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
  if target_template_id is null or ordered_ids is null then
    return 0;
  end if;

  -- Fase 1: empurra os momentos informados para uma faixa livre.
  foreach activity_id in array ordered_ids loop
    update public.ceremonial_template_activities
       set position = position + temp_offset
     where id = activity_id
       and template_id = target_template_id
       and position < temp_offset;
  end loop;

  -- Fase 2: grava as posições finais na ordem recebida. unnest WITH
  -- ORDINALITY devolve o índice (1..N) que substitui a posição original.
  for activity_id, final_order in
    select id, ord from unnest(ordered_ids) with ordinality as ordered(id, ord)
  loop
    update public.ceremonial_template_activities
       set position = final_order
     where id = activity_id
       and template_id = target_template_id;
  end loop;

  select count(*) into affected
  from public.ceremonial_template_activities
  where template_id = target_template_id
    and id = any(ordered_ids);

  return affected;
end;
$$;

revoke all on function public.reorder_ceremonial_template_activities(uuid, uuid[]) from public;
grant execute on function public.reorder_ceremonial_template_activities(uuid, uuid[]) to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- FIM DA MIGRAÇÃO
-- ═══════════════════════════════════════════════════════════════════════════