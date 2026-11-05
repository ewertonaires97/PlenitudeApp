-- Migração 015: Controle de acesso — usuários, níveis e permissões por tela
--
-- O QUE ESTA MIGRAÇÃO RESOLVE
--
-- Até aqui qualquer usuário autenticado enxergava e alterava tudo: as 22
-- políticas da 001 eram todas `using (true)`, e a coluna `profiles.role`
-- ('admin' | 'staff') existia mas não era lida nem pelo banco nem pelo
-- frontend. Um usuário logado podia, por exemplo, apagar orçamentos e ler
-- dados de clientes direto pela API do Supabase, sem passar pela interface.
--
-- Aqui a permissão vira regra do BANCO, não só da interface:
--
--   1. app_permissions          — catálogo das telas que existem no app.
--   2. app_roles                — os níveis de acesso (owner, admin, gestor,
--                                operador, consulta).
--   3. app_role_permissions     — quais telas cada nível abre por padrão.
--   4. profiles                 — ganha email, whatsapp, permissions e active.
--                                `permissions` é a lista explícita de telas do
--                                usuário; NULL significa "herda do nível".
--   5. has_permission()         — resolve a permissão efetiva na ordem
--                                owner/admin → lista do usuário → padrão do nível.
--   6. RLS reescrita            — cada tabela passa a exigir a permissão da
--                                tela que a alimenta.
--
-- FLUXO DE CADASTRO
--
-- A conta de login é criada em Authentication > Users do Supabase (o frontend
-- só tem a chave pública, e a service_role jamais deve ir para o navegador).
-- Quando o usuário é criado lá, a trigger handle_new_user já nasce esta
-- migração e cria a linha em `profiles` automaticamente. A partir daí o
-- cadastro de nome, WhatsApp, nível e telas é feito dentro do app, na tela
-- "Usuários". Se algum usuário antigo estiver sem a linha em `profiles`,
-- link_profile_by_email() a cria a partir do e-mail informado.
--
-- Idempotente: pode ser executada quantas vezes for necessário.


-- ═══════════════════════════════════════════════════════════════════════════
-- 1. CATÁLOGO DE TELAS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Uma linha por tela do app. A chave é a mesma usada no atributo
-- `data-permission` do index.html e em `has_permission()` nas políticas.

CREATE TABLE IF NOT EXISTS public.app_permissions (
  key text primary key,
  label text not null,
  description text,
  icon text,
  sort_order integer not null default 0
);

INSERT INTO public.app_permissions (key, label, description, icon, sort_order) VALUES
  ('dashboard',     'Início',            'Resumo do dia, ações rápidas e a lista de módulos.',              'house',           1),
  ('clientes',      'Clientes',          'Cadastro de clientes e histórico de contatos.',                  'users-round',     2),
  ('orcamentos',    'Orçamentos',        'Propostas, valores e conversão em evento.',                      'notebook-tabs',   3),
  ('eventos',       'Eventos',           'Agenda de eventos e a operação de cada(realização).',           'calendar-days',   4),
  ('servicos',      'Serviços',          'Catálogo de serviços oferecidos e seus valores.',                'sparkles',        5),
  ('cardapios',     'Cardápios',         'Cardápios e categorias de doce, salgado, bebida e sobremesa.',   'book-open',       6),
  ('estoque',       'Estoque',           'Itens, quantidades e movimentações de entrada e saída.',        'boxes',           7),
  ('configuracoes', 'Configurações',     'Telas de apoio do catálogo e do estoque.',                       'settings',        8),
  ('cerimonial',    'Cerimonial',        'Roteiro, recepção, equipe, mesas e operação ao vivo.',            'clipboard-check', 9),
  ('usuarios',      'Usuários',          'Cadastro de quem entra no app e quais telas cada pessoa abre.', 'shield-check',   10)
ON CONFLICT (key) DO UPDATE
  SET label = excluded.label,
      description = excluded.description,
      icon = excluded.icon,
      sort_order = excluded.sort_order;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. NÍVEIS DE ACESSO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `rank` ordena da permissão mais alta (1) para a mais baixa. Serve só para
-- ordenar a lista no formulário; a decisão de acesso usa o código.

CREATE TABLE IF NOT EXISTS public.app_roles (
  code text primary key,
  label text not null,
  description text,
  rank integer not null default 10,
  -- owner e admin nunca perdem acesso por padrão: as funções os tratam como
  -- acesso total antes de olhar qualquer lista. `is_system` existe para o app
  -- saber quais níveis não fazem sentido editar o padrão.
  is_system boolean not null default true
);

