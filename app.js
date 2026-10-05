lucide.createIcons();

const days = ['DOMINGO', 'SEGUNDA-FEIRA', 'TERÇA-FEIRA', 'QUARTA-FEIRA', 'QUINTA-FEIRA', 'SEXTA-FEIRA', 'SÁBADO'];
const months = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
function updateWelcomeDate() {
  const now = new Date();
  const dayName = days[now.getDay()];
  const day = now.getDate();
  const month = months[now.getMonth()];
  const welcomeEyebrow = document.querySelector('.welcome-copy .eyebrow');
  if (welcomeEyebrow) welcomeEyebrow.textContent = `${dayName}, ${day} DE ${month}`;
}
updateWelcomeDate();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((error) => {
      console.error('Não foi possível ativar o modo offline:', error);
    });
  });
}

const authScreen = document.querySelector('#auth-screen');
const appShell = document.querySelector('.app-shell');
const loginForm = document.querySelector('#login-form');
const loginButton = document.querySelector('.login-button');
const loginFeedback = document.querySelector('#login-feedback');
const googleLoginButton = document.querySelector('#google-login-button');
const logoutButton = document.querySelector('#logout-button');
const clientPanel = document.querySelector('#client-panel');
const clientFormPanel = document.querySelector('#client-form-panel');
const clientList = document.querySelector('#client-list');
const clientSearch = document.querySelector('#client-search');
const clientForm = document.querySelector('#client-form');
const clientFormTitle = document.querySelector('#client-form-title');
const clientFormFeedback = document.querySelector('#client-form-feedback');
const clientFeedback = document.querySelector('#client-feedback');
const servicePanel = document.querySelector('#service-panel');
const serviceFormPanel = document.querySelector('#service-form-panel');
const serviceList = document.querySelector('#service-list');
const serviceSearch = document.querySelector('#service-search');
const serviceForm = document.querySelector('#service-form');
const serviceFormTitle = document.querySelector('#service-form-title');
const serviceFormFeedback = document.querySelector('#service-form-feedback');
const serviceFeedback = document.querySelector('#service-feedback');
const serviceMenuFilter = document.querySelector('#service-menu-filter');
const serviceMenuOptions = document.querySelector('#service-menu-options');
const serviceMenuCreate = document.querySelector('[data-new-menu-from-service]');
const menuPanel = document.querySelector('#menu-panel');
const menuList = document.querySelector('#menu-list');
const menuFormPanel = document.querySelector('#menu-form-panel');
const menuForm = document.querySelector('#menu-form');
const menuFormTitle = document.querySelector('#menu-form-title');
const menuFormFeedback = document.querySelector('#menu-form-feedback');
const menuFeedback = document.querySelector('#menu-feedback');
const menuCategoryFilter = document.querySelector('#menu-category-filter');
const menuImageInput = document.querySelector('#menu-images');
const menuImagePreviews = document.querySelector('#menu-image-previews');
const menuCategoryOptions = document.querySelector('#menu-category-options');
const categoryPanel = document.querySelector('#category-panel');
const categoryList = document.querySelector('#category-list');
const categoryFeedback = document.querySelector('#category-feedback');
const settingsPanel = document.querySelector('#settings-panel');
const inventoryCategoryPanel = document.querySelector('#inventory-category-panel');
const inventoryCategoryList = document.querySelector('#inventory-category-list');
const inventoryCategoryFeedback = document.querySelector('#inventory-category-feedback');
const inventoryPanel = document.querySelector('#inventory-panel');
const inventoryList = document.querySelector('#inventory-list');
const inventorySearch = document.querySelector('#inventory-search');
const inventoryLowOnly = document.querySelector('#inventory-low-only');
const inventoryCategoryFilter = document.querySelector('#inventory-category-filter');
const inventoryCategoryOptions = document.querySelector('#inventory-category-options');
const inventoryImageInput = document.querySelector('#inventory-images');
const inventoryImagePreviews = document.querySelector('#inventory-image-previews');
const inventoryFeedback = document.querySelector('#inventory-feedback');
const inventoryFormPanel = document.querySelector('#inventory-form-panel');
const inventoryForm = document.querySelector('#inventory-form');
const inventoryFormTitle = document.querySelector('#inventory-form-title');
const inventoryFormFeedback = document.querySelector('#inventory-form-feedback');
const movementFormPanel = document.querySelector('#movement-form-panel');
const movementForm = document.querySelector('#movement-form');
const movementItemName = document.querySelector('#movement-item-name');
const movementFormFeedback = document.querySelector('#movement-form-feedback');
const movementType = document.querySelector('#movement-type');
const movementQuantityLabel = document.querySelector('#movement-quantity-label');
const imageViewer = document.querySelector('#image-viewer');
const imageViewerImage = document.querySelector('#image-viewer-image');
const detailView = document.querySelector('#detail-view');
const detailViewTitle = document.querySelector('#detail-view-title');
const detailViewEyebrow = document.querySelector('#detail-view-eyebrow');
const detailViewContent = document.querySelector('#detail-view-content');
const quotePanel = document.querySelector('#quote-panel');
const quoteList = document.querySelector('#quote-list');
const quoteSearch = document.querySelector('#quote-search');
const quoteStatusFilter = document.querySelector('#quote-status-filter');
const quoteFeedback = document.querySelector('#quote-feedback');
const quoteFormPanel = document.querySelector('#quote-form-panel');
const quoteForm = document.querySelector('#quote-form');
const quoteFormTitle = document.querySelector('#quote-form-title');
const quoteFormFeedback = document.querySelector('#quote-form-feedback');
const quoteServicePicker = document.querySelector('#quote-service-picker');
const menuServiceOptions = document.querySelector('#menu-service-options');
const quoteClientSelect = document.querySelector('#quote-client');
const quoteSubtotalPreview = document.querySelector('#quote-subtotal-preview');
const quoteTotalPreview = document.querySelector('#quote-total-preview');
const quoteDepositPercentInput = document.querySelector('#quote-deposit-percent');
const quoteValidUntilInput = document.querySelector('#quote-valid-until');
const quoteDepositPreview = document.querySelector('#quote-deposit-preview');
let clients = [];
let services = [];
let menus = [];
let menuImages = [];
let menuCategories = [];
let menuCategoryLinks = [];
let pendingMenuImages = [];
let removedMenuImageIds = [];
let quotes = [];
let inventoryItems = [];
let inventoryImages = [];
let inventoryCategories = [];
let inventoryCategoryLinks = [];
let pendingInventoryImages = [];
let removedInventoryImageIds = [];

function setAuthenticated(isAuthenticated) {
  authScreen.hidden = isAuthenticated;
  appShell.classList.toggle('ready', isAuthenticated);
}

function showLoginError(message) {
  loginFeedback.textContent = message;
  loginButton.disabled = false;
  loginButton.querySelector('span').textContent = 'Entrar no backoffice';
  if (googleLoginButton) {
    googleLoginButton.disabled = false;
    googleLoginButton.querySelector('span').textContent = 'Entrar com Google';
  }
}

// Entrar com a conta Google da pessoa. A configuração do provedor é feita no
// painel do Supabase e no Google Cloud Console, não aqui: o app só dispara o
// redirect e o Supabase devolve a sessão no mesmo endereço.
//
// A URL de retorno é a da própria página, e não uma rota inventada: o app não
// tem router, e é esse endereço que precisa estar na lista de Redirect URLs do
// Supabase.
googleLoginButton?.addEventListener('click', async () => {
  loginFeedback.textContent = '';
  googleLoginButton.disabled = true;
  googleLoginButton.querySelector('span').textContent = 'Abrindo o Google...';

  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.href.split('#')[0] }
  });

  // Sem este return a execução continuaria e religaria o botão: o redirect é
  // assíncrono e o erro chega logo em seguida.
  if (error) {
    showLoginError('O login com Google ainda não está liberado para este app.');
    console.error('Falha no login com Google:', error.message);
    return;
  }

  // Só chega aqui se o redirect falhar de verdade. Sem isso o botão ficaria
  // travado em "Abrindo o Google..." para sempre.
  setTimeout(() => {
    showLoginError('Não foi possível abrir o Google. Tente novamente.');
  }, 4000);
});

supabaseClient.auth.getSession().then(({ data, error }) => {
  if (error) {
    console.error('Não foi possível inicializar o Supabase:', error.message);
    showLoginError('Não foi possível verificar a sessão. Tente novamente.');
    return;
  }

  setAuthenticated(Boolean(data.session));
  mostrarErroDoOAuth();
  console.info('Supabase conectado ao projeto Plenitude Realizações.');
});

// Login social devolve o erro na URL, não no retorno da chamada. Sem tratar
// isso, quemconfigurou o endereço errado no Supabase voltaria para a tela de
// login sem nenhuma pista do que aconteceu.
function mostrarErroDoOAuth() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(window.location.search);
  const ler = (chave) => hash.get(chave) ?? query.get(chave);

  const codigo = ler('error_code');
  const descricao = ler('error_description');
  const erro = ler('error');

  if (!codigo && !erro) return false;

  const detalhe = `${erro || ''} ${codigo || ''} ${descricao || ''}`;
  let mensagem = 'Não foi possível entrar com o Google.';

  if (codigo === 'access_denied') {
    mensagem = 'O acesso foi cancelado na tela do Google.';
  } else if (/redirect|uri_not|invalid_request/i.test(detalhe)) {
    // É o caso mais comum de verdade: o Site URL ou a Redirect URL não
    // includes o endereço deste app.
    mensagem = 'O endereço deste app ainda não foi liberado no painel do Supabase.';
  } else if (descricao) {
    mensagem = descricao;
  }

  console.error('[OAuth] Falha ao voltar do login:', codigo || erro, descricao || '');
  showLoginError(mensagem);
  authScreen.hidden = false;
  if (appShell) appShell.classList.remove('ready');

  // Só limpa a URL no caso de erro: num login bem-sucedido o hash traz o
  // token, e apagá-lo aqui derrubaria a sessão que acabou de chegar.
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  return true;
}

supabaseClient.auth.onAuthStateChange((_event, session) => {
  setAuthenticated(Boolean(session));
});

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginFeedback.textContent = '';
  loginButton.disabled = true;
  loginButton.querySelector('span').textContent = 'Entrando...';

  const formData = new FormData(loginForm);
  const { error } = await supabaseClient.auth.signInWithPassword({
    email: formData.get('email'),
    password: formData.get('password')
  });

  if (error) {
    showLoginError('E-mail ou senha inválidos.');
    return;
  }

  loginForm.reset();
  loginButton.disabled = false;
  loginButton.querySelector('span').textContent = 'Entrar no backoffice';
});

logoutButton.addEventListener('click', async () => {
  const { error } = await supabaseClient.auth.signOut();
  if (error) showToast('Não foi possível sair');
});

// Trava a abertura de uma tela para quem não tem a permissão correspondente.
// A decisão vem do banco (my_access, resolvido pelo permissions.js); aqui o
// papel é só não mostrar uma tela que a pessoa não pode usar. A regra de
// escrita continua sendo a RLS, que nega o salvamento de qualquer forma.
function permitir(permission) {
  const access = window.plenitudePermissions;
  if (!access) return true;
  return access.allow(permission);
}

function setClientFeedback(message, isError = false) {
  clientFeedback.textContent = message;
  clientFeedback.style.color = isError ? '#a0483d' : '';
}

function clientInitial(name) {
  return name.trim().charAt(0).toUpperCase() || '?';
}

function escapeHTML(value) {
  return String(value || '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[character]));
}

function whatsappNumber(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits ? (digits.startsWith('55') ? digits : `55${digits}`) : '';
}

function renderClients() {
  const searchTerm = clientSearch.value.trim().toLowerCase();
  const visibleClients = clients.filter((client) => [client.name, client.whatsapp, client.email].some((value) => (value || '').toLowerCase().includes(searchTerm)));

  if (!visibleClients.length) {
    clientList.innerHTML = `<div class="empty-clients">${searchTerm ? 'Nenhum cliente encontrado para essa busca.' : 'Ainda não há clientes cadastrados.'}</div>`;
    return;
  }

  clientList.innerHTML = visibleClients.map((client) => `
    <article class="client-row detail-trigger" data-detail-type="client" data-detail-id="${client.id}">
      <span class="client-initial">${clientInitial(client.name)}</span>
      <div class="client-details">
        <strong>${escapeHTML(client.name)}</strong>
        <span>${client.whatsapp || client.email || 'Sem contato informado'}</span>
      </div>
      <div class="client-actions">
        <button class="client-action" type="button" data-edit-client="${client.id}" aria-label="Editar ${client.name}" title="Editar"><i data-lucide="pencil"></i></button>
        ${client.whatsapp ? `<button class="client-action whatsapp-action" type="button" data-whatsapp="${whatsappNumber(client.whatsapp)}" aria-label="Abrir WhatsApp de ${escapeHTML(client.name)}" title="WhatsApp"><i data-lucide="message-circle"></i></button>` : ''}
        <button class="client-action" type="button" data-delete-client="${client.id}" aria-label="Excluir ${client.name}" title="Excluir"><i data-lucide="trash-2"></i></button>
      </div>
    </article>
  `).join('');
  lucide.createIcons();
}

async function loadClients() {
  setClientFeedback('Carregando clientes...');
  const { data, error } = await supabaseClient.from('clients').select('id, name, whatsapp, email, notes, created_at').order('name');
  if (error) {
    setClientFeedback('Não foi possível carregar os clientes. Verifique seu acesso.', true);
    clientList.innerHTML = '';
    return;
  }
  clients = data || [];
  setClientFeedback(`${clients.length} ${clients.length === 1 ? 'cliente cadastrado' : 'clientes cadastrados'}`);
  renderClients();
}

function openClients() {
  if (!permitir('clientes')) return;
  clientPanel.hidden = false;
  clientSearch.value = '';
  loadClients();
}

function openClientForm(client = null) {
  clientForm.reset();
  document.querySelector('#client-id').value = client?.id || '';
  document.querySelector('#client-name').value = client?.name || '';
  document.querySelector('#client-whatsapp').value = client?.whatsapp || '';
  document.querySelector('#client-email').value = client?.email || '';
  document.querySelector('#client-notes').value = client?.notes || '';
  clientFormTitle.textContent = client ? 'Editar cliente' : 'Novo cliente';
  clientFormFeedback.textContent = '';
  clientFormPanel.hidden = false;
}

document.querySelectorAll('[data-open-clients]').forEach((button) => button.addEventListener('click', openClients));
document.querySelectorAll('[data-close-clients]').forEach((button) => button.addEventListener('click', () => { clientPanel.hidden = true; }));
document.querySelectorAll('[data-new-client]').forEach((button) => button.addEventListener('click', () => openClientForm()));
document.querySelectorAll('[data-close-client-form]').forEach((button) => button.addEventListener('click', () => { clientFormPanel.hidden = true; }));
clientSearch.addEventListener('input', renderClients);

clientForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const saveButton = clientForm.querySelector('button[type="submit"]');
  const clientId = document.querySelector('#client-id').value;
  const payload = {
    name: document.querySelector('#client-name').value.trim(),
    whatsapp: document.querySelector('#client-whatsapp').value.trim() || null,
    email: document.querySelector('#client-email').value.trim() || null,
    notes: document.querySelector('#client-notes').value.trim() || null
  };
  saveButton.disabled = true;
  saveButton.querySelector('span').textContent = 'Salvando...';
  clientFormFeedback.textContent = '';

  const result = clientId
    ? await supabaseClient.from('clients').update(payload).eq('id', clientId)
    : await supabaseClient.from('clients').insert(payload);

  if (result.error) {
    clientFormFeedback.textContent = 'Não foi possível salvar. Confira os dados e tente novamente.';
    saveButton.disabled = false;
    saveButton.querySelector('span').textContent = 'Salvar cliente';
    return;
  }

  clientFormPanel.hidden = true;
  await loadClients();
  saveButton.disabled = false;
  saveButton.querySelector('span').textContent = 'Salvar cliente';
  showToast(clientId ? 'Cliente atualizado' : 'Cliente cadastrado');
});

