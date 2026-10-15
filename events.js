// ==========================================================================
// Plenitude Realizações - Módulo de Eventos & Produção
// ==========================================================================
/*
 * A agenda de eventos e a operação de cada realização: a lista com filtros, a
 * ficha do evento em abas (visão geral, cronograma, convidados) e as
 * alterações que nascem dela.
 *
 * De onde vêm os eventos: um evento nasce de um orçamento que vira `confirmed`.
 * A trigger create_event_when_quote_confirmed do banco já faz o INSERT, e
 * quase tudo aqui é consequência disso — inclusive events.quote_id, que é
 * NOT NULL e UNIQUE, e é o caminho que a ficha usa para achar o orçamento, o
 * valor contratado e os itens do serviço.
 *
 * São três telas, todas <section> controladas pelo atributo `hidden`:
 *   #event-panel         lista com filtros (todos / próximos / hoje / realizados)
 *   #event-form-panel    criação e edição
 *   #event-detail-panel  ficha em abas, aberta por evento
 *
 * Este módulo não aplica o payload do Realtime: como as telas montam junções
 * no navegador, ele expõe recarregadores (reloadEvents, reloadEventDetail,
 * reloadLookups) e quem decide quando chamá-los é o realtime.js.
 *
 * Permissões: o allow('eventos') aqui esconde a tela para quem não tem acesso.
 * Quem pode gravar de verdade é a RLS do banco.
 */

