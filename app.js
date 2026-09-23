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
const quoteMenuSelect = document.querySelector('#quote-menu');
const quoteClientSelect = document.querySelector('#quote-client');
const quoteSubtotalPreview = document.querySelector('#quote-subtotal-preview');
const quoteTotalPreview = document.querySelector('#quote-total-preview');
let clients = [];
let services = [];
let menus = [];
let menuServices = [];
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
    <article class="client-row service-row detail-trigger" data-detail-type="service" data-detail-id="${service.id}">
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
  if (!linksError) setServiceFeedback(`${services.length} ${services.length === 1 ? 'serviço cadastrado' : 'serviços cadastrados'}`);
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
    const serviceCount = menuServices.filter((link) => link.menu_id === menu.id).length;
    const images = menuImages.filter((image) => image.menu_id === menu.id).slice(0, 4);
    const heroImage = images[0]?.public_url;
    return `<article class="visual-card menu-card detail-trigger" data-detail-type="menu" data-detail-id="${menu.id}">
      <button class="visual-card-hero${heroImage ? '' : ' visual-card-placeholder'}" type="button" ${heroImage ? `data-view-image="${escapeHTML(heroImage)}"` : ''} aria-label="${heroImage ? `Ver imagem de ${escapeHTML(menu.name)}` : 'Cardápio sem imagem'}">${heroImage ? `<img src="${escapeHTML(heroImage)}" alt="${escapeHTML(menu.name)}" />` : '<i data-lucide="book-open"></i><span>Sem imagem</span>'}</button>
      <div class="visual-card-body"><div class="visual-card-heading"><div><strong>${escapeHTML(menu.name)}</strong><span>${escapeHTML(menu.description || 'Sem descrição')}</span></div><span class="service-status${menu.active ? '' : ' inactive'}">${menu.active ? 'Ativo' : 'Inativo'}</span></div>
        <div class="visual-card-meta"><span class="service-price">${serviceCount} ${serviceCount === 1 ? 'serviço' : 'serviços'}</span>${images.length > 1 ? `<span>${images.length} imagens</span>` : ''}</div>
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
    showToast(button.dataset.nav);
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
  inventoryPanel.hidden = false;
  inventorySearch.value = '';
  inventoryLowOnly.checked = false;
  loadInventory();
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
  document.querySelector('#inventory-name').focus();
}

function openMovementForm(item) {
  if (!item) return;
  movementForm.reset();
  document.querySelector('#movement-item-id').value = item.id;
  movementItemName.textContent = `${item.name} · saldo atual: ${item.quantity} ${item.unit}`;
  movementFormFeedback.textContent = '';
  movementFormPanel.hidden = false;
  document.querySelector('#movement-quantity').focus();
}

document.querySelector('[data-open-inventory]').addEventListener('click', openInventory);
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

function openDetail(type, id) {
  let title = 'Detalhes';
  let eyebrow = 'DETALHES';
  let content = '';
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
    content = `<div class="detail-summary"><span class="detail-icon"><i data-lucide="sparkles"></i></span><div><strong>${escapeHTML(service.name)}</strong><span>${service.active ? 'Serviço ativo' : 'Serviço inativo'}</span></div></div>${detailRow('Categoria', service.category)}${detailRow('Preço padrão', formatCurrency(service.default_price))}${detailRow('Cardápios', service.menuNames.join(' · '))}${detailRow('Descrição', service.description)}`;
  } else if (type === 'menu') {
    const menu = menus.find((item) => item.id === id);
    if (!menu) return;
    const images = menuImages.filter((image) => image.menu_id === id).map((image) => image.public_url);
    const categories = menuCategoryLinks.filter((link) => link.menu_id === id).map((link) => menuCategories.find((category) => category.id === link.category_id)?.name).filter(Boolean);
    title = menu.name;
    eyebrow = 'CARDÁPIO';
    content = renderDetailImages(images, menu.name) + `<div class="detail-summary"><span class="detail-icon"><i data-lucide="book-open"></i></span><div><strong>${escapeHTML(menu.name)}</strong><span>${menu.active ? 'Disponível' : 'Inativo'}</span></div></div>${detailRow('Categorias', categories.join(' · '))}${detailRow('Serviços', `${menuServices.filter((link) => link.menu_id === id).length}`)}${detailRow('Descrição', menu.description)}`;
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
    title = quote.name;
    eyebrow = 'ORÇAMENTO';
    content = `<div class="detail-summary"><span class="detail-icon"><i data-lucide="notebook-tabs"></i></span><div><strong>${escapeHTML(quote.name)}</strong><span>${escapeHTML(quote.status)}</span></div></div>${detailRow('Cliente', quote.clients?.name)}${detailRow('Cardápio', quote.menus?.name)}${detailRow('Data', quote.event_date)}${detailRow('Horário', quote.event_time)}${detailRow('Local', quote.venue)}${detailRow('Total', formatCurrency(quote.total))}${detailRow('Observações', quote.notes)}`;
  }
  detailViewTitle.textContent = title;
  detailViewEyebrow.textContent = eyebrow;
  detailViewContent.innerHTML = content;
  detailView.hidden = false;
  lucide.createIcons();
}

function closeDetail() {
  detailView.hidden = true;
  detailViewContent.innerHTML = '';
}

document.addEventListener('click', (event) => {
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
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeDetail(); });

function setQuoteFeedback(message, isError = false) {
  quoteFeedback.textContent = message;
  quoteFeedback.style.color = isError ? '#a0483d' : '';
}

function quoteStatusLabel(status) {
  return { draft: 'Rascunho', sent: 'Enviado', confirmed: 'Confirmado', cancelled: 'Cancelado', expired: 'Expirado' }[status] || status;
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
  quoteList.innerHTML = visibleQuotes.map((quote) => `<article class="client-row quote-card detail-trigger" data-detail-type="quote" data-detail-id="${quote.id}"><span class="client-initial"><i data-lucide="notebook-tabs"></i></span><div class="client-details"><strong>${escapeHTML(quote.name)}</strong><span>${escapeHTML(quote.clients?.name || 'Cliente não informado')} · ${escapeHTML(quote.venue || 'Local não informado')}</span><span>${quote.event_date || 'Sem data'} ${quote.event_time ? `· ${quote.event_time}` : ''}</span><span class="quote-total">${formatCurrency(quote.total)}</span></div><div class="client-actions"><span class="quote-status ${quote.status}">${quoteStatusLabel(quote.status)}</span><button class="client-action" type="button" data-edit-quote="${quote.id}" aria-label="Editar ${escapeHTML(quote.name)}" title="Editar"><i data-lucide="pencil"></i></button><button class="client-action" type="button" data-delete-quote="${quote.id}" aria-label="Excluir ${escapeHTML(quote.name)}" title="Excluir"><i data-lucide="trash-2"></i></button></div></article>`).join('');
  lucide.createIcons();
}

async function loadQuotes() {
  setQuoteFeedback('Carregando orçamentos...');
  const { data, error } = await supabaseClient.from('quotes').select('id, quote_number, name, client_id, venue, event_date, event_time, status, notes, subtotal, discount, additional_fee, total, menu_id, clients(id, name), menus(id, name)').order('created_at', { ascending: false });
  if (error) {
    setQuoteFeedback('Não foi possível carregar os orçamentos. Verifique a migração 002.', true);
    quoteList.innerHTML = '';
    return;
  }
  quotes = data || [];
  setQuoteFeedback(`${quotes.length} ${quotes.length === 1 ? 'orçamento cadastrado' : 'orçamentos cadastrados'}`);
  renderQuotes();
}

async function loadQuoteReferences() {
  await Promise.all([loadClients(), loadServices(), loadMenus()]);
  quoteClientSelect.innerHTML = '<option value="">Selecione um cliente</option>' + clients.map((client) => `<option value="${client.id}">${escapeHTML(client.name)}</option>`).join('');
  quoteMenuSelect.innerHTML = '<option value="">Todos os serviços</option>' + menus.filter((menu) => menu.active).map((menu) => `<option value="${menu.id}">${escapeHTML(menu.name)}</option>`).join('');
}

function renderQuoteServices(selectedItems = []) {
  const selectedMenuId = quoteMenuSelect.value;
  const selectedByService = new Map(selectedItems.map((item) => [item.service_id, item]));
  const available = services.filter((service) => service.active && (!selectedMenuId || service.menuIds.includes(selectedMenuId)));
  if (!available.length) {
    quoteServicePicker.innerHTML = '<span class="field-hint">Cadastre serviços ativos para adicioná-los ao orçamento.</span>';
    updateQuotePreview();
    return;
  }
  quoteServicePicker.innerHTML = available.map((service) => {
    const selected = selectedByService.get(service.id);
    return `<label class="quote-service-option"><input type="checkbox" data-quote-service="${service.id}" ${selected ? 'checked' : ''} /><span class="quote-service-copy"><strong class="quote-service-name">${escapeHTML(service.name)}</strong><small>${escapeHTML(service.category || 'Serviço')}</small></span><span class="quote-service-price">${formatCurrency(service.default_price)}</span><input type="number" min="0.01" step="0.01" value="${selected?.quantity || 1}" data-quote-quantity="${service.id}" aria-label="Quantidade de ${escapeHTML(service.name)}" /><input type="number" min="0" step="0.01" value="${selected?.unit_price ?? service.default_price}" data-quote-price="${service.id}" aria-label="Preço de ${escapeHTML(service.name)}" /><span class="quote-service-choice">Selecionado</span></label>`;
  }).join('');
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
  quoteSubtotalPreview.textContent = formatCurrency(subtotal);
  quoteTotalPreview.textContent = formatCurrency(Math.max(0, subtotal - discount + fee));
}

async function openQuotes() {
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
  const selectedMenuId = quote?.menu_id || '';
  document.querySelector('#quote-date').value = quote?.event_date || '';
  document.querySelector('#quote-time').value = quote?.event_time || '';
  document.querySelector('#quote-venue').value = quote?.venue || '';
  document.querySelector('#quote-discount').value = quote?.discount || 0;
  document.querySelector('#quote-fee').value = quote?.additional_fee || 0;
  document.querySelector('#quote-status').value = quote?.status || 'draft';
  document.querySelector('#quote-notes').value = quote?.notes || '';
  quoteFormTitle.textContent = quote ? 'Editar orçamento' : 'Novo orçamento';
  quoteFormFeedback.textContent = '';
  quoteFormPanel.hidden = false;
  await loadQuoteReferences();
  quoteClientSelect.value = selectedClientId;
  quoteMenuSelect.value = selectedMenuId;
  const { data: items } = quote ? await supabaseClient.from('quote_items').select('service_id, quantity, unit_price, description').eq('quote_id', quote.id).order('sort_order') : { data: [] };
  renderQuoteServices(items || []);
  document.querySelector('#quote-name').focus();
}

document.querySelectorAll('[data-open-quotes]').forEach((button) => button.addEventListener('click', openQuotes));
document.querySelectorAll('[data-new-quote]').forEach((button) => button.addEventListener('click', () => openQuoteForm()));
document.querySelector('[data-close-quotes]').addEventListener('click', () => { quotePanel.hidden = true; });
document.querySelector('[data-close-quote-form]').addEventListener('click', () => { quoteFormPanel.hidden = true; });
quoteSearch.addEventListener('input', renderQuotes);
quoteStatusFilter.addEventListener('change', renderQuotes);
quoteMenuSelect.addEventListener('change', () => renderQuoteServices(getQuoteItemsFromForm()));
quoteServicePicker.addEventListener('input', updateQuotePreview);
quoteServicePicker.addEventListener('change', () => { updateQuoteServiceStates(); updateQuotePreview(); });
document.querySelector('#quote-discount').addEventListener('input', updateQuotePreview);
document.querySelector('#quote-fee').addEventListener('input', updateQuotePreview);

quoteForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const saveButton = quoteForm.querySelector('button[type="submit"]');
  const quoteId = document.querySelector('#quote-id').value;
  const payload = { name: document.querySelector('#quote-name').value.trim(), client_id: quoteClientSelect.value, menu_id: quoteMenuSelect.value || null, venue: document.querySelector('#quote-venue').value.trim() || null, event_date: document.querySelector('#quote-date').value || null, event_time: document.querySelector('#quote-time').value || null, status: document.querySelector('#quote-status').value, notes: document.querySelector('#quote-notes').value.trim() || null, discount: Number(document.querySelector('#quote-discount').value || 0), additional_fee: Number(document.querySelector('#quote-fee').value || 0) };
  const items = getQuoteItemsFromForm();
  if (!items.length) { quoteFormFeedback.textContent = 'Selecione pelo menos um serviço.'; return; }
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
});

quoteList.addEventListener('click', async (event) => {
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