INSERT INTO public.app_roles (code, label, description, rank) VALUES
  ('owner',    'Proprietário', 'Acesso total, inclusive à tela de Usuários. Não pode ficar sem permissão.', 1),
  ('admin',    'Administrador','Acesso total, inclusive à tela de Usuários.',                                2),
  ('gestor',   'Gestor',       'Acesso a todas as telas de operação, menos Usuários.',                     3),
  ('operador', 'Operador',     'Clientes, Orçamentos, Eventos, Cardápios e Cerimonial.',                     4),
  ('consulta', 'Consulta',     'Acesso de leitura à Agenda e à tela inicial.',                              5)
ON CONFLICT (code) DO UPDATE
  SET label = excluded.label,
      description = excluded.description,
      rank = excluded.rank;


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. PADRÃO DE CADA NÍVEL
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.app_role_permissions (
  role_code text not null references public.app_roles(code) on delete cascade,
  permission text not null references public.app_permissions(key) on delete cascade,
  primary key (role_code, permission)
);

-- DO NOTHING, e não DO UPDATE: a partir do momento em que esta migration roda
-- o padrão dos níveis passa a ser editável dentro do app, e reexecutar o
-- arquivo não pode sobrescrever essa escolha.
INSERT INTO public.app_role_permissions (role_code, permission)
SELECT 'owner', key FROM public.app_permissions
ON CONFLICT DO NOTHING;

INSERT INTO public.app_role_permissions (role_code, permission)
SELECT 'admin', key FROM public.app_permissions
ON CONFLICT DO NOTHING;

INSERT INTO public.app_role_permissions (role_code, permission)
SELECT 'gestor', key FROM public.app_permissions WHERE key <> 'usuarios'
ON CONFLICT DO NOTHING;

INSERT INTO public.app_role_permissions (role_code, permission)
SELECT 'operador', key FROM public.app_permissions
WHERE key IN ('dashboard', 'clientes', 'orcamentos', 'eventos', 'cardapios', 'cerimonial')
ON CONFLICT DO NOTHING;

INSERT INTO public.app_role_permissions (role_code, permission)
SELECT 'consulta', key FROM public.app_permissions WHERE key IN ('dashboard', 'eventos')
ON CONFLICT DO NOTHING;


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. PERFIL: E-MAIL, WHATSAPP, TELAS E SITUAÇÃO
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS whatsapp text;
-- NULL = herda o padrão do nível. Array vazio = nenhuma tela. Com array = usa
-- exatamente as telas listadas, ignorando o padrão do nível.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS permissions text[];
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS active boolean not null default true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS notes text;

-- O `check (role in ('admin','staff'))` da 001 impede owner/gestor/operador.
-- O nome do padrão do Postgres é profiles_role_check, mas o bloco abaixo
-- varre qualquer CHECK sobre a coluna caso a 001 tenha sido editada à mão.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_attribute att
      ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
    WHERE con.conrelid = 'public.profiles'::regclass
      AND con.contype = 'c'
      AND att.attname = 'role'
  LOOP
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', constraint_name);
    RAISE NOTICE 'CHECK de profiles.role removido: %.', constraint_name;
  END LOOP;
END
$$;

-- 'staff' virava 'consulta' antes da chave estrangeira, senão a criação da FK
-- falharia ao validar as linhas que ainda estuvessem com o valor antigo.
UPDATE public.profiles SET role = 'consulta' WHERE role = 'staff';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_code_fkey;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_code_fkey
  FOREIGN KEY (role) REFERENCES public.app_roles(code) ON UPDATE CASCADE;

-- Quem cria a conta agora entra com o nível mais baixo: se alguém abrir o
-- cadastro do Supabase por engano, o usuário não nasce com acesso a nada.
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'consulta';

-- E-mail vem de auth.users: o frontend nunca deve ler essa tabela, e é a
-- única forma de ligar um perfil antigo ao e-mail da conta.
UPDATE public.profiles p
   SET email = lower(btrim(u.email))
  FROM auth.users u
 WHERE u.id = p.id
   AND p.email IS NULL
   AND u.email IS NOT NULL;

UPDATE public.profiles SET email = lower(btrim(email)) WHERE email IS NOT NULL;

-- Contas do Supabase sem perfil (criadas antes da trigger existir).
INSERT INTO public.profiles (id, full_name, email)
SELECT u.id, coalesce(u.raw_user_meta_data ->> 'full_name', u.email), lower(btrim(u.email))
  FROM auth.users u
 WHERE u.email IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id);

CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_key ON public.profiles(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS profiles_role_idx ON public.profiles(role);


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. RESOLUÇÃO DA PERMISSÃO
-- ═══════════════════════════════════════════════════════════════════════════
--
--
-- effective_permissions() é o único lugar do banco que decide o que uma pessoa
-- pode abrir. has_permission(), my_permissions() e a trava do último
-- administrador chamam esta função em vez de repetir a regra: cópias
-- divergentes da mesma condição são exatamente o que deixaria alguém com acesso
-- a mais do que o dono cadastrou, sem erro aparecer em lugar nenhum.
--
-- A ordem é: conta desativada não entra em nada; owner e admin passam direto;
-- depois a lista da própria pessoa; e por último o padrão do nível.

CREATE OR REPLACE FUNCTION public.effective_permissions(
  target_role text,
  target_permissions text[],
  target_active boolean
)
RETURNS text[]
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN target_active IS FALSE THEN ARRAY[]::text[]
    WHEN target_role IN ('owner', 'admin') THEN ARRAY(SELECT ap.key FROM public.app_permissions ap ORDER BY ap.sort_order)
    WHEN target_permissions IS NOT NULL THEN target_permissions
    ELSE ARRAY(SELECT rp.permission FROM public.app_role_permissions rp WHERE rp.role_code = target_role)
  END;
$$;

-- has_permission() é SECURITY DEFINER porque é chamada de dentro das
-- políticas de RLS: sem isso, ler a própria linha em `profiles` para decidir a
-- permissão entraria na política de `profiles` e o banco recusaria a consulta
-- por recursão.
CREATE OR REPLACE FUNCTION public.has_permission(permission_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (
      SELECT permission_key = ANY (public.effective_permissions(p.role, p.permissions, p.active))
      FROM public.profiles p
      WHERE p.id = auth.uid()
    ),
    false
  );
$$;

-- Lista de telas do usuário logado. O frontend usa esta função em vez de
-- refazer a lógica de herança no navegador, para não existir dois lugares
-- decidindo o que é permitido.
CREATE OR REPLACE FUNCTION public.my_permissions()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT public.effective_permissions(p.role, p.permissions, p.active)
       FROM public.profiles p
      WHERE p.id = auth.uid()),
    ARRAY[]::text[]
  );
$$;

-- Perfil e telas numa única chamada. É o que o permissions.js busca ao entrar:
-- uma ida ao banco decide quem é o usuário e o que ele abre, e o app não
-- depende da política de leitura de `profiles` para isso funcionar.
CREATE OR REPLACE FUNCTION public.my_access()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'profile', (SELECT to_jsonb(p) FROM public.profiles p WHERE p.id = auth.uid()),
    'permissions', public.my_permissions()
  );
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 6. CADASTRO E EDIÇÃO DE USUÁRIOS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- As escritas em `profiles` passam por funções, e não por update direto, por
-- dois motivos:
--   1. o grant de coluna impede que alguém altere o próprio `role`. Sem isso,
--      um usuário comum poderia se promover a administrador com uma chamada.
--   2. a validação dos casos que quebram o acesso (rebaixar o único
--      proprietário, desativar a si mesmo) fica em um lugar só.

CREATE OR REPLACE FUNCTION public.assert_access_change(target_user_id uuid, next_role text, next_active boolean default null)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  previous_role text;
  was_active boolean;
  other_owners integer;
  other_managers integer;
BEGIN
  IF NOT public.has_permission('usuarios') THEN
    RAISE EXCEPTION 'Você não tem permissão para gerenciar usuários.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.app_roles r WHERE r.code = next_role) THEN
    RAISE EXCEPTION 'Nível de acesso desconhecido.';
  END IF;

  SELECT p.role, p.active INTO previous_role, was_active
  FROM public.profiles p
  WHERE p.id = target_user_id;

  IF previous_role IS NULL THEN
    RAISE EXCEPTION 'Usuário não encontrado.';
  END IF;

  -- Rebaixar a si mesmo é a forma mais fácil de ficar sem ninguém capaz de
  -- devolver o acesso, então é bloqueado mesmo para dono e administrador.
  IF target_user_id = auth.uid() AND next_role IS DISTINCT FROM previous_role THEN
    RAISE EXCEPTION 'Você não pode alterar o próprio nível de acesso. Peça a outro administrador.';
  END IF;

  -- Desativar a si mesmo trancaria o caminho de volta do mesmo jeito.
  IF target_user_id = auth.uid() AND next_active IS FALSE THEN
    RAISE EXCEPTION 'Você não pode desativar a própria conta.';
  END IF;

  -- O último proprietário ativo não pode ser rebaixado: é o caminho de volta
  -- quando todo mundo já perdeu acesso por engano.
  IF previous_role = 'owner'
     AND next_role IS DISTINCT FROM 'owner'
     AND was_active IS NOT FALSE THEN
    SELECT count(*) INTO other_owners
    FROM public.profiles p
    WHERE p.role = 'owner'
      AND p.active
      AND p.id <> target_user_id;

    IF other_owners = 0 THEN
      RAISE EXCEPTION 'Este é o único proprietário ativo. Promova outro usuário antes de rebaixar este.';
    END IF;
  END IF;

  -- Rede de proteção para a situação "ninguém consegue mais abrir a tela de
  -- Usuários". Com o bloqueio de auto-desativação acima, desativar a última
  -- conta que gerencia acessos já não é alcançável pela API — só restaria
  --_admin desativar o último colega e a si mesmo em seguida, e a segunda parte
  -- é barrada. A trava continua aqui porque essa conclusão depende de duas
  -- regras se sustentando juntas: se alguém relaxar a auto-desativação, ou
  -- abrir outra porta de escrita em profiles, esta é a que impede o app de
  -- ficar sem administrator. A contagem usa effective_permissions(), a mesma
  -- função que decide o acesso, para não divergir dela.
  IF next_active IS FALSE AND was_active IS NOT FALSE THEN
    SELECT count(*) INTO other_managers
    FROM public.profiles p
    WHERE p.id <> target_user_id
      AND 'usuarios' = ANY (public.effective_permissions(p.role, p.permissions, p.active));

    IF other_managers = 0 THEN
      RAISE EXCEPTION 'Esta é a última conta que pode gerenciar os acessos. Nomeie outro administrador antes de desativar esta.';
    END IF;
  END IF;