clientList.addEventListener('click', async (event) => {
  const editButton = event.target.closest('[data-edit-client]');
  const deleteButton = event.target.closest('[data-delete-client]');
  const whatsappButton = event.target.closest('[data-whatsapp]');
  if (whatsappButton) {
    window.open(`https://wa.me/${whatsappButton.dataset.whatsapp}`, '_blank', 'noopener,noreferrer');
    return;
  }
  if (editButton) {
    openClientForm(clients.find((client) => client.id === editButton.dataset.editClient));
    return;
  }
  if (deleteButton) {
    const client = clients.find((item) => item.id === deleteButton.dataset.deleteClient);
    if (!client || !window.confirm(`Excluir o cliente ${client.name}?`)) return;
    const { error } = await supabaseClient.from('clients').delete().eq('id', client.id);
    if (error) {
      setClientFeedback('Não foi possível excluir este cliente. Ele pode estar ligado a um orçamento.', true);
      return;
    }
    await loadClients();
    showToast('Cliente excluído');
  }
});

function setServiceFeedback(message, isError = false) {
  serviceFeedback.textContent = message;
  serviceFeedback.style.color = isError ? '#a0483d' : '';
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function renderServices() {
  const searchTerm = serviceSearch.value.trim().toLowerCase();
  const selectedMenuId = serviceMenuFilter.value;
  const visibleServices = services.filter((service) => {
    const matchesSearch = [service.name, service.category, service.description].some((value) => (value || '').toLowerCase().includes(searchTerm));
    const matchesMenu = !selectedMenuId || service.menuIds.includes(selectedMenuId);
    return matchesSearch && matchesMenu;
  });

  if (!visibleServices.length) {
    serviceList.innerHTML = `<div class="empty-clients">${searchTerm ? 'Nenhum serviço encontrado para essa busca.' : 'Ainda não há serviços cadastrados.'}</div>`;
    return;
  }

  serviceList.innerHTML = visibleServices.map((service) => `
    <article class="client-row service-row detail-trigger" data-detail-type="service" data-detail-id="${service.id}">
      <span class="client-initial">${escapeHTML(clientInitial(service.name))}</span>
      <div class="client-details">
        <strong>${escapeHTML(service.name)}</strong>
        <span>${escapeHTML(service.category || 'Sem categoria')}</span>
        ${service.menuNames.length ? `<span class="service-menus">${escapeHTML(service.menuNames.join(' · '))}</span>` : ''}
        ${service.description ? `<span class="service-description">${escapeHTML(service.description)}</span>` : ''}
        <span class="service-price">${formatCurrency(service.default_price)}</span>
        <span class="service-status${service.active ? '' : ' inactive'}">${service.active ? 'Ativo' : 'Inativo'}</span>
        ${service.is_ceremonial ? '<span class="service-status ceremonial">Cerimonial</span>' : ''}
      </div>
      <div class="client-actions">
        <button class="client-action service-toggle" type="button" data-toggle-service="${service.id}" aria-label="${service.active ? 'Desativar' : 'Ativar'} ${escapeHTML(service.name)}" title="${service.active ? 'Desativar' : 'Ativar'}">${service.active ? 'Desativar' : 'Ativar'}</button>
        <button class="client-action" type="button" data-edit-service="${service.id}" aria-label="Editar ${escapeHTML(service.name)}" title="Editar"><i data-lucide="pencil"></i></button>
        <button class="client-action" type="button" data-delete-service="${service.id}" aria-label="Excluir ${escapeHTML(service.name)}" title="Excluir"><i data-lucide="trash-2"></i></button>
      </div>
    </article>
  `).join('');
  lucide.createIcons();
}

async function loadServices() {
  setServiceFeedback('Carregando serviços...');
  const { data, error } = await supabaseClient.from('services').select('id, name, description, category, default_price, active, is_ceremonial, created_at').order('name');
  if (error) {
    setServiceFeedback('Não foi possível carregar os serviços. Verifique seu acesso.', true);
    serviceList.innerHTML = '';
    return;
  }
  services = data || [];
  hydrateMenuServiceLinks();
  setServiceFeedback(`${services.length} ${services.length === 1 ? 'serviço cadastrado' : 'serviços cadastrados'}`);
  renderServices();
  if (!menuPanel.hidden) renderMenus();
}

// O vinculo cardapio <-> serviço é N:N: um mesmo cardapio pode participar de
// varios servicos e, por isso, aparece em mais de um deles no orcamento.
function groupMenusByService(menus, serviceIds) {
  const wanted = new Set(serviceIds.filter(Boolean));
  const byService = new Map();
  menus.forEach((menu) => {
    menu.serviceIds.forEach((serviceId) => {
      if (!wanted.has(serviceId)) return;
      if (!byService.has(serviceId)) byService.set(serviceId, []);
      byService.get(serviceId).push(menu);
    });
  });
  return byService;
}

// O vinculo cardapio <-> serviço é N:N e mora em menu_services. Derivar os dois
// lados aqui mantem services e menus coerentes mesmo com os dois loaders rodando
// em paralelo.
function hydrateMenuServiceLinks() {
  services = services.map((service) => {
    const linked = menus.filter((menu) => menu.serviceIds.includes(service.id));
    return { ...service, menuIds: linked.map((menu) => menu.id), menuNames: linked.map((menu) => menu.name) };
  });
  menus = menus.map((menu) => ({
    ...menu,
    serviceNames: menu.serviceIds.map((id) => services.find((item) => item.id === id)?.name).filter(Boolean)
  }));
}

function openServices() {
  if (!permitir('servicos')) return;
  servicePanel.hidden = false;
  serviceSearch.value = '';
  serviceMenuFilter.value = '';
  Promise.all([loadMenus(), loadServices()]);
}

// No formulario de servico todos os cardapios sao listados: os marcados sao os
// que participam deste servico. O mesmo cardapio pode estar marcado em outros
// servicos ao mesmo tempo, e o nome do cardapio abre a tela de detalhes dele.
let serviceMenusBefore = [];

function renderServiceMenuOptions(serviceId) {
  if (!menus.length) {
    serviceMenuOptions.innerHTML = '<span class="field-hint">Nenhum cardápio cadastrado ainda.</span>';
    return;
  }
  serviceMenuOptions.innerHTML = menus.map((menu) => {
    const checked = serviceId ? menu.serviceIds.includes(serviceId) : false;
    const others = menu.serviceIds
      .filter((id) => id !== serviceId)
      .map((id) => services.find((service) => service.id === id)?.name)
      .filter(Boolean);
    const othersLine = others.length
      ? `<span class="service-menu-owner">também em ${escapeHTML(others.join(', '))}</span>`
      : '';
    return `<div class="service-menu-option${checked ? ' selected' : ''}">
      <label class="service-menu-check" for="service-menu-${menu.id}"><input id="service-menu-${menu.id}" type="checkbox" data-service-menu="${menu.id}" ${checked ? 'checked' : ''} /></label>
      <button class="linked-menu-chip" type="button" data-open-menu-detail="${menu.id}" aria-label="Abrir cardápio ${escapeHTML(menu.name)}"><i data-lucide="book-open"></i><span>${escapeHTML(menu.name)}</span></button>
      ${othersLine}
    </div>`;
  }).join('');
  lucide.createIcons();
}

serviceMenuOptions.addEventListener('change', (event) => {
  const checkbox = event.target.closest('[data-service-menu]');
  if (checkbox) checkbox.closest('.service-menu-option').classList.toggle('selected', checkbox.checked);
});

async function openServiceForm(service = null) {
  serviceForm.reset();
  document.querySelector('#service-id').value = service?.id || '';
  document.querySelector('#service-name').value = service?.name || '';
  document.querySelector('#service-category').value = service?.category || '';
  document.querySelector('#service-price').value = service?.default_price ?? '';
  document.querySelector('#service-description').value = service?.description || '';
  document.querySelector('#service-active').checked = service?.active ?? true;
  document.querySelector('#service-is-ceremonial').checked = service?.is_ceremonial ?? false;
  serviceFormTitle.textContent = service ? 'Editar serviço' : 'Novo serviço';
  serviceFormFeedback.textContent = '';
  serviceFormPanel.hidden = false;
  await Promise.all([loadMenus(), loadServices()]);
  serviceMenusBefore = service ? menus.filter((menu) => menu.serviceIds.includes(service.id)).map((menu) => menu.id) : [];
  renderServiceMenuOptions(service?.id || '');
  serviceMenuCreate.hidden = !service;
}

document.querySelectorAll('[data-open-services]').forEach((button) => button.addEventListener('click', openServices));
document.querySelectorAll('[data-close-services]').forEach((button) => button.addEventListener('click', () => { servicePanel.hidden = true; }));
document.querySelectorAll('[data-new-service]').forEach((button) => button.addEventListener('click', () => openServiceForm()));
document.querySelectorAll('[data-close-service-form]').forEach((button) => button.addEventListener('click', () => { serviceFormPanel.hidden = true; }));
serviceSearch.addEventListener('input', renderServices);
serviceMenuFilter.addEventListener('change', renderServices);

serviceForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const saveButton = serviceForm.querySelector('button[type="submit"]');
  const serviceId = document.querySelector('#service-id').value;
  const payload = {
    name: document.querySelector('#service-name').value.trim(),
    category: document.querySelector('#service-category').value.trim() || null,
    default_price: Number(document.querySelector('#service-price').value),
    description: document.querySelector('#service-description').value.trim() || null,
    active: document.querySelector('#service-active').checked,
    is_ceremonial: document.querySelector('#service-is-ceremonial').checked
  };
  saveButton.disabled = true;
  saveButton.querySelector('span').textContent = 'Salvando...';
  serviceFormFeedback.textContent = '';

  const result = serviceId
    ? await supabaseClient.from('services').update(payload).eq('id', serviceId).select('id').single()
    : await supabaseClient.from('services').insert(payload).select('id').single();

  if (result.error) {
    serviceFormFeedback.textContent = 'Não foi possível salvar. Confira os dados e tente novamente.';
    saveButton.disabled = false;
    saveButton.querySelector('span').textContent = 'Salvar serviço';
    return;
  }

  const savedId = result.data?.id;
  if (!savedId) {
    serviceFormFeedback.textContent = 'Não foi possível salvar. Confira os dados e tente novamente.';
    saveButton.disabled = false;
    saveButton.querySelector('span').textContent = 'Salvar serviço';
    return;
  }
  // Vinculo N:N em menu_services. Os cardapios marcados passam a participar
  // deste servico; os que estavam vinculados e foram desmarcados saem apenas
  // deste servico, continuando nos demais onde tambem aparecem.
  const checkedMenus = [...serviceMenuOptions.querySelectorAll('[data-service-menu]:checked')].map((checkbox) => checkbox.dataset.serviceMenu);
  const releasedMenus = serviceMenusBefore.filter((menuId) => !checkedMenus.includes(menuId));
  let menusError = null;
  if (releasedMenus.length) {
    const release = await supabaseClient.from('menu_services').delete().eq('service_id', savedId).in('menu_id', releasedMenus);
    if (release.error) menusError = release.error;
  }
  if (!menusError && checkedMenus.length) {
    // Só entram os vínculos novos: os que já existiam permanecem intactos, para
    // não repetir a chave (menu_id, service_id).
    const newLinks = checkedMenus.filter((menuId) => !serviceMenusBefore.includes(menuId));
    if (newLinks.length) {
      const attach = await supabaseClient.from('menu_services').insert(
        newLinks.map((menuId, index) => ({ menu_id: menuId, service_id: savedId, sort_order: index }))
      );
      if (attach.error) menusError = attach.error;
    }
  }
  if (menusError) {
    serviceFormFeedback.textContent = 'Serviço salvo, mas não foi possível atualizar os cardápios vinculados.';
    saveButton.disabled = false;
    saveButton.querySelector('span').textContent = 'Salvar serviço';
    return;
  }

  serviceFormPanel.hidden = true;
  // O vinculo dos cardapios mora em menu_services, entao os dois lados sao
  // recarregados juntos (excluir um servico leva junto os vinculos dele, por
  // causa do ON DELETE CASCADE).
  await Promise.all([loadServices(), loadMenus()]);
  saveButton.disabled = false;
  saveButton.querySelector('span').textContent = 'Salvar serviço';
  showToast(serviceId ? 'Serviço atualizado' : 'Serviço cadastrado');
});

serviceList.addEventListener('click', async (event) => {
  const editButton = event.target.closest('[data-edit-service]');
  const deleteButton = event.target.closest('[data-delete-service]');
  const toggleButton = event.target.closest('[data-toggle-service]');
  if (editButton) {
    openServiceForm(services.find((service) => service.id === editButton.dataset.editService));
    return;
  }
  if (toggleButton) {
    const service = services.find((item) => item.id === toggleButton.dataset.toggleService);
    if (!service) return;
    const { error } = await supabaseClient.from('services').update({ active: !service.active }).eq('id', service.id);
    if (error) {
      setServiceFeedback('Não foi possível alterar a disponibilidade deste serviço.', true);
      return;
    }
    await loadServices();
    return;
  }
  if (deleteButton) {
    const service = services.find((item) => item.id === deleteButton.dataset.deleteService);
    if (!service || !window.confirm(`Excluir o serviço ${service.name}?`)) return;
    const { error } = await supabaseClient.from('services').delete().eq('id', service.id);
    if (error) {
      setServiceFeedback('Não foi possível excluir este serviço.', true);
      return;
    }
    await loadServices();
    showToast('Serviço excluído');
  }
});

function setMenuFeedback(message, isError = false) {
  menuFeedback.textContent = message;
  menuFeedback.style.color = isError ? '#a0483d' : '';
}

function setCategoryFeedback(message, isError = false) {
  categoryFeedback.textContent = message;
  categoryFeedback.style.color = isError ? '#a0483d' : '';
}

function renderCategories() {
  if (!menuCategories.length) {
    categoryList.innerHTML = '<div class="empty-clients">Ainda não há categorias cadastradas.</div>';
    return;
  }
  categoryList.innerHTML = menuCategories.map((category) => {
    const menuCount = menuCategoryLinks.filter((link) => link.category_id === category.id).length;
    return `<article class="client-row detail-trigger" data-detail-type="category" data-detail-id="${category.id}"><span class="client-initial">${escapeHTML(clientInitial(category.name))}</span><div class="client-details"><strong>${escapeHTML(category.name)}</strong><span>${menuCount} ${menuCount === 1 ? 'cardápio' : 'cardápios'}</span></div><div class="client-actions"><button class="client-action" type="button" data-edit-category="${category.id}" aria-label="Editar ${escapeHTML(category.name)}" title="Editar"><i data-lucide="pencil"></i></button><button class="client-action" type="button" data-delete-category="${category.id}" aria-label="Excluir ${escapeHTML(category.name)}" title="Excluir"><i data-lucide="trash-2"></i></button></div></article>`;
  }).join('');
  lucide.createIcons();
}

