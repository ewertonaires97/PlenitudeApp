/* ==========================================================================
   Controle de acesso — quem entra no app e o que cada pessoa vê
   ==========================================================================
   Este arquivo é a camada de interface do controle de acesso. A decisão, porém,
   não é dele: as políticas de RLS da migration 015 já impedem a leitura e a
   escrita no banco. O que está aqui é o que a pessoa enxerga — cartões que
   somem, menus que não abrem e um painel para escolher isso.

   Como a permissão é resolvida em uma função do banco (my_access), não existe
   dois lugares decidindo o que é permitido. Se a lista que o navegador mostra
   e a que o banco aplica divergirem, é porque este arquivo errou, e não porque
   o usuário tem um regra diferente da que o dono cadastrou.

   A conta de login é criada pelo administrador em Authentication > Users do
   Supabase. Depois que a conta existe, tudo o mais — nome, WhatsApp, nível e
   telas — é definido aqui, na tela "Usuários".

   Dependência do banco: sem a migration 015_access_control.sql as funções
   my_access / has_permission não existem, e o app avisa e segue abrindo como
   antes, já que a RLS antiga também liberava tudo. Ver reloadAccess().
   ========================================================================== */

(function () {
  'use strict';

  // Catálogo de telas. Precisa bater com o app_permissions do banco, que é a
  // fonte da verdade: as chaves daqui são as mesmas do atributo
  // `data-permission` do index.html e do que as políticas de RLS pedem.
  const PERMISSIONS = [
    { key: 'dashboard', label: 'Início', hint: 'Resumo do dia, ações rápidas e a lista de módulos.' },
    { key: 'clientes', label: 'Clientes', hint: 'Cadastro de clientes e contatos.' },
    { key: 'orcamentos', label: 'Orçamentos', hint: 'Propostas, valores e conversão em evento.' },
    { key: 'eventos', label: 'Eventos', hint: 'Agenda e operação de cada realização.' },
    { key: 'servicos', label: 'Serviços', hint: 'Catálogo de serviços e seus valores.' },
    { key: 'cardapios', label: 'Cardápios', hint: 'Cardápios e suas categorias.' },
    { key: 'estoque', label: 'Estoque', hint: 'Itens, quantidades e movimentações.' },
    { key: 'configuracoes', label: 'Configurações', hint: 'Telas de apoio do catálogo e do estoque.' },
    { key: 'cerimonial', label: 'Cerimonial', hint: 'Roteiro, recepção, equipe, mesas e ao vivo.' },
    { key: 'financeiro', label: 'Financeiro', hint: 'Recebimentos, dízimo e divisão financeira dos eventos.' },
    { key: 'usuarios', label: 'Usuários', hint: 'Quem entra no app e quais telas cada pessoa abre.' }
  ];

  // Telas cujas telas o dono/admin não pode fechar: são o painel inteiro e o
  // formulário de acesso. Sem elas o resto da tela de Usuários não faz sentido.
  const FIXED_PERMISSIONS = ['usuarios'];

  // Telas que são fechadas quando o usuário perde o acesso, com o módulo que
  // as abre. Sem isso a pessoa ficaria olhando um painel que já não pode mais
  // salvar nada, porque a RLS passa a negar a escrita.
  const SCREENS = [
    { selector: '#client-panel', permission: 'clientes' },
    { selector: '#inventory-panel', permission: 'estoque' },
    { selector: '#inventory-category-panel', permission: 'estoque' },
    { selector: '#service-panel', permission: 'servicos' },
    { selector: '#menu-panel', permission: 'cardapios' },
    { selector: '#category-panel', permission: 'cardapios' },
    { selector: '#quote-panel', permission: 'orcamentos' },
    { selector: '#quote-form-panel', permission: 'orcamentos' },
    { selector: '#quote-deposit-panel', permission: 'orcamentos' },
    { selector: '#quote-reminder-panel', permission: 'orcamentos' },
    { selector: '#quote-alert-banner', permission: 'orcamentos' },
    { selector: '#quote-saved-panel', permission: 'orcamentos' },
    { selector: '#event-panel', permission: 'eventos' },
    { selector: '#event-detail-panel', permission: 'eventos' },
    { selector: '#ceremonial-panel', permission: 'cerimonial' },
    { selector: '#finance-panel', permission: 'financeiro' },
    { selector: '#finance-event-panel', permission: 'financeiro' },
    { selector: '#settings-panel', permission: 'configuracoes' },
    // O painel e o formulário de acesso entram aqui também: perdurar a tela de
    // quem acabou de perder o acesso a ela mostraria botões que o banco já
    // recusa.
    { selector: '#users-panel', permission: 'usuarios' },
    { selector: '#user-form-panel', permission: 'usuarios' }
  ];

  const state = {
    profile: null,
    granted: new Set(),
    roles: [],
    roleDefaults: new Map(),
    users: [],
    resolved: false,
    revealed: false
  };

  const toast = document.querySelector('.toast');
  const appShell = document.querySelector('.app-shell');
  const usersPanel = document.querySelector('#users-panel');
  const usersList = document.querySelector('#users-list');
  const usersFeedback = document.querySelector('#users-feedback');
  const usersSearch = document.querySelector('#users-search');
  const userFormPanel = document.querySelector('#user-form-panel');
  const userForm = document.querySelector('#user-form');
  const userFormTitle = document.querySelector('#user-form-title');
  const userFormFeedback = document.querySelector('#user-form-feedback');
  const userRoleSelect = document.querySelector('#user-role');
  const userRoleDescription = document.querySelector('#user-role-description');
  const userInheritRole = document.querySelector('#user-inherit-role');
  const userPermissionOptions = document.querySelector('#user-permission-options');
  const roleDefaultsList = document.querySelector('#role-defaults');

  let toastTimer;

  function getSupabase() {
    return window.plenitudeSupabase || null;
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[character]));
  }

  // O app.js tem o próprio showToast, que acrescenta " em breve" — texto
  //Pensado para os botões ainda sem ação. Aqui a mensagem é sempre final, então
  // este notify escreve direto no mesmo elemento.
  function notify(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  function roleLabel(code) {
    return state.roles.find((role) => role.code === code)?.label || code || '—';
  }

  // ==========================================================================
  // Permissão do usuário atual
  // ==========================================================================

  function can(permission) {
    return state.granted.has(permission);
  }

  // Usado no início de cada função que abre uma tela. Devolver `true` quando
  // o acesso não pôde ser avaliado ainda: é o app.js que decide o que fazer,
  // e travar a navegação antes da resposta do banco deixaria o app inutilizável
  // num instante de rede ruim.
  function allow(permission) {
    if (can(permission)) return true;
    notify('Você não tem acesso a esta área.');
    return false;
  }

  function applyToUI() {
    document.querySelectorAll('[data-permission]').forEach((element) => {
      element.hidden = !can(element.dataset.permission);
    });

    SCREENS.forEach((screen) => {
      const panel = document.querySelector(screen.selector);
      if (panel && !panel.hidden && !can(screen.permission)) panel.hidden = true;
    });

    // Configurações é só um índice para as telas de apoio. Se nenhuma delas
    // sobrou, o painel abriria vazio, então ele também some.
    const settingsPanel = document.querySelector('#settings-panel');
    const settingsItems = settingsPanel
      ? Array.from(settingsPanel.querySelectorAll('[data-permission]'))
      : [];
    if (settingsPanel && settingsItems.length && settingsItems.every((item) => item.hidden)) {
      settingsPanel.hidden = true;
    }

    // Vale qualquer ponto de entrada — card, ação rápida ou item da navegação
    // de baixo. Olhar só a grade de módulos avisaria "nenhuma tela liberada"
    // para quem só tem, por exemplo, o Estoque pelo menu inferior.
    const anyEntry = Array.from(document.querySelectorAll('.app-shell [data-permission]'))
      .some((element) => !element.hidden);
    const emptyNote = document.querySelector('#access-empty-note');
    if (emptyNote) emptyNote.hidden = anyEntry;

    applyIdentity();
    revealShell();
  }

  // O cabeçalho mostrava "Ana" fixo no HTML desde o começo do projeto. Agora o
  // nome vem do perfil, que é o mesmo dado que o cadastro de usuários edita.
  function applyIdentity() {
    const name = state.profile?.full_name?.trim();
    if (!name) return;

    const firstName = name.split(/\s+/)[0];
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';

    const heading = document.querySelector('#welcome-greeting');
    if (heading) heading.innerHTML = `${greeting}, ${escapeHTML(firstName)}<span>.</span>`;

    const avatar = document.querySelector('#profile-avatar');
    if (avatar) {
      avatar.textContent = firstName.slice(0, 2).toUpperCase();
      avatar.setAttribute('aria-label', `Perfil de ${name}`);
    }
  }

  function revealShell() {
    if (state.revealed || !appShell) return;
    appShell.classList.add('access-ready');
    state.revealed = true;
  }

  function clearAccess() {
    state.profile = null;
    state.granted = new Set();
    state.resolved = false;
  }

  // ==========================================================================
  // Carga do perfil e do catálogo
  // ==========================================================================

  async function loadCatalog() {
    const sb = getSupabase();
    if (!sb) return;

    const [rolesResult, defaultsResult] = await Promise.all([
      sb.from('app_roles').select('code, label, description, rank, is_system').order('rank'),
      sb.from('app_role_permissions').select('role_code, permission')
    ]);

    if (rolesResult.error) {
      console.error('[Acesso] Não foi possível carregar os níveis:', rolesResult.error.message);
      return;
    }

    state.roles = rolesResult.data || [];
    state.roleDefaults = new Map();
    (defaultsResult.data || []).forEach((row) => {
      if (!state.roleDefaults.has(row.role_code)) state.roleDefaults.set(row.role_code, new Set());
      state.roleDefaults.get(row.role_code).add(row.permission);
    });
  }

  function roleDefaultKeys(code) {
    return Array.from(state.roleDefaults.get(code) || []);
  }

  // Aviso persistente dentro do app. Difere do toast porque não some sozinho:
  // um problema de configuração que aparece por 2 segundos e some deixa o
  // administrador sem saber o que aconteceu quando o problema voltar.
  function showAccessWarning(message) {
    const warning = document.querySelector('#access-warning');
    if (!warning) return;
    warning.textContent = message;
    warning.hidden = false;
  }

  function showAccessError(message) {
    const authScreen = document.querySelector('#auth-screen');
    const loginFeedback = document.querySelector('#login-feedback');
    if (authScreen) authScreen.hidden = false;
    if (loginFeedback) loginFeedback.textContent = message;
    if (appShell) appShell.classList.remove('ready');
  }

  async function reloadAccess() {
    const sb = getSupabase();
    if (!sb) return;

    const { data, error } = await sb.rpc('my_access');

    if (error) {
      // A migration 015 ainda não foi aplicada, ou a sessão expirou no meio
      // da consulta.
      //
      // Aqui a decisão é abrir tudo, e não esconder tudo. Sem a 015, a RLS é a
      // antiga, que libera qualquer usuário autenticado — ou seja, o app já
      // está aberto para todos. Esconder os módulos deixaria o aplicativo
      // inutilizável até a migration rodar, que é bem pior do que o problema
      // que estamos resolvendo. 'usuarios' fica de fora de propósito: sem a
      // migration, essa tela não tem colunas nem políticas para funcionar.
      console.error('[Acesso] my_access indisponível — a migration 015_access_control.sql foi aplicada?', error.message);
      state.granted = new Set(PERMISSIONS.map((permission) => permission.key).filter((key) => key !== 'usuarios'));
      state.resolved = true;
      showAccessWarning('Sistema de permissões não configurado. Execute a migration 015_access_control.sql no SQL Editor do Supabase. Enquanto isso, todos os usuários autenticados veem o app inteiro e a tela de Usuários fica indisponível.');
      applyToUI();
      return;
    }

    const profile = data?.profile || null;

    if (!profile) {
      showAccessError('Esta conta ainda não foi cadastrada no app. Peça a um administrador para adicioná-la na tela de Usuários.');
      clearAccess();
      return;
    }

    if (profile.active === false) {
      showAccessError('Esta conta está desativada. Fale com um administrador para reativá-la.');
      clearAccess();
      return;
    }

    state.profile = profile;
    state.granted = new Set(data.permissions || []);
    state.resolved = true;

    await loadCatalog();
    applyToUI();

    // O próprio acesso pode ter mudado enquanto a tela estava aberta (outro
    // administrador mexeu nas permissões). A lista de usuários só interessa
    // para quem pode vê-la.
    if (can('usuarios') && usersPanel && !usersPanel.hidden) loadUsers();
  }

  // ==========================================================================
  // Tela de Usuários
  // ==========================================================================

  function setUsersFeedback(message, isError = false) {
    usersFeedback.textContent = message;
    usersFeedback.style.color = isError ? '#a0483d' : '';
  }

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
  }

  function permissionSummary(profile) {
    if (profile.role === 'owner' || profile.role === 'admin') return 'Acesso total';
    if (profile.permissions === null) {
      const total = roleDefaultKeys(profile.role).length;
      return `Padrão do nível · ${total} ${total === 1 ? 'tela' : 'telas'}`;
    }
    const total = profile.permissions.length;
    return total ? `${total} ${total === 1 ? 'tela' : 'telas'}` : 'Sem telas';
  }

  function renderUsers() {
    const term = (usersSearch?.value || '').trim().toLowerCase();
    const visible = state.users.filter((profile) =>
      [profile.full_name, profile.email, profile.whatsapp]
        .some((value) => (value || '').toLowerCase().includes(term))
    );

    if (!visible.length) {
      usersList.innerHTML = `<div class="empty-clients">${term ? 'Nenhum usuário encontrado para essa busca.' : 'Nenhum usuário cadastrado ainda.'}</div>`;
      return;
    }

    const currentUserId = state.profile?.id;

    usersList.innerHTML = visible.map((profile) => {
      const isSelf = profile.id === currentUserId;
      const isEnabled = profile.active !== false;
      const roleTone = profile.role === 'owner' ? 'owner' : profile.role === 'admin' ? 'admin' : '';

      return `
        <article class="client-row user-row">
          <span class="client-initial">${escapeHTML(initials(profile.full_name))}</span>
          <div class="client-details">
            <strong>${escapeHTML(profile.full_name || 'Sem nome')}${isSelf ? ' <span class="user-self-tag">você</span>' : ''}</strong>
            <span>${escapeHTML(profile.email || 'sem e-mail')}${profile.whatsapp ? ` · ${escapeHTML(profile.whatsapp)}` : ''}</span>
            <span class="user-permission-summary">${escapeHTML(permissionSummary(profile))}</span>
          </div>
          <div class="client-actions">
            <span class="role-badge ${roleTone}">${escapeHTML(roleLabel(profile.role))}</span>
            ${isEnabled ? '' : '<span class="role-badge off">Inativo</span>'}
            <button class="client-action" type="button" data-edit-user="${profile.id}" aria-label="Editar acesso de ${escapeHTML(profile.full_name || 'usuário')}" title="Editar acesso"><i data-lucide="pencil"></i></button>
            <button class="client-action" type="button" data-toggle-user="${profile.id}" aria-label="${isEnabled ? 'Desativar' : 'Reativar'} ${escapeHTML(profile.full_name || 'usuário')}" title="${isEnabled ? 'Desativar acesso' : 'Reativar acesso'}"><i data-lucide="${isEnabled ? 'user-x' : 'user-check'}"></i></button>
          </div>
        </article>
      `;
    }).join('');

    lucide.createIcons();
  }

  async function loadUsers() {
    const sb = getSupabase();
    if (!sb || !can('usuarios')) return;

    setUsersFeedback('Carregando usuários...');
    const { data, error } = await sb
      .from('profiles')
      .select('id, full_name, email, whatsapp, role, permissions, active, updated_at')
      .order('full_name');

    if (error) {
      setUsersFeedback('Não foi possível carregar os usuários. Verifique seu acesso.', true);
      usersList.innerHTML = '';
      return;
    }

    state.users = data || [];
    setUsersFeedback(`${state.users.length} ${state.users.length === 1 ? 'usuário cadastrado' : 'usuários cadastrados'}`);
    renderUsers();
    renderRoleDefaults();
  }

  function openUsersPanel() {
    if (!allow('usuarios')) return;
    // Configurações também é uma tela de apoio sobre a tela inicial e os dois
    // painéis dividem o mesmo z-index: sem isso, Configurações ficaria aberto
    // atrás de Usuários. O navigation.js fica sabendo que Configurações segue
    // na pilha, para o voltar devolver para lá em vez de pular para o início.
    const settingsPanel = document.querySelector('#settings-panel');
    if (settingsPanel) {
      if (window.plenitudeNav && !settingsPanel.hidden) window.plenitudeNav.cover(settingsPanel);
      settingsPanel.hidden = true;
    }
    usersPanel.hidden = false;
    if (usersSearch) usersSearch.value = '';
    loadUsers();
  }

  document.querySelectorAll('[data-open-users]').forEach((button) => {
    button.addEventListener('click', openUsersPanel);
  });
  document.querySelectorAll('[data-close-users]').forEach((button) => {
    button.addEventListener('click', () => { usersPanel.hidden = true; });
  });
  document.querySelectorAll('[data-new-user]').forEach((button) => {
    button.addEventListener('click', () => openUserForm());
  });
  document.querySelectorAll('[data-close-user-form]').forEach((button) => {
    button.addEventListener('click', () => { userFormPanel.hidden = true; });
  });
  if (usersSearch) usersSearch.addEventListener('input', renderUsers);

  // ==========================================================================
  // Padrão de telas de cada nível
  // ==========================================================================

  function renderRoleDefaults() {
    if (!roleDefaultsList) return;

    if (!state.roles.length) {
      roleDefaultsList.innerHTML = '<p class="field-hint">Níveis ainda não carregados.</p>';
      return;
    }

    roleDefaultsList.innerHTML = state.roles.map((role) => {
      const fixed = role.code === 'owner' || role.code === 'admin';
      const keys = fixed ? PERMISSIONS.map((permission) => permission.key) : roleDefaultKeys(role.code);
      const total = keys.length;
      const summary = fixed
        ? 'Acesso a todas as telas, sem configuração.'
        : `${total} ${total === 1 ? 'tela' : 'telas'}`;

      if (fixed) {
        return `
          <details class="role-default">
            <summary class="client-row settings-item">
              <span class="client-initial">${escapeHTML(role.label.slice(0, 1))}</span>
              <span class="client-details"><strong>${escapeHTML(role.label)}</strong><span>${escapeHTML(summary)}</span></span>
              <i data-lucide="chevron-right" class="settings-chevron"></i>
            </summary>
            <div class="role-default-body"><p class="field-hint">Estes níveis têm acesso total por definição, então o padrão não se edita aqui.</p></div>
          </details>
        `;
      }

      return `
        <details class="role-default" data-role-default="${escapeHTML(role.code)}">
          <summary class="client-row settings-item">
            <span class="client-initial">${escapeHTML(role.label.slice(0, 1))}</span>
            <span class="client-details"><strong>${escapeHTML(role.label)}</strong><span>${escapeHTML(role.description || summary)}</span></span>
            <span class="role-badge">${escapeHTML(summary)}</span>
          </summary>
          <div class="role-default-body">
            <p class="field-hint">Quem entra com este nível abre estas telas por padrão.Um usuário com telas marcadas no cadastro ignora este padrão.</p>
            <div class="permission-grid">${permissionGridMarkup(keys, false)}</div>
            <button class="add-client-button" type="button" data-save-role-default="${escapeHTML(role.code)}"><i data-lucide="check"></i><span>Salvar padrão deste nível</span></button>
            <p class="client-form-feedback" data-role-feedback="${escapeHTML(role.code)}" role="alert"></p>
          </div>
        </details>
      `;
    }).join('');

    lucide.createIcons();
  }

  roleDefaultsList?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-save-role-default]');
    if (!button) return;

    const sb = getSupabase();
    const code = button.dataset.saveRoleDefault;
    const container = button.closest('.role-default-body');
    const feedback = container?.querySelector('[data-role-feedback]');
    const selected = selectedPermissionKeys(container);

    button.disabled = true;
    const { error } = await sb.rpc('save_role_defaults', {
      target_role: code,
      target_permissions: selected
    });

    if (error) {
      if (feedback) feedback.textContent = accessErrorMessage(error);
      button.disabled = false;
      return;
    }

    // O catálogo mudou, então o resumo acima do <details> também.
    await loadCatalog();
    renderRoleDefaults();
    notify(`Padrão de ${roleLabel(code)} atualizado`);
  });

  // ==========================================================================
  // Formulário de usuário
  // ==========================================================================

  function permissionGridMarkup(selectedKeys, disabled) {
    return PERMISSIONS.map((permission) => `
      <label class="menu-option permission-option">
        <input type="checkbox" value="${permission.key}" ${selectedKeys.includes(permission.key) ? 'checked' : ''} ${disabled ? 'disabled' : ''} />
        <span class="permission-option-copy">
          <strong>${escapeHTML(permission.label)}</strong>
          <small>${escapeHTML(permission.hint)}</small>
        </span>
      </label>
    `).join('');
  }

  function selectedPermissionKeys(container) {
    if (!container) return [];
    return Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map((input) => input.value);
  }

  function renderRoleOptions() {
    userRoleSelect.innerHTML = state.roles.map((role) =>
      `<option value="${escapeHTML(role.code)}">${escapeHTML(role.label)}</option>`
    ).join('');
  }

  function describeRole(code) {
    const role = state.roles.find((entry) => entry.code === code);
    if (!role) return '';
    const fixed = code === 'owner' || code === 'admin';
    const total = fixed ? PERMISSIONS.length : roleDefaultKeys(code).length;
    const scope = fixed ? 'acesso a todas as telas' : `${total} ${total === 1 ? 'tela' : 'telas'}`;
    return `${role.description || ''} ${scope}.`.trim();
  }

  // A lista de telas que a pessoa já tinha salva, separada do que a grade está
  // mostrando. São coisas diferentes: em modo herança a grade exibe o padrão
  // do nível, e usar a grade como se fosse a lista da pessoa faria o formulário
  // trocar de nível e manter as telas do nível anterior.
  let savedPermissionKeys = null;

  function applyInheritMode() {
    const role = userRoleSelect.value;
    const roleKeys = FIXED_PERMISSIONS.includes(role)
      ? PERMISSIONS.map((permission) => permission.key)
      : roleDefaultKeys(role);

    if (userInheritRole.checked) {
      // Mostrar o que a pessoa vai receber de fato é mais útil do que deixar a
      // grade vazia: o administrador vê o padrão do nível, não o estado salvo.
      userPermissionOptions.innerHTML = permissionGridMarkup(roleKeys, true);
      userInheritRole.closest('.permission-legend')?.classList.add('is-inherited');
      return;
    }

    // Fora da herança, a grade parte da lista que a pessoa já tinha — se ainda
    // for válida para este nível — e do padrão do nível quando for um cadastro
    // novo ou o nível acabou de mudar.
    const keys = savedPermissionKeys?.length ? savedPermissionKeys : roleKeys;
    userPermissionOptions.innerHTML = permissionGridMarkup(keys, false);
    userInheritRole.closest('.permission-legend')?.classList.remove('is-inherited');
  }

  function openUserForm(profile = null) {
    if (!allow('usuarios')) return;

    userForm.reset();
    userFormFeedback.textContent = '';
    renderRoleOptions();

    const isEdit = Boolean(profile);
    const emailInput = document.querySelector('#user-email');

    document.querySelector('#user-id').value = profile?.id || '';
    emailInput.value = profile?.email || '';
    // O e-mail é a chave com que a conta é encontrada no Supabase, então em
    // edição ele identifica a linha e não pode trocar.
    emailInput.readOnly = isEdit;
    userRoleSelect.value = profile?.role || state.roles[state.roles.length - 1]?.code || 'consulta';
    // Quem entra herda o padrão do nível, inclusive no cadastro: o nível já
    // começa no de menor privilégio da lista, e desmarcar as telas todas sem
    // querer era o erro mais fácil de cometer aqui.
    userInheritRole.checked = isEdit ? profile?.permissions === null : true;
    savedPermissionKeys = isEdit && Array.isArray(profile.permissions)
      ? profile.permissions.slice()
      : null;
    // O campo aparece no cadastro também. Com as contas fechadas por padrão,
    // quem chega sozinho pelo Google fica inativo, e quem o administrador
    // cadastra entra ativo — a não ser que ele desmarque de propósito.
    document.querySelector('#user-active').checked = isEdit ? profile?.active !== false : true;

    userFormTitle.textContent = isEdit ? 'Editar acesso' : 'Novo usuário';
    userForm.querySelector('button[type="submit"] span').textContent = isEdit ? 'Salvar acesso' : 'Cadastrar usuário';

    const emailHint = document.querySelector('#user-email-hint');
    if (emailHint) {
      emailHint.textContent = isEdit
        ? 'O e-mail identifica a conta criada no painel do Supabase e não pode ser alterado por aqui.'
        : 'Crie a conta com este e-mail em Authentication > Users no painel do Supabase e depois cadastre aqui o nível e as telas.';
    }

    userRoleDescription.textContent = describeRole(userRoleSelect.value);
    applyInheritMode();

    userFormPanel.hidden = false;
  }

  userRoleSelect.addEventListener('change', () => {
    userRoleDescription.textContent = describeRole(userRoleSelect.value);
    // Trocar de nível fora da herança descarta a lista anterior: ela foi
    // escolhida olhando o padrão do nível velho, e mantê-la daria a impressão
    // de que o padrão do novo nível está valendo.
    if (!userInheritRole.checked) savedPermissionKeys = null;
    applyInheritMode();
  });
  userInheritRole.addEventListener('change', applyInheritMode);

  // O banco é quem decide a mensagem: as funções da 015 levantam avisos
  // escritos para quem está usando o app ("Crie a conta em Authentication >
  // Users..."), e repetir isso aqui criaria dois textos para o mesmo erro.
  function accessErrorMessage(error) {
    if (!error) return 'Não foi possível salvar. Tente novamente.';
    if (error.code === 'P0001') return error.message;
    if (error.code === '42501') return 'Você não tem permissão para essa alteração.';
    if (error.code === '23503') return 'Verifique o nível de acesso escolhido.';
    if (error.code === '23514') return 'Verifique os campos informados.';
    return 'Não foi possível salvar. Tente novamente.';
  }

  userForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const sb = getSupabase();
    const saveButton = userForm.querySelector('button[type="submit"]');
    const saveLabel = saveButton.querySelector('span');
    const userId = document.querySelector('#user-id').value;
    const isEdit = Boolean(userId);
    const inherit = userInheritRole.checked;
    const role = userRoleSelect.value;

    // O banco recusa desativar a própria conta e não deixa rebaixar o próprio
    // nível. Avisar aqui evita gravar o resto do formulário para só no fim a
    // gravação inteira ser recusada.
    if (isEdit && userId === state.profile?.id) {
      const ownActive = document.querySelector('#user-active');
      const ownRole = document.querySelector('#user-role').value;
      if (!ownActive.checked) {
        userFormFeedback.textContent = 'Você não pode desativar a própria conta.';
        return;
      }
      if (ownRole !== state.profile.role) {
        userFormFeedback.textContent = 'Você não pode alterar o próprio nível. Peça a outro administrador.';
        return;
      }
    }

    const payload = {
      target_name: document.querySelector('#user-name').value.trim(),
      target_whatsapp: document.querySelector('#user-whatsapp').value.trim() || null,
      target_role: role,
      target_permissions: inherit ? null : selectedPermissionKeys(userPermissionOptions),
      target_inherit_role: inherit
    };

    saveButton.disabled = true;
    saveLabel.textContent = 'Salvando...';
    userFormFeedback.textContent = '';

    const { error } = isEdit
      ? await sb.rpc('save_profile', {
        target_user_id: userId,
        ...payload,
        target_active: document.querySelector('#user-active').checked
      })
      : await sb.rpc('link_profile_by_email', {
        target_email: document.querySelector('#user-email').value.trim(),
        ...payload,
        target_active: document.querySelector('#user-active').checked
      });

    saveButton.disabled = false;
    saveLabel.textContent = isEdit ? 'Salvar acesso' : 'Cadastrar usuário';

    if (error) {
      userFormFeedback.textContent = accessErrorMessage(error);
      return;
    }

    userFormPanel.hidden = true;
    await loadCatalog();
    await loadUsers();
    // Quem acabou de ser editado pode ser a pessoa logada, e aí o próprio app
    // precisa acompanhar a mudança.
    await reloadAccess();
    notify(isEdit ? 'Acesso atualizado' : 'Usuário cadastrado');
  });

  usersList?.addEventListener('click', async (event) => {
    const editButton = event.target.closest('[data-edit-user]');
    const toggleButton = event.target.closest('[data-toggle-user]');
    const sb = getSupabase();

    if (editButton) {
      openUserForm(state.users.find((profile) => profile.id === editButton.dataset.editUser));
      return;
    }

    if (!toggleButton) return;

    const profile = state.users.find((entry) => entry.id === toggleButton.dataset.toggleUser);
    if (!profile) return;

    const willDisable = profile.active !== false;
    const verb = willDisable ? 'desativar o acesso de' : 'reativar o acesso de';
    if (!window.confirm(`${verb.charAt(0).toUpperCase()}${verb.slice(1)} ${profile.full_name}?`)) return;

    setUsersFeedback('Atualizando...');
    const { error } = await sb.rpc('save_profile', {
      target_user_id: profile.id,
      target_name: profile.full_name,
      target_whatsapp: profile.whatsapp,
      target_role: profile.role,
      target_permissions: profile.permissions,
      target_inherit_role: profile.permissions === null,
      target_active: !willDisable
    });

    if (error) {
      setUsersFeedback(accessErrorMessage(error), true);
      return;
    }

    await loadUsers();
    await reloadAccess();
    notify(willDisable ? 'Acesso desativado' : 'Acesso reativado');
  });

  // ==========================================================================
  // Inicialização
  // ==========================================================================

  function bindAuth() {
    const sb = getSupabase();
    if (!sb) return;

    sb.auth.onAuthStateChange((_event, session) => {
      // O cliente do Supabase serializa as chamadas de auth: um await dentro
      // deste callback trava o renovação do token. Por isso o trabalho sai
      // para o próximo tick.
      setTimeout(() => {
        if (!session) {
          clearAccess();
          return;
        }
        reloadAccess();
      }, 0);
    });
  }

  // Se a resposta não vier (rede presa, migration não aplicada), o app não
  // pode ficar travado atrás de uma tela de login. O banco continua sendo o
  // que barra o acesso; aqui é só a interface.
  function armFallback() {
    setTimeout(() => {
      if (state.resolved) return;
      console.warn('[Acesso] Perfil não resolvido; liberando a interface com as permissões padrão.');
      applyToUI();
    }, 8000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      bindAuth();
      armFallback();
    });
  } else {
    bindAuth();
    armFallback();
  }

  // ==========================================================================
  // API Pública
  // ==========================================================================
  //
  // can() e allow() são consumidos pelo app.js, events.js e ceremonial.js para
  // travar a abertura das telas. reloadAccess() e loadUsers() são chamadas pelo
  // realtime.js quando outro usuário mexe em perfis ou permissões, para que a
  // mudança chegue sem recarregar a página.

  window.plenitudePermissions = {
    can,
    allow,
    reloadAccess,
    loadUsers,
    openUsersPanel,
    // Consultas de leitura que outros módulos podem querer.
    profile: () => state.profile,
    roleLabel,
    PERMISSIONS
  };

})();