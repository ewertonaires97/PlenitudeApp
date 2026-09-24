// ==========================================================================
// Plenitude Realizações - Módulo de Eventos & Produção
// ==========================================================================

(() => {
  'use strict';

  // Referência do cliente Supabase
  function getSupabase() {
    return window.plenitudeSupabase || (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
  }

  // Estado local do módulo de eventos
  const state = {
    events: [],
    clients: [],
    quotes: [],
    activeFilter: 'all', // 'all', 'upcoming', 'today', 'completed'
    statusFilter: '',
    searchQuery: '',
    currentEventId: null,
    currentEventData: null,
    currentTab: 'overview',
    ceremonialActivities: [],
    eventTables: [],
    guests: [],
  };

  // Toast utilitário
  function notify(message, duration = 3500) {
    const toast = document.querySelector('.toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(notify._timer);
    notify._timer = setTimeout(() => {
      toast.classList.remove('show');
    }, duration);
  }

  function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  // Formatadores de data e hora
  const MONTHS_SHORT = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
  const MONTHS_LONG = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  const WEEKDAYS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

  function parseDateOnly(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    }
    return new Date(dateStr);
  }

  function formatDisplayDate(dateStr) {
    const d = parseDateOnly(dateStr);
    if (!d || isNaN(d.getTime())) return 'Data a definir';
    const weekday = WEEKDAYS[d.getDay()];
    const day = d.getDate();
    const month = MONTHS_LONG[d.getMonth()];
    const year = d.getFullYear();
    return `${weekday}, ${day} de ${month} de ${year}`;
  }

  function formatTimeOnly(timeStr) {
    if (!timeStr) return '';
    return timeStr.slice(0, 5);
  }

  function formatCurrency(val) {
    const num = Number(val) || 0;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function calculateCountdown(dateStr) {
    if (!dateStr) return { text: '', type: 'neutral' };
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const target = parseDateOnly(dateStr);
    if (!target) return { text: '', type: 'neutral' };
    target.setHours(0, 0, 0, 0);

    const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return { text: 'É HOJE!', type: 'today' };
    if (diffDays === 1) return { text: 'Amanhã', type: 'soon' };
    if (diffDays > 1 && diffDays <= 7) return { text: `Em ${diffDays} dias`, type: 'soon' };
    if (diffDays > 7) return { text: `Em ${diffDays} dias`, type: 'future' };
    if (diffDays === -1) return { text: 'Ontem', type: 'past' };
    return { text: `${Math.abs(diffDays)}d atrás`, type: 'past' };
  }

  function formatQuoteStatus(status) {
    switch (status) {
      case 'draft': return 'Rascunho';
      case 'sent': return 'Enviado';
      case 'confirmed': return 'Confirmado';
      case 'cancelled': return 'Cancelado';
      case 'expired': return 'Expirado';
      default: return status || 'Rascunho';
    }
  }

  function formatStatusLabel(status) {
    switch (status) {
      case 'planned': return 'Planejado';
      case 'in_progress': return 'Em andamento';
      case 'completed': return 'Realizado';
      case 'cancelled': return 'Cancelado';
      default: return status || 'Planejado';
    }
  }

  function sanitizeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function cleanPhoneForWhatsApp(phone) {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length <= 11 && !digits.startsWith('55')) {
      return `55${digits}`;
    }
    return digits;
  }

  // ==========================================================================
  // Carregamento de Dados do Supabase
  // ==========================================================================

  async function loadClients() {
    const sb = getSupabase();
    if (!sb) return [];
    try {
      const { data, error } = await sb.from('clients').select('id, name, whatsapp, email').order('name');
      if (error) throw error;
      state.clients = data || [];
      populateClientSelect();
      return state.clients;
    } catch (err) {
      console.warn('Erro ao carregar clientes para eventos:', err);
      return [];
    }
  }

  async function loadQuotes() {
    const sb = getSupabase();
    if (!sb) return [];
    try {
      const { data, error } = await sb
        .from('quotes')
        .select('id, quote_number, name, client_id, venue, event_date, event_time, status, total')
        .order('created_at', { ascending: false });
      if (error) throw error;
      state.quotes = data || [];
      populateQuoteSelect();
      return state.quotes;
    } catch (err) {
      console.warn('Erro ao carregar orçamentos para eventos:', err);
      return [];
    }
  }

  async function loadEvents() {
    const sb = getSupabase();
    const feedbackEl = document.getElementById('event-feedback');
    const listEl = document.getElementById('event-list');

    if (!sb) {
      if (feedbackEl) feedbackEl.textContent = 'Conectando ao banco de dados...';
      return;
    }

    if (feedbackEl) feedbackEl.textContent = 'Carregando eventos...';

    try {
      const { data, error } = await sb
        .from('events')
        .select(`
          id,
          quote_id,
          client_id,
          name,
          venue,
          event_date,
          event_time,
          status,
          notes,
          created_at,
          updated_at,
          clients ( id, name, whatsapp, email ),
          quotes ( id, quote_number, name, total, status, subtotal, discount, additional_fee )
        `)
        .order('event_date', { ascending: true });

      if (error) throw error;

      state.events = data || [];
      if (feedbackEl) feedbackEl.textContent = '';
      renderEventsList();
      updateTodaySummary();
    } catch (err) {
      console.error('Erro ao buscar eventos:', err);
      if (feedbackEl) feedbackEl.textContent = 'Não foi possível carregar os eventos.';
      if (listEl) {
        listEl.innerHTML = `<div class="empty-clients">Erro ao carregar eventos: ${sanitizeHtml(err.message)}</div>`;
      }
    }
  }

  function updateTodaySummary() {
    const todayStr = new Date().toISOString().split('T')[0];
    const todayEvents = state.events.filter(e => e.event_date === todayStr && e.status !== 'cancelled');
    
    // Atualiza o resumo da tela inicial
    const todayCountEl = document.querySelector('.today-row strong');
    if (todayCountEl) {
      if (todayEvents.length === 0) {
        todayCountEl.textContent = 'Nenhum evento hoje';
      } else if (todayEvents.length === 1) {
        todayCountEl.textContent = '1 evento para hoje';
      } else {
        todayCountEl.textContent = `${todayEvents.length} eventos para hoje`;
      }
    }
  }

  function populateClientSelect() {
    const select = document.getElementById('event-client');
    if (!select) return;
    const currentVal = select.value;
    select.innerHTML = '<option value="">Selecione um cliente</option>' +
      state.clients.map(c => `<option value="${c.id}">${sanitizeHtml(c.name)}</option>`).join('');
    if (currentVal) select.value = currentVal;
  }

  function populateQuoteSelect(clientId = null) {
    const select = document.getElementById('event-quote-select');
    if (!select) return;
    const currentVal = select.value;

    let availableQuotes = state.quotes;
    if (clientId) {
      availableQuotes = state.quotes.filter(q => q.client_id === clientId);
    }

    let html = '<option value="">Gerar / Vincular automaticamente</option>';
    availableQuotes.forEach(q => {
      const num = q.quote_number ? `#${q.quote_number} - ` : '';
      const total = formatCurrency(q.total);
      html += `<option value="${q.id}">${num}${sanitizeHtml(q.name)} (${total})</option>`;
    });

    select.innerHTML = html;
    if (currentVal && availableQuotes.some(q => q.id === currentVal)) {
      select.value = currentVal;
    }
  }

  // ==========================================================================
  // Renderização da Lista de Eventos
  // ==========================================================================

  function renderEventsList() {
    const listEl = document.getElementById('event-list');
    if (!listEl) return;

    const todayStr = new Date().toISOString().split('T')[0];

    let filtered = state.events.filter(event => {
      // Filtro de status
      if (state.statusFilter && event.status !== state.statusFilter) {
        return false;
      }

      // Filtro de período (tabs rápidas)
      if (state.activeFilter === 'upcoming') {
        if (event.event_date < todayStr || event.status === 'completed' || event.status === 'cancelled') {
          return false;
        }
      } else if (state.activeFilter === 'today') {
        if (event.event_date !== todayStr) {
          return false;
        }
      } else if (state.activeFilter === 'completed') {
        if (event.status !== 'completed') {
          return false;
        }
      }

      // Filtro de busca textual
      if (state.searchQuery) {
        const query = state.searchQuery.toLowerCase().trim();
        const nameMatch = (event.name || '').toLowerCase().includes(query);
        const venueMatch = (event.venue || '').toLowerCase().includes(query);
        const clientName = event.clients ? event.clients.name : '';
        const clientMatch = clientName.toLowerCase().includes(query);
        const dateMatch = (event.event_date || '').includes(query);
        return nameMatch || venueMatch || clientMatch || dateMatch;
      }

      return true;
    });

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div class="empty-clients">
          <p>Nenhum evento encontrado para os filtros selecionados.</p>
          <button class="text-button" type="button" data-new-event style="margin-top: 8px;">
            + Criar novo evento
          </button>
        </div>
      `;
      refreshIcons();
      return;
    }

    listEl.innerHTML = filtered.map(event => {
      const d = parseDateOnly(event.event_date);
      const dayNum = d ? d.getDate() : '--';
      const monthShort = d ? MONTHS_SHORT[d.getMonth()] : '---';
      const countdown = calculateCountdown(event.event_date);
      const clientName = event.clients ? event.clients.name : 'Cliente não informado';
      const clientPhone = event.clients ? event.clients.whatsapp : '';
      const waNumber = cleanPhoneForWhatsApp(clientPhone);
      const timeFormatted = formatTimeOnly(event.event_time);
      const statusLabel = formatStatusLabel(event.status);
      const quoteNumber = event.quotes && event.quotes.quote_number ? `#${event.quotes.quote_number}` : null;

      return `
        <article class="event-card" data-event-id="${event.id}">
          <div class="event-date-box">
            <span class="event-day">${dayNum}</span>
            <span class="event-month">${monthShort}</span>
            ${countdown.text ? `<span class="event-countdown">${countdown.text}</span>` : ''}
          </div>

          <div class="event-card-body">
            <div class="event-card-heading">
              <h3 class="event-card-title">${sanitizeHtml(event.name)}</h3>
            </div>

            <div class="event-meta-line">
              <i data-lucide="user"></i>
              <span>${sanitizeHtml(clientName)}</span>
            </div>

            ${event.venue ? `
              <div class="event-meta-line">
                <i data-lucide="map-pin"></i>
                <span>${sanitizeHtml(event.venue)}</span>
              </div>
            ` : ''}

            ${timeFormatted ? `
              <div class="event-meta-line">
                <i data-lucide="clock"></i>
                <span>${timeFormatted}</span>
              </div>
            ` : ''}

            <div class="event-badges-row">
              <span class="event-status-badge ${event.status}">${statusLabel}</span>
              ${quoteNumber ? `<span class="event-quote-badge"><i data-lucide="file-text"></i> ${quoteNumber}</span>` : ''}
            </div>
          </div>

          <div class="event-card-actions" onclick="event.stopPropagation()">
            ${waNumber ? `
              <a class="client-action whatsapp-action" href="https://wa.me/${waNumber}" target="_blank" rel="noopener noreferrer" title="Conversar no WhatsApp" aria-label="WhatsApp com ${sanitizeHtml(clientName)}">
                <i data-lucide="message-circle"></i>
              </a>
            ` : ''}
            <button class="client-action" type="button" data-manage-event="${event.id}" title="Gerenciar Evento" aria-label="Gerenciar Evento">
              <i data-lucide="calendar-check"></i>
            </button>
            <button class="client-action" type="button" data-edit-event="${event.id}" title="Editar Evento" aria-label="Editar Evento">
              <i data-lucide="pencil"></i>
            </button>
            <button class="client-action" type="button" data-delete-event="${event.id}" title="Excluir Evento" aria-label="Excluir Evento">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </article>
      `;
    }).join('');

    refreshIcons();
  }

  // ==========================================================================
  // Abertura e Fechamento de Painéis
  // ==========================================================================

  function openEventsPanel(filter = null) {
    const panel = document.getElementById('event-panel');
    if (!panel) return;

    if (filter) {
      state.activeFilter = filter;
      document.querySelectorAll('.event-pill').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.eventFilter === filter);
      });
    }

    panel.hidden = false;
    loadEvents();
    loadClients();
    loadQuotes();
    refreshIcons();
  }

  function closeEventsPanel() {
    const panel = document.getElementById('event-panel');
    if (panel) panel.hidden = true;
  }

  function openEventForm(eventData = null) {
    const panel = document.getElementById('event-form-panel');
    const form = document.getElementById('event-form');
    const titleEl = document.getElementById('event-form-title');
    const feedbackEl = document.getElementById('event-form-feedback');

    if (!panel || !form) return;

    feedbackEl.textContent = '';
    form.reset();

    populateClientSelect();
    populateQuoteSelect();

    if (eventData) {
      if (titleEl) titleEl.textContent = 'Editar evento';
      document.getElementById('event-id').value = eventData.id || '';
      document.getElementById('event-quote-id').value = eventData.quote_id || '';
      document.getElementById('event-name').value = eventData.name || '';
      document.getElementById('event-client').value = eventData.client_id || '';
      document.getElementById('event-date').value = eventData.event_date || '';
      document.getElementById('event-time').value = eventData.event_time ? eventData.event_time.slice(0, 5) : '';
      document.getElementById('event-venue').value = eventData.venue || '';
      document.getElementById('event-status').value = eventData.status || 'planned';
      document.getElementById('event-notes').value = eventData.notes || '';

      const quoteSelect = document.getElementById('event-quote-select');
      if (quoteSelect && eventData.quote_id) {
        quoteSelect.value = eventData.quote_id;
      }
    } else {
      if (titleEl) titleEl.textContent = 'Novo evento';
      document.getElementById('event-id').value = '';
      document.getElementById('event-quote-id').value = '';
      document.getElementById('event-status').value = 'planned';
      
      // Data padrão: 7 dias a partir de hoje
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      document.getElementById('event-date').value = nextWeek.toISOString().split('T')[0];
    }

    panel.hidden = false;
    refreshIcons();
  }

  function closeEventForm() {
    const panel = document.getElementById('event-form-panel');
    if (panel) panel.hidden = true;
  }

  // ==========================================================================
  // Salvar / Excluir Eventos
  // ==========================================================================

  async function handleEventFormSubmit(e) {
    e.preventDefault();
    const sb = getSupabase();
    const feedbackEl = document.getElementById('event-form-feedback');
    const submitBtn = e.target.querySelector('button[type="submit"]');

    if (!sb) {
      if (feedbackEl) feedbackEl.textContent = 'Erro de conexão com o banco.';
      return;
    }

    const id = document.getElementById('event-id').value.trim();
    const name = document.getElementById('event-name').value.trim();
    const clientId = document.getElementById('event-client').value;
    let quoteId = document.getElementById('event-quote-select').value || document.getElementById('event-quote-id').value.trim();
    const eventDate = document.getElementById('event-date').value;
    const eventTime = document.getElementById('event-time').value || null;
    const venue = document.getElementById('event-venue').value.trim() || null;
    const status = document.getElementById('event-status').value;
    const notes = document.getElementById('event-notes').value.trim() || null;

    if (!name || !clientId || !eventDate) {
      if (feedbackEl) feedbackEl.textContent = 'Preencha o nome do evento, cliente e data.';
      return;
    }

    if (submitBtn) submitBtn.disabled = true;
    if (feedbackEl) feedbackEl.textContent = 'Salvando evento...';

    try {
      // Se não houver quote_id vinculado (o banco de dados requer quote_id NOT NULL),
      // criamos um orçamento correspondente automaticamente!
      if (!quoteId) {
        const { data: newQuote, error: quoteErr } = await sb
          .from('quotes')
          .insert({
            name: `Orçamento - ${name}`,
            client_id: clientId,
            venue: venue,
            event_date: eventDate,
            event_time: eventTime,
            status: status === 'completed' || status === 'in_progress' ? 'confirmed' : 'draft',
            notes: notes || 'Gerado a partir do módulo de eventos'
          })
          .select('id')
          .single();

        if (quoteErr) throw quoteErr;
        quoteId = newQuote.id;
      }

      const eventPayload = {
        name,
        client_id: clientId,
        quote_id: quoteId,
        event_date: eventDate,
        event_time: eventTime,
        venue,
        status,
        notes
      };

      if (id) {
        // Atualização
        const { error } = await sb.from('events').update(eventPayload).eq('id', id);
        if (error) throw error;
        notify('Evento atualizado com sucesso!');
      } else {
        // Inserção
        const { error } = await sb.from('events').insert(eventPayload);
        if (error) throw error;
        notify('Evento criado com sucesso!');
      }

      closeEventForm();
      await loadEvents();
      await loadQuotes();

      // Se o modal de detalhes estiver aberto com este evento, recarrega
      if (state.currentEventId === id && id) {
        await openEventDetail(id);
      }
    } catch (err) {
      console.error('Erro ao salvar evento:', err);
      if (feedbackEl) feedbackEl.textContent = `Erro ao salvar: ${err.message}`;
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  async function deleteEvent(eventId) {
    const eventObj = state.events.find(e => e.id === eventId);
    const eventName = eventObj ? `"${eventObj.name}"` : 'este evento';

    if (!confirm(`Tem certeza que deseja excluir ${eventName}? Todas as atividades e convidados vinculados também serão removidos.`)) {
      return;
    }

    const sb = getSupabase();
    if (!sb) return;

    try {
      const { error } = await sb.from('events').delete().eq('id', eventId);
      if (error) throw error;

      notify('Evento excluído com sucesso.');
      await loadEvents();

      const detailPanel = document.getElementById('event-detail-panel');
      if (detailPanel && !detailPanel.hidden && state.currentEventId === eventId) {
        closeEventDetail();
      }
    } catch (err) {
      console.error('Erro ao excluir evento:', err);
      alert(`Não foi possível excluir o evento: ${err.message}`);
    }
  }

  // ==========================================================================
  // Gestão Detalhada do Evento (Produção, Cerimonial, Convidados)
  // ==========================================================================

  async function openEventDetail(eventId) {
    const panel = document.getElementById('event-detail-panel');
    if (!panel) return;

    state.currentEventId = eventId;
    panel.hidden = false;

    await loadEventFullDetails(eventId);
    refreshIcons();
  }

  function closeEventDetail() {
    const panel = document.getElementById('event-detail-panel');
    if (panel) panel.hidden = true;
    state.currentEventId = null;
    state.currentEventData = null;
  }

  async function loadEventFullDetails(eventId) {
    const sb = getSupabase();
    if (!sb) return;

    const heroEl = document.getElementById('event-detail-hero');
    if (heroEl) heroEl.innerHTML = '<p style="color: white; padding: 10px;">Carregando dados completos do evento...</p>';

    try {
      // 1. Dados do evento e vínculos
      const { data: eventData, error: eventErr } = await sb
        .from('events')
        .select(`
          *,
          clients ( id, name, whatsapp, email, notes ),
          quotes (
            id, quote_number, name, total, status, subtotal, discount, additional_fee, notes,
            quote_items ( id, description, quantity, unit_price, line_total )
          )
        `)
        .eq('id', eventId)
        .single();

      if (eventErr) throw eventErr;
      state.currentEventData = eventData;

      // 2. Cerimonial (atividades)
      const { data: activities, error: actErr } = await sb
        .from('ceremonial_activities')
        .select('*')
        .eq('event_id', eventId)
        .order('position', { ascending: true })
        .order('scheduled_time', { ascending: true });

      if (actErr) console.warn('Erro ao carregar atividades do cerimonial:', actErr);
      state.ceremonialActivities = activities || [];

      // 3. Mesas
      const { data: tables, error: tblErr } = await sb
        .from('event_tables')
        .select('*')
        .eq('event_id', eventId)
        .order('table_number', { ascending: true });

      if (tblErr) console.warn('Erro ao carregar mesas:', tblErr);
      state.eventTables = tables || [];

      // 4. Convidados
      const { data: guests, error: gstErr } = await sb
        .from('guests')
        .select('*, event_tables(id, table_number)')
        .eq('event_id', eventId)
        .order('name', { ascending: true });

      if (gstErr) console.warn('Erro ao carregar convidados:', gstErr);
      state.guests = guests || [];

      renderEventDetailHero();
      renderEventTabContent();
    } catch (err) {
      console.error('Erro ao buscar detalhes completos do evento:', err);
      if (heroEl) heroEl.innerHTML = `<p style="color: #f1dcd8; padding: 10px;">Erro ao carregar detalhes: ${err.message}</p>`;
    }
  }

  function renderEventDetailHero() {
    const heroEl = document.getElementById('event-detail-hero');
    const event = state.currentEventData;
    if (!heroEl || !event) return;

    const formattedDate = formatDisplayDate(event.event_date);
    const formattedTime = formatTimeOnly(event.event_time);
    const countdown = calculateCountdown(event.event_date);
    const clientName = event.clients ? event.clients.name : 'Cliente não informado';
    const clientPhone = event.clients ? event.clients.whatsapp : '';
    const waNumber = cleanPhoneForWhatsApp(clientPhone);

    heroEl.innerHTML = `
      <h3>${sanitizeHtml(event.name)}</h3>
      <div class="hero-meta-grid">
        <div class="hero-meta-item">
          <i data-lucide="calendar"></i>
          <span>${formattedDate} ${formattedTime ? `às <strong>${formattedTime}</strong>` : ''}</span>
          ${countdown.text ? `<span style="background: rgba(255,255,255,.2); padding: 2px 6px; border-radius: 3px; font-weight: bold; font-size: 9px;">${countdown.text}</span>` : ''}
        </div>
        ${event.venue ? `
          <div class="hero-meta-item">
            <i data-lucide="map-pin"></i>
            <span>${sanitizeHtml(event.venue)}</span>
          </div>
        ` : ''}
        <div class="hero-meta-item">
          <i data-lucide="user"></i>
          <span>${sanitizeHtml(clientName)} ${clientPhone ? `(${sanitizeHtml(clientPhone)})` : ''}</span>
        </div>
      </div>

      <div class="event-hero-actions">
        <div class="status-pill-group">
          <button class="status-btn ${event.status === 'planned' ? 'active' : ''}" type="button" data-set-status="planned">Planejado</button>
          <button class="status-btn ${event.status === 'in_progress' ? 'active' : ''}" type="button" data-set-status="in_progress">Em andamento</button>
          <button class="status-btn ${event.status === 'completed' ? 'active' : ''}" type="button" data-set-status="completed">Realizado</button>
        </div>
        <div class="hero-action-buttons">
          ${waNumber ? `
            <a class="hero-action-btn" href="https://wa.me/${waNumber}" target="_blank" rel="noopener noreferrer">
              <i data-lucide="message-circle"></i><span>WhatsApp</span>
            </a>
          ` : ''}
          <button class="hero-action-btn" type="button" data-edit-current-event>
            <i data-lucide="pencil"></i><span>Editar</span>
          </button>
        </div>
      </div>
    `;

    refreshIcons();
  }

  function renderEventTabContent() {
    const event = state.currentEventData;
    if (!event) return;

    // 1. Aba Visão Geral
    const overviewEl = document.getElementById('event-tab-overview');
    if (overviewEl) {
      const quote = event.quotes;
      const quoteItems = quote && quote.quote_items ? quote.quote_items : [];

      overviewEl.innerHTML = `
        <div class="overview-grid">
          <div class="overview-card">
            <h4>
              <span><i data-lucide="file-text" style="width:14px; display:inline-block; vertical-align:middle; color:var(--gold);"></i> Orçamento Comercial</span>
              ${quote && quote.quote_number ? `<span class="event-quote-badge">Proposta #${quote.quote_number}</span>` : ''}
            </h4>
            ${quote ? `
              <div class="detail-row" style="padding: 6px 0;">
                <span>Total Contratado</span>
                <strong style="color: var(--moss); font-size: 13px;">${formatCurrency(quote.total)}</strong>
              </div>
              <div class="detail-row" style="padding: 6px 0;">
                <span>Status da Proposta</span>
                <strong>${formatQuoteStatus(quote.status)}</strong>
              </div>

              ${quoteItems.length > 0 ? `
                <div class="overview-quote-items">
                  <span style="font-size: 9px; font-weight: 700; color: var(--gold); text-transform: uppercase;">Serviços & Itens Contratados</span>
                  ${quoteItems.map(item => `
                    <div class="overview-quote-item">
                      <span>${item.quantity}x ${sanitizeHtml(item.description)}</span>
                      <strong>${formatCurrency(item.line_total)}</strong>
                    </div>
                  `).join('')}
                </div>
              ` : '<p class="field-hint" style="margin-top: 6px;">Nenhum item discriminado no orçamento.</p>'}
            ` : '<p class="field-hint">Nenhum orçamento vinculado.</p>'}
          </div>

          <div class="overview-card">
            <h4><span><i data-lucide="user-check" style="width:14px; display:inline-block; vertical-align:middle; color:var(--moss);"></i> Dados do Cliente</span></h4>
            ${event.clients ? `
              <div class="detail-row" style="padding: 6px 0;">
                <span>Nome</span>
                <strong>${sanitizeHtml(event.clients.name)}</strong>
              </div>
              ${event.clients.whatsapp ? `
                <div class="detail-row" style="padding: 6px 0;">
                  <span>WhatsApp</span>
                  <strong>${sanitizeHtml(event.clients.whatsapp)}</strong>
                </div>
              ` : ''}
              ${event.clients.email ? `
                <div class="detail-row" style="padding: 6px 0;">
                  <span>E-mail</span>
                  <strong>${sanitizeHtml(event.clients.email)}</strong>
                </div>
              ` : ''}
            ` : '<p class="field-hint">Sem informações do cliente.</p>'}
          </div>

          ${event.notes ? `
            <div class="overview-card">
              <h4><span><i data-lucide="notebook-pen" style="width:14px; display:inline-block; vertical-align:middle; color:var(--gold);"></i> Observações de Produção</span></h4>
              <p style="margin: 0; font-size: 11px; line-height: 1.5; color: var(--ink); white-space: pre-wrap;">${sanitizeHtml(event.notes)}</p>
            </div>
          ` : ''}
        </div>
      `;
    }

    // 2. Aba Cerimonial & Cronograma
    const timelineEl = document.getElementById('event-tab-timeline');
    if (timelineEl) {
      timelineEl.innerHTML = `
        <div class="ceremonial-header-bar">
          <h4>Cronograma da Realização</h4>
          <span style="font-size: 10px; color: var(--muted);">${state.ceremonialActivities.length} momentos cadastrados</span>
        </div>

        <div class="ceremonial-list" id="ceremonial-items-container">
          ${state.ceremonialActivities.length === 0 ? `
            <div class="empty-clients" style="padding: 16px;">
              <p>Nenhuma atividade cadastrada no cronograma ainda.</p>
            </div>
          ` : state.ceremonialActivities.map(act => `
            <div class="ceremonial-item ${act.status === 'completed' ? 'done' : ''}" data-activity-id="${act.id}">
              <input type="checkbox" class="ceremonial-checkbox" ${act.status === 'completed' ? 'checked' : ''} data-toggle-activity="${act.id}" title="Marcar como concluído" />
              ${act.scheduled_time ? `<span class="ceremonial-time">${act.scheduled_time.slice(0, 5)}</span>` : ''}
              <div class="ceremonial-body">
                <span class="ceremonial-title">${sanitizeHtml(act.title)}</span>
                ${act.responsible || act.description ? `
                  <div class="ceremonial-sub">
                    ${act.responsible ? `<span><i data-lucide="user" style="width:10px; display:inline;"></i> ${sanitizeHtml(act.responsible)}</span>` : ''}
                    ${act.description ? `<span>${sanitizeHtml(act.description)}</span>` : ''}
                  </div>
                ` : ''}
              </div>
              <div class="ceremonial-actions">
                <button class="client-action" type="button" data-delete-activity="${act.id}" title="Excluir momento">
                  <i data-lucide="trash-2" style="width: 13px;"></i>
                </button>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="inline-form-box">
          <h5>+ Adicionar momento ao cronograma</h5>
          <form id="add-activity-form">
            <div class="inline-form-row">
              <input type="time" id="new-act-time" placeholder="Horário" />
              <input type="text" id="new-act-title" placeholder="Ex.: Entrada dos noivos, brinde, abertura da pista" required />
            </div>
            <div class="inline-form-row-3">
              <input type="text" id="new-act-resp" placeholder="Responsável (ex.: Cerimonialista, DJ)" />
              <input type="text" id="new-act-desc" placeholder="Detalhes / Músicas / Orientações" />
            </div>
            <button class="login-button" type="submit" style="margin-top: 8px; min-height: 38px; font-size: 10px;">
              <span>Adicionar ao cerimonial</span><i data-lucide="plus"></i>
            </button>
          </form>
        </div>
      `;
    }

    // 3. Aba Convidados & Mesas
    const guestsEl = document.getElementById('event-tab-guests');
    if (guestsEl) {
      const totalGuests = state.guests.length;
      const confirmedGuests = state.guests.filter(g => g.status === 'confirmed').length;
      const pendingGuests = state.guests.filter(g => g.status === 'pending').length;
      const declinedGuests = state.guests.filter(g => g.status === 'declined').length;

      guestsEl.innerHTML = `
        <div class="guests-stats-grid">
          <div class="guest-stat-box">
            <strong>${totalGuests}</strong>
            <span>Total</span>
          </div>
          <div class="guest-stat-box" style="border-color: #bcdcbc; background: #f4faf4;">
            <strong style="color: #2d693c;">${confirmedGuests}</strong>
            <span style="color: #2d693c;">Confirmados</span>
          </div>
          <div class="guest-stat-box" style="border-color: #ebd9ad; background: #fefaf0;">
            <strong style="color: #8b6e28;">${pendingGuests}</strong>
            <span style="color: #8b6e28;">Pendentes</span>
          </div>
          <div class="guest-stat-box" style="border-color: #e5beba; background: #fdf5f4;">
            <strong style="color: #9a554c;">${declinedGuests}</strong>
            <span style="color: #9a554c;">Recusados</span>
          </div>
        </div>

        <div class="guest-list">
          ${state.guests.length === 0 ? `
            <div class="empty-clients" style="padding: 16px;">
              <p>Nenhum convidado cadastrado para este evento.</p>
            </div>
          ` : state.guests.map(guest => {
            const guestWa = cleanPhoneForWhatsApp(guest.whatsapp);
            const tableName = guest.event_tables ? `Mesa ${guest.event_tables.table_number}` : (guest.notes || '');

            return `
              <div class="guest-row" data-guest-id="${guest.id}">
                <div class="guest-info">
                  <span class="guest-name">${sanitizeHtml(guest.name)}</span>
                  <div class="guest-sub">
                    ${tableName ? `<span><i data-lucide="utensils" style="width:10px; display:inline;"></i> ${sanitizeHtml(tableName)}</span>` : ''}
                    ${guest.whatsapp ? `<span>${sanitizeHtml(guest.whatsapp)}</span>` : ''}
                  </div>
                </div>

                <select class="guest-status-select ${guest.status}" data-change-guest-status="${guest.id}">
                  <option value="confirmed" ${guest.status === 'confirmed' ? 'selected' : ''}>Confirmado</option>
                  <option value="pending" ${guest.status === 'pending' ? 'selected' : ''}>Pendente</option>
                  <option value="declined" ${guest.status === 'declined' ? 'selected' : ''}>Recusado</option>
                </select>

                ${guestWa ? `
                  <a class="client-action whatsapp-action" href="https://wa.me/${guestWa}" target="_blank" rel="noopener noreferrer" title="WhatsApp com convidado">
                    <i data-lucide="message-circle" style="width: 14px;"></i>
                  </a>
                ` : ''}

                <button class="client-action" type="button" data-delete-guest="${guest.id}" title="Remover convidado">
                  <i data-lucide="trash-2" style="width: 13px;"></i>
                </button>
              </div>
            `;
          }).join('')}
        </div>

        <div class="inline-form-box">
          <h5>+ Adicionar convidado</h5>
          <form id="add-guest-form">
            <div class="inline-form-row">
              <input type="text" id="new-guest-name" placeholder="Nome do convidado" required style="grid-column: 1 / -1;" />
            </div>
            <div class="inline-form-row-3">
              <input type="tel" id="new-guest-phone" placeholder="WhatsApp (opcional)" />
              <input type="text" id="new-guest-table" placeholder="Mesa / Acompanhantes" />
            </div>
            <button class="login-button" type="submit" style="margin-top: 8px; min-height: 38px; font-size: 10px;">
              <span>Adicionar convidado</span><i data-lucide="user-plus"></i>
            </button>
          </form>
        </div>
      `;
    }

    refreshIcons();
  }

  // ==========================================================================
  // Atividades do Cerimonial & Convidados (Ações no Supabase)
  // ==========================================================================

  async function handleAddActivity(e) {
    e.preventDefault();
    const sb = getSupabase();
    if (!sb || !state.currentEventId) return;

    const time = document.getElementById('new-act-time').value || null;
    const title = document.getElementById('new-act-title').value.trim();
    const resp = document.getElementById('new-act-resp').value.trim() || null;
    const desc = document.getElementById('new-act-desc').value.trim() || null;

    if (!title) return;

    try {
      const nextPosition = state.ceremonialActivities.length + 1;
      const { error } = await sb.from('ceremonial_activities').insert({
        event_id: state.currentEventId,
        position: nextPosition,
        title,
        scheduled_time: time,
        responsible: resp,
        description: desc,
        status: 'pending'
      });

      if (error) throw error;
      notify('Momento adicionado ao cerimonial!');
      await loadEventFullDetails(state.currentEventId);
    } catch (err) {
      console.error('Erro ao adicionar momento:', err);
      alert(`Erro: ${err.message}`);
    }
  }

  async function toggleActivityStatus(actId) {
    const sb = getSupabase();
    if (!sb) return;

    const current = state.ceremonialActivities.find(a => a.id === actId);
    if (!current) return;

    const newStatus = current.status === 'completed' ? 'pending' : 'completed';

    try {
      const { error } = await sb
        .from('ceremonial_activities')
        .update({ status: newStatus })
        .eq('id', actId);

      if (error) throw error;
      current.status = newStatus;
      renderEventTabContent();
    } catch (err) {
      console.error('Erro ao atualizar status da atividade:', err);
    }
  }

  async function deleteActivity(actId) {
    const sb = getSupabase();
    if (!sb) return;

    try {
      const { error } = await sb.from('ceremonial_activities').delete().eq('id', actId);
      if (error) throw error;
      notify('Momento removido.');
      await loadEventFullDetails(state.currentEventId);
    } catch (err) {
      console.error('Erro ao excluir momento:', err);
    }
  }

  async function handleAddGuest(e) {
    e.preventDefault();
    const sb = getSupabase();
    if (!sb || !state.currentEventId) return;

    const name = document.getElementById('new-guest-name').value.trim();
    const phone = document.getElementById('new-guest-phone').value.trim() || null;
    const notes = document.getElementById('new-guest-table').value.trim() || null;

    if (!name) return;

    try {
      const { error } = await sb.from('guests').insert({
        event_id: state.currentEventId,
        name,
        whatsapp: phone,
        status: 'confirmed',
        notes
      });

      if (error) throw error;
      notify('Convidado adicionado!');
      await loadEventFullDetails(state.currentEventId);
    } catch (err) {
      console.error('Erro ao adicionar convidado:', err);
      alert(`Erro: ${err.message}`);
    }
  }

  async function updateGuestStatus(guestId, newStatus) {
    const sb = getSupabase();
    if (!sb) return;

    try {
      const { error } = await sb.from('guests').update({ status: newStatus }).eq('id', guestId);
      if (error) throw error;
      notify('Status do convidado atualizado.');
      await loadEventFullDetails(state.currentEventId);
    } catch (err) {
      console.error('Erro ao atualizar convidado:', err);
    }
  }

  async function deleteGuest(guestId) {
    const sb = getSupabase();
    if (!sb) return;

    try {
      const { error } = await sb.from('guests').delete().eq('id', guestId);
      if (error) throw error;
      notify('Convidado removido.');
      await loadEventFullDetails(state.currentEventId);
    } catch (err) {
      console.error('Erro ao remover convidado:', err);
    }
  }

  async function setEventStatus(newStatus) {
    const sb = getSupabase();
    if (!sb || !state.currentEventId) return;

    try {
      const { error } = await sb.from('events').update({ status: newStatus }).eq('id', state.currentEventId);
      if (error) throw error;

      if (state.currentEventData) state.currentEventData.status = newStatus;
      notify(`Status do evento alterado para ${formatStatusLabel(newStatus)}.`);
      renderEventDetailHero();
      await loadEvents();
    } catch (err) {
      console.error('Erro ao mudar status do evento:', err);
      alert(`Erro: ${err.message}`);
    }
  }

  // ==========================================================================
  // Integração: Criação Automática ao Confirmar Orçamento
  // ==========================================================================

  async function onQuoteConfirmed(quoteId) {
    const sb = getSupabase();
    if (!sb || !quoteId) return;

    try {
      // 1. Busca os dados do orçamento confirmado
      const { data: quote, error: qErr } = await sb
        .from('quotes')
        .select('*, clients(*)')
        .eq('id', quoteId)
        .single();

      if (qErr) throw qErr;

      // 2. Verifica se o evento já foi criado pelo trigger do banco
      const { data: existingEvent, error: eErr } = await sb
        .from('events')
        .select('id, name')
        .eq('quote_id', quoteId)
        .maybeSingle();

      if (eErr) console.warn('Aviso na busca de evento:', eErr);

      let createdEvent = existingEvent;

      if (!existingEvent && quote.event_date) {
        // Se o trigger não criou (ex.: caso de status inserido direto), criamos manualmente
        const { data: newEvt, error: insErr } = await sb
          .from('events')
          .insert({
            quote_id: quote.id,
            client_id: quote.client_id,
            name: quote.name,
            venue: quote.venue,
            event_date: quote.event_date,
            event_time: quote.event_time,
            status: 'planned',
            notes: quote.notes
          })
          .select('id, name')
          .single();

        if (!insErr && newEvt) {
          createdEvent = newEvt;
        }
      }

      notify('✨ Orçamento confirmado! Evento gerado com sucesso no calendário de produção.', 4500);
      await loadEvents();

      return createdEvent;
    } catch (err) {
      console.error('Erro na sincronização de evento após confirmação de orçamento:', err);
    }
  }

  async function openEventByQuoteId(quoteId) {
    const sb = getSupabase();
    if (!sb || !quoteId) return;

    try {
      const { data: event, error } = await sb
        .from('events')
        .select('id')
        .eq('quote_id', quoteId)
        .maybeSingle();

      if (error) throw error;
      if (event) {
        await openEventDetail(event.id);
      } else {
        notify('Evento ainda não encontrado para este orçamento.');
      }
    } catch (err) {
      console.error('Erro ao abrir evento por orçamento:', err);
    }
  }

  // ==========================================================================
  // Inicialização e Event Listeners
  // ==========================================================================

  function setupEventListeners() {
    // 1. Abertura pelo card no dashboard
    document.addEventListener('click', e => {
      const target = e.target.closest('button, a, [data-event-id]');
      if (!target) return;

      // Botões de navegação / módulos
      if (target.matches('.card-eventos') || target.dataset.action === 'Eventos') {
        e.preventDefault();
        openEventsPanel();
        return;
      }

      if (target.dataset.action === 'Novo evento' || target.hasAttribute('data-new-event')) {
        e.preventDefault();
        openEventForm();
        return;
      }

      if (target.dataset.action === 'Agenda de hoje') {
        e.preventDefault();
        openEventsPanel('today');
        return;
      }

      if (target.dataset.nav === 'Agenda') {
        e.preventDefault();
        openEventsPanel();
        return;
      }

      // Fechamento de painéis
      if (target.hasAttribute('data-close-events')) {
        e.preventDefault();
        closeEventsPanel();
        return;
      }

      if (target.hasAttribute('data-close-event-form')) {
        e.preventDefault();
        closeEventForm();
        return;
      }

      if (target.hasAttribute('data-close-event-detail')) {
        e.preventDefault();
        closeEventDetail();
        return;
      }

      // Ações nos cards de eventos
      if (target.hasAttribute('data-manage-event')) {
        e.preventDefault();
        const eventId = target.dataset.manageEvent;
        openEventDetail(eventId);
        return;
      }

      if (target.hasAttribute('data-edit-event')) {
        e.preventDefault();
        const eventId = target.dataset.editEvent;
        const ev = state.events.find(x => x.id === eventId);
        if (ev) openEventForm(ev);
        return;
      }

      if (target.hasAttribute('data-delete-event')) {
        e.preventDefault();
        const eventId = target.dataset.deleteEvent;
        deleteEvent(eventId);
        return;
      }

      // Clicar no card do evento abre os detalhes
      if (target.classList.contains('event-card') && target.dataset.eventId) {
        e.preventDefault();
        openEventDetail(target.dataset.eventId);
        return;
      }

      // Tabs internas de detalhes do evento
      if (target.hasAttribute('data-event-tab')) {
        e.preventDefault();
        const tabKey = target.dataset.eventTab;
        state.currentTab = tabKey;

        document.querySelectorAll('.event-tab-btn').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.eventTab === tabKey);
        });

        document.querySelectorAll('.event-tab-content').forEach(pane => {
          pane.hidden = pane.id !== `event-tab-${tabKey}`;
        });
        refreshIcons();
        return;
      }

      // Alterar status rápido no Hero
      if (target.hasAttribute('data-set-status')) {
        e.preventDefault();
        const newStatus = target.dataset.setStatus;
        setEventStatus(newStatus);
        return;
      }

      // Editar evento atual do hero
      if (target.hasAttribute('data-edit-current-event')) {
        e.preventDefault();
        if (state.currentEventData) openEventForm(state.currentEventData);
        return;
      }

      // Ações do Cerimonial
      if (target.hasAttribute('data-toggle-activity')) {
        const actId = target.dataset.toggleActivity;
        toggleActivityStatus(actId);
        return;
      }

      if (target.hasAttribute('data-delete-activity')) {
        e.preventDefault();
        const actId = target.dataset.deleteActivity;
        deleteActivity(actId);
        return;
      }

      // Ações de Convidados
      if (target.hasAttribute('data-delete-guest')) {
        e.preventDefault();
        const gstId = target.dataset.deleteGuest;
        deleteGuest(gstId);
        return;
      }

      // Botão de filtro de período (tabs rápidas)
      if (target.hasAttribute('data-event-filter')) {
        e.preventDefault();
        state.activeFilter = target.dataset.eventFilter;
        document.querySelectorAll('.event-pill').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.eventFilter === state.activeFilter);
        });
        renderEventsList();
        return;
      }
    });

    // 2. Submit do formulário de criação/edição de evento
    const eventForm = document.getElementById('event-form');
    if (eventForm) {
      eventForm.addEventListener('submit', handleEventFormSubmit);
    }

    // 3. Submits de cronograma e convidados dentro do modal de detalhes
    document.addEventListener('submit', e => {
      if (e.target.id === 'add-activity-form') {
        handleAddActivity(e);
      } else if (e.target.id === 'add-guest-form') {
        handleAddGuest(e);
      }
    });

    // 4. Mudança de status do convidado
    document.addEventListener('change', e => {
      if (e.target.hasAttribute('data-change-guest-status')) {
        const guestId = e.target.dataset.changeGuestStatus;
        const newStatus = e.target.value;
        updateGuestStatus(guestId, newStatus);
      }
    });

    // 5. Busca e Filtro de status em tempo real
    const searchInput = document.getElementById('event-search');
    if (searchInput) {
      searchInput.addEventListener('input', e => {
        state.searchQuery = e.target.value;
        renderEventsList();
      });
    }

    const statusFilterSelect = document.getElementById('event-status-filter');
    if (statusFilterSelect) {
      statusFilterSelect.addEventListener('change', e => {
        state.statusFilter = e.target.value;
        renderEventsList();
      });
    }

    // 6. Ao selecionar um cliente no formulário, sincroniza os orçamentos disponíveis
    const clientSelect = document.getElementById('event-client');
    if (clientSelect) {
      clientSelect.addEventListener('change', e => {
        populateQuoteSelect(e.target.value);
      });
    }

    // 7. Ao selecionar um orçamento no formulário de eventos, preenche data, hora, local automaticamente
    const quoteSelect = document.getElementById('event-quote-select');
    if (quoteSelect) {
      quoteSelect.addEventListener('change', e => {
        const selectedQuote = state.quotes.find(q => q.id === e.target.value);
        if (selectedQuote) {
          const nameInput = document.getElementById('event-name');
          const dateInput = document.getElementById('event-date');
          const timeInput = document.getElementById('event-time');
          const venueInput = document.getElementById('event-venue');

          if (nameInput && !nameInput.value) nameInput.value = selectedQuote.name || '';
          if (dateInput && selectedQuote.event_date) dateInput.value = selectedQuote.event_date;
          if (timeInput && selectedQuote.event_time) timeInput.value = selectedQuote.event_time.slice(0, 5);
          if (venueInput && selectedQuote.venue) venueInput.value = selectedQuote.venue;
        }
      });
    }

    // 8. Ouvir confirmações de orçamentos pelo app para atualizar eventos automaticamente
    window.addEventListener('plenitude:quote-confirmed', e => {
      const quoteId = e.detail && e.detail.quoteId;
      if (quoteId) {
        onQuoteConfirmed(quoteId);
      }
    });

    // 9. Observar e enriquecer os cards de orçamento com atalhos de evento
    const quoteFormEl = document.getElementById('quote-form');
    if (quoteFormEl) {
      quoteFormEl.addEventListener('submit', () => {
        const statusVal = document.getElementById('quote-status')?.value;
        const quoteIdVal = document.getElementById('quote-id')?.value;
        if (statusVal === 'confirmed') {
          setTimeout(async () => {
            await loadEvents();
            if (quoteIdVal) {
              await onQuoteConfirmed(quoteIdVal);
            }
          }, 1200);
        }
      });
    }

    // 10. Ações em orçamentos para confirmar e gerar evento
    document.addEventListener('click', async e => {
      const confirmBtn = e.target.closest('[data-confirm-quote-event]');
      if (confirmBtn) {
        e.preventDefault();
        e.stopPropagation();
        const quoteId = confirmBtn.dataset.confirmQuoteEvent;
        const sb = getSupabase();
        if (!sb || !quoteId) return;

        try {
          confirmBtn.disabled = true;
          const { error } = await sb
            .from('quotes')
            .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
            .eq('id', quoteId);

          if (error) throw error;

          notify('Orçamento confirmado com sucesso!');
          const createdEvt = await onQuoteConfirmed(quoteId);

          // Atualiza lista de orçamentos se existir função no window
          if (window.plenitudeApp && typeof window.plenitudeApp.loadQuotes === 'function') {
            window.plenitudeApp.loadQuotes();
          }

          if (createdEvt && createdEvt.id) {
            await openEventDetail(createdEvt.id);
          }
        } catch (err) {
          console.error('Erro ao confirmar orçamento:', err);
          alert(`Erro ao confirmar: ${err.message}`);
        } finally {
          confirmBtn.disabled = false;
        }
        return;
      }

      const openEventQuoteBtn = e.target.closest('[data-open-quote-event]');
      if (openEventQuoteBtn) {
        e.preventDefault();
        e.stopPropagation();
        const quoteId = openEventQuoteBtn.dataset.openQuoteEvent;
        await openEventByQuoteId(quoteId);
        return;
      }
    });
  }

  // ==========================================================================
  // Expor API Pública e Inicializar
  // ==========================================================================

  window.plenitudeEvents = {
    openEventsPanel,
    closeEventsPanel,
    openEventForm,
    openEventDetail,
    openEventByQuoteId,
    onQuoteConfirmed,
    reloadEvents: loadEvents,
  };

  // Carrega quando o DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setupEventListeners();
      loadEvents();
      loadClients();
      loadQuotes();
    });
  } else {
    setupEventListeners();
    loadEvents();
    loadClients();
    loadQuotes();
  }

})();