function renderMenuFilter() {
  const selectedValue = serviceMenuFilter.value;
  serviceMenuFilter.innerHTML = '<option value="">Todos os cardápios</option>' + menus.map((menu) => `<option value="${menu.id}">${escapeHTML(menu.name)}</option>`).join('');
  serviceMenuFilter.value = menus.some((menu) => menu.id === selectedValue) ? selectedValue : '';
}

function renderMenuCategoryFilter() {
  const selectedValue = menuCategoryFilter.value;
  menuCategoryFilter.innerHTML = '<option value="">Todas as categorias</option>' + menuCategories.map((category) => `<option value="${category.id}">${escapeHTML(category.name)}</option>`).join('');
  menuCategoryFilter.value = menuCategories.some((category) => category.id === selectedValue) ? selectedValue : '';
}

function renderMenus() {
  const selectedCategoryId = menuCategoryFilter.value;
  const visibleMenus = menus.filter((menu) => !selectedCategoryId || menuCategoryLinks.some((link) => link.menu_id === menu.id && link.category_id === selectedCategoryId));
  if (!visibleMenus.length) {
    menuList.innerHTML = '<div class="empty-clients">Ainda não há cardápios cadastrados.</div>';
    return;
  }
  menuList.innerHTML = visibleMenus.map((menu) => {
    const images = menuImages.filter((image) => image.menu_id === menu.id).slice(0, 4);
    const heroImage = images[0]?.public_url;
    return `<article class="visual-card menu-card detail-trigger" data-detail-type="menu" data-detail-id="${menu.id}">
      <button class="visual-card-hero${heroImage ? '' : ' visual-card-placeholder'}" type="button" ${heroImage ? `data-view-image="${escapeHTML(heroImage)}"` : ''} aria-label="${heroImage ? `Ver imagem de ${escapeHTML(menu.name)}` : 'Cardápio sem imagem'}">${heroImage ? `<img src="${escapeHTML(heroImage)}" alt="${escapeHTML(menu.name)}" />` : '<i data-lucide="book-open"></i><span>Sem imagem</span>'}</button>
      <div class="visual-card-body"><div class="visual-card-heading"><div><strong>${escapeHTML(menu.name)}</strong><span>${escapeHTML(menu.description || 'Sem descrição')}</span></div><span class="service-status${menu.active ? '' : ' inactive'}">${menu.active ? 'Ativo' : 'Inativo'}</span></div>
        <div class="visual-card-meta"><span class="menu-owner">${menu.serviceNames.length ? escapeHTML(menu.serviceNames.join(' · ')) : 'Sem serviço vinculado'}</span>${images.length > 1 ? `<span>${images.length} imagens</span>` : ''}</div>
        ${images.length > 1 ? `<div class="visual-card-thumbs">${images.slice(1).map((image) => `<button type="button" data-view-image="${escapeHTML(image.public_url)}" aria-label="Ver imagem do cardápio"><img src="${escapeHTML(image.public_url)}" alt="" /></button>`).join('')}</div>` : ''}
        <div class="visual-card-actions"><button class="client-action" type="button" data-edit-menu="${menu.id}" aria-label="Editar ${escapeHTML(menu.name)}" title="Editar"><i data-lucide="pencil"></i></button><button class="client-action" type="button" data-delete-menu="${menu.id}" aria-label="Excluir ${escapeHTML(menu.name)}" title="Excluir"><i data-lucide="trash-2"></i></button></div>
      </div>
    </article>`;
  }).join('');
  lucide.createIcons();
}

async function loadMenus() {
  const selectedCategoryIds = !menuFormPanel.hidden ? [...menuCategoryOptions.querySelectorAll('input:checked')].map((input) => input.value) : [];
  const openMenuId = !menuFormPanel.hidden ? document.querySelector('#menu-id').value || null : null;
  const checkedServiceIds = !menuFormPanel.hidden ? [...menuServiceOptions.querySelectorAll('input:checked')].map((input) => input.value) : [];
  // O vinculo cardapio <-> servico e N:N e mora em menu_services.
  const [menusResult, linksResult, imagesResult, categoriesResult, categoryLinksResult] = await Promise.all([
    supabaseClient.from('menus').select('id, name, description, active, created_at').order('name'),
    supabaseClient.from('menu_services').select('menu_id, service_id, sort_order').order('sort_order'),
    supabaseClient.from('menu_images').select('id, menu_id, storage_path, public_url, sort_order').order('sort_order'),
    supabaseClient.from('menu_categories').select('id, name').order('name'),
    supabaseClient.from('menu_category_links').select('menu_id, category_id')
  ]);
  if (menusResult.error) {
    setMenuFeedback(`Não foi possível carregar os cardápios: ${menusResult.error.message}`, true);
    return;
  }
  const serviceIdsByMenu = new Map();
  (linksResult.data || []).forEach((link) => {
    if (!serviceIdsByMenu.has(link.menu_id)) serviceIdsByMenu.set(link.menu_id, []);
    serviceIdsByMenu.get(link.menu_id).push(link.service_id);
  });
  menus = (menusResult.data || []).map((menu) => ({ ...menu, serviceIds: serviceIdsByMenu.get(menu.id) || [] }));
  menuImages = imagesResult.data || [];
  menuCategories = categoriesResult.data || [];
  menuCategoryLinks = categoryLinksResult.data || [];
  hydrateMenuServiceLinks();
  renderMenuFilter();
  renderMenuCategoryFilter();
  renderMenus();
  renderCategories();
  if (!menuFormPanel.hidden) {
    renderMenuServiceOptions(checkedServiceIds);
    renderMenuCategoryOptions(selectedCategoryIds);
    renderMenuImagePreviews(openMenuId);
  }
  if (!serviceFormPanel.hidden) renderServiceMenuOptions(document.querySelector('#service-id').value);
}

function openMenus() {
  if (!permitir('cardapios')) return;
  menuPanel.hidden = false;
  Promise.all([loadMenus(), loadServices()]);
}

function renderMenuServiceOptions(selectedServiceIds = []) {
  if (!services.length) {
    menuServiceOptions.innerHTML = '<span class="field-hint">Cadastre um serviço primeiro.</span>';
    return;
  }
  const selected = new Set(selectedServiceIds);
  menuServiceOptions.innerHTML = services.map((service) => `<div class="service-menu-option${selected.has(service.id) ? ' selected' : ''}">
    <label class="service-menu-check" for="menu-service-${service.id}"><input id="menu-service-${service.id}" type="checkbox" value="${service.id}" data-menu-service ${selected.has(service.id) ? 'checked' : ''} /></label>
    <label class="menu-service-name" for="menu-service-${service.id}">${escapeHTML(service.name)}</label>
  </div>`).join('');
}

menuServiceOptions.addEventListener('change', (event) => {
  const checkbox = event.target.closest('[data-menu-service]');
  if (checkbox) checkbox.closest('.service-menu-option').classList.toggle('selected', checkbox.checked);
});

async function openMenuForm(menu = null, presetServiceId = '') {
  menuForm.reset();
  pendingMenuImages = [];
  removedMenuImageIds = [];
  document.querySelector('#menu-id').value = menu?.id || '';
  document.querySelector('#menu-name').value = menu?.name || '';
  document.querySelector('#menu-description').value = menu?.description || '';
  document.querySelector('#menu-active').checked = menu?.active ?? true;
  menuFormTitle.textContent = menu ? 'Editar cardápio' : 'Novo cardápio';
  menuFormFeedback.textContent = '';
  menuFormPanel.hidden = false;
  await Promise.all([loadServices(), loadMenus()]);
  renderMenuServiceOptions(menu ? menu.serviceIds : (presetServiceId ? [presetServiceId] : []));
  renderMenuCategoryOptions(menu ? menuCategoryLinks.filter((link) => link.menu_id === menu.id).map((link) => link.category_id) : []);
  renderMenuImagePreviews(menu?.id || null);
}

document.querySelectorAll('[data-open-menus]').forEach((button) => button.addEventListener('click', openMenus));
document.querySelectorAll('[data-close-menus]').forEach((button) => button.addEventListener('click', () => { fecharPainelDeApoio(menuPanel); }));
document.querySelectorAll('[data-new-menu]').forEach((button) => button.addEventListener('click', () => openMenuForm()));
document.querySelectorAll('[data-close-menu-form]').forEach((button) => button.addEventListener('click', () => { menuFormPanel.hidden = true; }));
serviceMenuCreate.addEventListener('click', () => {
  openMenuForm(null, document.querySelector('#service-id').value);
});

document.querySelector('[data-open-categories]').addEventListener('click', () => {
  categoryPanel.hidden = false;
  loadMenus();
});

/* ========================================================================== */
/* CONFIGURAÇÕES                                                              */
/* Reúne as telas de apoio que antes só eram acessadas por ícones pequenos    */
/* dentro de outros módulos.                                                  */
/* ========================================================================== */
function openSettings() {
  if (!permitir('configuracoes')) return;
  settingsPanel.hidden = false;
}

// Configurações é só um índice: as telas de apoio saem de cima dela. O
// navigation.js registra que Configurações continua na pilha enquanto uma delas
// estiver aberta, e é ele quem traz Configurações de volta quando a tela de
// apoio fecha, tanto pelo X quanto pelo botão de voltar.
function fecharPainelDeApoio(panel) {
  panel.hidden = true;
}

function abrirDeConfiguracoes(destino) {
  // As telas de apoio têm permissão própria: quem abre Configurações nem
  // sempre pode abrir o que está dentro dela.
  if (destino === 'menus' || destino === 'menu-categories') {
    if (!permitir('cardapios')) return;
  }
  if (destino === 'inventory-categories') {
    if (!permitir('estoque')) return;
  }
  window.plenitudeNav.cover(settingsPanel);
  settingsPanel.hidden = true;
  if (destino === 'menus') openMenus();
  if (destino === 'menu-categories') { categoryPanel.hidden = false; loadMenus(); }
  if (destino === 'inventory-categories') { inventoryCategoryPanel.hidden = false; loadInventoryCategories(); }
}

document.querySelectorAll('[data-open-settings]').forEach((button) => button.addEventListener('click', openSettings));
document.querySelectorAll('[data-close-settings]').forEach((button) => button.addEventListener('click', () => {
  settingsPanel.hidden = true;
}));
settingsPanel.addEventListener('click', (event) => {
  if (event.target === settingsPanel) { settingsPanel.hidden = true; return; }
  const item = event.target.closest('[data-settings-goto]');
  if (!item) return;
  abrirDeConfiguracoes(item.dataset.settingsGoto);
});

/* Categorias de itens do estoque: espelha o painel de categorias de cardapio. */
function setInventoryCategoryFeedback(message, isError = false) {
  inventoryCategoryFeedback.textContent = message;
  inventoryCategoryFeedback.style.color = isError ? '#a0483d' : '';
}

async function loadInventoryCategories() {
  const [categoriesResult, linksResult] = await Promise.all([
    supabaseClient.from('inventory_categories').select('id, name').order('name'),
    supabaseClient.from('inventory_category_links').select('inventory_item_id, category_id')
  ]);
  if (categoriesResult.error) {
    setInventoryCategoryFeedback(`Não foi possível carregar as categorias: ${categoriesResult.error.message}`, true);
    return;
  }
  inventoryCategories = categoriesResult.data || [];
  inventoryCategoryLinks = linksResult.data || [];
  renderInventoryCategories();
}

function renderInventoryCategories() {
  if (!inventoryCategories.length) {
    inventoryCategoryList.innerHTML = '<div class="empty-clients">Ainda não há categorias cadastradas.</div>';
    return;
  }
  inventoryCategoryList.innerHTML = inventoryCategories.map((category) => {
    const itemCount = inventoryCategoryLinks.filter((link) => link.category_id === category.id).length;
    return `<article class="client-row"><span class="client-initial">${escapeHTML(clientInitial(category.name))}</span><div class="client-details"><strong>${escapeHTML(category.name)}</strong><span>${itemCount} ${itemCount === 1 ? 'item' : 'itens'}</span></div><div class="client-actions"><button class="client-action" type="button" data-edit-inventory-category="${category.id}" aria-label="Editar ${escapeHTML(category.name)}" title="Editar"><i data-lucide="pencil"></i></button><button class="client-action" type="button" data-delete-inventory-category="${category.id}" aria-label="Excluir ${escapeHTML(category.name)}" title="Excluir"><i data-lucide="trash-2"></i></button></div></article>`;
  }).join('');
  lucide.createIcons();
}

async function createInventoryCategory() {
  const name = window.prompt('Nome da nova categoria:');
  if (!name?.trim()) return;
  const { error } = await supabaseClient.from('inventory_categories').insert({ name: name.trim() });
  if (error) {
    setInventoryCategoryFeedback(error.code === '23505' ? 'Essa categoria já existe.' : 'Não foi possível criar a categoria.', true);
    return;
  }
  await loadInventoryCategories();
  await loadInventory();
  setInventoryCategoryFeedback('Categoria criada.');
}

document.querySelectorAll('[data-new-inventory-category]').forEach((button) => button.addEventListener('click', createInventoryCategory));
document.querySelectorAll('[data-close-inventory-categories]').forEach((button) => button.addEventListener('click', () => { fecharPainelDeApoio(inventoryCategoryPanel); }));

inventoryCategoryList.addEventListener('click', async (event) => {
  const editButton = event.target.closest('[data-edit-inventory-category]');
  const deleteButton = event.target.closest('[data-delete-inventory-category]');
  if (editButton) {
    const category = inventoryCategories.find((item) => item.id === editButton.dataset.editInventoryCategory);
    const name = window.prompt('Nome da categoria:', category?.name || '');
    if (!category || !name?.trim() || name.trim() === category.name) return;
    const { error } = await supabaseClient.from('inventory_categories').update({ name: name.trim() }).eq('id', category.id);
    if (error) {
      setInventoryCategoryFeedback(error.code === '23505' ? 'Essa categoria já existe.' : 'Não foi possível editar a categoria.', true);
      return;
    }
    await loadInventoryCategories();
    await loadInventory();
    setInventoryCategoryFeedback('Categoria atualizada.');
    return;
  }
  if (deleteButton) {
    const category = inventoryCategories.find((item) => item.id === deleteButton.dataset.deleteInventoryCategory);
    if (!category || !window.confirm(`Excluir a categoria ${category.name}?`)) return;
    const { error } = await supabaseClient.from('inventory_categories').delete().eq('id', category.id);
    if (error) {
      setInventoryCategoryFeedback('Não foi possível excluir a categoria.', true);
      return;
    }
    await loadInventoryCategories();
    await loadInventory();
    setInventoryCategoryFeedback('Categoria excluída.');
  }
});
document.querySelector('[data-close-categories]').addEventListener('click', () => { fecharPainelDeApoio(categoryPanel); });

menuForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const saveButton = menuForm.querySelector('button[type="submit"]');
  const menuId = document.querySelector('#menu-id').value;
  const selectedServiceIds = [...menuServiceOptions.querySelectorAll('[data-menu-service]:checked')].map((input) => input.value);
  const payload = { name: document.querySelector('#menu-name').value.trim(), description: document.querySelector('#menu-description').value.trim() || null, active: document.querySelector('#menu-active').checked };
  saveButton.disabled = true;
  saveButton.querySelector('span').textContent = 'Salvando...';
  const result = menuId
    ? await supabaseClient.from('menus').update(payload).eq('id', menuId).select('id').single()
    : await supabaseClient.from('menus').insert(payload).select('id').single();
  if (result.error) {
    menuFormFeedback.textContent = 'Não foi possível salvar o cardápio.';
    saveButton.disabled = false;
    saveButton.querySelector('span').textContent = 'Salvar cardápio';
    return;
  }
  const savedMenuId = result.data?.id;
  if (!savedMenuId) {
    menuFormFeedback.textContent = 'Não foi possível salvar o cardápio.';
    saveButton.disabled = false;
    saveButton.querySelector('span').textContent = 'Salvar cardápio';
    return;
  }
  // Vinculos N:N: apaga os anteriores e regrava os servios marcados.
  const { error: clearServicesError } = await supabaseClient.from('menu_services').delete().eq('menu_id', savedMenuId);
  if (clearServicesError) {
    menuFormFeedback.textContent = 'Cardápio salvo, mas não foi possível atualizar os serviços vinculados.';
    saveButton.disabled = false;
    saveButton.querySelector('span').textContent = 'Salvar cardápio';
    return;
  }
  if (selectedServiceIds.length) {
    const { error: linkError } = await supabaseClient.from('menu_services').insert(selectedServiceIds.map((serviceId, index) => ({ menu_id: savedMenuId, service_id: serviceId, sort_order: index })));
    if (linkError) {
      menuFormFeedback.textContent = 'Cardápio salvo, mas não foi possível vincular os serviços.';
      saveButton.disabled = false;
      saveButton.querySelector('span').textContent = 'Salvar cardápio';
      return;
    }
  }
  const selectedCategoryIds = [...menuCategoryOptions.querySelectorAll('input:checked')].map((input) => input.value);
  const { error: clearCategoriesError } = await supabaseClient.from('menu_category_links').delete().eq('menu_id', savedMenuId);
  if (clearCategoriesError) {
    menuFormFeedback.textContent = 'Cardápio salvo, mas não foi possível atualizar as categorias.';
    saveButton.disabled = false;
    saveButton.querySelector('span').textContent = 'Salvar cardápio';
    return;
  }
  if (selectedCategoryIds.length) {
    const { error: categoryError } = await supabaseClient.from('menu_category_links').insert(selectedCategoryIds.map((categoryId) => ({ menu_id: savedMenuId, category_id: categoryId })));
    if (categoryError) {
      menuFormFeedback.textContent = 'Cardápio salvo, mas não foi possível vincular as categorias.';
      saveButton.disabled = false;
      saveButton.querySelector('span').textContent = 'Salvar cardápio';
      return;
    }
  }
  if (removedMenuImageIds.length) {
    const removedImages = menuImages.filter((image) => removedMenuImageIds.includes(image.id));
    await supabaseClient.storage.from('menu-images').remove(removedImages.map((image) => image.storage_path));
    await supabaseClient.from('menu_images').delete().in('id', removedMenuImageIds);
  }
  if (pendingMenuImages.length) {
    const uploadedImages = [];
    for (const [index, file] of pendingMenuImages.entries()) {
      const extension = file.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const storagePath = `${savedMenuId}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabaseClient.storage.from('menu-images').upload(storagePath, file, { contentType: file.type, upsert: false });
      if (uploadError) {
        menuFormFeedback.textContent = 'Cardápio salvo, mas uma imagem não pôde ser enviada.';
        continue;
      }
      const { data: publicData } = supabaseClient.storage.from('menu-images').getPublicUrl(storagePath);
      uploadedImages.push({ menu_id: savedMenuId, storage_path: storagePath, public_url: publicData.publicUrl, sort_order: index });
    }
    if (uploadedImages.length) await supabaseClient.from('menu_images').insert(uploadedImages);
  }
  menuFormPanel.hidden = true;
  await loadMenus();
  await loadServices();
  saveButton.disabled = false;
  saveButton.querySelector('span').textContent = 'Salvar cardápio';
  showToast(menuId ? 'Cardápio atualizado' : 'Cardápio cadastrado');
});

menuList.addEventListener('click', async (event) => {
  const editButton = event.target.closest('[data-edit-menu]');
  const deleteButton = event.target.closest('[data-delete-menu]');
  if (editButton) {
    openMenuForm(menus.find((menu) => menu.id === editButton.dataset.editMenu));
    return;
  }
  if (deleteButton) {
    const menu = menus.find((item) => item.id === deleteButton.dataset.deleteMenu);
    if (!menu || !window.confirm(`Excluir o cardápio ${menu.name}?`)) return;
    const { error } = await supabaseClient.from('menus').delete().eq('id', menu.id);
    if (error) {
      setMenuFeedback('Não foi possível excluir este cardápio.', true);
      return;
    }
    await loadMenus();
    await loadServices();
    showToast('Cardápio excluído');
  }
});

function renderMenuCategoryOptions(selectedCategoryIds = []) {
  if (!menuCategories.length) {
    menuCategoryOptions.innerHTML = '<span class="field-hint">Adicione categorias para organizar este cardápio.</span>';
    return;
  }
  menuCategoryOptions.innerHTML = menuCategories.map((category) => `<label class="category-option" for="menu-category-${category.id}"><input id="menu-category-${category.id}" type="checkbox" value="${category.id}" ${selectedCategoryIds.includes(category.id) ? 'checked' : ''} /><span>${escapeHTML(category.name)}</span></label>`).join('');
}

function renderMenuImagePreviews(menuId = null) {
  const existingImages = menuImages.filter((image) => image.menu_id === menuId && !removedMenuImageIds.includes(image.id));
  const existingMarkup = existingImages.map((image) => `<div class="image-preview"><button class="image-preview-open" type="button" data-view-image="${escapeHTML(image.public_url)}" aria-label="Ampliar imagem"><img src="${escapeHTML(image.public_url)}" alt="Imagem do cardápio" /></button><button class="image-preview-remove" type="button" data-remove-existing-image="${image.id}" aria-label="Remover imagem"><i data-lucide="x"></i></button></div>`).join('');
  const pendingMarkup = pendingMenuImages.map((file, index) => { const previewUrl = URL.createObjectURL(file); return `<div class="image-preview"><button class="image-preview-open" type="button" data-view-image="${previewUrl}" aria-label="Ampliar imagem"><img src="${previewUrl}" alt="Prévia de ${escapeHTML(file.name)}" /></button><button class="image-preview-remove" type="button" data-remove-pending-image="${index}" aria-label="Remover imagem"><i data-lucide="x"></i></button></div>`; }).join('');
  menuImagePreviews.innerHTML = existingMarkup + pendingMarkup;
  lucide.createIcons();
}

menuImageInput.addEventListener('change', () => {
  pendingMenuImages = [...pendingMenuImages, ...menuImageInput.files].filter((file) => file.type.startsWith('image/'));
  menuImageInput.value = '';
  renderMenuImagePreviews(document.querySelector('#menu-id').value || null);
});

menuImagePreviews.addEventListener('click', (event) => {
  const existingButton = event.target.closest('[data-remove-existing-image]');
  const pendingButton = event.target.closest('[data-remove-pending-image]');
  if (existingButton) {
    removedMenuImageIds.push(existingButton.dataset.removeExistingImage);
    renderMenuImagePreviews(document.querySelector('#menu-id').value || null);
  }
  if (pendingButton) {
    pendingMenuImages.splice(Number(pendingButton.dataset.removePendingImage), 1);
    renderMenuImagePreviews(document.querySelector('#menu-id').value || null);
  }
});

async function createCategory() {
  const name = window.prompt('Nome da nova categoria:');
  if (!name?.trim()) return;
  const selectedCategoryIds = [...menuCategoryOptions.querySelectorAll('input:checked')].map((input) => input.value);
  const { error } = await supabaseClient.from('menu_categories').insert({ name: name.trim() });
  if (error) {
    const message = error.code === '42P01'
      ? 'A tabela de categorias não existe. Execute a migração 003 no Supabase.'
      : error.code === '23505'
        ? 'Essa categoria já existe.'
        : 'Não foi possível criar a categoria. Verifique as permissões do Supabase.';
    menuFormFeedback.textContent = message;
    setCategoryFeedback(message, true);
    return;
  }
  await loadMenus();
  renderMenuCategoryOptions(selectedCategoryIds);
  setCategoryFeedback('Categoria criada.');
}

document.querySelectorAll('[data-new-category]').forEach((button) => button.addEventListener('click', createCategory));

categoryList.addEventListener('click', async (event) => {
  const editButton = event.target.closest('[data-edit-category]');
  const deleteButton = event.target.closest('[data-delete-category]');
  if (editButton) {
    const category = menuCategories.find((item) => item.id === editButton.dataset.editCategory);
    const name = window.prompt('Nome da categoria:', category?.name || '');
    if (!category || !name?.trim() || name.trim() === category.name) return;
    const { error } = await supabaseClient.from('menu_categories').update({ name: name.trim() }).eq('id', category.id);
    if (error) {
      setCategoryFeedback(error.code === '23505' ? 'Essa categoria já existe.' : 'Não foi possível editar a categoria.', true);
      return;
    }
    await loadMenus();
    setCategoryFeedback('Categoria atualizada.');
    return;
  }
  if (deleteButton) {
    const category = menuCategories.find((item) => item.id === deleteButton.dataset.deleteCategory);
    if (!category || !window.confirm(`Excluir a categoria ${category.name}?`)) return;
    const { error } = await supabaseClient.from('menu_categories').delete().eq('id', category.id);
    if (error) {
      setCategoryFeedback('Não foi possível excluir a categoria.', true);
      return;
    }
    await loadMenus();
    setCategoryFeedback('Categoria excluída.');
  }
});

menuCategoryFilter.addEventListener('change', renderMenus);

const toast = document.querySelector('.toast');
let toastTimer;

function showToast(message) {
  toast.textContent = `${message} em breve`;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

document.querySelectorAll('[data-action]').forEach((button) => {
  button.addEventListener('click', () => showToast(button.dataset.action));
});

document.querySelectorAll('[data-nav]').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    // "Menu" e a propria tela de ajustes; Inicio e o painel principal.
    if (button.dataset.nav === 'Início') {
      settingsPanel.hidden = true;
      return;
    }
    if (button.dataset.nav === 'Menu') {
      openSettings();
      return;
    }
    // "Agenda" nao chega aqui: quem abre o painel de Eventos e o events.js, que
    // escuta o mesmo botão. Antes ele caía no showToast e pintava "Agenda em
    // breve" por cima da agenda que acabara de abrir.
  });
});

function setInventoryFeedback(message, isError = false) {
  inventoryFeedback.textContent = message;
  inventoryFeedback.style.color = isError ? '#a0483d' : '';
}

function inventoryIsLow(item) {
  return Number(item.minimum_quantity) > 0 && Number(item.quantity) <= Number(item.minimum_quantity);
}

function renderInventory() {
  const searchTerm = inventorySearch.value.trim().toLowerCase();
  const selectedCategoryId = inventoryCategoryFilter.value;
  const visibleItems = inventoryItems.filter((item) => {
    const searchableContent = Object.values(item).map((value) => String(value ?? '')).join(' ').toLowerCase();
    const matchesSearch = searchableContent.includes(searchTerm);
    const matchesCategory = !selectedCategoryId || item.categoryIds.includes(selectedCategoryId);
    return matchesSearch && matchesCategory && (!inventoryLowOnly.checked || inventoryIsLow(item));
  });

  if (!visibleItems.length) {
    inventoryList.innerHTML = `<div class="empty-clients">${searchTerm || inventoryLowOnly.checked ? 'Nenhum item encontrado para esse filtro.' : 'Ainda não há itens cadastrados.'}</div>`;
    return;
  }

  inventoryList.innerHTML = visibleItems.map((item) => `
    <article class="visual-card inventory-card detail-trigger" data-detail-type="inventory" data-detail-id="${item.id}">
      ${item.imageUrls.length ? `<button class="visual-card-hero" type="button" data-view-image="${escapeHTML(item.imageUrls[0])}" aria-label="Ver imagem de ${escapeHTML(item.name)}"><img src="${escapeHTML(item.imageUrls[0])}" alt="${escapeHTML(item.name)}" /></button>` : '<div class="visual-card-hero visual-card-placeholder"><i data-lucide="box"></i><span>Sem imagem</span></div>'}
      <div class="visual-card-body"><div class="visual-card-heading"><div><strong>${escapeHTML(item.name)}</strong><span>${escapeHTML(item.description || item.unit)}</span></div><span class="service-status${item.active ? '' : ' inactive'}">${item.active ? 'Disponível' : 'Inativo'}</span></div>
        ${item.categoryNames.length ? `<span class="service-menus">${escapeHTML(item.categoryNames.join(' · '))}</span>` : ''}
        <span class="inventory-balance ${inventoryIsLow(item) ? 'low' : ''}">${item.quantity} ${escapeHTML(item.unit)}${inventoryIsLow(item) ? ' · estoque baixo' : ''}</span>
        ${item.imageUrls.length > 1 ? `<div class="visual-card-thumbs">${item.imageUrls.slice(1, 4).map((url) => `<button type="button" data-view-image="${escapeHTML(url)}" aria-label="Ver imagem do item"><img src="${escapeHTML(url)}" alt="" /></button>`).join('')}</div>` : ''}
      <div class="visual-card-actions">
        <button class="client-action" type="button" data-move-inventory="${item.id}" aria-label="Movimentar ${escapeHTML(item.name)}" title="Movimentar"><i data-lucide="arrow-down-up"></i></button>
        <button class="client-action" type="button" data-edit-inventory="${item.id}" aria-label="Editar ${escapeHTML(item.name)}" title="Editar"><i data-lucide="pencil"></i></button>
        <button class="client-action" type="button" data-delete-inventory="${item.id}" aria-label="Excluir ${escapeHTML(item.name)}" title="Excluir"><i data-lucide="trash-2"></i></button>
      </div></div>
    </article>
  `).join('');
  lucide.createIcons();
}

async function loadInventory() {
  setInventoryFeedback('Carregando estoque...');
  const { data, error } = await supabaseClient.from('inventory_items').select('id, name, description, unit, quantity, minimum_quantity, active, created_at').order('name');
  if (error) {
    setInventoryFeedback('Não foi possível carregar o estoque. Verifique a autenticação.', true);
    inventoryList.innerHTML = '';
    return;
  }
  const [imagesResult, categoriesResult, linksResult] = await Promise.all([
    supabaseClient.from('inventory_images').select('id, inventory_item_id, storage_path, public_url, sort_order').order('sort_order'),
    supabaseClient.from('inventory_categories').select('id, name').order('name'),
    supabaseClient.from('inventory_category_links').select('inventory_item_id, category_id')
  ]);
  inventoryImages = imagesResult.data || [];
  inventoryCategories = categoriesResult.data || [];
  inventoryCategoryLinks = linksResult.data || [];
  renderInventoryCategoryFilter();
  inventoryItems = (data || []).map((item) => {
    const links = inventoryCategoryLinks.filter((link) => link.inventory_item_id === item.id);
    return {
      ...item,
      categoryIds: links.map((link) => link.category_id),
      categoryNames: links.map((link) => inventoryCategories.find((category) => category.id === link.category_id)?.name).filter(Boolean),
      imageUrls: inventoryImages.filter((image) => image.inventory_item_id === item.id).map((image) => image.public_url)
    };
  });
  const lowCount = inventoryItems.filter(inventoryIsLow).length;
  setInventoryFeedback(`${inventoryItems.length} ${inventoryItems.length === 1 ? 'item cadastrado' : 'itens cadastrados'}${lowCount ? ` · ${lowCount} com estoque baixo` : ''}`);
  renderInventory();
}

function openInventory() {
  if (!permitir('estoque')) return;
  inventoryPanel.hidden = false;
  inventorySearch.value = '';
  inventoryLowOnly.checked = false;
  loadInventory();
}

// Atalho do cabeçalho de Estoque para as categorias de itens. Mesmo caminho do
// atalho de categorias dentro de Cardápios: o painel de baixo continua aberto e
// o X volta para ele, em vez de fechar direto para a tela inicial.
function openInventoryCategories() {
  if (!permitir('estoque')) return;
  inventoryCategoryPanel.hidden = false;
  loadInventoryCategories();
}

function openInventoryForm(item = null) {
  inventoryForm.reset();
  pendingInventoryImages = [];
  removedInventoryImageIds = [];
  const unitSelect = document.querySelector('#inventory-unit');
  const knownUnit = [...unitSelect.options].some((option) => option.value === item?.unit);
  if (item?.unit && !knownUnit) {
    unitSelect.add(new Option(item.unit, item.unit));
  }
  document.querySelector('#inventory-id').value = item?.id || '';
  document.querySelector('#inventory-name').value = item?.name || '';
  document.querySelector('#inventory-unit').value = item?.unit || 'unidade';
  document.querySelector('#inventory-quantity').value = item?.quantity ?? '';
  document.querySelector('#inventory-minimum').value = item?.minimum_quantity ?? 0;
  document.querySelector('#inventory-description').value = item?.description || '';
  document.querySelector('#inventory-active').checked = item?.active ?? true;
  inventoryFormTitle.textContent = item ? 'Editar item' : 'Novo item';
  inventoryFormFeedback.textContent = '';
  inventoryFormPanel.hidden = false;
  renderInventoryCategoryOptions(item?.categoryIds || []);
  renderInventoryImagePreviews(item?.id || null);
}

function openMovementForm(item) {
  if (!item) return;
  movementForm.reset();
  document.querySelector('#movement-item-id').value = item.id;
  movementItemName.textContent = `${item.name} · saldo atual: ${item.quantity} ${item.unit}`;
  movementFormFeedback.textContent = '';
  movementFormPanel.hidden = false;
}

document.querySelector('[data-open-inventory]').addEventListener('click', openInventory);
document.querySelector('[data-open-inventory-categories]').addEventListener('click', openInventoryCategories);
document.querySelector('[data-close-inventory]').addEventListener('click', () => { inventoryPanel.hidden = true; });
document.querySelector('[data-new-inventory]').addEventListener('click', () => openInventoryForm());
document.querySelector('[data-close-inventory-form]').addEventListener('click', () => { inventoryFormPanel.hidden = true; });
document.querySelector('[data-close-movement-form]').addEventListener('click', () => { movementFormPanel.hidden = true; });
inventorySearch.addEventListener('input', renderInventory);
inventoryLowOnly.addEventListener('change', renderInventory);
inventoryCategoryFilter.addEventListener('change', renderInventory);

function renderInventoryCategoryFilter() {
  const selectedValue = inventoryCategoryFilter.value;
  inventoryCategoryFilter.innerHTML = '<option value="">Todas as categorias</option>' + inventoryCategories.map((category) => `<option value="${category.id}">${escapeHTML(category.name)}</option>`).join('');
  inventoryCategoryFilter.value = inventoryCategories.some((category) => category.id === selectedValue) ? selectedValue : '';
}

function renderInventoryCategoryOptions(selectedCategoryIds = []) {
  if (!inventoryCategories.length) {
    inventoryCategoryOptions.innerHTML = '<span class="field-hint">Execute a migração 005 para carregar categorias.</span>';
    return;
  }
  inventoryCategoryOptions.innerHTML = inventoryCategories.map((category) => `<label class="category-option" for="inventory-category-${category.id}"><input id="inventory-category-${category.id}" type="checkbox" value="${category.id}" ${selectedCategoryIds.includes(category.id) ? 'checked' : ''} /><span>${escapeHTML(category.name)}</span></label>`).join('');
}

function renderInventoryImagePreviews(itemId = null) {
  const existingImages = inventoryImages.filter((image) => image.inventory_item_id === itemId && !removedInventoryImageIds.includes(image.id));
  const existingMarkup = existingImages.map((image) => `<div class="image-preview"><button class="image-preview-open" type="button" data-view-image="${escapeHTML(image.public_url)}" aria-label="Ampliar imagem"><img src="${escapeHTML(image.public_url)}" alt="Imagem do item" /></button><button class="image-preview-remove" type="button" data-remove-existing-inventory-image="${image.id}" aria-label="Remover imagem"><i data-lucide="x"></i></button></div>`).join('');
  const pendingMarkup = pendingInventoryImages.map((file, index) => { const previewUrl = URL.createObjectURL(file); return `<div class="image-preview"><button class="image-preview-open" type="button" data-view-image="${previewUrl}" aria-label="Ampliar imagem"><img src="${previewUrl}" alt="Prévia de ${escapeHTML(file.name)}" /></button><button class="image-preview-remove" type="button" data-remove-pending-inventory-image="${index}" aria-label="Remover imagem"><i data-lucide="x"></i></button></div>`; }).join('');
  inventoryImagePreviews.innerHTML = existingMarkup + pendingMarkup;
  lucide.createIcons();
}

function openImageViewer(url) {
  imageViewerImage.src = url;
  imageViewer.hidden = false;
}

function closeImageViewer() {
  imageViewer.hidden = true;
  imageViewerImage.src = '';
}

function detailRow(label, value) {
  return `<div class="detail-row"><span>${label}</span><strong>${escapeHTML(value || 'Não informado')}</strong></div>`;
}

function renderDetailImages(images, title) {
  if (!images.length) return '';
  return `<div class="detail-images">${images.map((url) => `<button type="button" data-view-image="${escapeHTML(url)}" aria-label="Ampliar imagem de ${escapeHTML(title)}"><img src="${escapeHTML(url)}" alt="${escapeHTML(title)}" /></button>`).join('')}</div>`;
}

async function openDetail(type, id) {
  let title = 'Detalhes';
  let eyebrow = 'DETALHES';
  let content = '';
  let actionQuoteId = '';
  if (type === 'client') {
    const client = clients.find((item) => item.id === id);
    if (!client) return;
    title = client.name;
    eyebrow = 'CLIENTE';
    content = `<div class="detail-summary"><span class="detail-initial">${escapeHTML(clientInitial(client.name))}</span><div><strong>${escapeHTML(client.name)}</strong><span>Cadastro de cliente</span></div></div>${detailRow('WhatsApp', client.whatsapp)}${detailRow('E-mail', client.email)}${detailRow('Observações', client.notes)}`;
  } else if (type === 'service') {
    const service = services.find((item) => item.id === id);
    if (!service) return;
    title = service.name;
    eyebrow = 'SERVIÇO';
    // Mesmo padrao do detalhe do orcamento: cartapios em etiquetas que abrem a
    // ficha de cada um.
    const menusBox = service.menuNames.length
      ? `<div class="detail-box"><strong class="detail-box-title">CARDÁPIOS DESTE SERVIÇO</strong><div class="detail-item-menus">${service.menuIds.map((menuId) => {
        const menu = menus.find((item) => item.id === menuId);
        if (!menu) return '';
        return `<button class="linked-menu-chip" type="button" data-open-menu-detail="${menu.id}" aria-label="Abrir cardápio ${escapeHTML(menu.name)}"><i data-lucide="book-open"></i><span>${escapeHTML(menu.name)}</span></button>`;
      }).join('')}</div></div>`
      : '';
    content = `<div class="detail-summary"><span class="detail-icon"><i data-lucide="sparkles"></i></span><div><strong>${escapeHTML(service.name)}</strong><span>${service.active ? 'Serviço ativo' : 'Serviço inativo'}</span></div></div>${detailRow('Categoria', service.category)}${detailRow('Preço padrão', formatCurrency(service.default_price))}${menusBox}${detailRow('Descrição', service.description)}`;
  } else if (type === 'menu') {
    const menu = menus.find((item) => item.id === id);
    if (!menu) return;
    const images = menuImages.filter((image) => image.menu_id === id).map((image) => image.public_url);
    const categories = menuCategoryLinks.filter((link) => link.menu_id === id).map((link) => menuCategories.find((category) => category.id === link.category_id)?.name).filter(Boolean);
    title = menu.name;
    eyebrow = 'CARDÁPIO';
    content = renderDetailImages(images, menu.name) + `<div class="detail-summary"><span class="detail-icon"><i data-lucide="book-open"></i></span><div><strong>${escapeHTML(menu.name)}</strong><span>${menu.active ? 'Disponível' : 'Inativo'}</span></div></div>${detailRow('Serviços', menu.serviceNames.join(' · ') || 'Nenhum')}${detailRow('Categorias', categories.join(' · '))}${detailRow('Descrição', menu.description)}`;
  } else if (type === 'inventory') {
    const item = inventoryItems.find((entry) => entry.id === id);
    if (!item) return;
    title = item.name;
    eyebrow = 'ITEM DE ESTOQUE';
    content = renderDetailImages(item.imageUrls, item.name) + `<div class="detail-summary"><span class="detail-icon"><i data-lucide="box"></i></span><div><strong>${escapeHTML(item.name)}</strong><span>${item.active ? 'Disponível para uso' : 'Item inativo'}</span></div></div>${detailRow('Quantidade atual', `${item.quantity} ${item.unit}`)}${detailRow('Estoque mínimo', `${item.minimum_quantity} ${item.unit}`)}${detailRow('Categorias', item.categoryNames.join(' · '))}${detailRow('Descrição', item.description)}`;
  } else if (type === 'category') {
    const category = menuCategories.find((item) => item.id === id);
    if (!category) return;
    title = category.name;
    eyebrow = 'CATEGORIA';
    content = `<div class="detail-summary"><span class="detail-icon"><i data-lucide="tags"></i></span><div><strong>${escapeHTML(category.name)}</strong><span>Categoria de cardápios</span></div></div>${detailRow('Cardápios', `${menuCategoryLinks.filter((link) => link.category_id === id).length}`)}`;
  } else if (type === 'quote') {
    const quote = quotes.find((item) => item.id === id);
    if (!quote) return;
    actionQuoteId = quote.id;
    title = quote.name;
    eyebrow = 'ORÇAMENTO';
    let servicesHtml = '';
    try {
      if (!menus.length) await loadMenus();
      const { data: items } = await supabaseClient.from('quote_items').select('service_id, quantity, unit_price, description').eq('quote_id', quote.id).order('sort_order');
      if (items && items.length > 0) {
        // O cardapio nao e escolhido no orcamento: cada servico lista os seus,
        // no mesmo agrupamento usado no PDF.
        const menusByService = groupMenusByService(menus, items.map((item) => item.service_id));
        const rowsHtml = items.map((item) => {
          const service = services.find((s) => s.id === item.service_id);
          const name = service ? service.name : item.description || 'Serviço';
          const total = item.quantity * item.unit_price;
          const linked = menusByService.get(item.service_id) || [];
          const menusCell = linked.length
            ? `<div class="detail-item-menus">${linked.map((menu) => `
                <button class="linked-menu-chip" type="button" data-open-menu-detail="${menu.id}" aria-label="Abrir cardápio ${escapeHTML(menu.name)}">
                  <i data-lucide="book-open"></i>
                  <span>${escapeHTML(menu.name)}</span>
                </button>`).join('')}</div>`
            : '';
          return `<div class="detail-service-row"><div class="detail-service-head"><span>${escapeHTML(name)} <span class="detail-service-qty">×${item.quantity}</span></span><span class="detail-service-total">${formatCurrency(total)}</span></div>${menusCell}</div>`;
        }).join('');
        servicesHtml = `<div class="detail-box"><strong class="detail-box-title">SERVIÇOS SELECIONADOS</strong>${rowsHtml}<div class="detail-total-line"><span>TOTAL</span><span>${formatCurrency(quote.total)}</span></div></div>`;
      }
    } catch (e) { /* ignore */ }
    // Validade e sinal entram no detalhe porque é dali que se decide o que fazer
    // com a proposta: cobrar o sinal, estender o prazo ou encerrar.
    const signalRow = Number(quote.deposit_amount) > 0
      ? `${detailRow('Sinal exigido', `${formatCurrency(quote.deposit_amount)} (${formatNumber(quote.deposit_percent)}%)`)}${detailRow('Sinal recebido', formatCurrency(quote.deposited_amount || 0))}${detailRow('Validade', quoteValidityNote(quote))}`
      : '';
    content = `<div class="detail-summary"><span class="detail-icon"><i data-lucide="notebook-tabs"></i></span><div><strong>${escapeHTML(quote.name)}</strong><span>${escapeHTML(quoteStatusLabel(quote.status))}</span></div></div>${detailRow('Cliente', quote.clients?.name)}${detailRow('Data', quote.event_date)}${detailRow('Horário', quote.event_time)}${detailRow('Local', quote.venue)}${servicesHtml}${detailRow('Total', formatCurrency(quote.total))}${signalRow}${detailRow('Observações', quote.notes)}`;
  }
  detailViewTitle.textContent = title;
  detailViewEyebrow.textContent = eyebrow;
  // O botão de sinal acompanha o mesmo critério do painel pós-salvo: existe
  // valor a cobrar e o orçamento não está cancelado.
  const detailQuote = actionQuoteId ? quotes.find((item) => item.id === actionQuoteId) : null;
  const depositButton = actionQuoteId && detailQuote && Number(detailQuote.deposit_amount) > 0 && detailQuote.status !== 'cancelled'
    ? `<button class="client-action-button quote-deposit-action" type="button" data-quote-deposit-row="${actionQuoteId}"><i data-lucide="hand-coins"></i><span>Registrar sinal</span></button>`
    : '';
  detailViewContent.innerHTML = actionQuoteId
    ? `${content}<div class="quote-saved-actions">${depositButton}<button class="client-action-button" type="button" data-quote-pdf-row="${actionQuoteId}"><i data-lucide="file-text"></i><span>Ver PDF</span></button><button class="whatsapp-action-button" type="button" data-quote-whatsapp-row="${actionQuoteId}"><i data-lucide="message-circle"></i><span>Enviar WhatsApp</span></button><button class="client-action-button" type="button" data-quote-share-row="${actionQuoteId}"><i data-lucide="share-2"></i><span>Compartilhar</span></button></div>`
    : content;
  detailView.hidden = false;
  lucide.createIcons();
}

function closeDetail() {
  detailView.hidden = true;
  detailViewContent.innerHTML = '';
}

document.addEventListener('click', (event) => {
  // Chips de cardapio: abrem o detail do cardapio. Precisa de um handler
  // proprio porque o guard abaixo ignora cliques em botoes.
  const menuChip = event.target.closest('[data-open-menu-detail]');
  if (menuChip) {
    openDetail('menu', menuChip.dataset.openMenuDetail);
    return;
  }
  const imageButton = event.target.closest('[data-view-image]');
  if (imageButton) {
    openImageViewer(imageButton.dataset.viewImage);
    return;
  }
  if (event.target.closest('button, a, input, select, textarea')) return;
  const detailTrigger = event.target.closest('[data-detail-type]');
  if (detailTrigger) openDetail(detailTrigger.dataset.detailType, detailTrigger.dataset.detailId);
});
document.querySelector('[data-close-image-viewer]').addEventListener('click', closeImageViewer);
imageViewer.addEventListener('click', (event) => { if (event.target === imageViewer) closeImageViewer(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeImageViewer(); });
document.querySelector('[data-close-detail]').addEventListener('click', closeDetail);
detailView.addEventListener('click', (event) => { if (event.target === detailView) closeDetail(); });
detailView.addEventListener('click', async (event) => {
  const depositButton = event.target.closest('[data-quote-deposit-row]');
  const pdfButton = event.target.closest('[data-quote-pdf-row]');
  const whatsappButton = event.target.closest('[data-quote-whatsapp-row]');
  const shareButton = event.target.closest('[data-quote-share-row]');
  if (depositButton) { closeDetail(); await openQuoteDepositPanel(depositButton.dataset.quoteDepositRow); return; }
  if (pdfButton) { await printQuotePdf(pdfButton.dataset.quotePdfRow); return; }
  if (whatsappButton) { await sendQuoteOnWhatsapp(whatsappButton.dataset.quoteWhatsappRow); return; }
  if (shareButton) { await shareQuote(shareButton.dataset.quoteShareRow); }
});
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeDetail(); });

function setQuoteFeedback(message, isError = false) {
  quoteFeedback.textContent = message;
  quoteFeedback.style.color = isError ? '#a0483d' : '';
}

function quoteStatusLabel(status) {
  return { draft: 'Rascunho', sent: 'Enviado', confirmed: 'Confirmado', cancelled: 'Cancelado', expired: 'Expirado' }[status] || status;
}

// Prazo padrão de uma proposta: 20 dias contados da emissão.
const QUOTE_VALIDITY_DAYS = 20;
const QUOTE_DEFAULT_DEPOSIT_PERCENT = 30;

function localToday() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function addDaysToLocalDate(value, days) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function daysUntilLocalDate(value) {
  if (!value) return null;
  const target = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date(`${localToday()}T12:00:00`);
  return Math.round((target - today) / 86400000);
}

// Um orçamento só expira quando foi enviado e ainda não recebeu o sinal inteiro.
// Rascunho é material de trabalho interno; confirmado e cancelado não vencem.
function quoteRequiresSignal(quote) {
  return Number(quote?.deposit_amount || 0) > 0;
}

function quoteSignalComplete(quote) {
  return quoteRequiresSignal(quote) && Number(quote?.deposited_amount || 0) + 0.01 >= Number(quote.deposit_amount);
}

// Frase curta que resume a situação do sinal, usada na lista, no detalhe, no PDF
// e na mensagem: um texto só evita cada tela inventar sua própria redação.
function quoteValidityNote(quote) {
  if (!quote) return '';
  if (quote.status === 'confirmed') {
    return quoteSignalComplete(quote)
      ? `Sinal de ${formatCurrency(quote.deposited_amount)} recebido`
      : 'Confirmado';
  }
  if (!quoteRequiresSignal(quote)) return 'Sem sinal';
  const remaining = Math.max(0, Number(quote.deposit_amount) - Number(quote.deposited_amount || 0));
  const days = daysUntilLocalDate(quote.valid_until);
  const deadline = quote.valid_until ? ` até ${formatDateBR(quote.valid_until)}` : '';
  if (days !== null && days < 0) return `Vencido${deadline} · falta ${formatCurrency(remaining)}`;
  if (days === 0) return `Vence hoje${deadline} · falta ${formatCurrency(remaining)}`;
  if (days !== null && days <= 5) return `Vence em ${days} ${days === 1 ? 'dia' : 'dias'}${deadline} · falta ${formatCurrency(remaining)}`;
  return `Sinal de ${formatCurrency(quote.deposit_amount)}${deadline} · falta ${formatCurrency(remaining)}`;
}

function quoteValidityTone(quote) {
  if (!quote || quote.status === 'confirmed') return 'done';
  if (!quoteRequiresSignal(quote)) return 'none';
  if (quote.status === 'expired' || quote.status === 'cancelled') return 'late';
  const days = daysUntilLocalDate(quote.valid_until);
  if (days !== null && days < 0) return 'late';
  if (days !== null && days <= 5) return 'soon';
  return 'pending';
}

function renderQuotes() {
  const term = quoteSearch.value.trim().toLowerCase();
  const status = quoteStatusFilter.value;
  const visibleQuotes = quotes.filter((quote) => {
    const content = Object.values(quote).map((value) => String(value ?? '')).join(' ').toLowerCase();
    return content.includes(term) && (!status || quote.status === status);
  });
  if (!visibleQuotes.length) {
    quoteList.innerHTML = `<div class="empty-clients">${term || status ? 'Nenhum orçamento encontrado.' : 'Ainda não há orçamentos cadastrados.'}</div>`;
    return;
  }
  const grouped = {};
  visibleQuotes.forEach((q) => {
    const clientName = q.clients?.name || 'Sem cliente';
    if (!grouped[clientName]) grouped[clientName] = [];
    grouped[clientName].push(q);
  });
  let html = '';
  for (const [clientName, groupQuotes] of Object.entries(grouped)) {
    html += `<div style="margin-bottom:6px;padding:0 4px;"><strong style="font-size:9px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;">${escapeHTML(clientName)}</strong></div>`;
    for (const quote of groupQuotes) {
      // A linha de validade só aparece quando existe prazo ou sinal a cobrar;
      // orçamento confirmado mostra o sinal recebido, os demais, o que falta.
      const tone = quoteValidityTone(quote);
      const validity = quote.status === 'confirmed' && !quoteRequiresSignal(quote) ? '' : `<span class="quote-validity-tag ${tone}"><i data-lucide="${tone === 'done' ? 'circle-check' : tone === 'late' ? 'triangle-alert' : 'clock'}"></i>${escapeHTML(quoteValidityNote(quote))}</span>`;
      html += `<article class="client-row quote-card detail-trigger" data-detail-type="quote" data-detail-id="${quote.id}"><span class="client-initial"><i data-lucide="notebook-tabs"></i></span><div class="client-details"><strong>${escapeHTML(quote.name)}</strong><span>${escapeHTML(quote.venue || 'Local não informado')}</span><span>${quote.event_date || 'Sem data'} ${quote.event_time ? `· ${quote.event_time}` : ''}</span>${validity}</div><div class="client-actions"><span class="quote-total">${formatCurrency(quote.total)}</span><span class="quote-status ${quote.status}">${quoteStatusLabel(quote.status)}</span><button class="client-action" type="button" data-quote-pdf-row="${quote.id}" aria-label="Ver PDF de ${escapeHTML(quote.name)}" title="Ver PDF"><i data-lucide="file-text"></i></button><button class="client-action" type="button" data-quote-whatsapp-row="${quote.id}" aria-label="Enviar ${escapeHTML(quote.name)} por WhatsApp" title="Enviar WhatsApp"><i data-lucide="message-circle"></i></button><button class="client-action" type="button" data-edit-quote="${quote.id}" aria-label="Editar ${escapeHTML(quote.name)}" title="Editar"><i data-lucide="pencil"></i></button><button class="client-action" type="button" data-delete-quote="${quote.id}" aria-label="Excluir ${escapeHTML(quote.name)}" title="Excluir"><i data-lucide="trash-2"></i></button></div></article>`;
    }
  }
  quoteList.innerHTML = html;
  refreshQuoteDepositButtons();
  lucide.createIcons();
}

// Colunas usadas pelas telas de orçamento, listas uma vez para o select não
// divergir entre a lista, o detalhe, o PDF e a mensagem.
const QUOTE_COLUMNS = 'id, quote_number, name, client_id, venue, event_date, event_time, status, notes, subtotal, discount, additional_fee, total, valid_until, deposit_percent, deposit_amount, deposited_amount, confirmed_by_deposit';

async function loadQuotes() {
  setQuoteFeedback('Carregando orçamentos...');
  // A expiração é derivada da data de corte, então é resolvida aqui em vez de
  // depender de um job no servidor: quem abrir a lista já vê o estado real.
  await supabaseClient.rpc('expire_overdue_quotes');
  const { data, error } = await supabaseClient.from('quotes').select(`${QUOTE_COLUMNS}, clients(id, name)`).order('created_at', { ascending: false });
  if (error) {
    setQuoteFeedback(`Não foi possível carregar os orçamentos: ${error.message}`, true);
    quoteList.innerHTML = '';
    return;
  }
  quotes = data || [];
  setQuoteFeedback(`${quotes.length} ${quotes.length === 1 ? 'orçamento cadastrado' : 'orçamentos cadastrados'}`);
  renderQuotes();
}

/* ========================================================================== */
/* ORÇAMENTO EM PDF E ENVIO                                                  */
/* O PDF nasce da impressão do navegador: usa as fontes e as cores reais do   */
/* app e o texto continua selecionável. Tudo é montado na hora a partir do     */
/* banco, então o documento nunca sai desatualizado em relação ao orçamento.   */
/* ========================================================================== */
const quotePrint = document.querySelector('#quote-print');
const quoteSavedPanel = document.querySelector('#quote-saved-panel');
const quoteSavedFeedback = document.querySelector('#quote-saved-feedback');
const quoteSavedTitle = document.querySelector('#quote-saved-title');
let quoteSavedId = '';

// Erro de PDF, sinal e compartilhamento acontece com o painel pós-salvo na frente
// da tela, então a mensagem vai para o painel que o usuário está vendo. Sem isso o
// texto cai no feedback da lista, que fica atrás do overlay, e o clique parece não
// ter feito nada.
function setQuoteOutputFeedback(message, isError = false) {
  if (!quoteSavedPanel.hidden) {
    quoteSavedFeedback.textContent = message;
    quoteSavedFeedback.style.color = isError ? '#a0483d' : '';
    return;
  }
  setQuoteFeedback(message, isError);
}

function formatDateBR(value) {
  if (!value) return '';
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('pt-BR');
}

// Busca o orcamento e seus itens direto do banco, para o PDF e a mensagem
// refletirem o estado mais recente e nao a copia guardada em memoria.
async function loadQuoteForOutput(quoteId) {
  const { data: quote, error } = await supabaseClient.from('quotes').select(`${QUOTE_COLUMNS}, clients(id, name, whatsapp, email)`).eq('id', quoteId).single();
  if (error) throw new Error(error.message);
  const { data: items, error: itemsError } = await supabaseClient.from('quote_items').select('service_id, quantity, unit_price, description').eq('quote_id', quoteId).order('sort_order');
  if (itemsError) throw new Error(itemsError.message);
  if (!menus.length) await loadMenus();
  // Cardapios ficam agrupados pelos servicos que participam deles, em vez de
  // uma lista solta: no PDF e na mensagem cada servico mostra os seus.
  const menusByService = groupMenusByService(menus, (items || []).map((item) => item.service_id));
  return { quote, items: items || [], menusByService };
}

function renderQuotePrint({ quote, items, menusByService }) {
  const eventLine = [formatDateBR(quote.event_date), quote.event_time ? String(quote.event_time).slice(0, 5) : ''].filter(Boolean).join(' · ');
  const rows = items.map((item) => {
    const linked = menusByService.get(item.service_id) || [];
    const menusCell = linked.length
      ? `<span class="pd-item-menus">${linked.map((menu) => `<span class="pd-item-menu">${escapeHTML(menu.name)}</span>`).join('')}</span>`
      : '';
    return `<tr><td><span class="pd-item-name">${escapeHTML(item.description || 'Serviço')}</span>${menusCell}</td><td class="pd-num">${formatNumber(item.quantity)}</td><td class="pd-num">${formatCurrency(item.unit_price)}</td><td class="pd-num">${formatCurrency(Number(item.quantity) * Number(item.unit_price))}</td></tr>`;
  }).join('');
  // O sinal aparece uma vez só, na condição de validade no fim do documento. No
  // cabeçalho ele competia com local e data, e na conta ele se confundia com
  // mais uma parcela do total.
  quotePrint.innerHTML = `
    <header class="pd-head">
      <div class="pd-brand"><span class="pd-brand-mark">PR</span><span><span class="pd-brand-name">Plenitude</span><span class="pd-brand-sub">Realizações</span></span></div>
      <div class="pd-meta"><span class="pd-number-label">Orçamento</span><span class="pd-number">#${String(quote.quote_number ?? 0).padStart(4, '0')}</span><span class="pd-status ${escapeHTML(quote.status)}">${quoteStatusLabel(quote.status)}</span></div>
    </header>
    <h1 class="pd-title">${escapeHTML(quote.name)}</h1>
    <div class="pd-blocks">
      <div class="pd-block"><span class="pd-block-label">Cliente</span><span class="pd-block-value">${escapeHTML(quote.clients?.name || 'Sem cliente')}</span>${quote.clients?.whatsapp ? `<span class="pd-block-line">${escapeHTML(quote.clients.whatsapp)}</span>` : ''}${quote.clients?.email ? `<span class="pd-block-line">${escapeHTML(quote.clients.email)}</span>` : ''}</div>
      <div class="pd-block"><span class="pd-block-label">Data do evento</span><span class="pd-block-value">${escapeHTML(eventLine || 'A definir')}</span>${quote.event_time ? '' : ''}</div>
      <div class="pd-block"><span class="pd-block-label">Local</span><span class="pd-block-value">${escapeHTML(quote.venue || 'A definir')}</span></div>
    </div>
    <table class="pd-items"><thead><tr><th>Serviço</th><th class="pd-num">Qtd.</th><th class="pd-num">Valor unit.</th><th class="pd-num">Total</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="pd-totals"><div class="pd-totals-box">
      <div class="pd-total-line"><span>Subtotal</span><strong>${formatCurrency(quote.subtotal)}</strong></div>
      ${Number(quote.discount) > 0 ? `<div class="pd-total-line"><span>Desconto</span><strong>- ${formatCurrency(quote.discount)}</strong></div>` : ''}
      ${Number(quote.additional_fee) > 0 ? `<div class="pd-total-line"><span>Taxa adicional</span><strong>+ ${formatCurrency(quote.additional_fee)}</strong></div>` : ''}
      <div class="pd-total-line pd-grand"><span>Total</span><strong>${formatCurrency(quote.total)}</strong></div>
    </div></div>
    ${Number(quote.deposit_amount) > 0 && quote.status !== 'confirmed' ? `<div class="pd-signal-note"><span class="pd-notes-label">Condição de validade</span><span class="pd-notes-text">Esta proposta é válida até <strong>${escapeHTML(formatDateBR(quote.valid_until) || 'data a definir')}</strong>. O serviço fica reservado mediante o pagamento de ${formatCurrency(quote.deposit_amount)} (${formatNumber(quote.deposit_percent)}% do total). Sem o pagamento do sinal até essa data, a proposta perde a validade e a data do evento é liberada para outros clientes.</span></div>` : ''}
    ${quote.notes ? `<div class="pd-notes"><span class="pd-notes-label">Observações</span><span class="pd-notes-text">${escapeHTML(quote.notes)}</span></div>` : ''}
    <footer class="pd-foot"><span>Plenitude Realizações</span><span>Emitido em ${formatDateBR(new Date().toISOString())}</span></footer>`;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

async function printQuotePdf(quoteId) {
  try {
    const payload = await loadQuoteForOutput(quoteId);
    renderQuotePrint(payload);
    // As fontes do Google chegam por rede: sem esta espera o PDF sairia no fallback.
    if (document.fonts?.ready) await document.fonts.ready;
    window.print();
  } catch (error) {
    setQuoteFeedback(`Não foi possível gerar o PDF: ${error.message}`, true);
  }
}

function quoteWhatsappText({ quote, items, menusByService }) {
  const lines = [`*ORÇAMENTO #${String(quote.quote_number ?? 0).padStart(4, '0')}*`, `*${quote.name}*`, ''];
  lines.push(`Olá, ${quote.clients?.name || 'tudo bem'}!`.trim());
  lines.push('Segue a proposta da Plenitude Realizações:');
  lines.push('');
  // Mesmo agrupamento do PDF: cada servico lista os cardapios que o acompanham.
  items.forEach((item) => {
    lines.push(`• ${item.description || 'Serviço'} — ${formatNumber(item.quantity)} × ${formatCurrency(item.unit_price)} = ${formatCurrency(Number(item.quantity) * Number(item.unit_price))}`);
    const linked = menusByService.get(item.service_id) || [];
    if (linked.length) lines.push(`   _Cardápio: ${linked.map((menu) => menu.name).join(', ')}_`);
  });
  lines.push('');
  lines.push(`*Total: ${formatCurrency(quote.total)}*`);
  const details = [formatDateBR(quote.event_date), quote.venue].filter(Boolean);
  if (details.length) lines.push(`Evento: ${details.join(' · ')}`);
  // A validade e o sinal vão na mensagem porque e a condicao que faz a proposta
  // valer: e dela que sai a confirmacao do contrato.
  if (Number(quote.deposit_amount) > 0) {
    lines.push('');
    if (quote.status === 'confirmed') {
      lines.push(`✅ *Sinal recebido:* ${formatCurrency(quote.deposited_amount)} de ${formatCurrency(quote.deposit_amount)} (${formatNumber(quote.deposit_percent)}%)`);
    } else {
      lines.push(`*Para reservar a data:* sinal de ${formatCurrency(quote.deposit_amount)} (${formatNumber(quote.deposit_percent)}% do total)`);
      if (quote.valid_until) lines.push(`*Proposta válida até ${formatDateBR(quote.valid_until)}.*`);
    }
  }
  if (quote.notes) lines.push('', `Observações: ${quote.notes}`);
  lines.push('', 'Enviado por Plenitude Realizações');
  return lines.join('\n');
}

async function sendQuoteOnWhatsapp(quoteId) {
  try {
    const payload = await loadQuoteForOutput(quoteId);
    const number = whatsappNumber(payload.quote.clients?.whatsapp);
    if (!number) {
      setQuoteOutputFeedback('Cadastre o WhatsApp do cliente para enviar.', true);
      return;
    }
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(quoteWhatsappText(payload))}`, '_blank', 'noopener,noreferrer');
  } catch (error) {
    setQuoteOutputFeedback(`Não foi possível preparar o envio: ${error.message}`, true);
  }
}

async function shareQuote(quoteId) {
  try {
    const payload = await loadQuoteForOutput(quoteId);
    const shareData = { title: `Orçamento #${String(payload.quote.quote_number ?? 0).padStart(4, '0')} — ${payload.quote.name}`, text: quoteWhatsappText(payload) };
    if (navigator.share) {
      await navigator.share(shareData);
      return;
    }
    await navigator.clipboard.writeText(shareData.text);
    setQuoteOutputFeedback('Orçamento copiado. Cole no WhatsApp do cliente.');
  } catch (error) {
    if (error?.name === 'AbortError') return;
    setQuoteOutputFeedback('Não foi possível compartilhar o orçamento.', true);
  }
}

