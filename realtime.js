// ==========================================================================
// Plenitude Realizações - Módulo Global de Sincronização em Tempo Real (Realtime)
// Garante que todas as alterações feitas por qualquer usuário sejam refletidas
// instantaneamente em todos os navegadores/dispositivos conectados.
// ==========================================================================

(() => {
  'use strict';

  function getSupabase() {
    return window.plenitudeSupabase || (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
  }

  // Estado do Realtime
  const state = {
    channel: null,
    status: 'disconnected', // 'connected', 'connecting', 'disconnected', 'error'
    reconnectTimer: null,
    reconnectAttempts: 0,
    maxReconnectAttempts: 10,
    lastSyncTimestamp: null
  };

  // Utilitário de debounce para evitar re-consultas em rajada (batch operations)
  function debounce(fn, wait = 120) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        try {
          fn.apply(this, args);
        } catch (err) {
          console.error('[Realtime Debounce Error]', err);
        }
      }, wait);
    };
  }

  // ==========================================================================
  // Disparadores de Atualização de UI por Módulo (com debounce)
  // ==========================================================================

  const refreshClients = debounce(() => {
    console.info('[Realtime Sync] Atualizando clientes...');
    if (window.plenitudeApp && typeof window.plenitudeApp.loadClients === 'function') {
      window.plenitudeApp.loadClients();
    }
    if (window.plenitudeEvents && typeof window.plenitudeEvents.reloadClients === 'function') {
      window.plenitudeEvents.reloadClients();
    }
  }, 100);

  const refreshServices = debounce(() => {
    console.info('[Realtime Sync] Atualizando serviços...');
    if (window.plenitudeApp && typeof window.plenitudeApp.loadServices === 'function') {
      window.plenitudeApp.loadServices();
    }
  }, 100);

  const refreshMenus = debounce(() => {
    console.info('[Realtime Sync] Atualizando cardápios e categorias...');
    if (window.plenitudeApp && typeof window.plenitudeApp.loadMenus === 'function') {
      window.plenitudeApp.loadMenus();
    }
    if (window.plenitudeApp && typeof window.plenitudeApp.loadServices === 'function') {
      window.plenitudeApp.loadServices();
    }
  }, 100);

  const refreshInventory = debounce(() => {
    console.info('[Realtime Sync] Atualizando estoque...');
    if (window.plenitudeApp && typeof window.plenitudeApp.loadInventory === 'function') {
      window.plenitudeApp.loadInventory();
    }
  }, 100);

  const refreshQuotes = debounce(() => {
    console.info('[Realtime Sync] Atualizando orçamentos...');
    if (window.plenitudeApp && typeof window.plenitudeApp.loadQuotes === 'function') {
      window.plenitudeApp.loadQuotes();
    }
    if (window.plenitudeEvents && typeof window.plenitudeEvents.reloadQuotes === 'function') {
      window.plenitudeEvents.reloadQuotes();
    }
  }, 100);

  const refreshEvents = debounce((payload) => {
    console.info('[Realtime Sync] Atualizando eventos...');
    if (window.plenitudeEvents && typeof window.plenitudeEvents.reloadEvents === 'function') {
      window.plenitudeEvents.reloadEvents();
    }
    if (window.plenitudeCeremonial && typeof window.plenitudeCeremonial.reloadEvents === 'function') {
      window.plenitudeCeremonial.reloadEvents();
    }
    
    // Se a tela de detalhes de um evento específico estiver aberta, recarrega
    const eventId = payload?.new?.id || payload?.old?.id;
    if (window.plenitudeEvents && typeof window.plenitudeEvents.reloadEventDetails === 'function') {
      window.plenitudeEvents.reloadEventDetails(eventId);
    }
    if (window.plenitudeCeremonial && typeof window.plenitudeCeremonial.reloadCeremonial === 'function') {
      window.plenitudeCeremonial.reloadCeremonial(eventId);
    }
  }, 100);

  const refreshCeremonial = debounce((payload) => {
    console.info('[Realtime Sync] Atualizando cerimonial...');
    const eventId = payload?.new?.event_id || payload?.old?.event_id;
    if (window.plenitudeCeremonial && typeof window.plenitudeCeremonial.reloadCeremonial === 'function') {
      window.plenitudeCeremonial.reloadCeremonial(eventId);
    }
    if (window.plenitudeEvents && typeof window.plenitudeEvents.reloadEventDetails === 'function') {
      window.plenitudeEvents.reloadEventDetails(eventId);
    }
  }, 80);

  // ==========================================================================
  // Atualizador do Indicador Visual de Conexão na Topbar
  // ==========================================================================

  function updateStatusIndicator(status) {
    state.status = status;
    const pill = document.getElementById('realtime-status-pill');
    if (!pill) return;

    pill.className = `realtime-status-pill ${status}`;

    const textEl = pill.querySelector('.realtime-status-text');
    if (textEl) {
      switch (status) {
        case 'connected':
          textEl.textContent = 'Ao vivo';
          pill.title = 'Sincronização em tempo real ativa. Todas as alterações aparecem imediatamente.';
          break;
        case 'connecting':
          textEl.textContent = 'Conectando...';
          pill.title = 'Conectando à sincronização em tempo real...';
          break;
        case 'error':
        case 'disconnected':
          textEl.textContent = 'Reconectar';
          pill.title = 'Desconectado do tempo real. Clique para reconectar agora.';
          break;
      }
    }
  }

  // ==========================================================================
  // Iniciar e Parar o Canal Global de Realtime
  // ==========================================================================

  function startRealtime() {
    const sb = getSupabase();
    if (!sb) {
      console.warn('[Realtime] Supabase client não encontrado. Aguardando...');
      return;
    }

    // Se já estiver conectado, não recria
    if (state.channel && state.status === 'connected') {
      return;
    }

    stopRealtime();
    updateStatusIndicator('connecting');

    const channelName = 'plenitude-global-sync-' + Math.random().toString(36).substring(2, 7);

    try {
      state.channel = sb.channel(channelName)
        // ── 1. Clientes ────────────────────────────────────────────────
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'clients' },
          (payload) => refreshClients(payload)
        )
        // ── 2. Serviços e Materiais ─────────────────────────────────────
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'services' },
          (payload) => refreshServices(payload)
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'service_materials' },
          (payload) => refreshServices(payload)
        )
        // ── 3. Cardápios, Imagens e Categorias de Cardápio ─────────────
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'menus' },
          (payload) => refreshMenus(payload)
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'menu_services' },
          (payload) => refreshMenus(payload)
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'menu_images' },
          (payload) => refreshMenus(payload)
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'menu_categories' },
          (payload) => refreshMenus(payload)
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'menu_category_links' },
          (payload) => refreshMenus(payload)
        )
        // ── 4. Estoque, Imagens, Categorias e Movimentações ─────────────
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'inventory_items' },
          (payload) => refreshInventory(payload)
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'inventory_images' },
          (payload) => refreshInventory(payload)
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'inventory_categories' },
          (payload) => refreshInventory(payload)
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'inventory_category_links' },
          (payload) => refreshInventory(payload)
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'inventory_movements' },
          (payload) => refreshInventory(payload)
        )
        // ── 5. Orçamentos e Itens do Orçamento ──────────────────────────
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'quotes' },
          (payload) => refreshQuotes(payload)
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'quote_items' },
          (payload) => refreshQuotes(payload)
        )
        // ── 6. Eventos ──────────────────────────────────────────────────
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'events' },
          (payload) => refreshEvents(payload)
        )
        // ── 7. Cerimonial (Atividades, Convidados, Equipe, Mesas) ─────────
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'ceremonial_activities' },
          (payload) => refreshCeremonial(payload)
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'guests' },
          (payload) => refreshCeremonial(payload)
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'ceremonialistas' },
          (payload) => refreshCeremonial(payload)
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'event_tables' },
          (payload) => refreshCeremonial(payload)
        )
        // ── 8. Inscrição do Canal ───────────────────────────────────────
        .subscribe((status, err) => {
          if (status === 'SUBSCRIBED') {
            console.info('[Realtime] Sincronização em tempo real CONECTADA com sucesso.');
            state.reconnectAttempts = 0;
            state.lastSyncTimestamp = Date.now();
            updateStatusIndicator('connected');
          } else if (status === 'CLOSED') {
            console.warn('[Realtime] Canal fechado.');
            updateStatusIndicator('disconnected');
            scheduleReconnect();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.error('[Realtime] Erro no canal de sincronização:', err || status);
            updateStatusIndicator('error');
            scheduleReconnect();
          }
        });
    } catch (err) {
      console.error('[Realtime] Falha ao configurar canal:', err);
      updateStatusIndicator('error');
      scheduleReconnect();
    }
  }

  function stopRealtime() {
    clearTimeout(state.reconnectTimer);
    if (state.channel) {
      const sb = getSupabase();
      if (sb && typeof sb.removeChannel === 'function') {
        try {
          sb.removeChannel(state.channel);
        } catch (e) {
          console.warn('[Realtime] Aviso ao remover canal:', e);
        }
      }
      state.channel = null;
    }
    updateStatusIndicator('disconnected');
  }

  function scheduleReconnect() {
    clearTimeout(state.reconnectTimer);
    if (state.reconnectAttempts >= state.maxReconnectAttempts) {
      console.warn('[Realtime] Limite de tentativas de reconexão atingido.');
      return;
    }

    state.reconnectAttempts += 1;
    const delay = Math.min(1000 * Math.pow(1.5, state.reconnectAttempts), 15000);
    console.info(`[Realtime] Agendando reconexão (${state.reconnectAttempts}/${state.maxReconnectAttempts}) em ${Math.round(delay / 1000)}s...`);

    state.reconnectTimer = setTimeout(() => {
      startRealtime();
    }, delay);
  }

  // ==========================================================================
  // Sincronização Global de Todos os Módulos (Full Refresh)
  // ==========================================================================

  function refreshAll() {
    console.info('[Realtime] Realizando sincronização completa de todos os módulos...');
    refreshClients();
    refreshServices();
    refreshMenus();
    refreshInventory();
    refreshQuotes();
    refreshEvents();
    refreshCeremonial();
  }

  // ==========================================================================
  // Inicialização e Observadores de Ciclo de Vida
  // ==========================================================================

  function init() {
    const sb = getSupabase();

    // 1. Ouvir mudanças de autenticação
    if (sb && sb.auth) {
      sb.auth.getSession().then(({ data }) => {
        if (data && data.session) {
          startRealtime();
        }
      });

      sb.auth.onAuthStateChange((_event, session) => {
        if (session) {
          startRealtime();
        } else {
          stopRealtime();
        }
      });
    }

    // 2. Ouvir retorno à aba do navegador (quando volta de outra aba ou app)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        console.info('[Realtime] Aba voltou ao foco. Verificando sincronização...');
        if (state.status !== 'connected') {
          startRealtime();
        } else {
          // Atualiza dados caso tenha havido atualizações em background
          refreshAll();
        }
      }
    });

    // 3. Ouvir reconexão de internet
    window.addEventListener('online', () => {
      console.info('[Realtime] Rede conectada (online). Reiniciando sincronização...');
      startRealtime();
      refreshAll();
    });

    window.addEventListener('offline', () => {
      console.warn('[Realtime] Dispositivo offline.');
      updateStatusIndicator('disconnected');
    });

    // 4. Clique manual no pill de status para forçar reconexão/sincronização
    document.addEventListener('click', (e) => {
      const pill = e.target.closest('#realtime-status-pill');
      if (pill) {
        e.preventDefault();
        console.info('[Realtime] Clique manual no indicador. Forçando sincronização...');
        startRealtime();
        refreshAll();
        if (typeof window.showToast === 'function') {
          window.showToast('Sincronizando dados em tempo real...');
        }
      }
    });
  }

  // ==========================================================================
  // Exposição da API Pública
  // ==========================================================================

  window.plenitudeRealtime = {
    start: startRealtime,
    stop: stopRealtime,
    refreshAll,
    getStatus: () => state.status,
    refreshClients,
    refreshServices,
    refreshMenus,
    refreshInventory,
    refreshQuotes,
    refreshEvents,
    refreshCeremonial
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
