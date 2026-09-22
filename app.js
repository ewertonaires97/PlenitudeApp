lucide.createIcons();

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
let clients = [];
let services = [];
let menus = [];
let menuServices = [];
let menuImages = [];
let menuCategories = [];
let menuCategoryLinks = [];
let pendingMenuImages = [];
let removedMenuImageIds = [];

function setAuthenticated(isAuthenticated) {
  authScreen.hidden = isAuthenticated;
  appShell.classList.toggle('ready', isAuthenticated);
}

function showLoginError(message) {
  loginFeedback.textContent = message;
  loginButton.disabled = false;
  loginButton.querySelector('span').textContent = 'Entrar no backoffice';
}

supabaseClient.auth.getSession().then(({ data, error }) => {
  if (error) {
    console.error('Não foi possível inicializar o Supabase:', error.message);
    showLoginError('Não foi possível verificar a sessão. Tente novamente.');
    return;
  }

  setAuthenticated(Boolean(data.session));
  console.info('Supabase conectado ao projeto Plenitude Realizações.');
});

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
    <article class="client-row">
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
  document.querySelector('#client-name').focus();
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
    <article class="client-row service-row">
      <span class="client-initial">${escapeHTML(clientInitial(service.name))}</span>
      <div class="client-details">
        <strong>${escapeHTML(service.name)}</strong>
        <span>${escapeHTML(service.category || 'Sem categoria')}</span>
        ${service.menuNames.length ? `<span class="service-menus">${escapeHTML(service.menuNames.join(' · '))}</span>` : ''}
        ${service.description ? `<span class="service-description">${escapeHTML(service.description)}</span>` : ''}
        <span class="service-price">${formatCurrency(service.default_price)}</span>
        <span class="service-status${service.active ? '' : ' inactive'}">${service.active ? 'Ativo' : 'Inativo'}</span>
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
  const { data, error } = await supabaseClient.from('services').select('id, name, description, category, default_price, active, created_at').order('name');
  if (error) {
    setServiceFeedback('Não foi possível carregar os serviços. Verifique seu acesso.', true);
    serviceList.innerHTML = '';
    return;
  }
  const { data: links, error: linksError } = await supabaseClient.from('menu_services').select('service_id, menu_id, menus(id, name)');
  if (linksError) {
    setServiceFeedback('Serviços carregados, mas não foi possível carregar os cardápios.', true);
  }
  menuServices = links || [];
  services = (data || []).map((service) => {
    const serviceLinks = menuServices.filter((link) => link.service_id === service.id);
    return {
      ...service,
      menuIds: serviceLinks.map((link) => link.menu_id),
      menuNames: serviceLinks.map((link) => link.menus?.name).filter(Boolean)
    };
  });
  setServiceFeedback(`${services.length} ${services.length === 1 ? 'serviço cadastrado' : 'serviços cadastrados'}`);
  renderServices();
  if (!menuPanel.hidden) renderMenus();
}

function openServices() {
  servicePanel.hidden = false;
  serviceSearch.value = '';
  serviceMenuFilter.value = '';
  Promise.all([loadMenus(), loadServices()]);
}

async function renderServiceMenuOptions(selectedMenuIds = []) {
  if (!menus.length) {
    serviceMenuOptions.innerHTML = '<span class="field-hint">Ainda não há cardápios cadastrados.</span><button class="inline-create-button" type="button" data-new-menu-from-service><i data-lucide="plus"></i><span>Criar novo cardápio</span></button>';
    lucide.createIcons();
    return;
  }
  serviceMenuOptions.innerHTML = menus.map((menu) => `
    <label class="menu-option" for="service-menu-${menu.id}">
      <input id="service-menu-${menu.id}" type="checkbox" value="${menu.id}" ${selectedMenuIds.includes(menu.id) ? 'checked' : ''} />
      <span>${escapeHTML(menu.name)}</span>
    </label>
  `).join('');
}