function openQuoteSavedPanel(quoteId, message) {
  quoteSavedId = quoteId;
  quoteSavedFeedback.textContent = '';
  quoteSavedTitle.textContent = message;
  quoteSavedPanel.hidden = false;
  refreshQuoteDepositButtons();
}

document.querySelectorAll('[data-close-quote-saved]').forEach((button) => button.addEventListener('click', () => { quoteSavedPanel.hidden = true; quoteSavedId = ''; }));
quoteSavedPanel.addEventListener('click', (event) => {
  if (event.target === quoteSavedPanel) { quoteSavedPanel.hidden = true; quoteSavedId = ''; }
  if (event.target.closest('[data-quote-pdf]')) printQuotePdf(quoteSavedId);
  if (event.target.closest('[data-quote-whatsapp]')) sendQuoteOnWhatsapp(quoteSavedId);
  if (event.target.closest('[data-quote-share]')) shareQuote(quoteSavedId);
  if (event.target.closest('[data-quote-deposit]')) openQuoteDepositPanel(quoteSavedId);
});

// O botão de sinal só aparece onde faz sentido: quando existe valor a cobrar e
// o orçamento ainda não foi confirmado pelo pagamento.
function refreshQuoteDepositButtons() {
  document.querySelectorAll('[data-quote-deposit]').forEach((button) => {
    const quote = quotes.find((item) => item.id === (button.dataset.quoteDepositId || quoteSavedId));
    const visible = Boolean(quote) && Number(quote.deposit_amount) > 0 && quote.status !== 'cancelled';
    button.hidden = !visible;
  });
}