(() => {
  'use strict';

  // Referência do cliente Supabase
  // A primeira opção é o cliente compartilhado que a sessão cria; o global é o
  // fallback das telas antigas. Devolve null em vez de lançar para que cada
  // loader possa encerrar devolvendo lista vazia.
  function getSupabase() {
    return window.plenitudeSupabase || (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
  }

  // Estado local do módulo de eventos
  // Tudo aqui é cache de tela, não fonte de verdade: o Postgres é a fonte e o
  // realtime.js é quem manda recarregar.
  const state = {
    events: [],
    clients: [],
    quotes: [],
    // Filtros da lista. Os quatro valores do activeFilter são os das pílulas
    // (data-event-filter) do cabeçalho da tela, e os dois filtros se combinam:
    // o período vem das pílulas, o status vem do select ao lado da busca.
    activeFilter: 'all', // 'all', 'upcoming', 'today', 'completed'
    statusFilter: '',
    searchQuery: '',
    // Evento aberto na ficha. O id é o que o realtime.js usa para saber se vale
    // a pena recarregar o detalhe, e o data é a cópia que as abas renderizam.
    currentEventId: null,
    currentEventData: null,
    // Aba visível da ficha. Guardada para diagnóstico: quem mostra e esconde os
    // painéis é o listener, alternando o atributo `hidden` direto no DOM.
    currentTab: 'overview',
    // Carregadas junto com a ficha e sempre do evento aberto. As três saem
    // junto com ele: activities, mesas e convidados são ON DELETE CASCADE.
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
    // O timer fica preso na própria função para que uma mensagem nova substitua
    // a anterior em vez de compete com ela pelo mesmo toast.
    notify._timer = setTimeout(() => {
      toast.classList.remove('show');
    }, duration);
  }

  // Os ícones são <i data-lucide="..."> virados em SVG pelo Lucide, e ele só
  // enxerga o que já está no DOM. Como quase toda tela deste módulo é
  // reconstruída por innerHTML, cada render precisa chamar isto depois.
  function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  // ==========================================================================
  // Formatação de Datas, Valores e Normalização
  // ==========================================================================

  // Formatadores de data e hora
  const MONTHS_SHORT = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
  const MONTHS_LONG = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  const WEEKDAYS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

  // Converte a data `date` do Postgres (que é 'YYYY-MM-DD', sem hora) para Date
  // sem passar por UTC. Um `new Date('2026-10-15')` puro é interpretado como
  // meia-noite UTC, que no Brasil é a noite anterior do dia 14: o evento
  // apareceria com a data errada. Montando com os números no fuso local, o dia
  // é o dia em qualquer lugar do Brasil.
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

  // O Postgres devolve `time` como 'HH:MM:SS' e o <input type="time"> aceita
  // só 'HH:MM'. Cortar em 5 resolve os dois lados com uma linha.
  function formatTimeOnly(timeStr) {
    if (!timeStr) return '';
    return timeStr.slice(0, 5);
  }

  function formatCurrency(val) {
    const num = Number(val) || 0;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  // Conta os dias até o evento. O `type` volta junto porque cada faixa tem cor
  // própria em CSS (.today/.soon/.future/.past); o texto é o que o card mostra.
  function calculateCountdown(dateStr) {
    if (!dateStr) return { text: '', type: 'neutral' };
    // Zera as horas dos dois lados: a diferença tem de ser entre dias de
    // calendário, e não entre "agora" e a meia-noite do dia do evento. Sem
    // isso, um evento às 10h de hoje já daria -1 dia.
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const target = parseDateOnly(dateStr);
    if (!target) return { text: '', type: 'neutral' };
    target.setHours(0, 0, 0, 0);

    // Math.round e não Math.floor porque as horas já foram zeradas dos dois
    // lados: a divisão não tem fração, e o arredondamento absorve o resto dos
    // 30 minutos de diferença de horário de verão, quando existe.
    const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return { text: 'É HOJE!', type: 'today' };
    if (diffDays === 1) return { text: 'Amanhã', type: 'soon' };
    if (diffDays > 1 && diffDays <= 7) return { text: `Em ${diffDays} dias`, type: 'soon' };
    if (diffDays > 7) return { text: `Em ${diffDays} dias`, type: 'future' };
    if (diffDays === -1) return { text: 'Ontem', type: 'past' };
    return { text: `${Math.abs(diffDays)}d atrás`, type: 'past' };
  }

  // Rótulos dos enums do banco: quote_status para o orçamento e event_status
  // para o evento. Os valores são os mesmos que o CSS usa de classe nos cards.
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

  // 'cancelled' existe no enum mas não tem botão para virar: só se chega lá
  // editando o evento pelo formulário, porque cancelar um evento com custos já
  // lançados não é uma decisão de um toque.
  function formatStatusLabel(status) {
    switch (status) {
      case 'planned': return 'Planejado';
      case 'in_progress': return 'Em andamento';
      case 'completed': return 'Realizado';
      case 'cancelled': return 'Cancelado';
      default: return status || 'Planejado';
    }
  }

  // Escape de HTML. Quase toda tela deste módulo é montada por template string
  // com dados que o usuário digitou (nome do evento, local, observações), e
  // innerHTML não escapa nada. Por isso todo texto que vem do banco passa por
  // aqui antes de entrar no markup — o que falta é brecha de XSS.
  function sanitizeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Deixa o telefone no formato que o wa.me/número exige: só dígitos, com DDI.
  // O limite de 11 dígitos é o que separa "11 99999-9999" de um número já com
  // 55 na frente — acima disso o telefone já vem completo e acrescentar o DDI
  // de novo abriria a conversa no número errado.
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
  //
  // Três caches: os eventos, com tudo o que a consulta traz embutido, e os dois
  // lookups (clientes e orçamentos) que só alimentam os <select> do formulário.
  // Os loaders engolem o erro e devolvem lista vazia: sem cliente do
  // Supabase a tela ainda precisa renderizar, e o aviso de falha vai no texto
  // de feedback, não num unhandled rejection.
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

  // A data aqui é a de UTC (toISOString), diferente do parseDateOnly: entre 21h
  // e meia-noite no Brasil o "hoje" já é o dia seguinte. A comparação entre as
  // duas strings funciona porque o Postgres devolve 'YYYY-MM-DD' e nesse
  // formato a ordem alfabética é a ordem do calendário.
  async function updatePastEventsStatus() {
    const sb = getSupabase();
    if (!sb) return;

    // Gambiarra de negócio: o status 'completed' não vem de um trigger, vem
    // desta varredura. Só alguém que abre a agenda faz um evento virar
    // "realizado" sozinho, e quem não abre a agenda nunca vê o evento sair
    // de 'planned' por data.
    const todayStr = new Date().toISOString().split('T')[0];
    const pastEvents = state.events.filter(e =>
      e.event_date < todayStr &&
      (e.status === 'planned' || e.status === 'in_progress')
    );

    if (pastEvents.length === 0) return;

    try {
      // Um UPDATE por evento em vez de um UPDATE ... IN: são poucos por rodada e o
      // update em lote exigiria uma consulta por id de qualquer jeito, já que
      // este módulo não monta filtro de lista para o .update().
      for (const event of pastEvents) {
        const { error } = await sb
          .from('events')
          .update({ status: 'completed' })
          .eq('id', event.id);

        if (error) {
          console.warn(`Erro ao atualizar status do evento ${event.id}:`, error);
        } else {
          event.status = 'completed';
        }
      }
    } catch (err) {
      console.error('Erro ao atualizar status de eventos passados:', err);
    }
  }

  // O carregador principal do módulo: lista de eventos, ficha e o Realtime
  // entram todos por aqui. `clients` e `quotes` são relações embutidas do
  // PostgREST (as chaves estrangeiras de events), então chegam na mesma
  // consulta e o card não precisa de uma segunda ida ao banco.
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
        // A ordem é a da data do evento, não a de criação: a agenda é uma linha do
        // tempo, e um evento criado hoje para o ano que vem deve ficar no fim.
        .order('event_date', { ascending: true });

      if (error) throw error;

      state.events = data || [];
      // Antes de renderizar: o que já passou vira 'completed' no banco, então a
      // lista já sai com o status certo em vez de esperar o próximo clique.
      await updatePastEventsStatus();
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

  // Atualiza a frase "N eventos para hoje" do dashboard. Roda em toda carga da
  // agenda, mesmo com a tela de Eventos fechada, porque esse resumo fica na
  // tela inicial e é o que muda de forma visível mais rápido.
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
    // Redesenhar o <select> apaga a seleção. Guardar e devolver o valor é o que
    // permite o realtime recarregar os lookups com o formulário aberto sem
    // que o usuário perca o que já escolheu.
    const currentVal = select.value;
    select.innerHTML = '<option value="">Selecione um cliente</option>' +
      state.clients.map(c => `<option value="${c.id}">${sanitizeHtml(c.name)}</option>`).join('');
    if (currentVal) select.value = currentVal;
  }

  // Lista de orçamentos do selete do formulário. Com clientId, só os orçamentos
  // daquele cliente: vincular o evento a um orçamento de outra pessoa é erro
  // de digitação e a trigger do banco não pegaria.
  function populateQuoteSelect(clientId = null) {
    const select = document.getElementById('event-quote-select');
    if (!select) return;
    const currentVal = select.value;

    let availableQuotes = state.quotes;
    if (clientId) {
      availableQuotes = state.quotes.filter(q => q.client_id === clientId);
    }

    // A primeira opção é a saída para quem não quer vincular nada: o evento
    // nasce sem orçamento e o submit cria um rascunho na hora.
    let html = '<option value="">Gerar / Vincular automaticamente</option>';
    availableQuotes.forEach(q => {
      const num = q.quote_number ? `#${q.quote_number} - ` : '';
      const total = formatCurrency(q.total);
      html += `<option value="${q.id}">${num}${sanitizeHtml(q.name)} (${total})</option>`;
    });

    select.innerHTML = html;
    // Só recoloca a seleção se o orçamento escolhido ainda estiver na lista: ao
    // trocar de cliente, o orçamento antigo some e o select precisa cair na
    // opção em branco.
    if (currentVal && availableQuotes.some(q => q.id === currentVal)) {
      select.value = currentVal;
    }
  }

  // ==========================================================================
  // Renderização da Lista de Eventos
  //
  // A lista inteira é reconstruída por innerHTML. É barato (são dezenas de
  // cards) e evita a reconciliação de um framework que o app não tem; o preço
  // é que nada dentro dela pode guardar estado — até a busca é lida do campo a
  // cada tecla.
  // ==========================================================================

  function renderEventsList() {
    const listEl = document.getElementById('event-list');
    if (!listEl) return;

    const todayStr = new Date().toISOString().split('T')[0];

    // Filtrar no navegador, e não no banco: a lista inteira já está em memória
    // e assim o filtro responde sem ida ao Supabase nem delay de rede.
    let filtered = state.events.filter(event => {
      // Filtro de status
      if (state.statusFilter && event.status !== state.statusFilter) {
        return false;
      }

      // Filtro de período (tabs rápidas)
      // 'upcoming' é o filtro mais carregado: exclui também o que já foi realizado ou
      // cancelado, mesmo que a data ainda esteja à frente — um evento de ontem
      // que ninguém marcou não pode aparecer como "próximo".
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
      // A busca varre nome, local, cliente e a data crua, com `includes` em vez
      // de igualdade: quem digita parte do nome do cliente precisa achar o mesmo
      // evento, e digitar "2026-10" acha pela data.
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

    // Lista vazia com a saída para criar o evento: quem procurou e não achou quase
    // sempre está querendo cadastrar o que procurou.
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

    // O card é um <article> com data-event-id, e quem decide o que o clique faz é o
    // listener delegado no document (setupEventListeners). Os botões de ação
    // carregam o id em data-*: nenhum handler é preso ao elemento, porque esta
    // lista é reconstruída a cada filtro e a cada tecla digitada.
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

          <div class="event-card-actions">
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
            <button class="client-action" type="button" data-duplicate="event" data-duplicate-id="${event.id}" title="Duplicar Evento" aria-label="Duplicar Evento">
              <i data-lucide="copy"></i>
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
  // Abertura e Fechamento de Painéis
  //
  // Abrir e fechar aqui é só mexer no atributo `hidden` da <section>. A pilha de
  // telas do navigation.js observa esse atributo por MutationObserver, então
  // não há nada a sincronizar com o histórico do navegador.
  // ==========================================================================

  function openEventsPanel(filter = null) {
    const panel = document.getElementById('event-panel');
    if (!panel) return;

    // Quem não tem acesso à agenda não entra no painel. O banco também nega a
    // leitura, mas chegar aqui mostrava a lista vazia sem explicação.
    if (window.plenitudePermissions && !window.plenitudePermissions.allow('eventos')) return;

    // O filtro pode vir de fora: "Agenda de hoje" no dashboard abre a pílula
    // "hoje" já marcada, e o parâmetro é quem faz essa conciliação.
    if (filter) {
      state.activeFilter = filter;
      document.querySelectorAll('.event-pill').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.eventFilter === filter);
      });
    }

    // Abrir recarrega tudo, mesmo com o realtime ativo: a agenda é a entrada mais
    // usada do app e recarregar na abertura é o que garante que a lista não
    // mostre o que o outro usuário acabou de mudar.
    panel.hidden = false;
    loadEvents();
    loadClients();
    loadQuotes();
    refreshIcons();
  }

  // Fecha sem limpar state: quem chama apenas esconde a <section>, e o
  // realtime.js nem recarrega nada enquanto a tela não estiver visível.
  function closeEventsPanel() {
    const panel = document.getElementById('event-panel');
    if (panel) panel.hidden = true;
  }

  // O mesmo formulário serve para criar e para editar: o que decide é o
  // #event-id, campo escondido que fica vazio no cadastro e cheio na edição.
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

    // Edição vs. criação é decidido pelo id, não pela presença do objeto: assim
    // a cópia da duplicação (sem id) abre como "Novo evento" já preenchida.
    const isEdit = Boolean(eventData?.id);
    if (titleEl) titleEl.textContent = isEdit ? 'Editar evento' : 'Novo evento';
    // Os campos são preenchidos com o que veio em qualquer um dos modos. Só o
    // id e o orçamento vinculado ficam de fora na criação: um evento novo nasce
    // sem orçamento e o submit cria um rascunho na hora.
    document.getElementById('event-id').value = isEdit ? eventData.id : '';
    document.getElementById('event-quote-id').value = isEdit ? (eventData.quote_id || '') : '';
    document.getElementById('event-name').value = eventData?.name || '';
    document.getElementById('event-client').value = eventData?.client_id || '';
    document.getElementById('event-time').value = eventData?.event_time ? eventData.event_time.slice(0, 5) : '';
    document.getElementById('event-venue').value = eventData?.venue || '';
    // O status de uma cópia volta para 'planned'. Um evento em andamento ou
    // realizado faria o orçamento de apoio nascer 'confirmed', e a trigger
    // create_event_when_quote_confirmed criaria um segundo evento além deste.
    document.getElementById('event-status').value = isEdit ? (eventData?.status || 'planned') : 'planned';
    document.getElementById('event-notes').value = eventData?.notes || '';

    if (isEdit) {
      document.getElementById('event-date').value = eventData.event_date || '';
      const quoteSelect = document.getElementById('event-quote-select');
      if (quoteSelect && eventData.quote_id) {
        quoteSelect.value = eventData.quote_id;
      }
    } else {
      // Data padrão: 7 dias a partir de hoje. Numa cópia, mantém a data do
      // original para o novo evento nascer com a mesma do que foi duplicado.
      // É só um chute para o campo não vir vazio e obrigar a abrir o calendário,
      // e sai em UTC por causa do toISOString — o mesmo recorte de data usado
      // nos filtros da lista, coerente com ela.
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      document.getElementById('event-date').value = eventData?.event_date || nextWeek.toISOString().split('T')[0];
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
  //
  // Regras que valem mais que o código: events.quote_id é NOT NULL, então não
  // existe evento sem orçamento; e a trigger create_event_when_quote_confirmed
  // só cria evento quando o orçamento vira 'confirmed'. Salvar um evento aqui
  // não passa pela trigger, e é por isso que o orçamento de apoio é criado aqui
  // mesmo — com 'draft' ou 'confirmed' conforme o status escolhido.
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
    // O selete tem prioridade sobre o campo oculto: se o usuário escolheu outro
    // orçamento na hora, é esse que vale.
    let quoteId = document.getElementById('event-quote-select').value || document.getElementById('event-quote-id').value.trim();
    const eventDate = document.getElementById('event-date').value;
    const eventTime = document.getElementById('event-time').value || null;
    const venue = document.getElementById('event-venue').value.trim() || null;
    const status = document.getElementById('event-status').value;
    const notes = document.getElementById('event-notes').value.trim() || null;

    // Validação mínima no navegador: o banco cobra o resto (client_id, event_date,
    // quote_id NOT NULL). Aqui só o que evita erro de digitação óbvio, porque
    // o erro do banco aparece traduzido em inglês no campo de feedback.
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
        // O orçamento nasce com os mesmos dados do evento e vira 'confirmed'
        // só quando o evento já está em andamento ou realizado — é esse status
        // que decide se o evento entra para o Financeiro. Fora disso fica
        // 'draft', e a trigger nunca o promoveria por si só.
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
      // A ficha é reaberta (e não só atualizada) porque ela é quem decide a ordem de
      // exibição; voltar a abrir garante que cronogramas e convidados voltem
      // também.
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

  // Excluir o evento leva junto o roteiro, as mesas, os convidados e a equipe de
  // cerimonial: todas essas tabelas são ON DELETE CASCADE. O que fica é o
  // orçamento — events.quote_id é ON DELETE RESTRICT, então é a exclusão do
  // evento que destrava o orçamento, e não o contrário.
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

      // Se a ficha que está aberta era a do evento excluído, ela fecha junto: deixar
      // a ficha aberta mostraria um evento que não existe mais.
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
  //
  // A ficha abre em três abas: visão geral (orçamento e cliente), cronograma do
  // cerimonial e convidados. O roteiro completo, com chegada, equipe e mesas ao
  // vivo, vive no módulo de Cerimonial; aqui é a visão resumida do mesmo evento,
  // e o botão "Módulo Cerimonial" entrega o event_id para lá.
  // ==========================================================================

  // Abre a ficha. O id é guardado em state.currentEventId antes da carga porque
  // é esse estado que o realtime.js consulta para saber se deve recarregar.
  async function openEventDetail(eventId) {
    const panel = document.getElementById('event-detail-panel');
    if (!panel) return;

    state.currentEventId = eventId;
    panel.hidden = false;

    await loadEventFullDetails(eventId);
    refreshIcons();
  }

  // Limpar o id junto é obrigatório: é ele que o realtime.js consulta antes de
  // chamar reloadEventDetail. Mantido, a ficha fecharia recarregando sozinha.
  function closeEventDetail() {
    const panel = document.getElementById('event-detail-panel');
    if (panel) panel.hidden = true;
    state.currentEventId = null;
    state.currentEventData = null;
  }

  // Carrega tudo o que a ficha mostra. Só a primeira consulta pode derrubar a
  // ficha (ela é o evento em si): as outras três apenas registram aviso e seguem
  // com lista vazia, para um erro de RLS em uma tabela não apagar o resto.
  async function loadEventFullDetails(eventId) {
    const sb = getSupabase();
    if (!sb) return;

    const heroEl = document.getElementById('event-detail-hero');
    if (heroEl) heroEl.innerHTML = '<p style="color: white; padding: 10px;">Carregando dados completos do evento...</p>';

    try {
      // As consultas são sequenciais, e não em Promise.all: são quatro idas ao banco
      // e a ficha já mostra um "carregando" no hero, então a espera não aparece
      // como travamento.
      // 1. Dados do evento e vínculos
      // A árvore quotes -> quote_items é o que mostra o contratado na visão
      // geral. Não tem pacote de menus aqui: o cardápio de cada serviço é
      // detalhe do item do orçamento, e quem abre isso é o módulo de Cardápios.
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
      // 'position' é a ordem do roteiro e é UNIQUE por evento; o horário é
      // apenas o segundo critério, para dois momentos na mesma hora manter a
      // ordem em que foram cadastrados.
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
      // A mesa vem embutida pelo guests.table_id, que é ON DELETE SET NULL: um
      // convidado cuja mesa foi desfeita continua na lista, só sem o chip de
      // mesa.
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

  // Faixa colorida no topo da ficha: data, horário, countdown, cliente e as ações
  // de status. As três pílulas de status são a forma rápida de mudar o estágio
  // do evento, e é por isso que a ficha não tem um botão de salvar.
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

  // ==========================================================================
  // Conteúdo das Abas da Ficha
  //
  // As três abas são reconstruídas por inteiro a cada carga. Nenhuma delas
  // controla sua própria visibilidade: quem mostra e esconde é o listener do
  // data-event-tab, alternando o atributo `hidden` dos #event-tab-*.
  // ==========================================================================

  function renderEventTabContent() {
    const event = state.currentEventData;
    if (!event) return;

    // 1. Aba Visão Geral
    // Resumo do que foi contratado e dos dados do cliente. O total vem do
    // próprio quotes (mantido pela trigger recalculate_quote_totals a cada
    // quote_items), e não de uma soma feita aqui.
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
    // Roteiro resumido: marcar concluído e incluir um momento novo. Quem precisa
    // da operação completa (chegada, equipe, mesas ao vivo) sai pelo botão do
    // topo para o módulo de Cerimonial, que trabalha nas mesmas linhas.
    const timelineEl = document.getElementById('event-tab-timeline');
    if (timelineEl) {
      timelineEl.innerHTML = `
        <div class="ceremonial-header-bar">
          <div>
            <h4>Cronograma da Realização</h4>
            <span style="font-size: 10px; color: var(--muted);">${state.ceremonialActivities.length} momentos cadastrados</span>
          </div>
          <button class="text-button" type="button" data-jump-to-ceremonial="${event.id}" style="color: var(--moss); font-size: 10px; font-weight: 700; gap: 4px;">
            <span>Módulo Cerimonial</span><i data-lucide="arrow-up-right"></i>
          </button>
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
    // Convidados com status e, quando existe, a mesa da relação. A mesa de
    // verdade fica no módulo de Cerimonial; aqui é só para conferência rápida.
    const guestsEl = document.getElementById('event-tab-guests');
    if (guestsEl) {
      // Os quatro contadores saem de três varreduras do mesmo array, e não de um
      // reduce com acumulador: a lista tem poucas dezenas de linhas e ler três
      // vezes é mais barato do que manter a contagem em dia a cada render.
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
            // Duas fontes de "mesa" e só uma é mostrada: o guest.event_tables, que vem do
            // vínculo real, e o guest.notes, que é o texto livre digitado no
            // cadastro rápido ("Mesa 3 - família do noivo"). Quem é cadastrado
            // pela lista resumida cai no notes; quem foi para o Cerimonial tem
            // o vínculo e usa a relação.
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

                // O status da linha é também classe do <select>, para o CSS pintar a cor. A
                // troca dispara o listener de 'change' no document, que é quem
                // grava no banco.
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
  //
  // Estas ações escrevem nas mesmas tabelas que o módulo de Cerimonial usa,
  // então a mudança feita aqui chega à tela de lá pelo Realtime — e a de lá
  // pode ter sido feita por outra pessoa, no celular dela. A única confirmação
  // visual é a de excluir um momento; quem pode gravar continua sendo a RLS,
  // e o erro de escrita aparece no console e, quando há alert, para o usuário.
  // ==========================================================================

  // Inclui um momento no roteiro do evento aberto. O id do evento nunca vem do
  // formulário: sai de state.currentEventId, que a ficha preencheu ao abrir.
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
      // A posição vai para o fim do roteiro. (event_id, position) é único, então a
      // contagem do cache local serve: só quebra se duas pessoas incluírem
      // momentos ao mesmo tempo, e aí o banco recusa o segundo INSERT.
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

      // Cadastra automaticamente o(s) responsável(is) na equipe do cerimonial
      // Digitar o nome no roteiro já cria a pessoa na equipe do evento, porque
      // é assim que a equipe cresce no dia a dia: quem aparece no roteiro está
      // escalado. Separar por vírgula ou ponto e vírgula aceita os dois formatos
      // que aparecem na digitação.
      if (resp) {
        const names = resp.split(/[,;]+/).map(s => s.trim()).filter(Boolean);
        for (const name of names) {
          // Verifica se já existe
          // ilike, e não eq: "ana" e "Ana" são a mesma pessoa, e duplicar a
          // linha só faria a equipe parecer maior do que é.
          const { data: existing } = await sb
            .from('ceremonialistas')
            .select('id')
            .eq('event_id', state.currentEventId)
            .ilike('name', name)
            .limit(1);
          if (existing && existing.length > 0) continue;
          await sb.from('ceremonialistas').insert({ event_id: state.currentEventId, name });
        }
      }

      await loadEventFullDetails(state.currentEventId);
    } catch (err) {
      console.error('Erro ao adicionar momento:', err);
      alert(`Erro: ${err.message}`);
    }
  }

  // Marcador do roteiro. Só dois estados são usados aqui (pendente e concluído),
  // embora o enum activity_status aceite mais: alternar é mais rápido do que
  // descer um selete no meio da festa.
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
      // Ajusta o cache e redesenha só a aba. É o caminho curto de propósito: a
      // carga completa custaria quatro consultas para trocar uma palavra.
      current.status = newStatus;
      renderEventTabContent();
    } catch (err) {
      console.error('Erro ao atualizar status da atividade:', err);
    }
  }

  async function deleteActivity(actId) {
    const act = state.ceremonialActivities.find(a => a.id === actId);
    const title = act ? `"${act.title}"` : 'este momento';

    if (!confirm(`Deseja remover ${title} do roteiro?`)) return;

    const sb = getSupabase();
    if (!sb) return;

    try {
      const { error } = await sb.from('ceremonial_activities').delete().eq('id', actId);
      if (error) throw error;

      // Reempacota posições para evitar buracos na sequência
      // A função do banco renumera as posições em 1..N. Sem ela, o próximo
      // momento usaria length + 1 e cairia em um buraco deixado pela exclusão,
      // brigando com a restrição de unicidade de (event_id, position).
      await sb.rpc('pack_ceremonial_activities', { target_event_id: state.currentEventId });

      notify('Momento removido.');
      await loadEventFullDetails(state.currentEventId);
    } catch (err) {
      console.error('Erro ao excluir momento:', err);
    }
  }

  // Convidado cadastrado pela equipe já entra como 'confirmed', e não 'pending'
  // como é o default da tabela. Quem digita o nome aqui já sabe que a pessoa
  // está convidada; 'pending' fica para quem entra pela lista do Cerimonial,
  // ainda sem resposta.
  async function handleAddGuest(e) {
    e.preventDefault();
    const sb = getSupabase();
    if (!sb || !state.currentEventId) return;

    const name = document.getElementById('new-guest-name').value.trim();
    const phone = document.getElementById('new-guest-phone').value.trim() || null;
    // O campo "Mesa / Acompanhantes" vai para guests.notes, e não para o
    // table_id: é texto livre, e o vínculo com a mesa de verdade é feito no
    // módulo de Cerimonial. A aba de convidados usa notes como reserva quando o
    // convidado não tem mesa vinculada.
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

  // Muda o status do convidado pelo <select> da lista. Recarrega a ficha toda em
  // vez de ajustar a linha: é a mudança que a central de avisos acompanha
  // (quem marca "confirmado" faz o aviso do convidado sair), e recarregar deixa
  // os contadores batendo sem lógica extra.
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

  // Sem confirm(): remover convidado é um toque e desfazer seria um segundo
  // caminho só para isso. A exclusão é definitiva para quem não tem o contato em
  // outro lugar.
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

  // Mudança rápida de status pelas pílulas do hero. O cache é corrigido na mão
  // para o hero repintar na hora, e a lista da agenda é recarregada porque o
  // status também é filtro e selo lá.
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
  //
  // O evento não é criado aqui em condições normais: a trigger
  // create_event_when_quote_confirmed do banco insere em events no mesmo UPDATE
  // que leva o orçamento para 'confirmed', e o Realtime já avisa os outros
  // aparelhos. Estas funções cobrem o resto: confirmar o evento cedo demais e o
  // atalho "abrir o evento deste orçamento".
  // ==========================================================================

  // Chamada quando um orçamento vira 'confirmed' por qualquer caminho. Idempotente:
  // primeiro procura o evento que já nasceu da trigger e só cria se não houver.
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
      // maybeSingle e não single: enquanto a trigger roda dentro do UPDATE do
      // orçamento, pode haver um instante em que o evento ainda não apareceu
      // para esta sessão, e um erro aqui não pode derrubar a confirmação.
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

      // O aviso aparece mesmo quando não foi criado nada agora (a trigger já tinha
      // criado): para quem está na tela de orçamentos, a confirmação precisa
      // dizer que o evento está na agenda. A lista é recarregada para o card
      // novo já aparecer sem recarregar a página.
      notify('✨ Orçamento confirmado! Evento gerado com sucesso no calendário de produção.', 4500);
      await loadEvents();

      return createdEvent;
    } catch (err) {
      console.error('Erro na sincronização de evento após confirmação de orçamento:', err);
    }
  }

  // Atalho "ver o evento deste orçamento". A volta pelo quote_id funciona porque
  // a coluna é UNIQUE: no máximo um evento por orçamento, então maybeSingle
  // resolve sem precisar de .limit(1).
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
  //
  // Tudo aqui é escutado no document, e não nos elementos. O motivo é que a
  // lista de eventos, as abas da ficha e o hero são reconstruídos o tempo todo;
  // qualquer listener preso ao elemento morreria no primeiro redesenho. Em
  // troca, cada bloco começa testando um data-atributo para não competir com os
  // cliques dos outros módulos.
  // ==========================================================================

  function setupEventListeners() {
    // 1. Abertura pelo card no dashboard
    // Um único listener para toda a navegação por clique do módulo. A ordem dos
    // blocos importa: cada um devolve logo que casa, e o último que sobrar é o
    // clique no card.
    document.addEventListener('click', e => {
      // O closest sobe até o botão, o link ou o card: o alvo do clique é quase
      // sempre o <i> do Lucide ou o <strong> dentro dele.
      const target = e.target.closest('button, a, [data-event-id]');
      if (!target) return;

      // Botões de navegação / módulos
      // Atalho "eventos" do menu, herdado do app antigo em que a agenda era
      // uma das seções do painel principal.
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

      // Ponte com o módulo de Cerimonial: o botão da aba do cronograma entrega o
      // event_id e quem abre a tela é o outro módulo, que tem o painel pronto.
      if (target.hasAttribute('data-jump-to-ceremonial')) {
        e.preventDefault();
        const eventId = target.dataset.jumpToCeremonial;
        if (window.plenitudeCeremonial && typeof window.plenitudeCeremonial.openCeremonialPanel === 'function') {
          window.plenitudeCeremonial.openCeremonialPanel(eventId);
        }
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

      // Editar usa o objeto que já está em state.events em vez de buscar de novo:
      // o card só existe porque a lista foi renderizada a partir dele.
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
      // Só o atributo `hidden` muda: o conteúdo das três abas já foi renderizado
      // na carga da ficha, então trocar de aba não custa consulta nenhuma. Por
      // isso a aba escolhida não sobrevive a um fechamento da ficha.
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
      // O checkbox do roteiro não tem preventDefault: marcar e desmarcar é
      // justamente o que ele deve fazer, e a re-renderização logo em seguida
      // devolve o checkbox ao estado do banco.
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
    // Os dois formulários da ficha vivem dentro do innerHTML da aba, então são
    // recriados a cada render: listener delegado também aqui, pelo id do form.
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
    // Filtrar é local e instantâneo, então não há debounce: a lista já está em
    // memória e um atraso aqui só apareceria como travamento na digitação.
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
    // Trocar de cliente refaz a lista de orçamentos e descarta a seleção que
    // não serviria mais para o novo cliente.
    const clientSelect = document.getElementById('event-client');
    if (clientSelect) {
      clientSelect.addEventListener('change', e => {
        populateQuoteSelect(e.target.value);
      });
    }

    // 7. Ao selecionar um orçamento no formulário de eventos, preenche data, hora, local automaticamente
    // Os dados do orçamento copiam para o evento, e não o contrário: o orçamento
    // continua sendo a fonte comercial. O nome só é preenchido se estiver
    // vazio, para não sobrescrever o que a pessoa já digitou.
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
    // Ponto de entrada por evento de window: qualquer módulo (ou o console)
    // pode disparar plenitude:quote-confirmed com { quoteId } para gerar o
    // evento. onQuoteConfirmed é idempotente, então chamar duas vezes não cria
    // dois eventos.
    window.addEventListener('plenitude:quote-confirmed', e => {
      const quoteId = e.detail && e.detail.quoteId;
      if (quoteId) {
        onQuoteConfirmed(quoteId);
      }
    });

    // 9. Observar e enriquecer os cards de orçamento com atalhos de evento
    // O formulário de orçamento é do módulo de Orçamentos (app.js), não deste.
    // O listener é o gancho para o caso em que a confirmação acontece lá e o
    // evento precisa aparecer na agenda: só interessa quando o status escolhido
    // é 'confirmed'.
    const quoteFormEl = document.getElementById('quote-form');
    if (quoteFormEl) {
      quoteFormEl.addEventListener('submit', () => {
        const statusVal = document.getElementById('quote-status')?.value;
        const quoteIdVal = document.getElementById('quote-id')?.value;
        if (statusVal === 'confirmed') {
          // Gambiarra de espera: o submit deste lado não espera o app.js
          // terminar de gravar, e o orçamento salvo ainda pode ser o anterior.
          // Espera um instante para ler o id novo — a alternativa seria um
          // evento customizado do módulo de Orçamentos, que não existe hoje.
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
    // Segundo listener de clique, separado do primeiro porque é assíncrono:
    // um listener async não pode conviver com o encadeamento de return do
    // outro, e os dois tentam casar com o mesmo alvo.
    document.addEventListener('click', async e => {
      // Botão de confirmação rápido em um card de orçamento. O stopPropagation
      // impede que o clique suba para a lista e abra alguma coisa por cima.
      const confirmBtn = e.target.closest('[data-confirm-quote-event]');
      if (confirmBtn) {
        e.preventDefault();
        e.stopPropagation();
        const quoteId = confirmBtn.dataset.confirmQuoteEvent;
        const sb = getSupabase();
        if (!sb || !quoteId) return;

        // Confirmar aqui grava o 'confirmed' e chama onQuoteConfirmed, que fica
        // responsável pela criação do evento. O botão fica desabilitado durante
        // a operação para não confirmar o mesmo orçamento duas vezes.
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
          // Checagem defensiva: o botão vive em tela de outro módulo e nada
          // garante que a função loadQuotes continue exposta no window.
          if (window.plenitudeApp && typeof window.plenitudeApp.loadQuotes === 'function') {
            window.plenitudeApp.loadQuotes();
          }

          // Confirmar um orçamento leva direto para a ficha do evento criado: é o fluxo
          // que o usuário espera depois de fechar um negócio.
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

      // Atalho inverso: da lista de orçamentos para a ficha do evento, para quem
      // procura a operação e não o contrato.
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
  //
  // O módulo é anônimo e não exporta nada: ele se pendura em
  // window.plenitudeEvents e é por ali que os outros arquivos o chamam. O
  // realtime.js é o principal consumidor dos recarregadores.
  // ==========================================================================

  // Funções de tela, usadas pelo app.js e pelos cliques do dashboard.
  window.plenitudeEvents = {
    openEventsPanel,
    closeEventsPanel,
    openEventForm,
    openEventDetail,
    openEventByQuoteId,
    onQuoteConfirmed,
    reloadEvents: loadEvents,
    // Chamados por realtime.js quando outro usuário mexe em clientes,
    // orçamentos ou no próprio evento.
    // Os dois juntos, e não a lista inteira: quem mexe no evento só precisa da
    // ficha aberta, quem mexe em cliente ou orçamento só precisa dos seletores.
    reloadLookups: async () => {
      await Promise.all([loadClients(), loadQuotes()]);
    },
    // Só recarrega se houver ficha aberta, e usa o id guardado em state: é este
    // guard que impede a carga de ficar rodando para uma ficha já fechada.
    reloadEventDetail: () => {
      if (state.currentEventId) loadEventFullDetails(state.currentEventId);
    }
  };

  // Duplicação: a cópia (sem id) abre o formulário em modo criação já
  // preenchido. O orçamento vinculado não vai junto, então o novo evento nasce
  // sem orçamento e o salvamento cria um rascunho.
  window.plenitudeDuplicate?.register('event', (id) => {
    const item = state.events.find((event) => event.id === id);
    if (item) openEventForm(window.plenitudeDuplicate.copy(item));
  });

  // Carrega quando o DOM estiver pronto
  // A agenda é carregada no boot mesmo com a tela fechada: é o que alimenta o
  // resumo "eventos para hoje" do dashboard, que o usuário vê antes de abrir
  // qualquer coisa.
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