async function openServiceForm(service = null) {
  serviceForm.reset();
  document.querySelector('#service-id').value = service?.id || '';
  document.querySelector('#service-name').value = service?.name || '';
  document.querySelector('#service-category').value = service?.category || '';
  document.querySelector('#service-price').value = service?.default_price ?? '';
  document.querySelector('#service-description').value = service?.description || '';
  document.querySelector('#service-active').checked = service?.active ?? true;
  serviceFormTitle.textContent = service ? 'Editar serviço' : 'Novo serviço';
  serviceFormFeedback.textContent = '';
  serviceFormPanel.hidden = false;
  await loadMenus();
  await renderServiceMenuOptions(service?.menuIds || []);
  document.querySelector('#service-name').focus();
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
    active: document.querySelector('#service-active').checked
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

  const savedServiceId = result.data.id;
  const selectedMenuIds = [...serviceMenuOptions.querySelectorAll('input:checked')].map((input) => input.value);
  const { error: clearLinksError } = await supabaseClient.from('menu_services').delete().eq('service_id', savedServiceId);
  if (clearLinksError) {
    serviceFormFeedback.textContent = 'Serviço salvo, mas não foi possível atualizar os cardápios.';
    saveButton.disabled = false;
    saveButton.querySelector('span').textContent = 'Salvar serviço';
    return;
  }
  if (selectedMenuIds.length) {
    const { error: linkError } = await supabaseClient.from('menu_services').insert(selectedMenuIds.map((menuId, index) => ({ menu_id: menuId, service_id: savedServiceId, sort_order: index })));
    if (linkError) {
      serviceFormFeedback.textContent = 'Serviço salvo, mas não foi possível vincular os cardápios.';
      saveButton.disabled = false;
      saveButton.querySelector('span').textContent = 'Salvar serviço';
      return;
    }
  }

  serviceFormPanel.hidden = true;
  await loadServices();
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
    return `<article class="client-row"><span class="client-initial">${escapeHTML(clientInitial(category.name))}</span><div class="client-details"><strong>${escapeHTML(category.name)}</strong><span>${menuCount} ${menuCount === 1 ? 'cardápio' : 'cardápios'}</span></div><div class="client-actions"><button class="client-action" type="button" data-edit-category="${category.id}" aria-label="Editar ${escapeHTML(category.name)}" title="Editar"><i data-lucide="pencil"></i></button><button class="client-action" type="button" data-delete-category="${category.id}" aria-label="Excluir ${escapeHTML(category.name)}" title="Excluir"><i data-lucide="trash-2"></i></button></div></article>`;
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
    const serviceCount = menuServices.filter((link) => link.menu_id === menu.id).length;
    return `<article class="client-row service-row">
      <span class="client-initial">${escapeHTML(clientInitial(menu.name))}</span>
      <div class="client-details"><strong>${escapeHTML(menu.name)}</strong><span>${escapeHTML(menu.description || 'Sem descrição')}</span><span class="service-price">${serviceCount} ${serviceCount === 1 ? 'serviço' : 'serviços'}</span><span class="service-status${menu.active ? '' : ' inactive'}">${menu.active ? 'Ativo' : 'Inativo'}</span></div>
      <div class="client-actions"><button class="client-action" type="button" data-edit-menu="${menu.id}" aria-label="Editar ${escapeHTML(menu.name)}" title="Editar"><i data-lucide="pencil"></i></button><button class="client-action" type="button" data-delete-menu="${menu.id}" aria-label="Excluir ${escapeHTML(menu.name)}" title="Excluir"><i data-lucide="trash-2"></i></button></div>
    </article>`;
  }).join('');
  lucide.createIcons();
}

async function loadMenus() {
  const selectedCategoryIds = !menuFormPanel.hidden ? [...menuCategoryOptions.querySelectorAll('input:checked')].map((input) => input.value) : [];
  const openMenuId = !menuFormPanel.hidden ? document.querySelector('#menu-id').value || null : null;
  const { data, error } = await supabaseClient.from('menus').select('id, name, description, active, created_at').order('name');
  if (error) {
    setMenuFeedback('Não foi possível carregar os cardápios. Execute a migração 002 no Supabase.', true);
    return;
  }
  menus = data || [];
  const [imagesResult, categoriesResult, categoryLinksResult] = await Promise.all([
    supabaseClient.from('menu_images').select('id, menu_id, storage_path, public_url, sort_order').order('sort_order'),
    supabaseClient.from('menu_categories').select('id, name').order('name'),
    supabaseClient.from('menu_category_links').select('menu_id, category_id')
  ]);
  menuImages = imagesResult.data || [];
  menuCategories = categoriesResult.data || [];
  menuCategoryLinks = categoryLinksResult.data || [];
  renderMenuFilter();
  renderMenuCategoryFilter();
  renderMenus();
  renderCategories();
  if (!menuFormPanel.hidden) {
    renderMenuCategoryOptions(selectedCategoryIds);
    renderMenuImagePreviews(openMenuId);
  }
  if (!serviceFormPanel.hidden) await renderServiceMenuOptions([...serviceMenuOptions.querySelectorAll('input:checked')].map((input) => input.value));
}

function openMenus() {
  menuPanel.hidden = false;
  Promise.all([loadMenus(), loadServices()]);
}

function openMenuForm(menu = null) {
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
  renderMenuCategoryOptions(menu ? menuCategoryLinks.filter((link) => link.menu_id === menu.id).map((link) => link.category_id) : []);
  renderMenuImagePreviews(menu?.id || null);
  document.querySelector('#menu-name').focus();
}

document.querySelectorAll('[data-open-menus]').forEach((button) => button.addEventListener('click', openMenus));
document.querySelectorAll('[data-close-menus]').forEach((button) => button.addEventListener('click', () => { menuPanel.hidden = true; }));
document.querySelectorAll('[data-new-menu]').forEach((button) => button.addEventListener('click', () => openMenuForm()));
document.querySelectorAll('[data-close-menu-form]').forEach((button) => button.addEventListener('click', () => { menuFormPanel.hidden = true; }));
serviceMenuOptions.addEventListener('click', (event) => {
  if (event.target.closest('[data-new-menu-from-service]')) openMenuForm();
});

document.querySelector('[data-open-categories]').addEventListener('click', () => {
  categoryPanel.hidden = false;
  loadMenus();
});
document.querySelector('[data-close-categories]').addEventListener('click', () => { categoryPanel.hidden = true; });

menuForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const saveButton = menuForm.querySelector('button[type="submit"]');
  const menuId = document.querySelector('#menu-id').value;
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
  const savedMenuId = result.data.id;
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
  const existingMarkup = existingImages.map((image) => `<div class="image-preview"><img src="${escapeHTML(image.public_url)}" alt="Imagem do cardápio" /><button type="button" data-remove-existing-image="${image.id}" aria-label="Remover imagem"><i data-lucide="x"></i></button></div>`).join('');
  const pendingMarkup = pendingMenuImages.map((file, index) => `<div class="image-preview"><img src="${URL.createObjectURL(file)}" alt="Prévia de ${escapeHTML(file.name)}" /><button type="button" data-remove-pending-image="${index}" aria-label="Remover imagem"><i data-lucide="x"></i></button></div>`).join('');
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
    showToast(button.dataset.nav);
  });
});