// Painel do sinal: mostra o que era, o que já entrou e o que falta, para o
// registro ser uma conferência e não um cálculo no olho.
const quoteDepositPanel = document.querySelector('#quote-deposit-panel');
const quoteDepositForm = document.querySelector('#quote-deposit-form');
const quoteDepositHistory = document.querySelector('#quote-deposit-history');
const quoteDepositFeedback = document.querySelector('#quote-deposit-feedback');

async function loadQuoteDeposit(quoteId) {
  const { data: quote, error } = await supabaseClient.from('quotes').select(`${QUOTE_COLUMNS}, clients(id, name)`).eq('id', quoteId).single();
  if (error) throw new Error(error.message);
  const { data: deposits } = await supabaseClient.from('quote_deposits').select('id, amount, paid_on, payment_method, notes, voided_at, posted_at').eq('quote_id', quoteId).order('paid_on', { ascending: false });
  return { quote, deposits: deposits || [] };
}

function renderQuoteDepositHistory(deposits) {
  if (!deposits.length) {
    quoteDepositHistory.innerHTML = '<p class="quote-deposit-history-empty">Nenhum sinal registrado ainda.</p>';
    return;
  }
  quoteDepositHistory.innerHTML = `<span class="quote-deposit-history-title">Sinais registrados</span>${deposits.map((deposit) => `<div class="quote-deposit-row ${deposit.voided_at ? 'voided' : ''}">
    <div><strong>${formatCurrency(deposit.amount)}</strong><span>${formatDateBR(deposit.paid_on)}${deposit.notes ? ` · ${escapeHTML(deposit.notes)}` : ''}</span></div>
    ${deposit.voided_at ? '<span class="quote-deposit-void-tag">Estornado</span>' : `<button class="client-action" type="button" data-void-quote-deposit="${deposit.id}" aria-label="Estornar sinal de ${formatCurrency(deposit.amount)}" title="Estornar"><i data-lucide="rotate-ccw"></i></button>`}
  </div>`).join('')}`;
  window.lucide?.createIcons();
}

