/* ========================================================================== */
/* CENTRAL DE AVISOS                                                          */
/*                                                                           */
/* O sino do topo é a única coisa do app que aparece em todas as telas sem    */
/* levar a lugar nenhum: ele contava proposta vencendo e, sem nada pendente,  */
/* abria um toast dizendo que a tela não existia. Este arquivo transforma o   */
/* sino em uma central. Cada módulo registra o que sabe que precisa de uma    */
/* decisão, e a central reúne tudo, ordena por urgência e abre a tela onde o */
/* assunto é resolvido.                                                      */
/*                                                                           */
/* Nada é gravado. Cada aviso é derivado de uma coluna que já existe e some   */
/* sozinho quando o assunto é resolvido — é o mesmo recorte do lembrete de    */
/* sinal, que resolve a cobrança sem nenhuma tabela de notificações. Um       */
/* "lido" guardado em banco seria pior: marcaria a leitura, não a resolução, */
/* e o contador passaria a avisar de um problema que ninguém mais tem.        */
/*                                                                           */
/* Uma fonte se registra com uma permissão e uma função que devolve os        */
/* avisos. Quem registra é o módulo dono do dado: os orçamentos e o estoque    */
/* saem do app.js, os convidados e o roteiro saem do events.js. Assim a      */
/* central não precisa saber nada sobre orçamento, sinal ou convidado, e     */
/* cada módulo continua sendo o único dono da regra do seu recorte.          */
/* ========================================================================== */
(function () {
  'use strict';

  // Duas urgências só. "Agora" é o que já quebrou alguma coisa — o prazo da
  // proposta passou, o evento é hoje e ainda tem convidado sem responder.
  // "Em breve" é o que dá para resolver com calma. Uma terceira faixa exigiria
  // um terceiro tipo de ação, e o que existe no app resolve em duas.
  const SEVERITIES = [
    { id: 'critical', label: 'Agora' },
    { id: 'warn', label: 'Em breve' }
  ];
  const RANK = { critical: 0, warn: 1 };

  // A central lê direto do banco o que não está em memória em nenhum módulo
  // (convidados e itens de estoque só são carregados quando a tela deles abre).
  // O intervalo evita que duas fontes asking ao mesmo tempo virem duas
  // consultas; o realtime ainda força a recarga quando algo muda de verdade.
  const REFRESH_TTL_MS = 10000;
  // Um convidado sem responder só vira aviso perto do evento: três meses antes
  // a lista de confirmados ainda vai mudar, e cobrar cedo cansa o contato.
  const GUEST_WINDOW_DAYS = 7;
  // Cada refresh forçado invalida os caches das fontes, não só o resultado
  // montado. Sem isto o force do realtime não passaria adiante: a passagem
  // recolheria de novo e as duas fontes com cache devolveriam o recorte velho,
  // que é justamente o que o realtime veio corrigir.
  let generation = 0;

  const SOURCES = [];
  // O que cada botão da lista faz. Vive fora do render porque o botão na tela
  // carrega só uma chave: guardar a função no dataset exigiria serializar
  // função em atributo, e o closure do módulo é mais simples de conferir.
  const actions = new Map();
  // Recolhido na última passagem, para o painel não precisar recoletar ao abrir.
  let collected = [];
  let refreshedAt = 0;
  let inFlight = null;

  const panel = document.querySelector('#notice-panel');
  const panelList = document.querySelector('#notice-list');
  const panelSummary = document.querySelector('#notice-summary');
  const bell = document.querySelector('#notice-bell');
  const bellCount = document.querySelector('#notice-count');
  const bellDot = document.querySelector('#notice-dot');

  function getSupabase() {
    return window.plenitudeSupabase || (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));
  }

  function localToday() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
  }

  function addDays(value, days) {
    const date = new Date(`${value}T12:00:00`);
    date.setDate(date.getDate() + days);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }

  function daysUntil(value) {
    if (!value) return null;
    const target = new Date(`${String(value).slice(0, 10)}T12:00:00`);
    if (Number.isNaN(target.getTime())) return null;
    const today = new Date(`${localToday()}T12:00:00`);
    return Math.round((target - today) / 86400000);
  }

  function formatDateBR(value) {
    if (!value) return '';
    const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('pt-BR');
  }

  // Quem não tem a permissão da fonte não vê nada dela: nem o aviso, nem a
  // contagem. O mesmo motivo do sino antigo — o número não pode revelar que
  // existe proposta vencendo para quem jamais abriria a tela de Orçamentos.
  function permitted(source) {
    const access = window.plenitudePermissions;
    if (!access) return false;
    // `permissions` são alternativas: convidados são lidos por quem tem Eventos
    // ou Cerimonial, porque as duas telas mostram a mesma lista de gente.
    return source.permissions.some((permission) => access.can(permission));
  }

  function register(source) {
    if (!source || !source.id || typeof source.collect !== 'function') return;
    SOURCES.push({ permissions: [], ...source });
  }

  /* ========================================================================== */
  /* ESTOQUE ABAIXO DO MÍNIMO                                                  */
  /* O item some da lista quando alguém repõe, então não há nada para          */
  /* marcar como resolvido. A consulta é estreita de propósito: só as colunas   */
  /* do recorte, e não a lista com imagem e categoria que a tela de Estoque     */
  /* carrega. É a única leitura da central que não vem de um módulo, porque o   */
  /* item só existe em memória enquanto a tela dele estiver aberta.             */
  /* ========================================================================== */
  let stockCache = { at: 0, generation: -1, alerts: [] };

  async function collectLowStock() {
    const sb = getSupabase();
    if (!sb) return [];
    if (stockCache.generation === generation && Date.now() - stockCache.at < REFRESH_TTL_MS) return stockCache.alerts;

    const { data, error } = await sb
      .from('inventory_items')
      .select('id, name, unit, quantity, minimum_quantity')
      .eq('active', true);
    // Falhou: não guarda o resultado, para a próxima passagem tentar de novo em
    // vez de repetir o vazio por todo o intervalo.
    if (error) return [];

    const low = (data || []).filter((item) => Number(item.minimum_quantity) > 0 && Number(item.quantity) <= Number(item.minimum_quantity));
    // Vários itens viram um aviso só. Trinta itens abaixo do mínimo são um
    // problema de compra, e trinta linhas na central só fariam o sino
    // parecer piegas.
    const alerts = low.length ? [{
      id: `estoque:${low.length}`,
      severity: 'warn',
      icon: 'boxes',
      title: low.length === 1 ? '1 item abaixo do estoque mínimo' : `${low.length} itens abaixo do estoque mínimo`,
      detail: low.slice(0, 3).map((item) => `${item.name} · ${item.quantity}/${item.minimum_quantity} ${item.unit}`).join(' · '),
      action: { label: 'Ver estoque', run: () => window.plenitudeApp?.openInventory?.({ lowOnly: true }) }
    }] : [];

    stockCache = { at: Date.now(), generation, alerts };
    return alerts;
  }

  register({
    id: 'estoque',
    label: 'Estoque',
    permissions: ['estoque'],
    collect: collectLowStock
  });

  /* ========================================================================== */
  /* CONVIDADOS SEM CONFIRMAR                                                  */
  /* O evento é o que dá o prazo: um convidado pendente de um evento que       */
  /* acontece hoje é uma mesa sem confirmar amanhã. Antes disso é só uma       */
  /* lista de gente que ainda vai responder.                                   */
  /* ========================================================================== */
  let guestCache = { at: 0, generation: -1, alerts: [] };

  async function collectPendingGuests() {
    const sb = getSupabase();
    if (!sb) return [];
    if (guestCache.generation === generation && Date.now() - guestCache.at < REFRESH_TTL_MS) return guestCache.alerts;

    const today = localToday();
    const { data: events, error: eventsError } = await sb
      .from('events')
      .select('id, name, event_date, status')
      .gte('event_date', today)
      .lte('event_date', addDays(today, GUEST_WINDOW_DAYS))
      .neq('status', 'cancelled')
      .neq('status', 'completed');
    if (eventsError || !events?.length) {
      guestCache = { at: Date.now(), generation, alerts: [] };
      return guestCache.alerts;
    }

    const { data: guests, error: guestsError } = await sb
      .from('guests')
      .select('event_id, status')
      .in('event_id', events.map((event) => event.id))
      .eq('status', 'pending');
    if (guestsError) return [];

    const pendingByEvent = new Map();
    (guests || []).forEach((guest) => {
      pendingByEvent.set(guest.event_id, (pendingByEvent.get(guest.event_id) || 0) + 1);
    });

    const alerts = events.map((event) => {
      const pending = pendingByEvent.get(event.id) || 0;
      if (!pending) return null;
      const days = daysUntil(event.event_date);
      return {
        id: `convidados:${event.id}`,
        // O evento é hoje: a lista de mesa fecha antes do evento começar, e
        // quem não respondeu mais tarde já não tem de quem perguntar.
        severity: days === 0 ? 'critical' : 'warn',
        icon: 'users-round',
        title: pending === 1 ? '1 convidado sem confirmar' : `${pending} convidados sem confirmar`,
        detail: `${event.name} · ${days === 0 ? 'evento hoje' : days === 1 ? 'evento amanhã' : `evento em ${days} dias`} · ${formatDateBR(event.event_date)}`,
        action: { label: 'Abrir evento', run: () => window.plenitudeEvents?.openEventDetail?.(event.id) }
      };
    }).filter(Boolean);

    guestCache = { at: Date.now(), generation, alerts };
    return alerts;
  }

  register({
    id: 'convidados',
    label: 'Convidados',
    // Eventos e Cerimonial mostram a mesma lista de convidados, e a política do
    // banco libera a leitura para os dois níveis: quem tem um tem o outro.
    permissions: ['eventos', 'cerimonial'],
    collect: collectPendingGuests
  });

  /* ========================================================================== */
  /* RECOLHER, ORDENAR E DESENHAR                                               */
  /* ========================================================================== */
  async function collectAll() {
    const visible = SOURCES.filter(permitted);
    const collectedFromSources = await Promise.all(visible.map(async (source) => {
      try {
        const alerts = await source.collect();
        return Array.isArray(alerts) ? alerts.filter(Boolean) : [];
      } catch (error) {
        // Uma fonte que falha não pode derrubar as outras: perder o aviso de
        // estoque é ruim, perder também o de sinal seria uma cobrança perdida.
        console.error(`[Avisos] Falha ao colher "${source.id}":`, error);
        return [];
      }
    }));
    return collectedFromSources.flat();
  }

  function sortAlerts(alerts) {
    return alerts.slice().sort((a, b) => {
      const bySeverity = (RANK[a.severity] ?? 9) - (RANK[b.severity] ?? 9);
      if (bySeverity) return bySeverity;
      return String(a.title).localeCompare(String(b.title), 'pt-BR');
    });
  }

  function renderBell(alerts) {
    const critical = alerts.some((alert) => alert.severity === 'critical');
    if (bellCount) {
      bellCount.textContent = String(alerts.length);
      bellCount.hidden = !alerts.length;
    }
    // O ponto é o que distingue "tem aviso" de "o prazo já passou". A contagem
    // sozinha não diz se é para se apressar ou só olhar.
    if (bellDot) bellDot.hidden = !critical;
    if (bell) {
      bell.classList.toggle('has-alerts', alerts.length > 0);
      bell.classList.toggle('has-critical', critical);
      bell.setAttribute('aria-label', alerts.length ? `Avisos (${alerts.length})` : 'Avisos');
    }
  }

  function renderPanel(alerts) {
    if (!panelList) return;
    if (panelSummary) {
      panelSummary.textContent = alerts.length
        ? `${alerts.length} ${alerts.length === 1 ? 'assunto pede' : 'assuntos pedem'} uma decisão. Cada aviso abre a tela onde ele é resolvido.`
        : '';
    }
    if (!alerts.length) {
      panelList.innerHTML = '<div class="empty-clients">Nada pendente. Sinal recebido, estoque acima do mínimo e todo convidado do evento desta semana respondeu.</div>';
      return;
    }

    // A lista é reescrita do zero, então as chaves da passada anterior não
    // pertencem mais a nenhum botão: sem esta limpeza elas ficariam guardadas
    // até a próxima abertura, segurando o closure de um aviso que saiu da tela.
    actions.clear();
    let html = '';
    SEVERITIES.forEach((severity) => {
      const group = alerts.filter((alert) => alert.severity === severity.id);
      if (!group.length) return;
      html += `<h3 class="notice-group is-${severity.id}"><i data-lucide="${severity.id === 'critical' ? 'triangle-alert' : 'clock'}"></i>${severity.label}</h3>`;
      html += group.map((alert, index) => {
        const key = `${severity.id}-${index}`;
        actions.set(key, alert.action?.run);
        return `<article class="notice-row is-${severity.id}">
          <span class="notice-icon"><i data-lucide="${escapeHTML(alert.icon || 'bell')}"></i></span>
          <div class="notice-copy"><strong>${escapeHTML(alert.title)}</strong><span>${escapeHTML(alert.detail || '')}</span></div>
          ${alert.action ? `<button class="client-action-button" type="button" data-notice-action="${key}"><span>${escapeHTML(alert.action.label)}</span></button>` : ''}
        </article>`;
      }).join('');
    });
    panelList.innerHTML = html;
    if (window.lucide?.createIcons) window.lucide.createIcons();
  }

  function render(alerts) {
    collected = sortAlerts(alerts);
    renderBell(collected);
    // Com o painel fechado só o sino importa. A lista é montada na hora em que
    // alguém está olhando para ela.
    if (panel && !panel.hidden) renderPanel(collected);
  }

  // Recarrega a central. Duas passagens ao mesmo tempo produziriam duas listas
  // e dois renders do sino, e a segunda-usada-para-cima seria a velha, então a
  // chamada enquanto outra corre devolve a mesma promessa: `open()` dispara uma
  // recarga sem esperar, e o refresh logo em seguida — o do realtime, o da
  // virada do dia — precisa enxergar o resultado novo, não o de antes dele.
  function refresh(options = {}) {
    if (inFlight) return inFlight;
    if (options.force) generation += 1;
    const current = generation;
    // O corpo só roda no próximo microtask, e não junto com a atribuição: o
    // atalho do TTL resolve sem consultar nada, e nesse caso o finally
    // zeraria inFlight antes de a variável receber a promessa, deixando-a
    // apontando para uma recarga velha já resolvida e travando as próximas.
    inFlight = Promise.resolve().then(async () => {
      try {
        if (!options.force && Date.now() - refreshedAt < REFRESH_TTL_MS) {
          render(collected);
          return collected;
        }
        const alerts = await collectAll();
        // Uma passagem forçada começou durante esta: o resultado dela é mais
        // novo, e desenhar o desta agora mostraria um número que já foi
        // corrigido.
        if (current !== generation) return collected;
        // Devolve o que foi desenhado, e não a lista crua: quem chama o refresh
        // recebe a mesma ordem que está no sino e na central.
        render(alerts);
        refreshedAt = Date.now();
        return collected;
      } finally {
        inFlight = null;
      }
    });
    return inFlight;
  }

  function open() {
    if (!panel) return;
    panel.hidden = false;
    renderPanel(collected);
    if (window.lucide?.createIcons) window.lucide.createIcons();
    // Pode haver algo novo desde a última passagem — outro usuário marcou um
    // convidado, o item de estoque foi reposto — e abrir a central com o número
    // velho seria pior do que esperar meio segundo pela lista certa.
    refresh({ force: true });
  }

  function close() {
    if (panel) panel.hidden = true;
  }

  bell?.addEventListener('click', open);
  document.querySelectorAll('[data-close-notices]').forEach((button) => button.addEventListener('click', close));
  panel?.addEventListener('click', (event) => { if (event.target === panel) close(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && panel && !panel.hidden) close(); });
  panelList?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-notice-action]');
    if (!button) return;
    actions.get(button.dataset.noticeAction)?.();
  });

  window.plenitudeAlerts = {
    register,
    refresh,
    open,
    close,
    // O que a central sabe agora. Usado no teste e por quem quiser desenhar a
    // mesma lista em outro lugar sem poder registrar uma fonte nova.
    all: () => collected.slice()
  };
})();