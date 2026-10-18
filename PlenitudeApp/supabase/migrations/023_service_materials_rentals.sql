-- Itens de estoque usados por serviço, e o alerta de aluguel no estoque.
--
-- A tabela `service_materials` já existia desde a 001 e nunca foi usada por
-- nenhuma tela: era o esquema pronto para a ligação "serviço usa item" que
-- faltava. Esta migration não cria nada novo, ela deixa pronto o caminho que o
-- app percorre agora em dois sentidos:
--
--   1. Serviço -> itens: o formulário de serviço marca os itens que o serviço
--      utiliza (gravados em `service_materials`).
--   2. Item -> eventos: o item é marcado como confirmado para um evento quando
--      algum serviço que o utiliza está num orçamento confirmado — o mesmo
--      caminho que a 001 usa para transformar orçamento confirmado em evento.
--
-- Continua sem trigger e sem agendamento: o alerta é derivado na hora, a
-- partir de `service_materials` + `quote_items` + `quotes` + `events`.

-- -----------------------------------------------------------------------------
-- Índices
-- -----------------------------------------------------------------------------
-- A consulta de aluguel é feita a partir do item ("quais serviços usam este
-- item e em quais eventos eles estão confirmados"), então o índice precisa
-- começar por `inventory_item_id`. A chave primária `(service_id,
-- inventory_item_id)` já atende o caminho inverso, o do formulário de serviço.
--
-- O segundo índice é para a outra perna da mesma junção: de um serviço
-- contratado, quais itens ele consome. `quote_items` só tinha índice implícito
-- pela chave estrangeira de `quote_id`, que não ajuda nesse filtro.
create index if not exists service_materials_inventory_item_idx
  on public.service_materials(inventory_item_id);

create index if not exists quote_items_service_id_idx
  on public.quote_items(service_id);

-- Depende da 015: as políticas abaixo usam public.has_permission, que é o que
-- transforma a permissão do app em regra de RLS. Rode esta migration depois dela.
--
-- -----------------------------------------------------------------------------
-- Leitura por quem cuida do estoque
-- -----------------------------------------------------------------------------
-- O caminho inverso das políticas da 015. Ela abriu `service_materials` e as
-- tabelas de estoque para quem cadastra serviço ("os materiais do serviço
-- apontam para itens do estoque, então quem cadastra serviço precisa ler os
-- itens"); falta o outro lado: quem cuida do estoque precisa saber em quais
-- eventos o item está confirmado, e essa resposta mora em `quote_items`,
-- `quotes` e `events`.
--
-- São políticas de LEITURA only, em arquivo separado das de escrita: as
-- políticas `FOR ALL` que a 015 criou continuam valendo, e como as políticas do
-- Postgres se somam por operação, quem tem `estoque` passa a ler essas três
-- tabelas sem ganhar nenhuma permissão de INSERT/UPDATE/DELETE nelas — para
-- escrever, a `FOR ALL` de antes continua sendo a única que conta.
drop policy if exists "estoque users can read quote items" on public.quote_items;
create policy "estoque users can read quote items" on public.quote_items
  for select to authenticated
  using (public.has_permission('estoque'));

drop policy if exists "estoque users can read quotes" on public.quotes;
create policy "estoque users can read quotes" on public.quotes
  for select to authenticated
  using (public.has_permission('estoque'));

drop policy if exists "estoque users can read events" on public.events;
create policy "estoque users can read events" on public.events
  for select to authenticated
  using (public.has_permission('estoque'));