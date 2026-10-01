// ==========================================================================
// Plenitude Realizações - Módulo de Cerimonial & Operação do Evento
// ==========================================================================

(() => {
  'use strict';

  // Referência do cliente Supabase
  function getSupabase() {
    return window.plenitudeSupabase || (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
  }

  // Estado local do módulo de cerimonial
  const state = {
    events: [],
    selectedEventId: null,
    selectedEvent: null,
    activities: [],
    staff: [],
    guests: [],
    tables: [],
    currentTab: 'timeline', // 'timeline', 'arrival', 'staff', 'tables', 'live'
    timelineFilter: 'all', // 'all', 'pending', 'in_progress', 'completed', 'skipped'
    arrivalFilter: 'all', // 'all', 'arrived', 'pending', 'confirmed'
    arrivalSearch: '',
    liveTimerInterval: null,
    editingActivityId: null,
    editingStaffId: null,
    editingGuestId: null,
    editingTableId: null,
    // Filtro do seletor de evento: só eventos com serviço de Cerimonial no
    // orçamento. Não pode desligar o módulo: sem nenhum serviço marcado o
    // filtro é ignorado e todos os eventos aparecem.
    onlyCeremonialEvents: true,
    ceremonialServiceIds: new Set(),
    // Modelos padrão de roteiro cadastrados pelo usuário
    templates: [],
    templateActivities: [],
    editingTemplateId: null,
    // Arraste em andamento (drag and drop do roteiro)
    drag: { activityId: null, beforeId: null, started: false, card: null, pointerY: 0 },
    // Arraste em andamento nos momentos do modelo padrão. State separado do
    // roteiro porque a lista alvo é outra e o commit é outro.
    templateDrag: { activityId: null, beforeId: null, started: false, row: null, pointerY: 0 }
  };

  // Modelos pré-definidos de momentos para o cerimonial (templates rápidos)
  const CEREMONIAL_PRESETS = [
    { title: 'Recepção dos Convidados & Welcome Drink', responsible: 'Recepção / Cerimonial', defaultTimeOffset: -60, description: 'Acolhimento com música ambiente e conferência de nomes.' },
    { title: 'Entrada dos Padrinhos e Pais', responsible: 'Cerimonialista de Pista', defaultTimeOffset: 0, description: 'Música 01 - Cortejo formal na ordem estabelecida.' },
    { title: 'Entrada do Noivo', responsible: 'Cerimonialista de Pista', defaultTimeOffset: 10, description: 'Música 02 - Entrada com a mãe/acompanhante.' },
    { title: 'Entrada das Damas, Pajens & Floristas', responsible: 'Cerimonial / Apoio', defaultTimeOffset: 15, description: 'Música 03 - Entrada com alianças e flores.' },
    { title: 'Entrada Triunfal da Noiva', responsible: 'Coordenadora Geral', defaultTimeOffset: 20, description: 'Música 04 - Clarins / Marcha nupcial e abertura de portas.' },
    { title: 'Celebração & Troca de Votos', responsible: 'Celebrante / Noivos', defaultTimeOffset: 30, description: 'Mensagem, votos personalizados e troca de alianças.' },
    { title: 'Bênção das Alianças & Beijo dos Noivos', responsible: 'Celebrante', defaultTimeOffset: 50, description: 'Momento solene da bênção e confirmação do matrimônio.' },
    { title: 'Assinatura da Ata & Cumprimentos', responsible: 'Cerimonialista', defaultTimeOffset: 60, description: 'Música 05 - Testemunhas assinam e fotos no altar.' },
    { title: 'Saída dos Noivos (Chuva de Arroz/Pétalas)', responsible: 'Equipe de Cerimonial', defaultTimeOffset: 70, description: 'Música 06 animada - Distribuição dos sparkles/pétalas.' },
    { title: 'Sessão de Fotos Oficiais', responsible: 'Fotógrafo / Cerimonial', defaultTimeOffset: 85, description: 'Fotos com pais, padrinhos e ensaio exclusivo do casal.' },
    { title: 'Entrada no Salão & Brinde dos Noivos', responsible: 'Mestre de Cerimônia / DJ', defaultTimeOffset: 110, description: 'Música de entrada na recepção e brinde com champanhe.' },
    { title: 'Corte Simbólico do Bolo & Sobremesa', responsible: 'Buffet / Cerimonial', defaultTimeOffset: 125, description: 'Fotos na mesa do bolo e brinde das famílias.' },
    { title: 'Primeira Dança dos Noivos', responsible: 'DJ / Som & Iluminação', defaultTimeOffset: 140, description: 'Música especial do casal com fumaça e iluminação cênica.' },
    { title: 'Abertura do Jantar / Buffet', responsible: 'Buffet / Garçons', defaultTimeOffset: 155, description: 'Abertura das ilhas gastronômicas e serviço empratado.' },
    { title: 'Abertura da Pista de Dança', responsible: 'DJ / Banda / Noivos', defaultTimeOffset: 195, description: 'Contagem regressiva e entrega de adereços de pista.' },
    { title: 'Hora do Buquê & Brincadeiras', responsible: 'Cerimonialista de Pista', defaultTimeOffset: 240, description: 'Chamar todas as solteiras / brincadeira da fita.' },
    { title: 'Encerramento & Entrega de Lembrancinhas', responsible: 'Equipe de Cerimonial', defaultTimeOffset: 300, description: 'Agradecimento aos convidados, entrega de bem-casados.' },
  ];

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

  function formatDateTime(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
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

  function specialtyLabel(spec) {
    switch (spec) {
      case 'coordenacao': return 'Coordenação Geral';
      case 'andamento': return 'Andamento de Pista';
      case 'logistica': return 'Logística & Montagem';
      case 'decoracao': return 'Decoração & Cenografia';
      case 'som_iluminacao': return 'Som & Iluminação';
      case 'alimentacao': return 'Alimentação & Buffet';
      case 'recepcao': return 'Recepção & Portaria';
      case 'outros': return 'Outros';
      default: return spec || 'Cerimonial';
    }
  }

  function activityStatusLabel(status) {
    switch (status) {
      case 'pending': return 'Pendente';
      case 'in_progress': return 'Em andamento';
      case 'completed': return 'Concluído';
      case 'skipped': return 'Ignorado';
      default: return 'Pendente';
    }
  }

  function guestStatusLabel(status) {
    switch (status) {
      case 'confirmed': return 'Confirmado';
      case 'pending': return 'Pendente';
      case 'declined': return 'Recusado';
      default: return status || 'Pendente';
    }
  }

  // ==========================================================================
  // Sincronização em tempo real
  // ==========================================================================
  // A assinatura do canal é global e mora em realtime.js: um único canal
  // atende todas as tabelas do app e recarrega o cerimonial apenas quando a
  // tela está aberta. Este módulo só precisa reagir quando o evento
  // selecionado mudar por causa de outro usuário.

  // ==========================================================================
  // Utilitários de Erro de Schema (orienta usuário sobre migrações pendentes)
  // ==========================================================================

  function showSchemaError(err, operationName) {
    const msg = err.message || String(err);
    const isMissingColumn = msg.includes("Could not find the") && msg.includes("column");
    const isMissingTable = msg.includes("Could not find the table");

    if (isMissingColumn) {
      const colMatch = msg.match(/'(\w+)' column of '(\w+)'/);
      if (colMatch) {
        const [, colName, tableName] = colMatch;
        notify(`⚠️ Coluna '${colName}' na tabela '${tableName}' ainda existe no banco. Execute a migração 009_ceremonial_schema.sql.`);
        return;
      }
    }
    if (isMissingTable) {
      const tblMatch = msg.match(/table '(\w+\.\w+)'/);
      if (tblMatch) {
        notify(`⚠️ Tabela '${tblMatch[1]}' não foi encontrada no banco. Execute a migração 009_ceremonial_schema.sql.`);
        return;
      }
    }
    notify(`Erro ao ${operationName}: ${msg}`);
  }

  // ==========================================================================
  // Carregamento de Dados do Supabase
  // ==========================================================================

  // Um evento só aparece no seletor do cerimonial quando o seu orçamento
  // tem pelo menos um item apontando para um serviço marcado com
  // services.is_ceremonial. A ligação é sempre through quote_items:
  //   events.quote_id -> quotes.id -> quote_items.quote_id -> quote_items.service_id
  async function loadEventsList() {
    const sb = getSupabase();
    const feedbackEl = document.getElementById('ceremonial-feedback');
    if (!sb) {
      if (feedbackEl) feedbackEl.textContent = 'Aguardando conexão com banco...';
      return [];
    }

    try {
      const { data, error } = await sb
        .from('events')
        .select(`
          id,
          name,
          venue,
          event_date,
          event_time,
          status,
          notes,
          clients ( id, name, whatsapp, email ),
          quotes ( id, quote_items ( service_id ) )
        `)
        .order('event_date', { ascending: true });

      if (error) throw error;
      state.events = data || [];
      state.events.forEach(event => {
        const items = event.quotes?.quote_items || [];
        event.hasCeremonial = items.some(item => state.ceremonialServiceIds.has(item.service_id));
      });
      populateEventSelector();

      // O evento selecionado pode ter sido excluído por outro usuário desde a
      // última carga, ou ter deixado de ter serviço de cerimonial. Nos dois
      // casos a seleção é refeita a partir da lista visível.
      const visible = visibleEvents();
      if (state.selectedEventId && !visible.some(e => e.id === state.selectedEventId)) {
        state.selectedEventId = null;
        state.selectedEvent = null;
      }

      // Se nenhum evento foi selecionado ainda, seleciona o mais próximo de hoje
      if (!state.selectedEventId && visible.length > 0) {
        const todayStr = new Date().toISOString().split('T')[0];
        const upcoming = visible.find(e => e.event_date >= todayStr && e.status !== 'cancelled');
        const defaultEvt = upcoming || visible[0];
        selectEvent(defaultEvt.id);
      } else if (state.selectedEventId) {
        await loadSelectedEventDetails(state.selectedEventId);
      } else {
        renderEmptyState();
      }

      return state.events;
    } catch (err) {
      console.error('Erro ao carregar lista de eventos para cerimonial:', err);
      if (feedbackEl) feedbackEl.textContent = 'Erro ao carregar eventos: ' + err.message;
      return [];
    }
  }

  // O filtro só vale quando existe algum serviço marcado. Sem nenhum, mostrar
  // uma lista vazia deixaria o módulo inteiro inutilizável, então o seletor
  // cai para todos os eventos e avisa o que falta configurar.
  function ceremonialFilterIsActive() {
    return state.onlyCeremonialEvents && state.ceremonialServiceIds.size > 0;
  }

  function visibleEvents() {
    if (!ceremonialFilterIsActive()) return state.events;
    return state.events.filter(event => event.hasCeremonial);
  }

  function populateEventSelector() {
    const select = document.getElementById('ceremonial-event-select');
    if (!select) return;

    if (state.events.length === 0) {
      select.innerHTML = '<option value="">Nenhum evento cadastrado no sistema</option>';
      renderCeremonialFilterHint();
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const visible = visibleEvents();

    if (visible.length === 0) {
      select.innerHTML = '<option value="">Nenhum evento com serviço de Cerimonial</option>';
      renderCeremonialFilterHint();
      return;
    }

    const options = visible.map(ev => {
      const d = parseDateOnly(ev.event_date);
      const dateFmt = d ? `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}` : 'Data indefinida';
      const isToday = ev.event_date === todayStr;
      const prefix = isToday ? '⭐ [HOJE] ' : '';
      const clientName = ev.clients ? ` (${ev.clients.name})` : '';
      return `<option value="${ev.id}" ${ev.id === state.selectedEventId ? 'selected' : ''}>${prefix}${dateFmt} - ${sanitizeHtml(ev.name)}${sanitizeHtml(clientName)}</option>`;
    });

    // Eventos fora do filtro ficam visíveis, porém desabilitados e agrupados.
    // Assim o usuário descobre que eles existem e pode desligar o filtro
    // sem precisar sair do módulo.
    if (ceremonialFilterIsActive()) {
      const others = state.events.filter(event => !event.hasCeremonial);
      if (others.length) {
        options.push('<optgroup label="Sem serviço de Cerimonial" disabled>');
        others.forEach(ev => {
          const d = parseDateOnly(ev.event_date);
          const dateFmt = d ? `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}` : 'Data indefinida';
          const clientName = ev.clients ? ` (${ev.clients.name})` : '';
          options.push(`<option value="" disabled>${dateFmt} - ${sanitizeHtml(ev.name)}${sanitizeHtml(clientName)}</option>`);
        });
        options.push('</optgroup>');
      }
    }

    select.innerHTML = options.join('');
    renderCeremonialFilterHint();
  }

  // Explica por que a lista está vazia ou por que está filtrada. Sem isso o
  // usuário não tem como saber se o problema é no filtro ou nos cadastros.
  function renderCeremonialFilterHint() {
    const hint = document.getElementById('ceremonial-filter-hint');
    if (!hint) return;

    if (state.ceremonialServiceIds.size === 0) {
      hint.hidden = false;
      hint.innerHTML = '<i data-lucide="info"></i> Nenhum serviço está marcado como <strong>serviço de Cerimonial</strong>. Marque a caixa no cadastro do serviço para o filtro funcionar. Enquanto isso, todos os eventos aparecem.';
      refreshIcons();
      return;
    }

    if (!state.onlyCeremonialEvents) {
      hint.hidden = true;
      return;
    }

    const withCeremonial = state.events.filter(event => event.hasCeremonial).length;
    if (withCeremonial === 0) {
      hint.hidden = false;
      hint.innerHTML = '<i data-lucide="info"></i> Nenhum dos ' + state.events.length + ' eventos tem serviço de Cerimonial no orçamento. Desligue o filtro para ver todos.';
      refreshIcons();
      return;
    }

    hint.hidden = true;
  }

  async function loadCeremonialServiceIds() {
    const sb = getSupabase();
    if (!sb) return;

    try {
      const { data, error } = await sb
        .from('services')
        .select('id')
        .eq('is_ceremonial', true);
      if (error) throw error;
      state.ceremonialServiceIds = new Set((data || []).map(row => row.id));
    } catch (err) {
      console.warn('Não foi possível ler os serviços de cerimonial:', err);
      state.ceremonialServiceIds = new Set();
    }
  }

  async function toggleCeremonialFilter(onlyWithCeremonial) {
    state.onlyCeremonialEvents = onlyWithCeremonial;

    // A lista foi carregada antes de o filtro mudar, então a marcação
    // hasCeremonial precisa ser recalculada antes de redesenhar.
    if (onlyWithCeremonial && state.ceremonialServiceIds.size > 0) {
      state.events.forEach(event => {
        const items = event.quotes?.quote_items || [];
        event.hasCeremonial = items.some(item => state.ceremonialServiceIds.has(item.service_id));
      });
    }

    populateEventSelector();

    const visible = visibleEvents();
    if (state.selectedEventId && !visible.some(e => e.id === state.selectedEventId)) {
      state.selectedEventId = null;
      state.selectedEvent = null;
      const todayStr = new Date().toISOString().split('T')[0];
      const upcoming = visible.find(e => e.event_date >= todayStr && e.status !== 'cancelled');
      const fallback = upcoming || visible[0];
      if (fallback) {
        await selectEvent(fallback.id);
        return;
      }
    }

    if (state.selectedEventId) {
      await loadSelectedEventDetails(state.selectedEventId);
    } else {
      renderEmptyState();
    }
  }

  async function selectEvent(eventId) {
    if (!eventId) return;

    state.selectedEventId = eventId;
    state.selectedEvent = state.events.find(e => e.id === eventId) || null;

    const select = document.getElementById('ceremonial-event-select');
    if (select && select.value !== eventId) {
      select.value = eventId;
    }

    await loadSelectedEventDetails(eventId);
  }

  async function loadSelectedEventDetails(eventId) {
    const sb = getSupabase();
    if (!sb || !eventId) return;

    const feedbackEl = document.getElementById('ceremonial-feedback');
    if (feedbackEl) feedbackEl.textContent = 'Carregando dados do cerimonial...';

    try {
      // 1. Dados completos do evento
      const { data: eventData, error: eventErr } = await sb
        .from('events')
        .select(`
          *,
          clients ( id, name, whatsapp, email, notes ),
          quotes ( id, quote_number, name, total, status )
        `)
        .eq('id', eventId)
        .single();

      if (eventErr) throw eventErr;
      state.selectedEvent = eventData;

      // 2. Atividades do cronograma / cerimonial
      const { data: activities, error: actErr } = await sb
        .from('ceremonial_activities')
        .select('*')
        .eq('event_id', eventId)
        .order('position', { ascending: true })
        .order('scheduled_time', { ascending: true });

      if (actErr) console.warn('Aviso ao buscar atividades do cerimonial:', actErr);
      state.activities = activities || [];

      // 3. Equipe de cerimonialistas
      let staffList = [];
      try {
        const { data: staffData, error: staffErr } = await sb
          .from('ceremonialistas')
          .select('*')
          .or(`event_id.eq.${eventId},event_id.is.null`)
          .order('name', { ascending: true });

        if (!staffErr && staffData) {
          staffList = staffData;
        }
      } catch (e) {
        console.warn('Tabela ceremonialistas ainda não carregada:', e);
      }
      state.staff = staffList;

      // 4. Mesas do evento
      const { data: tables, error: tblErr } = await sb
        .from('event_tables')
        .select('*')
        .eq('event_id', eventId)
        .order('table_number', { ascending: true });

      if (tblErr) console.warn('Aviso ao buscar mesas:', tblErr);
      state.tables = tables || [];

      // 5. Convidados do evento com dados da mesa
      const { data: guests, error: gstErr } = await sb
        .from('guests')
        .select('*, event_tables ( id, table_number, capacity )')
        .eq('event_id', eventId)
        .order('name', { ascending: true });

      if (gstErr) console.warn('Aviso ao buscar convidados:', gstErr);
      state.guests = guests || [];

      if (feedbackEl) feedbackEl.textContent = '';

      // Atualiza as visualizações
      renderCeremonialHero();
      renderActiveTab();
      refreshIcons();
    } catch (err) {
      console.error('Erro ao buscar detalhes do evento:', err);
      if (feedbackEl) feedbackEl.textContent = 'Não foi possível carregar os dados: ' + err.message;
    }
  }

  // ==========================================================================
  // Renderização da Interface
  // ==========================================================================

  function renderEmptyState() {
    const heroEl = document.getElementById('ceremonial-event-hero');
    if (heroEl) {
      heroEl.innerHTML = `
        <div class="empty-clients" style="padding: 24px; text-align: center;">
          <i data-lucide="calendar-x" style="width: 32px; height: 32px; color: var(--gold); margin-bottom: 8px;"></i>
          <h4 style="margin: 0 0 6px; font: 600 16px 'Playfair Display', serif;">Nenhum evento selecionado</h4>
          <p style="margin: 0; font-size: 11px; color: var(--muted);">Cadastre ou selecione um evento no topo para gerenciar o cerimonial, cronograma, equipe e recepção.</p>
        </div>
      `;
    }

    const panes = document.querySelectorAll('.ceremonial-tab-pane');
    panes.forEach(pane => {
      pane.innerHTML = '<div class="empty-clients"><p>Selecione um evento para visualizar os dados.</p></div>';
    });
    refreshIcons();
  }

  function renderCeremonialHero() {
    const heroEl = document.getElementById('ceremonial-event-hero');
    const ev = state.selectedEvent;
    if (!heroEl || !ev) return;

    const formattedDate = formatDisplayDate(ev.event_date);
    const formattedTime = formatTimeOnly(ev.event_time);
    const countdown = calculateCountdown(ev.event_date);
    const clientName = ev.clients ? ev.clients.name : 'Cliente não informado';
    const clientPhone = ev.clients ? ev.clients.whatsapp : '';
    const waNumber = cleanPhoneForWhatsApp(clientPhone);

    // Contadores para os mini-cards do Hero
    const totalActivities = state.activities.length;
    const completedActivities = state.activities.filter(a => a.status === 'completed').length;
    const timelinePercent = totalActivities > 0 ? Math.round((completedActivities / totalActivities) * 100) : 0;

    const totalGuests = state.guests.length;
    const arrivedGuests = state.guests.filter(g => Boolean(g.arrived_at)).length;
    const arrivalPercent = totalGuests > 0 ? Math.round((arrivedGuests / totalGuests) * 100) : 0;

    const totalStaff = state.staff.length;
    const totalTables = state.tables.length;

    heroEl.innerHTML = `
      <div class="ceremonial-hero-card">
        <div class="ceremonial-hero-top">
          <div class="ceremonial-hero-info">
            <span class="ceremonial-badge-status ${ev.status}">${ev.status === 'planned' ? 'Planejado' : ev.status === 'in_progress' ? 'Em andamento' : ev.status === 'completed' ? 'Realizado' : 'Cancelado'}</span>
            <h3>${sanitizeHtml(ev.name)}</h3>
            <div class="ceremonial-hero-meta">
              <span><i data-lucide="calendar"></i> ${formattedDate} ${formattedTime ? `às <strong>${formattedTime}</strong>` : ''}</span>
              ${ev.venue ? `<span><i data-lucide="map-pin"></i> ${sanitizeHtml(ev.venue)}</span>` : ''}
              <span><i data-lucide="user"></i> ${sanitizeHtml(clientName)}</span>
              ${countdown.text ? `<span class="countdown-tag ${countdown.type}">${countdown.text}</span>` : ''}
            </div>
          </div>
          <div class="ceremonial-hero-quick-actions">
            ${waNumber ? `
              <a class="ceremonial-action-btn wa" href="https://wa.me/${waNumber}" target="_blank" rel="noopener noreferrer" title="WhatsApp com cliente">
                <i data-lucide="message-circle"></i><span>WhatsApp</span>
              </a>
            ` : ''}
            <button class="ceremonial-action-btn live" type="button" data-ceremonial-live-toggle>
              <i data-lucide="play-circle"></i><span>Modo Ao Vivo</span>
            </button>
          </div>
        </div>

        <div class="ceremonial-stats-bar">
          <div class="ceremonial-stat-tile" data-ceremonial-tab-jump="timeline">
            <div class="stat-tile-header">
              <span class="stat-label">Roteiro / Momentos</span>
              <span class="stat-value">${completedActivities}/${totalActivities}</span>
            </div>
            <div class="ceremonial-progress-track">
              <div class="ceremonial-progress-fill" style="width: ${timelinePercent}%;"></div>
            </div>
            <span class="stat-sub">${timelinePercent}% concluído</span>
          </div>

          <div class="ceremonial-stat-tile" data-ceremonial-tab-jump="arrival">
            <div class="stat-tile-header">
              <span class="stat-label">Recepção / Presença</span>
              <span class="stat-value">${arrivedGuests}/${totalGuests}</span>
            </div>
            <div class="ceremonial-progress-track">
              <div class="ceremonial-progress-fill arrival-fill" style="width: ${arrivalPercent}%;"></div>
            </div>
            <span class="stat-sub">${arrivalPercent}% presentes</span>
          </div>

          <div class="ceremonial-stat-tile small" data-ceremonial-tab-jump="staff">
            <span class="stat-label">Equipe</span>
            <strong class="stat-number">${totalStaff}</strong>
            <span class="stat-sub">Cerimonialistas</span>
          </div>

          <div class="ceremonial-stat-tile small" data-ceremonial-tab-jump="tables">
            <span class="stat-label">Mesas</span>
            <strong class="stat-number">${totalTables}</strong>
            <span class="stat-sub">Setores</span>
          </div>
        </div>
      </div>
    `;

    refreshIcons();
  }

  function renderActiveTab() {
    // Esconde todas as tabs
    document.querySelectorAll('.ceremonial-tab-pane').forEach(p => { p.hidden = true; });

    // Atualiza botões
    document.querySelectorAll('.ceremonial-tabs .event-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.ceremonialTab === state.currentTab);
    });

    const activePane = document.getElementById(`ceremonial-tab-${state.currentTab}`);
    if (!activePane) return;

    activePane.hidden = false;

    switch (state.currentTab) {
      case 'timeline':
        renderTimelineTab(activePane);
        break;
      case 'arrival':
        renderArrivalTab(activePane);
        break;
      case 'staff':
        renderStaffTab(activePane);
        break;
      case 'tables':
        renderTablesTab(activePane);
        break;
      case 'live':
        renderLiveTab(activePane);
        break;
    }

    refreshIcons();
  }

  // ==========================================================================
  // TAB 1: ROTEIRO & CRONOGRAMA
  // ==========================================================================

  function renderTimelineTab(container) {
    if (!state.selectedEvent) {
      container.innerHTML = '<div class="empty-clients"><p>Nenhum evento selecionado.</p></div>';
      return;
    }

    let filtered = state.activities;
    if (state.timelineFilter !== 'all') {
      filtered = state.activities.filter(a => a.status === state.timelineFilter);
    }

    const total = state.activities.length;
    const completed = state.activities.filter(a => a.status === 'completed').length;
    const inProgress = state.activities.filter(a => a.status === 'in_progress').length;
    const pending = state.activities.filter(a => a.status === 'pending').length;

    container.innerHTML = `
      <div class="ceremonial-section-header">
        <div>
          <h4>Cronograma & Roteiro da Cerimônia</h4>
          <p class="section-subtitle">${completed} de ${total} momentos concluídos</p>
        </div>
        <div class="section-actions-right">
          <button class="text-button template-open-btn" type="button" data-open-templates-modal>
            <i data-lucide="copy-check"></i><span>Modelo padrão</span>
          </button>
          <button class="add-client-button" type="button" data-open-activity-modal>
            <i data-lucide="plus"></i><span>Novo momento</span>
          </button>
        </div>
      </div>

      <!-- Filtros rápidos de status do roteiro -->
      <div class="event-filter-pills" style="margin-top: 10px;">
        <button class="event-pill ${state.timelineFilter === 'all' ? 'active' : ''}" type="button" data-timeline-filter="all">Todos (${total})</button>
        <button class="event-pill ${state.timelineFilter === 'pending' ? 'active' : ''}" type="button" data-timeline-filter="pending">Pendentes (${pending})</button>
        <button class="event-pill ${state.timelineFilter === 'in_progress' ? 'active' : ''}" type="button" data-timeline-filter="in_progress">Em andamento (${inProgress})</button>
        <button class="event-pill ${state.timelineFilter === 'completed' ? 'active' : ''}" type="button" data-timeline-filter="completed">Concluídos (${completed})</button>
      </div>

      <!-- Barra de Presets Rápidos -->
      <div class="ceremonial-presets-bar">
        <span class="presets-label"><i data-lucide="sparkles"></i> Modelos rápidos:</span>
        <div class="presets-scroll">
          ${CEREMONIAL_PRESETS.slice(0, 6).map((preset, idx) => `
            <button class="preset-pill-btn" type="button" data-add-preset-idx="${idx}">
              + ${sanitizeHtml(preset.title.split(' ')[0])} ${sanitizeHtml(preset.title.split(' ')[1] || '')}
            </button>
          `).join('')}
          <button class="preset-pill-btn more" type="button" data-open-activity-modal>
            Ver todos...
          </button>
        </div>
      </div>

      <!-- Lista de Atividades do Cronograma -->
      <div class="ceremonial-timeline-list" id="timeline-activities-list">
        ${filtered.length === 0 ? `
          <div class="empty-clients" style="padding: 24px;">
            <p>Nenhum momento cadastrado no roteiro com o filtro selecionado.</p>
            <button class="text-button" type="button" data-open-activity-modal style="margin-top: 8px;">
              + Adicionar primeiro momento
            </button>
          </div>
        ` : filtered.map((act, index) => {
          const isDone = act.status === 'completed';
          const isInProgress = act.status === 'in_progress';
          const isSkipped = act.status === 'skipped';
          const timeFmt = act.scheduled_time ? act.scheduled_time.slice(0, 5) : '';

          return `
            <article class="timeline-activity-card ${act.status}" data-activity-id="${act.id}">
              <div class="activity-drag-order">
                <button class="activity-grip" type="button" data-drag-grip="${act.id}" aria-label="Arrastar para reordenar" title="Arraste para reordenar">
                  <i data-lucide="grip-vertical"></i>
                </button>
                <span class="activity-pos-badge">${act.position || index + 1}</span>
              </div>

              <div class="activity-check-col">
                <button class="activity-checkbox-btn ${isDone ? 'checked' : ''}" type="button" data-toggle-activity-check="${act.id}" title="${isDone ? 'Desmarcar' : 'Concluir momento'}">
                  ${isDone ? '<i data-lucide="check"></i>' : ''}
                </button>
              </div>

              <div class="activity-main-col">
                <div class="activity-title-row">
                  <h5 class="activity-title ${isDone ? 'strike' : ''}">${sanitizeHtml(act.title)}</h5>
                  ${timeFmt ? `<span class="activity-time-tag"><i data-lucide="clock"></i> ${timeFmt}</span>` : ''}
                </div>

                ${act.description ? `
                  <p class="activity-description">${sanitizeHtml(act.description)}</p>
                ` : ''}

                <div class="activity-footer-meta">
                  ${act.responsible ? `
                    <span class="activity-responsible-tag">
                      <i data-lucide="user-check"></i> <strong>Resp.:</strong> ${sanitizeHtml(act.responsible)}
                    </span>
                  ` : ''}
                  <span class="activity-status-tag ${act.status}">${activityStatusLabel(act.status)}</span>
                </div>
              </div>

              <div class="activity-actions-col">
                <div class="activity-mini-actions">
                  <button class="client-action" type="button" data-edit-activity="${act.id}" title="Editar momento">
                    <i data-lucide="pencil"></i>
                  </button>
                  <button class="client-action" type="button" data-delete-activity="${act.id}" title="Excluir momento">
                    <i data-lucide="trash-2"></i>
                  </button>
                </div>
              </div>
            </article>
          `;
        }).join('')}
      </div>

      <!-- Quick Add Inline Form -->
      <div class="inline-form-box" style="margin-top: 16px;">
        <h5>+ Adicionar momento rápido</h5>
        <form id="inline-activity-form">
          <div class="inline-form-row">
            <input type="time" id="inline-act-time" placeholder="Horário" />
            <input type="text" id="inline-act-title" placeholder="Nome do momento (ex.: Entrada dos Noivos)" required />
          </div>
          <div class="inline-form-row-3">
            <input type="text" id="inline-act-resp" placeholder="Responsável (ex.: Cerimonialista, DJ)" />
            <input type="text" id="inline-act-desc" placeholder="Instruções / Músicas / Detalhes" />
          </div>
          <button class="login-button" type="submit" style="margin-top: 6px; min-height: 38px; font-size: 10px;">
            <span>Salvar momento no roteiro</span><i data-lucide="plus"></i>
          </button>
        </form>
      </div>
    `;

    refreshIcons();
  }

  // ==========================================================================
  // TAB 2: RECEPÇÃO & CONTROLE DE CHEGADA (CHECK-IN)
  // ==========================================================================

  function renderArrivalTab(container) {
    if (!state.selectedEvent) {
      container.innerHTML = '<div class="empty-clients"><p>Nenhum evento selecionado.</p></div>';
      return;
    }

    const total = state.guests.length;
    const arrived = state.guests.filter(g => Boolean(g.arrived_at)).length;
    const pending = total - arrived;
    const confirmed = state.guests.filter(g => g.status === 'confirmed').length;
    const percent = total > 0 ? Math.round((arrived / total) * 100) : 0;

    // Filtros de convidados
    let visibleGuests = state.guests.filter(g => {
      // Filtro de status de chegada
      if (state.arrivalFilter === 'arrived' && !g.arrived_at) return false;
      if (state.arrivalFilter === 'pending' && Boolean(g.arrived_at)) return false;
      if (state.arrivalFilter === 'confirmed' && g.status !== 'confirmed') return false;

      // Busca por nome ou mesa
      if (state.arrivalSearch) {
        const q = state.arrivalSearch.toLowerCase().trim();
        const nameMatch = (g.name || '').toLowerCase().includes(q);
        const phoneMatch = (g.whatsapp || '').includes(q);
        const tableNum = g.event_tables ? String(g.event_tables.table_number).toLowerCase() : '';
        const tableMatch = tableNum.includes(q);
        const notesMatch = (g.notes || '').toLowerCase().includes(q);
        return nameMatch || phoneMatch || tableMatch || notesMatch;
      }

      return true;
    });

    container.innerHTML = `
      <div class="ceremonial-section-header">
        <div>
          <h4>Recepção & Controle de Chegada</h4>
          <p class="section-subtitle">Controle de presença dos convidados em tempo real</p>
        </div>
        <div class="section-actions-right">
          <button class="add-client-button" type="button" data-open-guest-modal>
            <i data-lucide="user-plus"></i><span>Novo convidado</span>
          </button>
        </div>
      </div>

      <!-- Painel de Estatísticas de Recepção -->
      <div class="arrival-stats-card">
        <div class="arrival-stat-col">
          <strong class="stat-big-num">${arrived}</strong>
          <span class="stat-big-label">Presentes (${percent}%)</span>
        </div>
        <div class="arrival-divider"></div>
        <div class="arrival-stat-col">
          <strong class="stat-big-num" style="color: var(--gold);">${pending}</strong>
          <span class="stat-big-label">Aguardando</span>
        </div>
        <div class="arrival-divider"></div>
        <div class="arrival-stat-col">
          <strong class="stat-big-num" style="color: var(--muted);">${total}</strong>
          <span class="stat-big-label">Total na Lista</span>
        </div>
      </div>

      <!-- Barra de Busca de Convidado em Tempo Real -->
      <div class="client-toolbar" style="margin-top: 12px; margin-bottom: 8px;">
        <label class="search-field" for="arrival-guest-search">
          <i data-lucide="search"></i>
          <input id="arrival-guest-search" type="search" placeholder="Buscar por nome, telefone ou mesa..." value="${sanitizeHtml(state.arrivalSearch)}" />
        </label>
      </div>

      <!-- Filtros rápidos de recepção -->
      <div class="event-filter-pills" style="margin-bottom: 12px;">
        <button class="event-pill ${state.arrivalFilter === 'all' ? 'active' : ''}" type="button" data-arrival-filter="all">Todos (${total})</button>
        <button class="event-pill ${state.arrivalFilter === 'arrived' ? 'active' : ''}" type="button" data-arrival-filter="arrived">Presentes (${arrived})</button>
        <button class="event-pill ${state.arrivalFilter === 'pending' ? 'active' : ''}" type="button" data-arrival-filter="pending">Aguardando (${pending})</button>
        <button class="event-pill ${state.arrivalFilter === 'confirmed' ? 'active' : ''}" type="button" data-arrival-filter="confirmed">Confirmados (${confirmed})</button>
      </div>

      <!-- Lista de Convidados da Recepção -->
      <div class="arrival-guest-list">
        ${visibleGuests.length === 0 ? `
          <div class="empty-clients" style="padding: 24px;">
            <p>${state.arrivalSearch ? 'Nenhum convidado encontrado para essa busca.' : 'Nenhum convidado cadastrado na lista para os filtros selecionados.'}</p>
            <button class="text-button" type="button" data-open-guest-modal style="margin-top: 8px;">
              + Adicionar convidado à lista
            </button>
          </div>
        ` : visibleGuests.map(g => {
          const hasArrived = Boolean(g.arrived_at);
          const arrivalTimeFmt = hasArrived ? formatDateTime(g.arrived_at) : '';
          const guestWa = cleanPhoneForWhatsApp(g.whatsapp);
          const tableName = g.event_tables ? `Mesa ${g.event_tables.table_number}` : '';

          return `
            <article class="arrival-guest-row ${hasArrived ? 'arrived' : 'pending'}" data-guest-id="${g.id}">
              <div class="arrival-status-indicator ${hasArrived ? 'arrived' : 'pending'}"></div>

              <div class="guest-details-col">
                <div class="guest-name-row">
                  <strong class="guest-name-text">${sanitizeHtml(g.name)}</strong>
                  ${tableName ? `<span class="guest-table-badge"><i data-lucide="utensils"></i> ${sanitizeHtml(tableName)}</span>` : ''}
                </div>

                <div class="guest-sub-meta">
                  ${hasArrived ? `
                    <span class="arrived-time-badge"><i data-lucide="check-check"></i> Chegou às <strong>${arrivalTimeFmt}</strong></span>
                  ` : `
                    <span class="waiting-badge"><i data-lucide="clock"></i> Aguardando chegada</span>
                  `}
                  ${g.whatsapp ? `<span class="guest-phone-text">${sanitizeHtml(g.whatsapp)}</span>` : ''}
                  ${g.notes ? `<span class="guest-notes-tag">${sanitizeHtml(g.notes)}</span>` : ''}
                </div>
              </div>

              <div class="arrival-actions-col">
                <button class="arrival-check-btn ${hasArrived ? 'is-arrived' : 'not-arrived'}" type="button" data-toggle-arrival="${g.id}" title="${hasArrived ? 'Desmarcar presença' : 'Registrar chegada'}">
                  <i data-lucide="${hasArrived ? 'user-check' : 'user-plus'}"></i>
                  <span>${hasArrived ? 'Presente' : 'Check-in'}</span>
                </button>

                ${guestWa ? `
                  <a class="client-action whatsapp-action" href="https://wa.me/${guestWa}" target="_blank" rel="noopener noreferrer" title="WhatsApp com convidado">
                    <i data-lucide="message-circle"></i>
                  </a>
                ` : ''}

                <button class="client-action" type="button" data-edit-guest="${g.id}" title="Editar convidado">
                  <i data-lucide="pencil"></i>
                </button>
                <button class="client-action" type="button" data-delete-guest="${g.id}" title="Remover da lista">
                  <i data-lucide="trash-2"></i>
                </button>
              </div>
            </article>
          `;
        }).join('')}
      </div>
    `;

    // Conecta evento de busca em tempo real
    const searchInput = container.querySelector('#arrival-guest-search');
    if (searchInput) {
      searchInput.addEventListener('input', e => {
        state.arrivalSearch = e.target.value;
        renderArrivalTab(container);
        const newSearch = container.querySelector('#arrival-guest-search');
        if (newSearch) {
          newSearch.focus();
          newSearch.setSelectionRange(newSearch.value.length, newSearch.value.length);
        }
      });
    }

    refreshIcons();
  }

  // ==========================================================================
  // TAB 3: EQUIPE DE CERIMONIAL (STAFF / CERIMONIALISTAS)
  // ==========================================================================

  function renderStaffTab(container) {
    if (!state.selectedEvent) {
      container.innerHTML = '<div class="empty-clients"><p>Nenhum evento selecionado.</p></div>';
      return;
    }

    const totalStaff = state.staff.length;

    container.innerHTML = `
      <div class="ceremonial-section-header">
        <div>
          <h4>Equipe de Cerimonialistas & Produção</h4>
          <p class="section-subtitle">${totalStaff} profissionais alocados</p>
        </div>
        <div class="section-actions-right">
          <button class="add-client-button" type="button" data-open-staff-modal>
            <i data-lucide="user-plus"></i><span>Novo profissional</span>
          </button>
        </div>
      </div>

      <div class="ceremonial-staff-grid">
        ${state.staff.length === 0 ? `
          <div class="empty-clients" style="grid-column: 1 / -1; padding: 24px;">
            <p>Nenhum cerimonialista ou membro da equipe cadastrado para este evento.</p>
            <button class="text-button" type="button" data-open-staff-modal style="margin-top: 8px;">
              + Adicionar cerimonialista à equipe
            </button>
          </div>
        ` : state.staff.map(member => {
          const waClean = cleanPhoneForWhatsApp(member.whatsapp);
          const specLabel = specialtyLabel(member.specialty);

          return `
            <article class="staff-card" data-staff-id="${member.id}">
              <div class="staff-card-header">
                <span class="staff-avatar">${sanitizeHtml(member.name.charAt(0).toUpperCase())}</span>
                <div class="staff-info-col">
                  <h5 class="staff-name">${sanitizeHtml(member.name)}</h5>
                  <span class="staff-specialty-badge">${sanitizeHtml(specLabel)}</span>
                </div>
              </div>

              ${member.notes ? `
                <p class="staff-notes">${sanitizeHtml(member.notes)}</p>
              ` : ''}

              <div class="staff-contacts-row">
                ${member.whatsapp ? `
                  <a class="staff-contact-link wa" href="https://wa.me/${waClean}" target="_blank" rel="noopener noreferrer">
                    <i data-lucide="message-circle"></i> <span>WhatsApp</span>
                  </a>
                ` : ''}
                ${member.email ? `
                  <a class="staff-contact-link email" href="mailto:${sanitizeHtml(member.email)}">
                    <i data-lucide="mail"></i> <span>E-mail</span>
                  </a>
                ` : ''}
              </div>

              <div class="staff-card-actions">
                <button class="client-action" type="button" data-edit-staff="${member.id}" title="Editar dados">
                  <i data-lucide="pencil"></i>
                </button>
                <button class="client-action" type="button" data-delete-staff="${member.id}" title="Remover da equipe">
                  <i data-lucide="trash-2"></i>
                </button>
              </div>
            </article>
          `;
        }).join('')}
      </div>
    `;

    refreshIcons();
  }

  // ==========================================================================
  // TAB 4: MESAS & SETORES
  // ==========================================================================

  function renderTablesTab(container) {
    if (!state.selectedEvent) {
      container.innerHTML = '<div class="empty-clients"><p>Nenhum evento selecionado.</p></div>';
      return;
    }

    const totalTables = state.tables.length;
    let totalCapacity = 0;
    state.tables.forEach(t => { totalCapacity += Number(t.capacity) || 0; });

    container.innerHTML = `
      <div class="ceremonial-section-header">
        <div>
          <h4>Mesas & Setores do Salão</h4>
          <p class="section-subtitle">${totalTables} mesas cadastradas · Capacidade: ${totalCapacity} lugares</p>
        </div>
        <div class="section-actions-right">
          <button class="add-client-button" type="button" data-open-table-modal>
            <i data-lucide="plus"></i><span>Nova mesa</span>
          </button>
        </div>
      </div>

      <div class="ceremonial-tables-grid">
        ${state.tables.length === 0 ? `
          <div class="empty-clients" style="grid-column: 1 / -1; padding: 24px;">
            <p>Nenhuma mesa cadastrada para este evento ainda.</p>
            <button class="text-button" type="button" data-open-table-modal style="margin-top: 8px;">
              + Adicionar primeira mesa
            </button>
          </div>
        ` : state.tables.map(tbl => {
          // Convidados alocados nesta mesa
          const tableGuests = state.guests.filter(g => g.table_id === tbl.id);
          const occupied = tableGuests.length;
          const capacity = tbl.capacity || 0;
          const isFull = capacity > 0 && occupied >= capacity;
          const arrivedInTable = tableGuests.filter(g => Boolean(g.arrived_at)).length;

          return `
            <article class="table-card" data-table-id="${tbl.id}">
              <div class="table-card-top">
                <div class="table-number-box">
                  <span class="table-label">MESA</span>
                  <strong class="table-num">${sanitizeHtml(tbl.table_number)}</strong>
                </div>
                <div class="table-header-meta">
                  <span class="table-occupancy-badge ${isFull ? 'full' : 'avail'}">
                    ${occupied}/${capacity > 0 ? capacity : '∞'} lugares
                  </span>
                  <span class="table-arrived-count">
                    <i data-lucide="user-check"></i> ${arrivedInTable} presentes
                  </span>
                </div>
                <div class="table-actions">
                  <button class="client-action" type="button" data-edit-table="${tbl.id}" title="Editar mesa">
                    <i data-lucide="pencil"></i>
                  </button>
                  <button class="client-action" type="button" data-delete-table="${tbl.id}" title="Excluir mesa">
                    <i data-lucide="trash-2"></i>
                  </button>
                </div>
              </div>

              ${tbl.notes ? `<p class="table-notes">${sanitizeHtml(tbl.notes)}</p>` : ''}

              <div class="table-guests-chips">
                ${tableGuests.length === 0 ? `
                  <span class="field-hint">Nenhum convidado atribuído a esta mesa</span>
                ` : tableGuests.map(g => `
                  <span class="table-guest-chip ${g.arrived_at ? 'arrived' : ''}">
                    <span class="guest-chip-dot"></span>
                    <span>${sanitizeHtml(g.name)}</span>
                  </span>
                `).join('')}
              </div>
            </article>
          `;
        }).join('')}
      </div>
    `;

    refreshIcons();
  }

  // ==========================================================================
  // TAB 5: MODO AO VIVO (EXECUÇÃO EM TEMPO REAL)
  // ==========================================================================

  function renderLiveTab(container) {
    if (!state.selectedEvent) {
      container.innerHTML = '<div class="empty-clients"><p>Nenhum evento selecionado.</p></div>';
      return;
    }

    const activities = state.activities;
    const currentActivity = activities.find(a => a.status === 'in_progress') || activities.find(a => a.status === 'pending') || activities[activities.length - 1];
    const currentIndex = currentActivity ? activities.indexOf(currentActivity) : -1;
    const nextActivity = currentIndex >= 0 && currentIndex + 1 < activities.length ? activities[currentIndex + 1] : null;

    const completedCount = activities.filter(a => a.status === 'completed').length;
    const totalCount = activities.length;
    const arrivedGuests = state.guests.filter(g => Boolean(g.arrived_at)).length;
    const totalGuests = state.guests.length;

    container.innerHTML = `
      <div class="ceremonial-live-container">
        <!-- Relógio & Header Ao Vivo -->
        <div class="live-clock-card">
          <div class="live-clock-header">
            <span class="live-indicator"><span class="live-dot"></span> AO VIVO</span>
            <span class="live-event-title">${sanitizeHtml(state.selectedEvent.name)}</span>
          </div>
          <div class="live-digital-clock" id="live-digital-clock-display">--:--:--</div>
          <div class="live-stats-row">
            <span><i data-lucide="check-circle-2"></i> <strong>${completedCount}/${totalCount}</strong> momentos</span>
            <span><i data-lucide="user-check"></i> <strong>${arrivedGuests}/${totalGuests}</strong> presentes</span>
          </div>
        </div>

        ${!currentActivity ? `
          <div class="empty-clients" style="padding: 30px;">
            <p>Nenhuma atividade cadastrada para execução ao vivo.</p>
            <button class="text-button" type="button" data-open-activity-modal>+ Cadastrar cronograma</button>
          </div>
        ` : `
          <!-- Cartão do Momento Atual em Destaque -->
          <div class="live-current-card">
            <span class="live-step-label">MOMENTO ATUAL (${currentIndex + 1} de ${totalCount})</span>
            <h3 class="live-current-title">${sanitizeHtml(currentActivity.title)}</h3>

            ${currentActivity.scheduled_time ? `
              <div class="live-time-badge">
                <i data-lucide="clock"></i> Horário previsto: <strong>${currentActivity.scheduled_time.slice(0, 5)}</strong>
              </div>
            ` : ''}

            ${currentActivity.responsible ? `
              <div class="live-responsible-badge">
                <i data-lucide="user"></i> Responsável: <strong>${sanitizeHtml(currentActivity.responsible)}</strong>
              </div>
            ` : ''}

            ${currentActivity.description ? `
              <div class="live-instructions-box">
                <strong>Orientações / Músicas:</strong>
                <p>${sanitizeHtml(currentActivity.description)}</p>
              </div>
            ` : ''}

            <!-- Botões de Ação Imediata -->
            <div class="live-controls-grid">
              <button class="live-btn complete" type="button" data-live-action="complete" data-activity-id="${currentActivity.id}">
                <i data-lucide="check-circle"></i>
                <span>Concluir Momento</span>
              </button>
              <button class="live-btn start" type="button" data-live-action="start" data-activity-id="${currentActivity.id}">
                <i data-lucide="play"></i>
                <span>Iniciar Agora</span>
              </button>
              <button class="live-btn skip" type="button" data-live-action="skip" data-activity-id="${currentActivity.id}">
                <i data-lucide="fast-forward"></i>
                <span>Pular</span>
              </button>
            </div>
          </div>

          <!-- Próximo Momento na Fila -->
          ${nextActivity ? `
            <div class="live-next-card">
              <span class="live-next-label"><i data-lucide="arrow-right"></i> A SEGUIR:</span>
              <strong class="live-next-title">${sanitizeHtml(nextActivity.title)}</strong>
              ${nextActivity.scheduled_time ? `<span>${nextActivity.scheduled_time.slice(0, 5)}</span>` : ''}
            </div>
          ` : `
            <div class="live-next-card end">
              <span>🎉 Último momento da programação!</span>
            </div>
          `}
        `}

        <!-- Contatos Rápidos de Emergência da Equipe -->
        <div class="live-quick-staff-box">
          <h5><i data-lucide="phone-call"></i> Contatos Rápidos da Equipe</h5>
          <div class="live-staff-scroll">
            ${state.staff.length === 0 ? `
              <span class="field-hint">Nenhum cerimonialista cadastrado na equipe</span>
            ` : state.staff.map(s => {
              const wa = cleanPhoneForWhatsApp(s.whatsapp);
              return `
                <div class="live-staff-pill">
                  <span class="live-staff-name">${sanitizeHtml(s.name)} (${sanitizeHtml(specialtyLabel(s.specialty))})</span>
                  ${wa ? `
                    <a class="live-wa-btn" href="https://wa.me/${wa}" target="_blank" rel="noopener noreferrer">
                      <i data-lucide="message-circle"></i>
                    </a>
                  ` : ''}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;

    // Inicia relógio ao vivo
    startLiveClock();
    refreshIcons();
  }

  function startLiveClock() {
    clearInterval(state.liveTimerInterval);
    function update() {
      const clockEl = document.getElementById('live-digital-clock-display');
      if (!clockEl) {
        clearInterval(state.liveTimerInterval);
        return;
      }
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      clockEl.textContent = `${hours}:${minutes}:${seconds}`;
    }
    update();
    state.liveTimerInterval = setInterval(update, 1000);
  }

  // ==========================================================================
  // Operações de Dados: Atividades, Convidados, Equipe e Mesas
  // ==========================================================================

  // --- Atividades ---
  async function toggleActivityCheck(actId) {
    const sb = getSupabase();
    if (!sb) return;

    const act = state.activities.find(a => a.id === actId);
    if (!act) return;

    const newStatus = act.status === 'completed' ? 'pending' : 'completed';

    try {
      const { error } = await sb
        .from('ceremonial_activities')
        .update({ status: newStatus })
        .eq('id', actId);

      if (error) throw error;
      act.status = newStatus;
      notify(newStatus === 'completed' ? 'Momento marcado como concluído!' : 'Momento reaberto.');
      renderCeremonialHero();
      renderActiveTab();
    } catch (err) {
      console.error('Erro ao atualizar momento:', err);
      alert('Erro ao atualizar: ' + err.message);
    }
  }

  async function updateActivityStatus(actId, newStatus) {
    const sb = getSupabase();
    if (!sb) return;

    try {
      const { error } = await sb
        .from('ceremonial_activities')
        .update({ status: newStatus })
        .eq('id', actId);

      if (error) throw error;
      const act = state.activities.find(a => a.id === actId);
      if (act) act.status = newStatus;
      notify(`Status atualizado para ${activityStatusLabel(newStatus)}.`);
      renderCeremonialHero();
      renderActiveTab();
    } catch (err) {
      console.error('Erro ao alterar status:', err);
      alert('Erro: ' + err.message);
    }
  }

  // A ordem canônica do roteiro é sempre state.activities (ordenada por
  // position no banco), nunca a lista já filtrada da tela. Reordenar a partir
  // do filtro trocaria o item pela posição que o usuário não está vendo.
  function orderedActivityIds() {
    return state.activities.map(a => a.id);
  }

  // nextPosition precisa ser max(position) + 1, e não activities.length + 1.
  // Excluir um momento do meio deixa um buraco na sequência (1, 2, 4): o
  // length daria 3 e o INSERT colidiria com a posição 4 já ocupada, falhando
  // com unique_violation.
  function nextActivityPosition() {
    return state.activities.reduce((max, a) => Math.max(max, a.position || 0), 0) + 1;
  }

  async function persistActivityOrder(orderedIds) {
    const sb = getSupabase();
    if (!sb || !state.selectedEventId) return;

    const { error } = await sb.rpc('reorder_ceremonial_activities', {
      target_event_id: state.selectedEventId,
      ordered_ids: orderedIds
    });

    if (error) {
      console.error('Erro ao reordenar o roteiro:', error);
      notify('Não foi possível reordenar o roteiro.');
      await loadSelectedEventDetails(state.selectedEventId);
      return;
    }

    await loadSelectedEventDetails(state.selectedEventId);
  }

  // Reordena movendo actId para a posição de beforeId na ordem atual.
  // beforeId null significa "colocar no fim".
  async function moveActivityTo(actId, beforeId) {
    const list = [...state.activities];
    const from = list.findIndex(a => a.id === actId);
    if (from === -1) return;

    const [moved] = list.splice(from, 1);
    let to = beforeId ? list.findIndex(a => a.id === beforeId) : list.length;
    if (to === -1) to = list.length;
    list.splice(to, 0, moved);

    if (list.every((a, i) => a.id === state.activities[i].id)) return; // nada mudou
    await persistActivityOrder(list.map(a => a.id));
  }

  // ==========================================================================
  // DRAG AND DROP DO ROTEIRO (Pointer Events)
  // ==========================================================================
  // Usa Pointer Events em vez da API nativa drag-and-drop porque a API nativa
  // não funciona em touchscreen, e o app é um PWA usado no celular. Com
  // pointerdown/pointermove/pointerup o mesmo código serve para dedo e mouse.

  const DRAG_THRESHOLD_PX = 6;   // abaixo disso é clique, não arrasto

  function timelineList() {
    return document.getElementById('timeline-activities-list');
  }

  function activityCards() {
    const list = timelineList();
    return list ? Array.from(list.querySelectorAll('.timeline-activity-card')) : [];
  }

  // Decide em que posição o card arrastado deve cair, comparando o ponteiro com
  // o centro de cada card. Retorna o id do card anterior, que é o que
  // moveActivityTo espera, ou null para "colocar no fim".
  function dropTargetBeforeId(pointerY) {
    const cards = activityCards().filter(card => card.dataset.activityId !== state.drag.activityId);
    for (const card of cards) {
      const box = card.getBoundingClientRect();
      if (pointerY < box.top + box.height / 2) return card.dataset.activityId;
    }
    return null;
  }

  function clearDropMarkers() {
    activityCards().forEach(card => card.classList.remove('drag-over-top', 'drag-over-bottom'));
  }

  function paintDropTarget(beforeId) {
    clearDropMarkers();
    const others = activityCards().filter(c => c.dataset.activityId !== state.drag.activityId);
    if (!beforeId) {
      others[others.length - 1]?.classList.add('drag-over-bottom');
    } else {
      others.find(c => c.dataset.activityId === beforeId)?.classList.add('drag-over-top');
    }
  }

  function endDrag(commit) {
    const { activityId, beforeId, started, card } = state.drag;
    if (!activityId) return;

    clearDropMarkers();
    card?.classList.remove('dragging');
    document.body.classList.remove('is-dragging-activity');

    state.drag = emptyDragState();
    if (commit && started) moveActivityTo(activityId, beforeId);
  }

  function emptyDragState() {
    return { activityId: null, beforeId: null, started: false, card: null, pointerY: 0 };
  }

  function onGripPointerDown(event) {
    // Só o botão principal; o clique direito não deve iniciar arraste.
    if (event.button !== undefined && event.button !== 0) return;

    const grip = event.target.closest('[data-drag-grip]');
    if (!grip || !state.selectedEventId) return;

    const card = grip.closest('.timeline-activity-card');
    if (!card) return;

    // Impede a rolagem da página enquanto o dedo arrasta o card.
    event.preventDefault();

    state.drag = {
      activityId: card.dataset.activityId,
      beforeId: null,
      started: false,
      card,
      pointerY: event.clientY
    };

    const startY = event.clientY;

    const onMove = (moveEvent) => {
      // Um toque no punho sem deslocar é um clique, não um arraste.
      if (!state.drag.started && Math.abs(moveEvent.clientY - startY) < DRAG_THRESHOLD_PX) return;

      if (!state.drag.started) {
        state.drag.started = true;
        state.drag.card?.classList.add('dragging');
        document.body.classList.add('is-dragging-activity');
      }

      state.drag.pointerY = moveEvent.clientY;
      state.drag.beforeId = dropTargetBeforeId(moveEvent.clientY);
      paintDropTarget(state.drag.beforeId);
    };

    const finish = (commit) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      endDrag(commit);
    };

    const onUp = () => finish(true);
    const onCancel = () => finish(false);

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  }

  // ==========================================================================
  // MODELOS PADRÃO DE ROTEIRO
  // ==========================================================================
  // Um modelo é um roteiro sem evento, guardado pelo usuário e reaproveitado.
  // As atividades vivem em ceremonial_template_activities e são copiadas para
  // o evento pela função copy_ceremonial_template, que faz tudo em uma
  // transação no banco.

  function setTemplatesFeedback(message, isError = false) {
    const el = document.getElementById('ceremonial-templates-feedback');
    if (!el) return;
    el.textContent = message;
    el.style.color = isError ? '#a0483d' : '';
  }

  async function loadTemplates() {
    const sb = getSupabase();
    if (!sb) return;

    try {
      const [templatesResult, activitiesResult] = await Promise.all([
        sb.from('ceremonial_templates').select('id, name, description, created_at').order('name'),
        sb.from('ceremonial_template_activities').select('id, template_id, position, title, description, responsible, scheduled_time').order('position')
      ]);

      if (templatesResult.error) throw templatesResult.error;

      state.templates = templatesResult.data || [];
      state.templateActivities = activitiesResult.data || [];
    } catch (err) {
      console.error('Erro ao carregar modelos padrão:', err);
      setTemplatesFeedback('Não foi possível carregar os modelos padrão.', true);
    }
  }

  function selectedTemplate() {
    return state.templates.find(t => t.id === state.editingTemplateId) || null;
  }

  function templateActivities(templateId) {
    return state.templateActivities
      .filter(item => item.template_id === templateId)
      .sort((a, b) => a.position - b.position);
  }

  function openTemplatesModal() {
    const panel = document.getElementById('ceremonial-templates-modal');
    if (!panel) return;

    setTemplatesFeedback('');
    if (!state.editingTemplateId && state.templates.length) {
      state.editingTemplateId = state.templates[0].id;
    }

    panel.hidden = false;
    loadTemplates().then(renderTemplatesModal);
    refreshIcons();
  }

  function closeTemplatesModal() {
    const panel = document.getElementById('ceremonial-templates-modal');
    if (panel) panel.hidden = true;
  }

  function renderTemplatesModal() {
    const list = document.getElementById('templates-list');
    const detail = document.getElementById('templates-detail');
    if (!list || !detail) return;

    if (!state.templates.length) {
      list.innerHTML = '<p class="templates-list-empty">Nenhum modelo ainda. Crie o primeiro ao lado.</p>';
      detail.innerHTML = '<div class="templates-empty-detail">Crie um modelo padrão com os momentos que você sempre repete nos eventos.</div>';
      refreshIcons();
      return;
    }

    list.innerHTML = state.templates.map(template => {
      const count = templateActivities(template.id).length;
      return `
        <button class="templates-list-item${template.id === state.editingTemplateId ? ' active' : ''}" type="button" data-select-template="${template.id}">
          <span>${sanitizeHtml(template.name)}<small>${count} ${count === 1 ? 'momento' : 'momentos'}</small></span>
          <i data-lucide="chevron-right"></i>
        </button>
      `;
    }).join('');

    renderTemplateDetail();
    refreshIcons();
  }

  function renderTemplateDetail() {
    const detail = document.getElementById('templates-detail');
    if (!detail) return;

    const template = selectedTemplate();
    if (!template) {
      detail.innerHTML = '<div class="templates-empty-detail">Escolha um modelo à esquerda ou crie um novo.</div>';
      return;
    }

    const activities = templateActivities(template.id);

    detail.innerHTML = `
      <div class="templates-detail-head">
        <h5>${sanitizeHtml(template.name)}</h5>
        <div class="activity-mini-actions">
          <button class="client-action" type="button" data-rename-template="${template.id}" title="Renomear modelo"><i data-lucide="pencil"></i></button>
          <button class="client-action" type="button" data-delete-template="${template.id}" title="Excluir modelo"><i data-lucide="trash-2"></i></button>
        </div>
      </div>

      <form id="template-activity-form" class="templates-create-form" style="flex-wrap: wrap;">
        <input id="template-act-time" type="time" style="flex: 0 0 96px;" />
        <input id="template-act-title" type="text" placeholder="Nome do momento (ex.: Entrada dos Noivos)" required style="flex: 1 1 130px;" />
        <input id="template-act-resp" type="text" placeholder="Responsável" style="flex: 1 1 100px;" />
        <button class="inline-create-button" type="submit"><i data-lucide="plus"></i><span>Adicionar</span></button>
      </form>

      <div class="templates-activity-list" style="margin-top: 9px;">
        ${activities.length === 0
          ? '<p class="templates-list-empty">Este modelo ainda não tem momentos. Use o campo acima para começar.</p>'
          : activities.map((item, index) => `
              <div class="templates-activity-row" data-template-act-id="${item.id}">
                <button class="templates-act-grip" type="button" data-template-drag-grip="${item.id}" aria-label="Arrastar para reordenar" title="Arraste para reordenar">
                  <i data-lucide="grip-vertical"></i>
                </button>
                <span class="templates-activity-index">${index + 1}</span>
                <div class="templates-activity-body">
                  <strong>${sanitizeHtml(item.title)}</strong>
                  <span>${item.scheduled_time ? sanitizeHtml(item.scheduled_time.slice(0, 5)) + ' · ' : ''}${item.responsible ? sanitizeHtml(item.responsible) : ''}</span>
                </div>
                <button class="order-btn templates-act-delete" type="button" data-template-act-delete="${item.id}" title="Remover do modelo"><i data-lucide="trash-2"></i></button>
              </div>
            `).join('')}
      </div>

      ${state.selectedEventId ? `
        <div class="templates-apply-box">
          <div>
            <label>
              <input id="template-replace" type="checkbox" />
              <span>Substituir o roteiro atual em vez de anexar</span>
            </label>
            <p class="field-hint" style="margin-top: 4px;">O evento <strong>${sanitizeHtml(state.selectedEvent?.name || '')}</strong> tem ${state.activities.length} ${state.activities.length === 1 ? 'momento' : 'momentos'}.</p>
          </div>
          <button class="add-client-button" type="button" data-apply-template="${template.id}">
            <i data-lucide="copy-check"></i><span>Copiar para o evento</span>
          </button>
        </div>
      ` : '<p class="field-hint" style="margin-top: 10px;">Selecione um evento acima para poder copiar o modelo.</p>'}
    `;

    const form = document.getElementById('template-activity-form');
    if (form) form.addEventListener('submit', handleTemplateActivitySubmit);
  }

  async function createTemplate(event) {
    event.preventDefault();
    const sb = getSupabase();
    const input = document.getElementById('template-new-name');
    if (!sb || !input) return;

    const name = input.value.trim();
    if (!name) return;

    setTemplatesFeedback('');
    const { data, error } = await sb
      .from('ceremonial_templates')
      .insert({ name })
      .select('id, name, description, created_at')
      .single();

    if (error) {
      setTemplatesFeedback('Não foi possível criar o modelo: ' + error.message, true);
      return;
    }

    input.value = '';
    state.editingTemplateId = data.id;
    state.templates.push(data);
    renderTemplatesModal();
    notify(`Modelo "${data.name}" criado.`);
  }

  async function renameTemplate(templateId) {
    const sb = getSupabase();
    const template = state.templates.find(t => t.id === templateId);
    if (!sb || !template) return;

    const name = window.prompt('Novo nome do modelo:', template.name);
    if (!name || !name.trim()) return;

    const { error } = await sb.from('ceremonial_templates').update({ name: name.trim() }).eq('id', templateId);
    if (error) {
      setTemplatesFeedback('Não foi possível renomear: ' + error.message, true);
      return;
    }

    template.name = name.trim();
    renderTemplatesModal();
  }

  async function deleteTemplate(templateId) {
    const sb = getSupabase();
    const template = state.templates.find(t => t.id === templateId);
    if (!sb || !template) return;

    const count = templateActivities(templateId).length;
    if (!confirm(`Excluir o modelo "${template.name}"${count ? ` e seus ${count} momentos` : ''}?`)) return;

    // As atividades do modelo caem por cascade, então uma chamada basta.
    const { error } = await sb.from('ceremonial_templates').delete().eq('id', templateId);
    if (error) {
      setTemplatesFeedback('Não foi possível excluir: ' + error.message, true);
      return;
    }

    state.templates = state.templates.filter(t => t.id !== templateId);
    state.templateActivities = state.templateActivities.filter(item => item.template_id !== templateId);
    if (state.editingTemplateId === templateId) {
      state.editingTemplateId = state.templates.length ? state.templates[0].id : null;
    }
    renderTemplatesModal();
    notify('Modelo excluído.');
  }

  async function handleTemplateActivitySubmit(event) {
    event.preventDefault();
    const sb = getSupabase();
    const template = selectedTemplate();
    if (!sb || !template) return;

    const title = document.getElementById('template-act-title').value.trim();
    if (!title) return;

    const time = document.getElementById('template-act-time').value || null;
    const responsible = document.getElementById('template-act-resp').value.trim() || null;

    // max(position) + 1 e não length + 1: excluir um momento do meio deixa
    // buraco na sequência e o length colidiria com a posição ocupada.
    const current = templateActivities(template.id);
    const nextPosition = current.reduce((max, item) => Math.max(max, item.position || 0), 0) + 1;

    const { data, error } = await sb
      .from('ceremonial_template_activities')
      .insert({ template_id: template.id, position: nextPosition, title, scheduled_time: time, responsible })
      .select('id, template_id, position, title, description, responsible, scheduled_time')
      .single();

    if (error) {
      setTemplatesFeedback('Não foi possível adicionar ao modelo: ' + error.message, true);
      return;
    }

    state.templateActivities.push(data);
    renderTemplatesModal();
    document.getElementById('template-act-title').value = '';
    document.getElementById('template-act-resp').value = '';
  }

  async function removeTemplateActivity(activityId) {
    const sb = getSupabase();
    if (!sb) return;

    const { error } = await sb.from('ceremonial_template_activities').delete().eq('id', activityId);
    if (error) {
      setTemplatesFeedback('Não foi possível remover do modelo: ' + error.message, true);
      return;
    }

    state.templateActivities = state.templateActivities.filter(item => item.id !== activityId);
    renderTemplatesModal();
  }

  // Reordena gravando a ordem inteira no banco, o mesmo caminho do roteiro.
  // Um movimento de drag pode cruzar meia lista, então a troca de vizinhos não
  // bastaria: `unique (template_id, position)` não deixa gravar a ordem final
  // em UPDATEs avulsos, porque o primeiro esbarraria na posição que o vizinho
  // ainda ocupa. A RPC faz as duas fases dentro de uma transação.
  async function persistTemplateActivityOrder(orderedIds) {
    const sb = getSupabase();
    const template = selectedTemplate();
    if (!sb || !template) return;

    setTemplatesFeedback('');

    const { error } = await sb.rpc('reorder_ceremonial_template_activities', {
      target_template_id: template.id,
      ordered_ids: orderedIds
    });

    if (error) {
      console.error('Erro ao reordenar os momentos do modelo:', error);
      setTemplatesFeedback('Não foi possível reordenar: ' + error.message, true);
    }

    await loadTemplates();
    renderTemplatesModal();
  }

  // Reordena movendo activityId para a posição de beforeId na ordem atual.
  // beforeId null significa "colocar no fim".
  async function moveTemplateActivityTo(activityId, beforeId) {
    const template = selectedTemplate();
    if (!template) return;

    const current = templateActivities(template.id);
    const list = [...current];
    const from = list.findIndex(item => item.id === activityId);
    if (from === -1) return;

    const [moved] = list.splice(from, 1);
    let to = beforeId ? list.findIndex(item => item.id === beforeId) : list.length;
    if (to === -1) to = list.length;
    list.splice(to, 0, moved);

    if (list.every((item, i) => item.id === current[i].id)) return; // nada mudou
    await persistTemplateActivityOrder(list.map(item => item.id));
  }

  // ==========================================================================
  // DRAG AND DROP DOS MOMENTOS DO MODELO PADRÃO (Pointer Events)
  // ==========================================================================
  // Mesmo desenho do roteiro, em um state separado porque a lista alvo e o
  // commit são outros: aqui o destino é reorder_ceremonial_template_activities.

  function emptyTemplateDragState() {
    return { activityId: null, beforeId: null, started: false, row: null, pointerY: 0 };
  }

  function templateActivityRows() {
    const list = document.querySelector('#ceremonial-templates-modal .templates-activity-list');
    return list ? Array.from(list.querySelectorAll('.templates-activity-row')) : [];
  }

  function templateDropTargetBeforeId(pointerY) {
    const rows = templateActivityRows().filter(row => row.dataset.templateActId !== state.templateDrag.activityId);
    for (const row of rows) {
      const box = row.getBoundingClientRect();
      if (pointerY < box.top + box.height / 2) return row.dataset.templateActId;
    }
    return null;
  }

  function clearTemplateDropMarkers() {
    templateActivityRows().forEach(row => row.classList.remove('drag-over-top', 'drag-over-bottom'));
  }

  function paintTemplateDropTarget(beforeId) {
    clearTemplateDropMarkers();
    const others = templateActivityRows().filter(row => row.dataset.templateActId !== state.templateDrag.activityId);
    if (!beforeId) {
      others[others.length - 1]?.classList.add('drag-over-bottom');
    } else {
      others.find(row => row.dataset.templateActId === beforeId)?.classList.add('drag-over-top');
    }
  }

  function endTemplateDrag(commit) {
    const { activityId, beforeId, started, row } = state.templateDrag;
    if (!activityId) return;

    clearTemplateDropMarkers();
    row?.classList.remove('dragging');
    document.body.classList.remove('is-dragging-activity');

    state.templateDrag = emptyTemplateDragState();
    if (commit && started) moveTemplateActivityTo(activityId, beforeId);
  }

  function onTemplateGripPointerDown(event) {
    // Só o botão principal; o clique direito não deve iniciar arraste.
    if (event.button !== undefined && event.button !== 0) return;

    const grip = event.target.closest('[data-template-drag-grip]');
    if (!grip) return;

    const row = grip.closest('.templates-activity-row');
    if (!row) return;

    // Impede a rolagem da página enquanto o dedo arrasta a linha.
    event.preventDefault();

    state.templateDrag = {
      activityId: row.dataset.templateActId,
      beforeId: null,
      started: false,
      row,
      pointerY: event.clientY
    };

    const startY = event.clientY;

    const onMove = (moveEvent) => {
      // Um toque no punho sem deslocar é um clique, não um arraste.
      if (!state.templateDrag.started && Math.abs(moveEvent.clientY - startY) < DRAG_THRESHOLD_PX) return;

      if (!state.templateDrag.started) {
        state.templateDrag.started = true;
        state.templateDrag.row?.classList.add('dragging');
        document.body.classList.add('is-dragging-activity');
      }

      state.templateDrag.pointerY = moveEvent.clientY;
      state.templateDrag.beforeId = templateDropTargetBeforeId(moveEvent.clientY);
      paintTemplateDropTarget(state.templateDrag.beforeId);
    };

    const finish = (commit) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      endTemplateDrag(commit);
    };

    const onUp = () => finish(true);
    const onCancel = () => finish(false);

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  }

  async function applyTemplateToEvent(templateId) {
    const sb = getSupabase();
    const template = state.templates.find(t => t.id === templateId);
    if (!sb || !template || !state.selectedEventId) return;

    const replace = document.getElementById('template-replace')?.checked === true;
    const count = templateActivities(templateId).length;
    if (!count) {
      setTemplatesFeedback('Este modelo ainda não tem momentos para copiar.', true);
      return;
    }

    if (replace && state.activities.length && !confirm(`Isso apaga os ${state.activities.length} momentos do roteiro atual e coloca os ${count} do modelo. Continuar?`)) {
      return;
    }

    setTemplatesFeedback('');
    const { data, error } = await sb.rpc('copy_ceremonial_template', {
      source_template_id: templateId,
      target_event_id: state.selectedEventId,
      replace_activity: replace
    });

    if (error) {
      setTemplatesFeedback('Não foi possível copiar o modelo: ' + error.message, true);
      return;
    }

    const copied = Array.isArray(data) ? data[0] : data;
    closeTemplatesModal();
    await loadSelectedEventDetails(state.selectedEventId);
    notify(`${copied || count} momentos do modelo "${template.name}" copiados para o roteiro.`, 4000);
  }

  async function deleteActivity(actId) {
    const act = state.activities.find(a => a.id === actId);
    const title = act ? `"${act.title}"` : 'este momento';

    if (!confirm(`Deseja remover ${title} do roteiro?`)) return;

    const sb = getSupabase();
    if (!sb) return;

    try {
      const { error } = await sb.from('ceremonial_activities').delete().eq('id', actId);
      if (error) throw error;

      // Renumera para 1..N. Sem isso sobraria um buraco na sequência e o
      // próximo momento criado colidiria com a posição ocupada.
      await sb.rpc('pack_ceremonial_activities', { target_event_id: state.selectedEventId });

      notify('Momento excluído do cronograma.');
      await loadSelectedEventDetails(state.selectedEventId);
    } catch (err) {
      console.error('Erro ao excluir momento:', err);
      alert('Erro: ' + err.message);
    }
  }

  async function handleAddPreset(presetIndex) {
    const preset = CEREMONIAL_PRESETS[presetIndex];
    if (!preset || !state.selectedEventId) return;

    const sb = getSupabase();
    if (!sb) return;

    try {
      const nextPos = nextActivityPosition();

      // Calcula horário estimado se houver horário no evento
      let scheduledTime = null;
      if (state.selectedEvent && state.selectedEvent.event_time) {
        const [h, m] = state.selectedEvent.event_time.split(':').map(Number);
        const baseDate = new Date();
        baseDate.setHours(h, m + (preset.defaultTimeOffset || 0), 0, 0);
        scheduledTime = `${String(baseDate.getHours()).padStart(2, '0')}:${String(baseDate.getMinutes()).padStart(2, '0')}:00`;
      }

      const { error } = await sb.from('ceremonial_activities').insert({
        event_id: state.selectedEventId,
        position: nextPos,
        title: preset.title,
        scheduled_time: scheduledTime,
        responsible: preset.responsible,
        description: preset.description,
        status: 'pending'
      });

      if (error) throw error;
      notify(`"${preset.title}" adicionado ao roteiro!`);
      await loadSelectedEventDetails(state.selectedEventId);
    } catch (err) {
      console.error('Erro ao adicionar preset:', err);
      alert('Erro: ' + err.message);
    }
  }

  // --- Convidados & Recepção ---
  async function toggleGuestArrival(guestId) {
    const sb = getSupabase();
    if (!sb) return;

    const guest = state.guests.find(g => g.id === guestId);
    if (!guest) return;

    const newArrival = guest.arrived_at ? null : new Date().toISOString();

    try {
      const { error } = await sb
        .from('guests')
        .update({ arrived_at: newArrival })
        .eq('id', guestId);

      if (error) throw error;
      guest.arrived_at = newArrival;

      if (newArrival) {
        notify(`✨ Presença confirmada: ${guest.name}`);
      } else {
        notify(`Presença desmarcada para ${guest.name}`);
      }

      renderCeremonialHero();
      renderActiveTab();
    } catch (err) {
      console.error('Erro ao registrar chegada:', err);
      showSchemaError(err, 'registrar chegada');
    }
  }

  async function deleteGuest(guestId) {
    const guest = state.guests.find(g => g.id === guestId);
    const name = guest ? `"${guest.name}"` : 'este convidado';

    if (!confirm(`Deseja remover ${name} da lista?`)) return;

    const sb = getSupabase();
    if (!sb) return;

    try {
      const { error } = await sb.from('guests').delete().eq('id', guestId);
      if (error) throw error;
      notify('Convidado removido da lista.');
      await loadSelectedEventDetails(state.selectedEventId);
    } catch (err) {
      console.error('Erro ao remover convidado:', err);
      alert('Erro: ' + err.message);
    }
  }

  // --- Equipe / Cerimonialistas ---
  async function deleteStaff(staffId) {
    const member = state.staff.find(s => s.id === staffId);
    const name = member ? `"${member.name}"` : 'este profissional';

    if (!confirm(`Deseja remover ${name} da equipe?`)) return;

    const sb = getSupabase();
    if (!sb) return;

    try {
      const { error } = await sb.from('ceremonialistas').delete().eq('id', staffId);
      if (error) throw error;
      notify('Profissional removido da equipe.');
      await loadSelectedEventDetails(state.selectedEventId);
    } catch (err) {
      console.error('Erro ao remover cerimonialista:', err);
      alert('Erro: ' + err.message);
    }
  }

  // --- Mesas ---
  async function deleteTable(tableId) {
    const tbl = state.tables.find(t => t.id === tableId);
    const name = tbl ? `Mesa ${tbl.table_number}` : 'esta mesa';

    if (!confirm(`Deseja excluir ${name}? Os convidados vinculados não serão apagados, apenas desvinculados da mesa.`)) return;

    const sb = getSupabase();
    if (!sb) return;

    try {
      const { error } = await sb.from('event_tables').delete().eq('id', tableId);
      if (error) throw error;
      notify('Mesa removida.');
      await loadSelectedEventDetails(state.selectedEventId);
    } catch (err) {
      console.error('Erro ao remover mesa:', err);
      alert('Erro: ' + err.message);
    }
  }

  // ==========================================================================
  // Modais de Cadastro e Edição
  // ==========================================================================

  // 1. Modal de Atividade
  function openActivityModal(actData = null) {
    const panel = document.getElementById('ceremonial-activity-modal');
    const form = document.getElementById('ceremonial-activity-form');
    const titleEl = document.getElementById('ceremonial-activity-modal-title');
    const feedbackEl = document.getElementById('ceremonial-activity-feedback');

    if (!panel || !form) return;

    form.reset();
    if (feedbackEl) feedbackEl.textContent = '';

    if (actData) {
      state.editingActivityId = actData.id;
      if (titleEl) titleEl.textContent = 'Editar Momento do Cerimonial';
      document.getElementById('modal-act-id').value = actData.id || '';
      document.getElementById('modal-act-title').value = actData.title || '';
      document.getElementById('modal-act-time').value = actData.scheduled_time ? actData.scheduled_time.slice(0, 5) : '';
      document.getElementById('modal-act-resp').value = actData.responsible || '';
      document.getElementById('modal-act-status').value = actData.status || 'pending';
      document.getElementById('modal-act-desc').value = actData.description || '';
    } else {
      state.editingActivityId = null;
      if (titleEl) titleEl.textContent = 'Novo Momento no Cronograma';
      document.getElementById('modal-act-id').value = '';
      document.getElementById('modal-act-status').value = 'pending';
    }

    panel.hidden = false;
    refreshIcons();
  }

  function closeActivityModal() {
    const panel = document.getElementById('ceremonial-activity-modal');
    if (panel) panel.hidden = true;
    state.editingActivityId = null;
  }

  // 2. Modal de Convidado
  function openGuestModal(guestData = null) {
    const panel = document.getElementById('ceremonial-guest-modal');
    const form = document.getElementById('ceremonial-guest-form');
    const titleEl = document.getElementById('ceremonial-guest-modal-title');
    const feedbackEl = document.getElementById('ceremonial-guest-feedback');

    if (!panel || !form) return;

    form.reset();
    if (feedbackEl) feedbackEl.textContent = '';

    // Popula select de mesas
    const tableSelect = document.getElementById('modal-guest-table');
    if (tableSelect) {
      tableSelect.innerHTML = '<option value="">Sem mesa definida</option>' +
        state.tables.map(t => `<option value="${t.id}">Mesa ${sanitizeHtml(t.table_number)} (${t.capacity || 'Livre'} lugares)</option>`).join('');
    }

    if (guestData) {
      state.editingGuestId = guestData.id;
      if (titleEl) titleEl.textContent = 'Editar Convidado';
      document.getElementById('modal-guest-id').value = guestData.id || '';
      document.getElementById('modal-guest-name').value = guestData.name || '';
      document.getElementById('modal-guest-phone').value = guestData.whatsapp || '';
      document.getElementById('modal-guest-status').value = guestData.status || 'confirmed';
      if (tableSelect && guestData.table_id) tableSelect.value = guestData.table_id;
      document.getElementById('modal-guest-arrived').checked = Boolean(guestData.arrived_at);
      document.getElementById('modal-guest-notes').value = guestData.notes || '';
    } else {
      state.editingGuestId = null;
      if (titleEl) titleEl.textContent = 'Novo Convidado na Lista';
      document.getElementById('modal-guest-id').value = '';
      document.getElementById('modal-guest-status').value = 'confirmed';
      document.getElementById('modal-guest-arrived').checked = false;
    }

    panel.hidden = false;
    refreshIcons();
  }

  function closeGuestModal() {
    const panel = document.getElementById('ceremonial-guest-modal');
    if (panel) panel.hidden = true;
    state.editingGuestId = null;
  }

  // 3. Modal de Equipe
  function openStaffModal(staffData = null) {
    const panel = document.getElementById('ceremonial-staff-modal');
    const form = document.getElementById('ceremonial-staff-form');
    const titleEl = document.getElementById('ceremonial-staff-modal-title');
    const feedbackEl = document.getElementById('ceremonial-staff-feedback');

    if (!panel || !form) return;

    form.reset();
    if (feedbackEl) feedbackEl.textContent = '';

    if (staffData) {
      state.editingStaffId = staffData.id;
      if (titleEl) titleEl.textContent = 'Editar Cerimonialista';
      document.getElementById('modal-staff-id').value = staffData.id || '';
      document.getElementById('modal-staff-name').value = staffData.name || '';
      document.getElementById('modal-staff-specialty').value = staffData.specialty || 'coordenacao';
      document.getElementById('modal-staff-phone').value = staffData.whatsapp || '';
      document.getElementById('modal-staff-email').value = staffData.email || '';
      document.getElementById('modal-staff-notes').value = staffData.notes || '';
    } else {
      state.editingStaffId = null;
      if (titleEl) titleEl.textContent = 'Adicionar à Equipe de Cerimonial';
      document.getElementById('modal-staff-id').value = '';
      document.getElementById('modal-staff-specialty').value = 'coordenacao';
    }

    panel.hidden = false;
    refreshIcons();
  }

  function closeStaffModal() {
    const panel = document.getElementById('ceremonial-staff-modal');
    if (panel) panel.hidden = true;
    state.editingStaffId = null;
  }

  // 4. Modal de Mesa
  function openTableModal(tableData = null) {
    const panel = document.getElementById('ceremonial-table-modal');
    const form = document.getElementById('ceremonial-table-form');
    const titleEl = document.getElementById('ceremonial-table-modal-title');
    const feedbackEl = document.getElementById('ceremonial-table-feedback');

    if (!panel || !form) return;

    form.reset();
    if (feedbackEl) feedbackEl.textContent = '';

    if (tableData) {
      state.editingTableId = tableData.id;
      if (titleEl) titleEl.textContent = 'Editar Mesa';
      document.getElementById('modal-table-id').value = tableData.id || '';
      document.getElementById('modal-table-number').value = tableData.table_number || '';
      document.getElementById('modal-table-capacity').value = tableData.capacity || '8';
      document.getElementById('modal-table-notes').value = tableData.notes || '';
    } else {
      state.editingTableId = null;
      if (titleEl) titleEl.textContent = 'Nova Mesa / Setor';
      document.getElementById('modal-table-id').value = '';
      const nextNum = state.tables.length + 1;
      document.getElementById('modal-table-number').value = String(nextNum).padStart(2, '0');
      document.getElementById('modal-table-capacity').value = '8';
    }

    panel.hidden = false;
    refreshIcons();
  }

  function closeTableModal() {
    const panel = document.getElementById('ceremonial-table-modal');
    if (panel) panel.hidden = true;
    state.editingTableId = null;
  }

  // ==========================================================================
  // Submissão dos Formulários
  // ==========================================================================

  async function handleActivitySubmit(e) {
    e.preventDefault();
    const sb = getSupabase();
    if (!sb || !state.selectedEventId) return;

    const id = document.getElementById('modal-act-id').value.trim();
    const title = document.getElementById('modal-act-title').value.trim();
    const time = document.getElementById('modal-act-time').value || null;
    const resp = document.getElementById('modal-act-resp').value.trim() || null;
    const status = document.getElementById('modal-act-status').value || 'pending';
    const desc = document.getElementById('modal-act-desc').value.trim() || null;
    const feedbackEl = document.getElementById('ceremonial-activity-feedback');

    if (!title) {
      if (feedbackEl) feedbackEl.textContent = 'Preencha o título do momento.';
      return;
    }

    try {
      const payload = {
        event_id: state.selectedEventId,
        title,
        scheduled_time: time,
        responsible: resp,
        status,
        description: desc
      };

      if (id) {
        const { error } = await sb.from('ceremonial_activities').update(payload).eq('id', id);
        if (error) throw error;
        notify('Momento atualizado com sucesso!');
      } else {
        payload.position = nextActivityPosition();
        const { error } = await sb.from('ceremonial_activities').insert(payload);
        if (error) throw error;
        notify('Momento adicionado ao cronograma!');
      }

      closeActivityModal();
      await loadSelectedEventDetails(state.selectedEventId);
    } catch (err) {
      console.error('Erro ao salvar atividade:', err);
      if (feedbackEl) feedbackEl.textContent = 'Erro ao salvar: ' + err.message;
    }
  }

  async function handleInlineActivitySubmit(e) {
    e.preventDefault();
    const sb = getSupabase();
    if (!sb || !state.selectedEventId) return;

    const time = document.getElementById('inline-act-time').value || null;
    const title = document.getElementById('inline-act-title').value.trim();
    const resp = document.getElementById('inline-act-resp').value.trim() || null;
    const desc = document.getElementById('inline-act-desc').value.trim() || null;

    if (!title) return;

    try {
      const { error } = await sb.from('ceremonial_activities').insert({
        event_id: state.selectedEventId,
        position: nextActivityPosition(),
        title,
        scheduled_time: time,
        responsible: resp,
        description: desc,
        status: 'pending'
      });

      if (error) throw error;
      notify('Momento adicionado ao cronograma!');
      document.getElementById('inline-act-title').value = '';
      document.getElementById('inline-act-desc').value = '';
      await loadSelectedEventDetails(state.selectedEventId);
    } catch (err) {
      console.error('Erro ao adicionar inline:', err);
      showSchemaError(err, 'adicionar momento');
    }
  }

  async function handleGuestSubmit(e) {
    e.preventDefault();
    const sb = getSupabase();
    if (!sb || !state.selectedEventId) return;

    const id = document.getElementById('modal-guest-id').value.trim();
    const name = document.getElementById('modal-guest-name').value.trim();
    const phone = document.getElementById('modal-guest-phone').value.trim() || null;
    const tableId = document.getElementById('modal-guest-table').value || null;
    const status = document.getElementById('modal-guest-status').value || 'confirmed';
    const isArrived = document.getElementById('modal-guest-arrived').checked;
    const notes = document.getElementById('modal-guest-notes').value.trim() || null;
    const feedbackEl = document.getElementById('ceremonial-guest-feedback');

    if (!name) {
      if (feedbackEl) feedbackEl.textContent = 'Preencha o nome do convidado.';
      return;
    }

    try {
      const payload = {
        event_id: state.selectedEventId,
        name,
        whatsapp: phone,
        table_id: tableId,
        status,
        arrived_at: isArrived ? new Date().toISOString() : null,
        notes
      };

      if (id) {
        const { error } = await sb.from('guests').update(payload).eq('id', id);
        if (error) throw error;
        notify('Convidado atualizado!');
      } else {
        const { error } = await sb.from('guests').insert(payload);
        if (error) throw error;
        notify('Convidado adicionado à recepção!');
      }

      closeGuestModal();
      await loadSelectedEventDetails(state.selectedEventId);
    } catch (err) {
      console.error('Erro ao salvar convidado:', err);
      if (feedbackEl) feedbackEl.textContent = 'Erro ao salvar: ' + err.message;
    }
  }

  async function handleStaffSubmit(e) {
    e.preventDefault();
    const sb = getSupabase();
    if (!sb) return;

    const id = document.getElementById('modal-staff-id').value.trim();
    const name = document.getElementById('modal-staff-name').value.trim();
    const specialty = document.getElementById('modal-staff-specialty').value || 'coordenacao';
    const phone = document.getElementById('modal-staff-phone').value.trim() || null;
    const email = document.getElementById('modal-staff-email').value.trim() || null;
    const notes = document.getElementById('modal-staff-notes').value.trim() || null;
    const feedbackEl = document.getElementById('ceremonial-staff-feedback');

    if (!name) {
      if (feedbackEl) feedbackEl.textContent = 'Preencha o nome do cerimonialista.';
      return;
    }

    try {
      const payload = {
        event_id: state.selectedEventId,
        name,
        specialty,
        whatsapp: phone,
        email,
        notes
      };

      if (id) {
        const { error } = await sb.from('ceremonialistas').update(payload).eq('id', id);
        if (error) throw error;
        notify('Dados da equipe atualizados!');
      } else {
        const { error } = await sb.from('ceremonialistas').insert(payload);
        if (error) throw error;
        notify('Profissional adicionado à equipe!');
      }

      closeStaffModal();
      await loadSelectedEventDetails(state.selectedEventId);
    } catch (err) {
      console.error('Erro ao salvar staff:', err);
      if (feedbackEl) feedbackEl.textContent = 'Erro ao salvar: ' + err.message;
    }
  }

  async function handleTableSubmit(e) {
    e.preventDefault();
    const sb = getSupabase();
    if (!sb || !state.selectedEventId) return;

    const id = document.getElementById('modal-table-id').value.trim();
    const tableNumber = document.getElementById('modal-table-number').value.trim();
    const capacity = parseInt(document.getElementById('modal-table-capacity').value, 10) || 8;
    const notes = document.getElementById('modal-table-notes').value.trim() || null;
    const feedbackEl = document.getElementById('ceremonial-table-feedback');

    if (!tableNumber) {
      if (feedbackEl) feedbackEl.textContent = 'Preencha o número/identificação da mesa.';
      return;
    }

    try {
      const payload = {
        event_id: state.selectedEventId,
        table_number: tableNumber,
        capacity,
        notes
      };

      if (id) {
        const { error } = await sb.from('event_tables').update(payload).eq('id', id);
        if (error) throw error;
        notify('Mesa atualizada!');
      } else {
        const { error } = await sb.from('event_tables').insert(payload);
        if (error) throw error;
        notify('Mesa cadastrada!');
      }

      closeTableModal();
      await loadSelectedEventDetails(state.selectedEventId);
    } catch (err) {
      console.error('Erro ao salvar mesa:', err);
      if (feedbackEl) feedbackEl.textContent = 'Erro ao salvar: ' + err.message;
    }
  }

  // ==========================================================================
  // Abertura e Fechamento do Módulo Principal
  // ==========================================================================

  function openCeremonialPanel(targetEventId = null, defaultTab = null) {
    const panel = document.getElementById('ceremonial-panel');
    if (!panel) return;

    // Mesmo caminho do restante: o módulo inteiro depende da permissão
    // 'cerimonial', então quem não a tem não chega a abrir o painel.
    if (window.plenitudePermissions && !window.plenitudePermissions.allow('cerimonial')) return;

    panel.hidden = false;

    if (defaultTab) {
      state.currentTab = defaultTab;
    }

    const filterToggle = document.getElementById('ceremonial-only-toggle');
    if (filterToggle) filterToggle.checked = state.onlyCeremonialEvents;

    // Os serviços marcados decidem o filtro, então precisam ser lidos antes
    // de a lista de eventos ser desenhada.
    loadCeremonialServiceIds()
      .then(() => loadEventsList())
      .then(() => {
        if (targetEventId) {
          selectEvent(targetEventId);
        }
      });

    refreshIcons();
  }

  function closeCeremonialPanel() {
    const panel = document.getElementById('ceremonial-panel');
    if (panel) panel.hidden = true;
    clearInterval(state.liveTimerInterval);
  }

  // ==========================================================================
  // Event Listeners Globais
  // ==========================================================================

  function setupEventListeners() {
    // 1. Abertura pelo Card de Cerimonial na tela inicial
    document.addEventListener('click', e => {
      const target = e.target.closest('button, a, [data-open-ceremonial], [data-ceremonial-tab-jump]');
      if (!target) return;

      // Abrir painel
      if (target.matches('.card-cerimonial') || target.dataset.action === 'Cerimonial' || target.hasAttribute('data-open-ceremonial')) {
        e.preventDefault();
        openCeremonialPanel();
        return;
      }

      // Fechar painel
      if (target.hasAttribute('data-close-ceremonial')) {
        e.preventDefault();
        closeCeremonialPanel();
        return;
      }

      // Troca de tabs principais
      if (target.hasAttribute('data-ceremonial-tab')) {
        e.preventDefault();
        state.currentTab = target.dataset.ceremonialTab;
        renderActiveTab();
        return;
      }

      // Atalho de salto para tab a partir do Hero
      if (target.hasAttribute('data-ceremonial-tab-jump')) {
        e.preventDefault();
        state.currentTab = target.dataset.ceremonialTabJump;
        renderActiveTab();
        return;
      }

      // Alternar Modo Ao Vivo
      if (target.hasAttribute('data-ceremonial-live-toggle')) {
        e.preventDefault();
        state.currentTab = state.currentTab === 'live' ? 'timeline' : 'live';
        renderActiveTab();
        return;
      }

      // Filtros rápidos do Roteiro
      if (target.hasAttribute('data-timeline-filter')) {
        e.preventDefault();
        state.timelineFilter = target.dataset.timelineFilter;
        renderTimelineTab(document.getElementById('ceremonial-tab-timeline'));
        return;
      }

      // Filtros rápidos da Recepção
      if (target.hasAttribute('data-arrival-filter')) {
        e.preventDefault();
        state.arrivalFilter = target.dataset.arrivalFilter;
        renderArrivalTab(document.getElementById('ceremonial-tab-arrival'));
        return;
      }

      // Ações do Cronograma (Checkbox, Edit, Delete, Preset)
      if (target.hasAttribute('data-toggle-activity-check')) {
        e.preventDefault();
        toggleActivityCheck(target.dataset.toggleActivityCheck);
        return;
      }

      if (target.hasAttribute('data-add-preset-idx')) {
        e.preventDefault();
        handleAddPreset(parseInt(target.dataset.addPresetIdx, 10));
        return;
      }

      if (target.hasAttribute('data-edit-activity')) {
        e.preventDefault();
        const act = state.activities.find(a => a.id === target.dataset.editActivity);
        if (act) openActivityModal(act);
        return;
      }

      if (target.hasAttribute('data-delete-activity')) {
        e.preventDefault();
        deleteActivity(target.dataset.deleteActivity);
        return;
      }

      // Ações dos modelos padrão
      if (target.closest('[data-open-templates-modal]')) {
        e.preventDefault();
        openTemplatesModal();
        return;
      }

      if (target.hasAttribute('data-select-template')) {
        e.preventDefault();
        state.editingTemplateId = target.dataset.selectTemplate;
        setTemplatesFeedback('');
        renderTemplatesModal();
        return;
      }

      if (target.hasAttribute('data-rename-template')) {
        e.preventDefault();
        renameTemplate(target.dataset.renameTemplate);
        return;
      }

      if (target.hasAttribute('data-delete-template')) {
        e.preventDefault();
        deleteTemplate(target.dataset.deleteTemplate);
        return;
      }

      if (target.hasAttribute('data-template-act-delete')) {
        e.preventDefault();
        removeTemplateActivity(target.dataset.templateActDelete);
        return;
      }

      if (target.hasAttribute('data-apply-template')) {
        e.preventDefault();
        applyTemplateToEvent(target.dataset.applyTemplate);
        return;
      }

      // Ações da Recepção (Check-in, Edit, Delete)
      if (target.hasAttribute('data-toggle-arrival')) {
        e.preventDefault();
        toggleGuestArrival(target.dataset.toggleArrival);
        return;
      }

      if (target.hasAttribute('data-edit-guest')) {
        e.preventDefault();
        const guest = state.guests.find(g => g.id === target.dataset.editGuest);
        if (guest) openGuestModal(guest);
        return;
      }

      if (target.hasAttribute('data-delete-guest')) {
        e.preventDefault();
        deleteGuest(target.dataset.deleteGuest);
        return;
      }

      // Ações da Equipe (Edit, Delete)
      if (target.hasAttribute('data-edit-staff')) {
        e.preventDefault();
        const member = state.staff.find(s => s.id === target.dataset.editStaff);
        if (member) openStaffModal(member);
        return;
      }

      if (target.hasAttribute('data-delete-staff')) {
        e.preventDefault();
        deleteStaff(target.dataset.deleteStaff);
        return;
      }

      // Ações de Mesas (Edit, Delete)
      if (target.hasAttribute('data-edit-table')) {
        e.preventDefault();
        const tbl = state.tables.find(t => t.id === target.dataset.editTable);
        if (tbl) openTableModal(tbl);
        return;
      }

      if (target.hasAttribute('data-delete-table')) {
        e.preventDefault();
        deleteTable(target.dataset.deleteTable);
        return;
      }

      // Abertura de Modais
      if (target.hasAttribute('data-open-activity-modal')) {
        e.preventDefault();
        openActivityModal();
        return;
      }
      if (target.hasAttribute('data-close-activity-modal')) {
        e.preventDefault();
        closeActivityModal();
        return;
      }

      if (target.hasAttribute('data-open-guest-modal')) {
        e.preventDefault();
        openGuestModal();
        return;
      }
      if (target.hasAttribute('data-close-guest-modal')) {
        e.preventDefault();
        closeGuestModal();
        return;
      }

      if (target.hasAttribute('data-open-staff-modal')) {
        e.preventDefault();
        openStaffModal();
        return;
      }
      if (target.hasAttribute('data-close-staff-modal')) {
        e.preventDefault();
        closeStaffModal();
        return;
      }

      if (target.hasAttribute('data-open-table-modal')) {
        e.preventDefault();
        openTableModal();
        return;
      }
      if (target.hasAttribute('data-close-table-modal')) {
        e.preventDefault();
        closeTableModal();
        return;
      }

      // Ações do Modo Ao Vivo
      if (target.hasAttribute('data-live-action')) {
        e.preventDefault();
        const action = target.dataset.liveAction;
        const actId = target.dataset.activityId;
        if (action === 'complete') {
          updateActivityStatus(actId, 'completed');
        } else if (action === 'start') {
          updateActivityStatus(actId, 'in_progress');
        } else if (action === 'skip') {
          updateActivityStatus(actId, 'skipped');
        }
        return;
      }
    });

    // 2. Mudança no Seletor de Eventos
    const eventSelect = document.getElementById('ceremonial-event-select');
    if (eventSelect) {
      eventSelect.addEventListener('change', e => {
        selectEvent(e.target.value);
      });
    }

    // 2b. Filtro "somente eventos com serviço de Cerimonial"
    const onlyToggle = document.getElementById('ceremonial-only-toggle');
    if (onlyToggle) {
      onlyToggle.addEventListener('change', e => {
        toggleCeremonialFilter(e.target.checked);
      });
    }

    // 2c. Arraste do roteiro. Delegado porque os cards são redesenhados a
    // cada recarga e um listener direto seria perdido.
    document.addEventListener('pointerdown', onGripPointerDown);

    // 2d. Arraste dos momentos do modelo padrão, mesma técnica e pelo mesmo
    // motivo: as linhas são redesenhadas a cada render do modal.
    document.addEventListener('pointerdown', onTemplateGripPointerDown);

    // 3. Mudança rápida de status da atividade no select inline
    document.addEventListener('change', e => {
      if (e.target.hasAttribute('data-change-activity-status')) {
        const actId = e.target.dataset.changeActivityStatus;
        const newStatus = e.target.value;
        updateActivityStatus(actId, newStatus);
      }
    });

    // 4. Submissão dos Formulários
    const actForm = document.getElementById('ceremonial-activity-form');
    if (actForm) actForm.addEventListener('submit', handleActivitySubmit);

    const inlineActForm = document.getElementById('inline-activity-form');
    if (inlineActForm) inlineActForm.addEventListener('submit', handleInlineActivitySubmit);

    const guestForm = document.getElementById('ceremonial-guest-form');
    if (guestForm) guestForm.addEventListener('submit', handleGuestSubmit);

    const staffForm = document.getElementById('ceremonial-staff-form');
    if (staffForm) staffForm.addEventListener('submit', handleStaffSubmit);

    const tableForm = document.getElementById('ceremonial-table-form');
    if (tableForm) tableForm.addEventListener('submit', handleTableSubmit);

    const templateCreateForm = document.getElementById('template-create-form');
    if (templateCreateForm) templateCreateForm.addEventListener('submit', createTemplate);

    document.querySelectorAll('[data-close-templates-modal]').forEach(button => {
      button.addEventListener('click', closeTemplatesModal);
    });
  }

  // ==========================================================================
  // Expor API Pública e Inicializar
  // ==========================================================================

  window.plenitudeCeremonial = {
    openCeremonialPanel,
    closeCeremonialPanel,
    selectEvent,
    // Chamados por realtime.js. reloadCeremonial só tem efeito com um evento
    // selecionado; reloadEventsList recarrega a lista e reaplica a seleção.
    reloadCeremonial: () => {
      if (state.selectedEventId) loadSelectedEventDetails(state.selectedEventId);
    },
    reloadEventsList: loadEventsList,
    // Realtime: os modelos padrão são compartilhados pela equipe, então uma
    // alteração feita por outro usuário precisa chegar aqui.
    reloadTemplates: async () => {
      await loadTemplates();
      const modal = document.getElementById('ceremonial-templates-modal');
      if (modal && !modal.hidden) renderTemplatesModal();
    },
    // Realtime: marcar um serviço como "de cerimonial" muda o filtro do
    // seletor de evento, então a lista precisa ser redesenhada.
    reloadCeremonialFilter: async () => {
      await loadCeremonialServiceIds();
      state.events.forEach(event => {
        const items = event.quotes?.quote_items || [];
        event.hasCeremonial = items.some(item => state.ceremonialServiceIds.has(item.service_id));
      });
      populateEventSelector();
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setupEventListeners();
    });
  } else {
    setupEventListeners();
  }

})();