END;
$$;

-- Normaliza a lista de telas: sem duplicatas, sem vazios e sem chave que não
-- exista no catálogo (uma chave desconhecida ficaria invisível no app e
-- pareceria funcionar).
CREATE OR REPLACE FUNCTION public.normalize_permissions(target text[])
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(
    ARRAY(
      SELECT DISTINCT trim(t)
        FROM unnest(coalesce(target, ARRAY[]::text[])) t
       WHERE trim(t) <> ''
         AND trim(t) IN (SELECT ap.key FROM public.app_permissions ap)
      ORDER BY 1
    ),
    ARRAY[]::text[]
  );
$$;

-- Vincula uma conta já existente no Supabase a um perfil deste app.
--
-- É o caminho do cadastro: o administrador cria a conta em
-- Authentication > Users e informa o mesmo e-mail aqui. O id do usuário é
-- lido de auth.users porque o frontend não tem, e não deve ter, essa chave.
--
-- A linha nasce com 'consulta' e a edição é entregue ao save_profile(), que
-- centraliza as validações de acesso: duplicar o UPDATE aqui arriscaria a
-- validação do "único proprietário" divergir entre os dois caminhos.
CREATE OR REPLACE FUNCTION public.link_profile_by_email(
  target_email text,
  target_name text,
  target_whatsapp text,
  target_role text,
  target_permissions text[] default null,
  target_inherit_role boolean default true
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  matched_user_id uuid;
BEGIN
  IF NOT public.has_permission('usuarios') THEN
    RAISE EXCEPTION 'Você não tem permissão para gerenciar usuários.';
  END IF;

  IF target_email IS NULL OR btrim(target_email) = '' THEN
    RAISE EXCEPTION 'Informe o e-mail da conta.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.app_roles r WHERE r.code = target_role) THEN
    RAISE EXCEPTION 'Nível de acesso desconhecido.';
  END IF;

  SELECT u.id INTO matched_user_id
  FROM auth.users u
  WHERE lower(btrim(u.email)) = lower(btrim(target_email))
  LIMIT 1;

  IF matched_user_id IS NULL THEN
    RAISE EXCEPTION 'Não existe conta com esse e-mail. Crie-a em Authentication > Users no painel do Supabase e tente de novo.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = matched_user_id) THEN
    INSERT INTO public.profiles (id, full_name, email, whatsapp, role)
    VALUES (
      matched_user_id,
      coalesce(nullif(btrim(target_name), ''), target_email),
      lower(btrim(target_email)),
      nullif(btrim(coalesce(target_whatsapp, '')), ''),
      'consulta'
    );
  ELSE
    -- O e-mail guardado pode ter ficado antigo se a conta foi renomeada lá no
    -- painel do Supabase; a busca acima achou pelo e-mail novo.
    UPDATE public.profiles
       SET email = lower(btrim(target_email))
     WHERE id = matched_user_id
       AND email IS DISTINCT FROM lower(btrim(target_email));
  END IF;

  RETURN public.save_profile(
    matched_user_id,
    target_name,
    target_whatsapp,
    target_role,
    target_permissions,
    target_inherit_role,
    NULL
  );
END;
$$;

-- Edição de nome, WhatsApp, nível, telas e situação de um usuário existente.
--
-- `target_permissions` NULL mantém a lista atual. Para VOLTAR a herdar do
-- padrão do nível é preciso `target_inherit_role`: passar NULL não serviria,
-- porque NULL também é o que mantém a lista quando o chamador não mexeu nela,
-- e um usuário com telas próprias ficaria preso nelas para sempre sem ter como
-- sair.
CREATE OR REPLACE FUNCTION public.save_profile(
  target_user_id uuid,
  target_name text,
  target_whatsapp text,
  target_role text,
  target_permissions text[],
  target_inherit_role boolean default false,
  target_active boolean default null
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  saved public.profiles;
BEGIN
  PERFORM public.assert_access_change(target_user_id, target_role, target_active);

  UPDATE public.profiles
     SET full_name = coalesce(nullif(btrim(target_name), ''), full_name),
         whatsapp = nullif(btrim(coalesce(target_whatsapp, '')), ''),
         role = target_role,
         permissions = CASE
           WHEN target_inherit_role THEN NULL
           WHEN target_permissions IS NULL THEN permissions
           ELSE public.normalize_permissions(target_permissions)
         END,
         active = coalesce(target_active, active)
   WHERE id = target_user_id
  RETURNING * INTO saved;

  IF saved.id IS NULL THEN
    RAISE EXCEPTION 'Usuário não encontrado.';
  END IF;

  RETURN saved;
END;
$$;

-- Padrão de telas de um nível, para quem entra depois já nascer com elas.
-- owner e admin são bloqueados: as funções os tratam como acesso total antes
-- de olhar qualquer lista, então um padrão menor só criaria confusão.
CREATE OR REPLACE FUNCTION public.save_role_defaults(target_role text, target_permissions text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_permission('usuarios') THEN
    RAISE EXCEPTION 'Você não tem permissão para gerenciar usuários.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.app_roles r WHERE r.code = target_role) THEN
    RAISE EXCEPTION 'Nível de acesso desconhecido.';
  END IF;

  IF target_role IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Estes níveis já têm acesso a todas as telas.';
  END IF;

  DELETE FROM public.app_role_permissions WHERE role_code = target_role;

  INSERT INTO public.app_role_permissions (role_code, permission)
  SELECT target_role, unnest(public.normalize_permissions(target_permissions))
  ON CONFLICT DO NOTHING;
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 7. TRIGGER DE NOVO USUÁRIO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A 001 copiava só o nome. Agora o e-mail também entra junto, porque é por ele
-- que o app encontra a conta e mostra quem é quem na tela de Usuários. O
-- nível não é informado aqui de propósito: nasce como 'consulta' e só muda
-- quando alguém com acesso à tela de Usuários definir.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    lower(btrim(new.email))
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 8. ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Duas regras valem para todas as tabelas:
--
--   • Um módulo lê o que ele precisa, e não só a própria tabela. O Cerimonial
--     mostra eventos, clientes e o serviço marcado como cerimonial, então quem
--     tem 'cerimonial' lê também essas. Do mesmo modo, o Orçamento lista os
--     serviços do catálogo e o Estoque aparece no cadastro de serviço.
--
--   • 'dashboard' não protege tabela nenhuma: é só a tela inicial, que monta
--     o resumo com leituras de várias tabelas. Quem não tem as permissões
--     comuns vê a tela inicial sem os números.
--
-- Todas as políticas antigas eram `using (true)`, então precisam cair antes de
-- as novas entrarem: duas políticas permissivas em paralelo deixariam a nova
-- sem efeito.
--
-- A limpeza abaixo apaga TODA política permissiva das tabelas listadas, e não
-- só as conhecidas pelo nome. Isso é necessário porque o histórico deste
-- banco criou a mesma política com nomes diferentes: a 001 e a 008 usaram
-- "authenticated users can manage ceremonialistas", com espaços, e a 009 criou
-- "authenticated_users_can_manage_ceremonialistas", com sublinhados. Um DROP
-- POLICY pelo nome da 008 deixaria a da 009 valendo, e o módulo continuaria
-- aberto para qualquer usuário autenticado.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_role_permissions ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  table_name text;
  policy_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'profiles',
    'clients',
    'services',
    'service_materials',
    'quotes',
    'quote_items',
    'events',
    'event_tables',
    'guests',
    'ceremonial_activities',
    'ceremonialistas',
    'ceremonial_templates',
    'ceremonial_template_activities',
    'inventory_items',
    'inventory_movements',
    'inventory_images',
    'inventory_categories',
    'inventory_category_links',
    'menus',
    'menu_services',
    'menu_images',
    'menu_categories',
    'menu_category_links'
  ]
  LOOP
    IF to_regclass('public.' || table_name) IS NULL THEN
      CONTINUE;
    END IF;

    FOR policy_name IN
      SELECT pol.polname
      FROM pg_policy pol
      WHERE pol.polrelid = to_regclass('public.' || table_name)
        AND pol.polpermissive
        AND (pol.polqual IS NULL OR pg_get_expr(pol.polqual, pol.polrelid) = 'true')
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', policy_name, table_name);
      RAISE NOTICE 'Política aberta "%" removida de public.%', policy_name, table_name;
    END LOOP;
  END LOOP;
END
$$;

-- ─── 8.1. Perfis e catálogo de acessos ─────────────────────────────────────
--
-- Ler o próprio perfil é o mínimo para o app mostrar nome e nível. Ler os
-- demais exige acesso à tela de Usuários. Ninguém edita `role` ou
-- `permissions` por update direto: o grant de coluna abaixo restringe a
-- escrita a full_name e whatsapp, e o resto passa por save_profile().

DROP POLICY IF EXISTS "authenticated users can read profiles" ON public.profiles;
DROP POLICY IF EXISTS "users can update their own profile" ON public.profiles;
-- Esta não é apagada pela limpeza acima (o filtro dela não é `true`), então
-- precisa do DROP explícito para a migration poder ser reexecutada.
DROP POLICY IF EXISTS "users can read their own profile" ON public.profiles;
CREATE POLICY "users can read their own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_permission('usuarios'));
CREATE POLICY "users can update their own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- O catálogo é apenas uma lista de nomes: liberado para leitura, para o app
-- conseguir montar o formulário de nível. A escrita é das funções da seção 6.
DROP POLICY IF EXISTS "authenticated users can read app_roles" ON public.app_roles;
CREATE POLICY "authenticated users can read app_roles" ON public.app_roles
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated users can read app_permissions" ON public.app_permissions;
CREATE POLICY "authenticated users can read app_permissions" ON public.app_permissions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated users can read app_role_permissions" ON public.app_role_permissions;
CREATE POLICY "authenticated users can read app_role_permissions" ON public.app_role_permissions
  FOR SELECT TO authenticated USING (true);

-- ─── 8.2. Clientes ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "authenticated users can manage clients" ON public.clients;
CREATE POLICY "authenticated users can manage clients" ON public.clients
  FOR ALL TO authenticated
  USING (public.has_permission('clientes') OR public.has_permission('eventos') OR public.has_permission('cerimonial'))
  WITH CHECK (public.has_permission('clientes'));

-- ─── 8.3. Serviços e materiais ─────────────────────────────────────────────
DROP POLICY IF EXISTS "authenticated users can manage services" ON public.services;
CREATE POLICY "authenticated users can manage services" ON public.services
  FOR ALL TO authenticated
  USING (public.has_permission('servicos') OR public.has_permission('cardapios') OR public.has_permission('orcamentos') OR public.has_permission('cerimonial'))
  WITH CHECK (public.has_permission('servicos'));

DROP POLICY IF EXISTS "authenticated users can manage service materials" ON public.service_materials;
CREATE POLICY "authenticated users can manage service materials" ON public.service_materials
  FOR ALL TO authenticated
  USING (public.has_permission('servicos') OR public.has_permission('estoque'))
  WITH CHECK (public.has_permission('servicos'));

-- ─── 8.4. Orçamentos ───────────────────────────────────────────────────────
-- O Eventos nasce de um orçamento confirmado e o Cerimonial filtra os eventos
-- pelo serviço marcado, então os dois precisam ler as duas tabelas.
DROP POLICY IF EXISTS "authenticated users can manage quotes" ON public.quotes;
CREATE POLICY "authenticated users can manage quotes" ON public.quotes
  FOR ALL TO authenticated
  USING (public.has_permission('orcamentos') OR public.has_permission('eventos') OR public.has_permission('cerimonial'))
  WITH CHECK (public.has_permission('orcamentos'));

DROP POLICY IF EXISTS "authenticated users can manage quote items" ON public.quote_items;
CREATE POLICY "authenticated users can manage quote items" ON public.quote_items
  FOR ALL TO authenticated
  USING (public.has_permission('orcamentos') OR public.has_permission('eventos') OR public.has_permission('cerimonial'))
  WITH CHECK (public.has_permission('orcamentos'));

-- ─── 8.5. Eventos, mesas e convidados ──────────────────────────────────────
DROP POLICY IF EXISTS "authenticated users can manage events" ON public.events;
CREATE POLICY "authenticated users can manage events" ON public.events
  FOR ALL TO authenticated
  USING (public.has_permission('eventos') OR public.has_permission('cerimonial'))
  WITH CHECK (public.has_permission('eventos'));

DROP POLICY IF EXISTS "authenticated users can manage event tables" ON public.event_tables;
CREATE POLICY "authenticated users can manage event tables" ON public.event_tables
  FOR ALL TO authenticated
  USING (public.has_permission('eventos') OR public.has_permission('cerimonial'))
  WITH CHECK (public.has_permission('eventos'));

DROP POLICY IF EXISTS "authenticated users can manage guests" ON public.guests;
CREATE POLICY "authenticated users can manage guests" ON public.guests
  FOR ALL TO authenticated
  USING (public.has_permission('eventos') OR public.has_permission('cerimonial'))
  WITH CHECK (public.has_permission('eventos'));

-- ─── 8.6. Roteiro do cerimonial ────────────────────────────────────────────
DROP POLICY IF EXISTS "authenticated users can manage ceremonial activities" ON public.ceremonial_activities;
CREATE POLICY "authenticated users can manage ceremonial activities" ON public.ceremonial_activities
  FOR ALL TO authenticated
  USING (public.has_permission('cerimonial') OR public.has_permission('eventos'))
  WITH CHECK (public.has_permission('cerimonial'));

-- ─── 8.7. Equipe, mesas do dia e modelos padrão ───────────────────────────
DO $$
BEGIN
  IF to_regclass('public.ceremonialistas') IS NULL THEN
    RAISE NOTICE 'Tabela public.ceremonialistas não existe – ignorada.';
  ELSE
    EXECUTE 'DROP POLICY IF EXISTS "authenticated users can manage ceremonialistas" ON public.ceremonialistas';
    EXECUTE 'CREATE POLICY "authenticated users can manage ceremonialistas" ON public.ceremonialistas
      FOR ALL TO authenticated
      USING (public.has_permission(''cerimonial''))
      WITH CHECK (public.has_permission(''cerimonial''))';
  END IF;

  IF to_regclass('public.ceremonial_templates') IS NULL THEN
    RAISE NOTICE 'Tabela public.ceremonial_templates não existe – ignorada.';
  ELSE
    EXECUTE 'DROP POLICY IF EXISTS "authenticated users can manage ceremonial templates" ON public.ceremonial_templates';
    EXECUTE 'CREATE POLICY "authenticated users can manage ceremonial templates" ON public.ceremonial_templates
      FOR ALL TO authenticated
      USING (public.has_permission(''cerimonial''))
      WITH CHECK (public.has_permission(''cerimonial''))';
  END IF;

  IF to_regclass('public.ceremonial_template_activities') IS NULL THEN
    RAISE NOTICE 'Tabela public.ceremonial_template_activities não existe – ignorada.';
  ELSE
    EXECUTE 'DROP POLICY IF EXISTS "authenticated users can manage ceremonial template activities" ON public.ceremonial_template_activities';
    EXECUTE 'CREATE POLICY "authenticated users can manage ceremonial template activities" ON public.ceremonial_template_activities
      FOR ALL TO authenticated
      USING (public.has_permission(''cerimonial''))
      WITH CHECK (public.has_permission(''cerimonial''))';
  END IF;
END
$$;

-- ─── 8.8. Estoque ──────────────────────────────────────────────────────────
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'inventory_items',
    'inventory_movements',
    'inventory_images',
    'inventory_categories',
    'inventory_category_links'
  ]
  LOOP
    IF to_regclass('public.' || table_name) IS NULL THEN
      RAISE NOTICE 'Tabela public.% não existe – ignorada.', table_name;
      CONTINUE;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'authenticated users can manage ' || table_name, table_name);
    -- Os materiais do serviço apontam para itens do estoque, então quem
    -- cadastra serviço precisa ler os itens.
    EXECUTE format('CREATE POLICY %I ON public.%I
      FOR ALL TO authenticated
      USING (public.has_permission(''estoque'') OR public.has_permission(''servicos''))
      WITH CHECK (public.has_permission(''estoque''))', 'authenticated users can manage ' || table_name, table_name);
  END LOOP;
END
$$;

-- ─── 8.9. Cardápios e categorias ───────────────────────────────────────────
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'menus',
    'menu_services',
    'menu_images',
    'menu_categories',
    'menu_category_links'
  ]
  LOOP
    IF to_regclass('public.' || table_name) IS NULL THEN
      RAISE NOTICE 'Tabela public.% não existe – ignorada.', table_name;
      CONTINUE;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'authenticated users can manage ' || table_name, table_name);
    -- O Orçamento monta a proposta a partir dos cardápios do serviço, então
    -- quem monta orçamento também precisa ler o catálogo.
    EXECUTE format('CREATE POLICY %I ON public.%I
      FOR ALL TO authenticated
      USING (public.has_permission(''cardapios'') OR public.has_permission(''servicos'') OR public.has_permission(''orcamentos''))
      WITH CHECK (public.has_permission(''cardapios''))', 'authenticated users can manage ' || table_name, table_name);
  END LOOP;
END
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 9. CONCESSÕES DE COLUNA EM `profiles`
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Sem isto, um usuário com acesso à própria linha poderia trocar o próprio
-- `role` e se promover a administrador com uma chamada direta à API. O grant
-- por coluna deixa a escrita comum limitada ao que a pessoa muda em si mesma;
-- nível, telas e situação só mudam pelas funções da seção 6.

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name, whatsapp) ON public.profiles TO authenticated;
REVOKE ALL ON public.profiles FROM anon;