async function openQuoteDepositPanel(quoteId) {
  if (!quoteId || !quoteDepositPanel) return;
  try {
    const { quote, deposits } = await loadQuoteDeposit(quoteId);
    const paid = deposits.filter((deposit) => !deposit.voided_at).reduce((sum, deposit) => sum + Number(deposit.amount), 0);
    const required = Number(quote.deposit_amount || 0);
    const remaining = Math.max(0, required - paid);
    document.querySelector('#quote-deposit-quote-id').value = quote.id;
    document.querySelector('#quote-deposit-context').textContent = `${quote.name} · ${quote.clients?.name || 'Sem cliente'} · total ${formatCurrency(quote.total)}`;
    document.querySelector('#quote-deposit-required').textContent = formatCurrency(required);
    document.querySelector('#quote-deposit-paid').textContent = formatCurrency(paid);
    document.querySelector('#quote-deposit-remaining').textContent = remaining > 0 ? formatCurrency(remaining) : 'Quitado';
    document.querySelector('#quote-deposit-amount').value = remaining > 0 ? remaining : '';
    document.querySelector('#quote-deposit-date').value = localToday();
    document.querySelector('#quote-deposit-notes').value = '';
    quoteDepositFeedback.textContent = '';
    renderQuoteDepositHistory(deposits);
    quoteDepositPanel.hidden = false;
  } catch (error) {
    // O painel não abriu, então o aviso vai para quem chamou o botão e um toast
    // fecha o recado: sem os dois, o clique não deixa marca nenhuma na tela.
    setQuoteOutputFeedback(`Não foi possível abrir o sinal: ${error.message}`, true);
    showToast('Não foi possível abrir o sinal');
  }
}

// Os três lados do painel do sinal são ligados com ?. de propósito: o painel é
// a única parte opcional do módulo e, se ele faltar no markup, o que cai fora é
// só o registro de sinal — não a lista, nem o formulário, nem o PDF.
document.querySelector('[data-close-quote-deposit]')?.addEventListener('click', () => { quoteDepositPanel.hidden = true; });

quoteDepositForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submitButton = quoteDepositForm.querySelector('button[type="submit"]');
  const quoteId = document.querySelector('#quote-deposit-quote-id').value;
  const amount = Number(document.querySelector('#quote-deposit-amount').value);
  const label = submitButton.querySelector('span');
  if (!Number.isFinite(amount) || amount <= 0) { quoteDepositFeedback.textContent = 'Informe um valor maior que zero.'; return; }
  submitButton.disabled = true;
  label.textContent = 'Registrando...';
  const { error } = await supabaseClient.rpc('register_quote_deposit', {
    target_quote_id: quoteId,
    target_amount: amount,
    target_paid_on: document.querySelector('#quote-deposit-date').value,
    target_payment_method: document.querySelector('#quote-deposit-method').value,
    target_notes: document.querySelector('#quote-deposit-notes').value
  });
  submitButton.disabled = false;
  label.textContent = 'Registrar sinal';
  if (error) {
    quoteDepositFeedback.textContent = error.message || 'Não foi possível registrar o sinal.';
    return;
  }
  await loadQuotes();
  const { quote, deposits } = await loadQuoteDeposit(quoteId);
  const paid = deposits.filter((deposit) => !deposit.voided_at).reduce((sum, deposit) => sum + Number(deposit.amount), 0);
  const remaining = Math.max(0, Number(quote.deposit_amount || 0) - paid);
  document.querySelector('#quote-deposit-paid').textContent = formatCurrency(paid);
  document.querySelector('#quote-deposit-remaining').textContent = remaining > 0 ? formatCurrency(remaining) : 'Quitado';
  document.querySelector('#quote-deposit-amount').value = remaining > 0 ? remaining : '';
  renderQuoteDepositHistory(deposits);
  refreshQuoteDepositButtons();
  showToast(quote.status === 'confirmed' ? 'Sinal recebido. Orçamento confirmado.' : 'Sinal registrado');
});

quoteDepositHistory?.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-void-quote-deposit]');
  if (!button) return;
  const depositId = button.dataset.voidQuoteDeposit;
  if (!window.confirm('Estornar este sinal? O recebimento correspondente no Financeiro também será estornado.')) return;
  button.disabled = true;
  const { error } = await supabaseClient.rpc('void_quote_deposit', { target_deposit_id: depositId });
  button.disabled = false;
  if (error) { quoteDepositFeedback.textContent = error.message || 'Não foi possível estornar o sinal.'; return; }
  await loadQuotes();
  await openQuoteDepositPanel(document.querySelector('#quote-deposit-quote-id').value);
  showToast('Sinal estornado');
});

async function loadQuoteReferences() {
  await Promise.all([loadClients(), loadServices(), loadMenus()]);
  quoteClientSelect.innerHTML = '<option value="">Selecione um cliente</option>' + clients.map((client) => `<option value="${client.id}">${escapeHTML(client.name)}</option>`).join('');
}

function renderQuoteServices(selectedItems = []) {
  const selectedByService = new Map(selectedItems.map((item) => [item.service_id, item]));
  const available = services.filter((service) => service.active);
  if (!available.length) {
    quoteServicePicker.innerHTML = '<span class="field-hint">Cadastre serviços ativos para adicioná-los ao orçamento.</span>';
    updateQuotePreview();
    return;
  }
  quoteServicePicker.innerHTML = available.map((service) => {
    const selected = selectedByService.get(service.id);
    // O cardapio nunca e escolhido: ele acompanha o servico marcado.
    const linkedMenus = menus.filter((menu) => menu.serviceIds.includes(service.id));
    const menusHtml = linkedMenus.length
      ? `<span class="quote-service-menus"><span class="quote-service-menus-label">Cardápios</span>${linkedMenus.map((menu) => `
          <button class="linked-menu-chip" type="button" data-open-menu-detail="${menu.id}" aria-label="Abrir cardápio ${escapeHTML(menu.name)}">
            <i data-lucide="book-open"></i>
            <span>${escapeHTML(menu.name)}</span>
          </button>
        `).join('')}</span>`
      : '';
    return `<div class="quote-service-option"><label class="quote-service-check" for="quote-service-${service.id}"><input id="quote-service-${service.id}" type="checkbox" data-quote-service="${service.id}" ${selected ? 'checked' : ''} /></label><span class="quote-service-copy"><label class="quote-service-name" for="quote-service-${service.id}"><strong>${escapeHTML(service.name)}</strong></label><small>${escapeHTML(service.category || 'Serviço')}</small></span><span class="quote-service-price">${formatCurrency(service.default_price)}</span><span><label for="qty-${service.id}" class="quote-qty-label">Quant.</label><input type="number" min="0.01" step="0.01" id="qty-${service.id}" value="${selected?.quantity || 1}" data-quote-quantity="${service.id}" /></span><span><label for="price-${service.id}" class="quote-price-label">Preço unit.</label><input type="number" min="0" step="0.01" id="price-${service.id}" value="${selected?.unit_price ?? service.default_price}" data-quote-price="${service.id}" /></span><span class="quote-service-choice">Selecionado</span>${menusHtml}</div>`;
  }).join('');
  lucide.createIcons();
  updateQuoteServiceStates();
  updateQuotePreview();
}

function updateQuoteServiceStates() {
  quoteServicePicker.querySelectorAll('.quote-service-option').forEach((option) => {
    option.classList.toggle('selected', option.querySelector('[data-quote-service]').checked);
  });
}

function getQuoteItemsFromForm() {
  return [...quoteServicePicker.querySelectorAll('[data-quote-service]:checked')].map((checkbox) => ({ service_id: checkbox.dataset.quoteService, quantity: Number(quoteServicePicker.querySelector(`[data-quote-quantity="${checkbox.dataset.quoteService}"]`).value), unit_price: Number(quoteServicePicker.querySelector(`[data-quote-price="${checkbox.dataset.quoteService}"]`).value), description: services.find((service) => service.id === checkbox.dataset.quoteService)?.name || 'Serviço' }));
}

function updateQuotePreview() {
  const subtotal = getQuoteItemsFromForm().reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const discount = Number(document.querySelector('#quote-discount').value || 0);
  const fee = Number(document.querySelector('#quote-fee').value || 0);
  const total = Math.max(0, subtotal - discount + fee);
  quoteSubtotalPreview.textContent = formatCurrency(subtotal);
  quoteTotalPreview.textContent = formatCurrency(total);
  updateQuoteValidityPreview(total);
}

// Traduz os dois campos de validade no que o usuário precisa decidir: quanto é
// o sinal, até quando e o que a data de corte significa.
function updateQuoteValidityPreview(total = null) {
  const percentInput = quoteDepositPercentInput;
  const validUntilInput = quoteValidUntilInput;
  const preview = quoteDepositPreview;
  if (!percentInput || !validUntilInput || !preview) return;
  const percent = Math.min(100, Math.max(0, Number(percentInput.value) || 0));
  const resolvedTotal = total === null ? Math.max(0, getQuoteItemsFromForm().reduce((sum, item) => sum + item.quantity * item.unit_price, 0) - Number(document.querySelector('#quote-discount').value || 0) + Number(document.querySelector('#quote-fee').value || 0)) : total;
  const deposit = Math.round(resolvedTotal * percent / 100 * 100) / 100;
  const validUntil = validUntilInput.value;
  const days = daysUntilLocalDate(validUntil);
  if (percent <= 0) {
    preview.innerHTML = '<i data-lucide="info"></i><span>Sem sinal, o orçamento não expira. Confirme manualmente quando o cliente aceitar.</span>';
  } else if (!validUntil) {
    preview.innerHTML = `<i data-lucide="triangle-alert"></i><span>Sinal de <strong>${formatCurrency(deposit)}</strong> (${formatNumber(percent)}%), mas sem data de corte: a proposta não expira. Defina a validade.</span>`;
  } else if (days !== null && days < 0) {
    preview.innerHTML = `<i data-lucide="triangle-alert"></i><span>A validade venceu em ${formatDateBR(validUntil)}. O orçamento expira ao salvar.</span>`;
  } else {
    const when = days === 0 ? 'hoje' : days === 1 ? 'amanhã' : `em ${days} dias`;
    preview.innerHTML = `<i data-lucide="clock"></i><span>Para reservar a data, o cliente paga <strong>${formatCurrency(deposit)}</strong> (${formatNumber(percent)}%) até <strong>${formatDateBR(validUntil)}</strong> — ${when}. O sinal confirma o orçamento e entra como recebimento no Financeiro.</span>`;
  }
  lucide.createIcons();
}

