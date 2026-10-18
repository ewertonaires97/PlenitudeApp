-- Migração 016: Login com Google e contas fechadas por padrão
--
-- O QUE ESTA MIGRAÇÃO RESOLVE
--
-- Duas coisas que andam juntas.
--
-- 1. O LOGIN COM GOOGLE
--    A conta de login passa a poder ser a conta Google da pessoa, e aí o
--    administrador nunca vê uma senha. Isso é ativado no painel do Supabase
--    (Authentication > Providers > Google) e no Google Cloud Console; nada
--    disso aparece nesta migration, porque o Google responde se linking e
--    mantém o mesmo id de usuário — que é o que preserva as permissões já
--    cadastradas.
--
-- 2. CONTAS FECHADAS POR PADRÃO
--    Publicar o app OAuth no Google significa que QUALQUER conta Google que
--    descobrir o endereço do aplicativo consegue entrar. Sem nada aqui, essa
--    pessoa receberia um perfil com o nível 'consulta' e passaria a ler a
--    agenda, os convidados e o WhatsApp de cada convidado.
--
--    A saída é fechar a porta por padrão: a conta nasce inativa e a pessoa vê
--    "Esta conta está desativada. Fale com um administrador para reativá-la."
--    Só entra depois que o administrador registra a pessoa na tela de Usuários,
--    onde o nível e as telas são definidos. É a mesma tela e o mesmo botão de
--    ativar que já existem para suspender alguém — nenhum conceito novo.
--
-- Por que a conta nasce pelo perfil, e não pela senha: sem o backend que
-- criasse a conta no cadastro (a service_role jamais pode ir para o
-- navegador), o Google é quem cria o usuário no Supabase no primeiro acesso.
-- Esse é o único momento em que uma conta entra no app sem passar por você.
--
-- Idempotente: pode ser executada quantas vezes for necessário.


-- ═══════════════════════════════════════════════════════════════════════════
-- 1. PERFIL NASCE INATIVO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Esta função é a mesma que a 015 substituiu. Só muda o `active` do INSERT:
-- nasce false, e o administrador liga a conta ao cadastrar a pessoa.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, active)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    lower(btrim(new.email)),
    false
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. CADASTRO PELO ADMINISTRADOR ATIVA A CONTA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Criar a conta na tela de Usuários é um gesto deliberado de cadastro, e a
-- pessoa que entra por ele precisa conseguir entrar. Por isso o cadastro vem
-- com `target_active`: o administrador decide, em vez de a conta ficar
-- esperando um clique extra que é fácil esquecer.
--
-- O parâmetro tem default true de propósito: qualquer chamada que não fale
-- dele está registrando alguém, e é esse o caso comum.

DROP FUNCTION IF EXISTS public.link_profile_by_email(text, text, text, text, text[], boolean);

CREATE OR REPLACE FUNCTION public.link_profile_by_email(
  target_email text,
  target_name text,
  target_whatsapp text,
  target_role text,
  target_permissions text[] default null,
  target_inherit_role boolean default true,
  target_active boolean default true
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

  -- O id vem de auth.users porque o frontend não tem, e não deve ter, a chave
  -- que lê essa tabela.
  SELECT u.id INTO matched_user_id
  FROM auth.users u
  WHERE lower(btrim(u.email)) = lower(btrim(target_email))
  LIMIT 1;

  IF matched_user_id IS NULL THEN
    RAISE EXCEPTION 'Não existe conta com esse e-mail. Crie-a em Authentication > Users no painel do Supabase, ou peça para a pessoa entrar uma vez com o Google usando este mesmo e-mail, e tente de novo.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = matched_user_id) THEN
    -- Conta sem perfil: só acontece com contas antigas, criadas antes da
    -- trigger existir. Já entra ativa, porque é gente que usava o app antes.
    INSERT INTO public.profiles (id, full_name, email, whatsapp, role, active)
    VALUES (
      matched_user_id,
      coalesce(nullif(btrim(target_name), ''), target_email),
      lower(btrim(target_email)),
      nullif(btrim(coalesce(target_whatsapp, '')), ''),
      'consulta',
      true
    );
  ELSE
    -- O e-mail guardado pode ter ficado antigo se a conta foi renomeada no
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
    target_active
  );
END;
$$;

REVOKE ALL ON FUNCTION public.link_profile_by_email(text, text, text, text, text[], boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_profile_by_email(text, text, text, text, text[], boolean, boolean) TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. O QUE ESSA MUDANÇA NÃO TOCA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Contas que já existiam continuam ativas. A trigger só roda em INSERT de
-- auth.users, então quem já tinha perfil mantém o acesso de antes; desativar
-- quem já estava usando o app seria uma mudança de comportamento que ninguém
-- pediu.
--
-- Para conferir depois de aplicar:
--
--   SELECT email, role, active FROM public.profiles ORDER BY created_at;

-- ═══════════════════════════════════════════════════════════════════════════
-- FIM DA MIGRAÇÃO
-- ═══════════════════════════════════════════════════════════════════════════