-- Não existe política de DELETE em `profiles`: apagar a linha deixaria a conta
-- do Supabase órfã, sem perfil e sem caminho para dentro do app. Desativar
-- (active = false) é a forma de revogar o acesso, e é reversível.

-- O catálogo de acessos é só leitura no frontend. As três tabelas nascem com os
-- grants padrão do Supabase para anon e authenticated, então o acesso do anon
-- é removido aqui: elas descrevem a estrutura de acesso do aplicativo.
REVOKE ALL ON public.app_roles FROM anon;
REVOKE ALL ON public.app_permissions FROM anon;
REVOKE ALL ON public.app_role_permissions FROM anon;
GRANT SELECT ON public.app_roles TO authenticated;
GRANT SELECT ON public.app_permissions TO authenticated;
GRANT SELECT ON public.app_role_permissions TO authenticated;

-- has_permission() e my_permissions() são usadas de dentro das políticas, que
-- rodam como `authenticated`; sem o execute explícito a consulta falha.
REVOKE ALL ON FUNCTION public.has_permission(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_permission(text) TO authenticated;
REVOKE ALL ON FUNCTION public.my_permissions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_permissions() TO authenticated;
REVOKE ALL ON FUNCTION public.my_access() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_access() TO authenticated;
REVOKE ALL ON FUNCTION public.link_profile_by_email(text, text, text, text, text[], boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_profile_by_email(text, text, text, text, text[], boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.save_profile(uuid, text, text, text, text[], boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_profile(uuid, text, text, text, text[], boolean, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.save_role_defaults(text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_role_defaults(text, text[]) TO authenticated;
REVOKE ALL ON FUNCTION public.normalize_permissions(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_permissions(text[]) TO authenticated;
-- assert_access_change é chamada por outras funções security definer e não
-- precisa ficar disponível para o frontend.
REVOKE ALL ON FUNCTION public.assert_access_change(uuid, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.effective_permissions(text, text[], boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.effective_permissions(text, text[], boolean) TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- 10. REALTIME
-- ═══════════════════════════════════════════════════════════════════════════
--
-- profiles já estava na publication desde a 012, e é a tabela que o app
-- escuta para reagir a uma mudança de permissão sem recarregar a página.
-- As tabelas de catálogo entram por completude; são estáticas, então na
-- prática não geram evento.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['app_roles', 'app_permissions', 'app_role_permissions']
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'Tabela public.% não existe – ignorada.', t;
      CONTINUE;
    END IF;

    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      RAISE NOTICE 'public.% publicada no realtime.', t;
    EXCEPTION WHEN duplicate_object THEN
      RAISE NOTICE 'public.% já estava publicada.', t;
    END;
  END LOOP;
END
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 11. PRIMEIRO DONO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Sem isto, o primeiro usuário a entrar ficaria com o papel 'consulta' criado
-- pela trigger e não haveria quem pudesse abrir a tela de Usuários para
-- promover alguém. A conta do administrador do app entra como proprietário,
-- que tem acesso total e pode redefinir as permissões de todos os outros.
--
-- O `active = true` é o que mantém este trecho funcionando depois da 016, que
-- passa a criar todo perfil novo inativo: sem ele, a conta do administrador
-- nasceria bloqueada e a única pessoa capaz de destravar o app ficaria trancada
-- de fora. É por isso que este bloco precisa reativar, e não só promover.

UPDATE public.profiles
   SET role = 'owner',
       active = true
 WHERE lower(btrim(email)) = 'ewertonaires97@gmail.com';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE lower(btrim(email)) = 'ewertonaires97@gmail.com'
  ) THEN
    RAISE WARNING 'Nenhuma conta com e-mail ewertonaires97@gmail.com foi encontrada em public.profiles. Crie a conta em Authentication > Users e execute esta migration de novo para que ela vire proprietária.';
  ELSE
    RAISE NOTICE 'Conta do administrador definida como proprietário e ativa.';
  END IF;
END
$$;

-- Confere o resultado e avisa em vez de falhar calado: uma migração de acesso
-- aplicada pela metade deixa o app inteiro sem dados, e o sintoma é um
-- "não foi possível carregar" em todas as telas.
DO $$
DECLARE
  permissive integer;
BEGIN
  SELECT count(*) INTO permissive
  FROM pg_policies
  WHERE schemaname = 'public'
    AND qual = 'true'
    AND policyname LIKE 'authenticated users can manage%';

  IF permissive > 0 THEN
    RAISE WARNING 'Ainda existem % políticas liberadas para qualquer usuário autenticado. Revise o acesso antes de usar o app.', permissive;
  ELSE
    RAISE NOTICE 'Controle de acesso aplicado: nenhuma política aberta de escritarestante.';
  END IF;
END
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- FIM DA MIGRAÇÃO
-- ═══════════════════════════════════════════════════════════════════════════