async function openQuotes() {
  if (!permitir('orcamentos')) return;
  quotePanel.hidden = false;
  quoteSearch.value = '';
  quoteStatusFilter.value = '';
  await loadQuotes();
}

async function openQuoteForm(quote = null) {
  quoteForm.reset();
  document.querySelector('#quote-id').value = quote?.id || '';
  document.querySelector('#quote-name').value = quote?.name || '';
  const selectedClientId = quote?.client_id || '';
  document.querySelector('#quote-date').value = quote?.event_date || '';
  document.querySelector('#quote-time').value = quote?.event_time || '';
  document.querySelector('#quote-venue').value = quote?.venue || '';
  document.querySelector('#quote-discount').value = quote?.discount || 0;
  document.querySelector('#quote-fee').value = quote?.additional_fee || 0;
  document.querySelector('#quote-status').value = quote?.status || 'draft';
  document.querySelector('#quote-notes').value = quote?.notes || '';
  // Orçamento novo já nasce com o prazo padrão de 20 dias, para a validade nunca
  // depender de o usuário lembrar de preencher. Os dois campos são opcionais no
  // markup: sem eles a proposta só não expira, o formulário continua abrindo.
  if (quoteValidUntilInput) quoteValidUntilInput.value = quote?.valid_until || addDaysToLocalDate(localToday(), QUOTE_VALIDITY_DAYS);
  if (quoteDepositPercentInput) quoteDepositPercentInput.value = quote?.deposit_percent ?? QUOTE_DEFAULT_DEPOSIT_PERCENT;
  quoteFormTitle.textContent = quote ? 'Editar orçamento' : 'Novo orçamento';
  quoteFormFeedback.textContent = '';
  quoteFormPanel.hidden = false;
  await loadQuoteReferences();
  quoteClientSelect.value = selectedClientId;
  const { data: items } = quote ? await supabaseClient.from('quote_items').select('service_id, quantity, unit_price, description').eq('quote_id', quote.id).order('sort_order') : { data: [] };
  renderQuoteServices(items || []);
}

document.querySelectorAll('[data-open-quotes]').forEach((button) => button.addEventListener('click', openQuotes));
document.querySelectorAll('[data-new-quote]').forEach((button) => button.addEventListener('click', () => openQuoteForm()));
document.querySelector('[data-close-quotes]').addEventListener('click', () => { quotePanel.hidden = true; });
document.querySelector('[data-close-quote-form]').addEventListener('click', () => { quoteFormPanel.hidden = true; });
quoteSearch.addEventListener('input', renderQuotes);
quoteStatusFilter.addEventListener('change', renderQuotes);
quoteServicePicker.addEventListener('input', updateQuotePreview);
quoteServicePicker.addEventListener('change', () => { updateQuoteServiceStates(); updateQuotePreview(); });
document.querySelector('#quote-discount').addEventListener('input', updateQuotePreview);
document.querySelector('#quote-fee').addEventListener('input', updateQuotePreview);
quoteDepositPercentInput?.addEventListener('input', () => updateQuoteValidityPreview());
quoteValidUntilInput?.addEventListener('input', () => updateQuoteValidityPreview());
quoteValidUntilInput?.addEventListener('change', () => updateQuoteValidityPreview());

quoteForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const saveButton = quoteForm.querySelector('button[type="submit"]');
  const quoteId = document.querySelector('#quote-id').value;
  const depositPercent = Math.min(100, Math.max(0, Number(quoteDepositPercentInput?.value || 0)));
  const payload = { name: document.querySelector('#quote-name').value.trim(), client_id: quoteClientSelect.value, venue: document.querySelector('#quote-venue').value.trim() || null, event_date: document.querySelector('#quote-date').value || null, event_time: document.querySelector('#quote-time').value || null, status: document.querySelector('#quote-status').value, notes: document.querySelector('#quote-notes').value.trim() || null, discount: Number(document.querySelector('#quote-discount').value || 0), additional_fee: Number(document.querySelector('#quote-fee').value || 0), valid_until: depositPercent > 0 ? (quoteValidUntilInput?.value || null) : null, deposit_percent: depositPercent };
  const items = getQuoteItemsFromForm();
  if (!items.length) { quoteFormFeedback.textContent = 'Selecione pelo menos um serviço.'; return; }
  if (depositPercent > 0 && payload.status === 'sent' && !payload.valid_until) { quoteFormFeedback.textContent = 'Defina a data de validade do orçamento ou use 0% de sinal.'; return; }
  saveButton.disabled = true;
  saveButton.querySelector('span').textContent = 'Salvando...';
  const result = quoteId ? await supabaseClient.from('quotes').update(payload).eq('id', quoteId).select('id').single() : await supabaseClient.from('quotes').insert(payload).select('id').single();
  if (result.error) { quoteFormFeedback.textContent = result.error.message.includes('confirmed_quote') ? 'Orçamentos confirmados precisam ter uma data.' : 'Não foi possível salvar o orçamento.'; saveButton.disabled = false; saveButton.querySelector('span').textContent = 'Salvar orçamento'; return; }
  const savedId = result.data.id;
  const { error: deleteItemsError } = await supabaseClient.from('quote_items').delete().eq('quote_id', savedId);
  if (deleteItemsError) {
    quoteFormFeedback.textContent = 'Orçamento salvo, mas não foi possível substituir os serviços anteriores.';
    saveButton.disabled = false;
    saveButton.querySelector('span').textContent = 'Salvar orçamento';
    return;
  }
  const { error: itemError } = await supabaseClient.from('quote_items').insert(items.map((item, index) => ({ quote_id: savedId, ...item, sort_order: index })));
  if (itemError) { quoteFormFeedback.textContent = 'Orçamento salvo, mas não foi possível salvar os serviços.'; saveButton.disabled = false; saveButton.querySelector('span').textContent = 'Salvar orçamento'; return; }
  quoteFormPanel.hidden = true;
  await loadQuotes();
  saveButton.disabled = false;
  saveButton.querySelector('span').textContent = 'Salvar orçamento';
  showToast(quoteId ? 'Orçamento atualizado' : 'Orçamento cadastrado');
  // O PDF e a mensagem sao montados sob demanda, entao o documento sempre
  // corresponde ao estado atual do orcamento, antigo ou novo.
  openQuoteSavedPanel(savedId, quoteId ? 'Orçamento atualizado' : 'Orçamento cadastrado');
});

quoteList.addEventListener('click', async (event) => {
  const pdfButton = event.target.closest('[data-quote-pdf-row]');
  const whatsappButton = event.target.closest('[data-quote-whatsapp-row]');
  if (pdfButton) { await printQuotePdf(pdfButton.dataset.quotePdfRow); return; }
  if (whatsappButton) { await sendQuoteOnWhatsapp(whatsappButton.dataset.quoteWhatsappRow); return; }
  const editButton = event.target.closest('[data-edit-quote]');
  const deleteButton = event.target.closest('[data-delete-quote]');
  if (editButton) { openQuoteForm(quotes.find((quote) => quote.id === editButton.dataset.editQuote)); return; }
  if (deleteButton) {
    const quote = quotes.find((item) => item.id === deleteButton.dataset.deleteQuote);
    if (!quote || !window.confirm(`Excluir o orçamento ${quote.name}?`)) return;
    const { error } = await supabaseClient.from('quotes').delete().eq('id', quote.id);
    if (error) { setQuoteFeedback('Não foi possível excluir este orçamento.', true); return; }
    await loadQuotes();
    showToast('Orçamento excluído');
  }
});

inventoryImageInput.addEventListener('change', () => {
  pendingInventoryImages = [...pendingInventoryImages, ...inventoryImageInput.files].filter((file) => file.type.startsWith('image/'));
  inventoryImageInput.value = '';
  renderInventoryImagePreviews(document.querySelector('#inventory-id').value || null);
});

inventoryImagePreviews.addEventListener('click', (event) => {
  const existingButton = event.target.closest('[data-remove-existing-inventory-image]');
  const pendingButton = event.target.closest('[data-remove-pending-inventory-image]');
  if (existingButton) {
    removedInventoryImageIds.push(existingButton.dataset.removeExistingInventoryImage);
    renderInventoryImagePreviews(document.querySelector('#inventory-id').value || null);
  }
  if (pendingButton) {
    pendingInventoryImages.splice(Number(pendingButton.dataset.removePendingInventoryImage), 1);
    renderInventoryImagePreviews(document.querySelector('#inventory-id').value || null);
  }
});

inventoryForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const saveButton = inventoryForm.querySelector('button[type="submit"]');
  const itemId = document.querySelector('#inventory-id').value;
  const payload = {
    name: document.querySelector('#inventory-name').value.trim(),
    unit: document.querySelector('#inventory-unit').value.trim(),
    quantity: Number(document.querySelector('#inventory-quantity').value),
    minimum_quantity: Number(document.querySelector('#inventory-minimum').value),
    description: document.querySelector('#inventory-description').value.trim() || null,
    active: document.querySelector('#inventory-active').checked
  };
  saveButton.disabled = true;
  saveButton.querySelector('span').textContent = 'Salvando...';
  inventoryFormFeedback.textContent = '';
  const result = itemId
    ? await supabaseClient.from('inventory_items').update(payload).eq('id', itemId)
    : await supabaseClient.from('inventory_items').insert(payload).select('id').single();
  if (result.error) {
    inventoryFormFeedback.textContent = 'Não foi possível salvar o item. Confira os dados.';
    saveButton.disabled = false;
    saveButton.querySelector('span').textContent = 'Salvar item';
    return;
  }
  const selectedCategoryIds = [...inventoryCategoryOptions.querySelectorAll('input:checked')].map((input) => input.value);
  const savedItemId = itemId || result.data?.id;
  const { error: clearCategoriesError } = await supabaseClient.from('inventory_category_links').delete().eq('inventory_item_id', savedItemId);
  if (clearCategoriesError || !savedItemId) {
    inventoryFormFeedback.textContent = 'Item salvo, mas não foi possível atualizar suas categorias.';
    saveButton.disabled = false;
    saveButton.querySelector('span').textContent = 'Salvar item';
    return;
  }
  if (selectedCategoryIds.length) await supabaseClient.from('inventory_category_links').insert(selectedCategoryIds.map((categoryId) => ({ inventory_item_id: savedItemId, category_id: categoryId })));
  if (removedInventoryImageIds.length) {
    const removedImages = inventoryImages.filter((image) => removedInventoryImageIds.includes(image.id));
    await supabaseClient.storage.from('inventory-images').remove(removedImages.map((image) => image.storage_path));
    await supabaseClient.from('inventory_images').delete().in('id', removedInventoryImageIds);
  }
  if (pendingInventoryImages.length) {
    const uploadedImages = [];
    for (const [index, file] of pendingInventoryImages.entries()) {
      const extension = file.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const storagePath = `${savedItemId}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabaseClient.storage.from('inventory-images').upload(storagePath, file, { contentType: file.type, upsert: false });
      if (uploadError) continue;
      const { data: publicData } = supabaseClient.storage.from('inventory-images').getPublicUrl(storagePath);
      uploadedImages.push({ inventory_item_id: savedItemId, storage_path: storagePath, public_url: publicData.publicUrl, sort_order: index });
    }
    if (uploadedImages.length) await supabaseClient.from('inventory_images').insert(uploadedImages);
  }
  inventoryFormPanel.hidden = true;
  await loadInventory();
  saveButton.disabled = false;
  saveButton.querySelector('span').textContent = 'Salvar item';
  showToast(itemId ? 'Item atualizado' : 'Item cadastrado');
});

movementType.addEventListener('change', () => {
  movementQuantityLabel.textContent = movementType.value === 'adjustment' ? 'Nova quantidade total' : 'Quantidade';
});

movementForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const saveButton = movementForm.querySelector('button[type="submit"]');
  saveButton.disabled = true;
  saveButton.querySelector('span').textContent = 'Registrando...';
  movementFormFeedback.textContent = '';
  const { error } = await supabaseClient.rpc('record_inventory_movement', {
    target_item_id: document.querySelector('#movement-item-id').value,
    movement_kind: movementType.value,
    movement_quantity: Number(document.querySelector('#movement-quantity').value),
    movement_notes: document.querySelector('#movement-notes').value.trim() || null
  });
  if (error) {
    movementFormFeedback.textContent = error.message.includes('negativo') ? 'A saída não pode ser maior que o estoque atual.' : 'Não foi possível registrar a movimentação. Execute a migração 004 no Supabase.';
    saveButton.disabled = false;
    saveButton.querySelector('span').textContent = 'Registrar movimentação';
    return;
  }
  movementFormPanel.hidden = true;
  await loadInventory();
  saveButton.disabled = false;
  saveButton.querySelector('span').textContent = 'Registrar movimentação';
  showToast('Movimentação registrada');
});

inventoryList.addEventListener('click', async (event) => {
  const moveButton = event.target.closest('[data-move-inventory]');
  const editButton = event.target.closest('[data-edit-inventory]');
  const deleteButton = event.target.closest('[data-delete-inventory]');
  const itemId = moveButton?.dataset.moveInventory || editButton?.dataset.editInventory || deleteButton?.dataset.deleteInventory;
  const item = inventoryItems.find((entry) => entry.id === itemId);
  if (moveButton) return openMovementForm(item);
  if (editButton) return openInventoryForm(item);
  if (deleteButton) {
    if (!item || !window.confirm(`Excluir o item ${item.name}?`)) return;
    const { error } = await supabaseClient.from('inventory_items').delete().eq('id', item.id);
    if (error) {
      setInventoryFeedback('Não foi possível excluir este item. Ele pode estar ligado a um serviço.', true);
      return;
    }
    await loadInventory();
    showToast('Item excluído');
  }
});

/* ========================================================================== */
/* API Pública                                                                */
/* ========================================================================== */
/* Exposta para realtime.js, que chama estes loaders quando outro usuário      */
/* altera uma tabela. Também é o que events.js usava em window.plenitudeApp   */
/* sem que esse objeto existisse.                                             */
window.plenitudeApp = {
  loadClients,
  loadServices,
  loadMenus,
  loadInventory,
  loadInventoryCategories,
  loadQuotes,
  loadQuoteReferences,
  // O módulo de Cerimonial precisa saber quais serviços estão marcados como
  // "serviço de cerimonial" para filtrar o seletor de evento ativo. A lista
  // só é buscada se o app já tiver carregado os serviços; caso contrário o
  // cerimonial cai no fallback e mostra todos os eventos.
  getCeremonialServiceIds: () => services.filter((service) => service.is_ceremonial).map((service) => service.id)
};