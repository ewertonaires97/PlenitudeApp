/* ========================================================================== */
/* Realtime – sincronização de todas as telas entre usuários                 */
/* ========================================================================== */
/*
 * Um único canal do Supabase Realtime escuta todas as tabelas e, a cada
 * alteração feita por qualquer usuário, recarrega somente as telas que estão
 * visíveis no momento.
 *
 * Por que recarregar em vez de aplicar o payload?
 *   As telas deste app montam listas com junções feitas no navegador
 *   (cardápios x serviços x imagens, item x categorias, etc.). Aplicar o
 *   `payload.new` exigiria reimplementar cada junção em cada tabela. O refetch
 *   reaproveita os loaders que já existem e não tem como divergir do banco.
 *   O custo é amortizado pelo debounce: salvar um orçamento dispara
 *   UPDATE quotes + DELETE quote_items + N INSERT quote_items, e mesmo assim
 *   a tela recarrega uma única vez.
 *
 * Dependência do banco: a publication `supabase_realtime` do Supabase nasce
 * vazia. Sem a migration 012_realtime_publication.sql nenhuma tabela emite
 * eventos e este arquivo silenciosamente não sincroniza nada.
 */

(function () {
  'use strict';

  const CHANNEL_NAME = 'plenitude-app-v1';
  const DEBOUNCE_MS = 400;

  const state = {
    channel: null,
    dirty: new Set(),
    timer: null,
    running: new Set()
  };

  function getSupabase() {
    return window.plenitudeSupabase || null;
  }

  // Um painel só está de fato visível se ele e todos os seus ancestrais
  // estiverem sem o atributo `hidden` (as telas de apoio ficam aninhadas
  // dentro de #settings-panel).
  function isVisible(selector) {
    const target = document.querySelector(selector);
    if (!target) return false;

    for (let node = target; node; node = node.parentElement) {
      if (node.hidden) return false;
    }
    return true;
  }

  // Devolve uma Promise para que o agendador saiba quando a recarga
  // realmente terminou — sem isso, o bloqueio contra recargas concorrentes
  // seria liberado no mesmo tick e não impediria nada.
  function whenVisible(selector, task) {
    if (!isVisible(selector)) return null;
    return Promise.resolve().then(task);
  }

  const app = () => window.plenitudeApp;
  const events = () => window.plenitudeEvents;
  const ceremonial = () => window.plenitudeCeremonial;

  // Cada tópico agrupa as tabelas que alimentam a mesma tela. Um tópico
  // pendente é executado uma única vez, depois de DEBOUNCE_MS sem novas
  // alterações.
  //
  // A tabela `profiles` está publicada na migration 012 mas não é assinada
  // aqui: nenhum módulo a consulta ainda. Quando o cabeçalho passar a ler o
  // nome do usuário autenticado, basta acrescentar um tópico para ela.
  const TOPICS = [
    {
      // A lista de clientes também alimenta os seletes de Eventos/Cerimonial.
      // Um item novo no orçamento pode ser o serviço de Cerimonial, o que
      // muda quem aparece no seletor de evento do cerimonial.
      name: 'clientes',
      tables: ['clients'],
      reload() {
        return Promise.all([
          whenVisible('#client-panel', () => app()?.loadClients()),
          whenVisible('#event-panel', () => events()?.reloadLookups()),
          whenVisible('#ceremonial-panel', () => ceremonial()?.reloadEventsList())
        ]);
      }
    },
    {
      // Renomear um serviço muda o rótulo dele nos cardápios e nos orçamentos.
      // Marcar ou desmarcar is_ceremonial muda o filtro do seletor de evento.
      name: 'servicos',
      tables: ['services', 'service_materials'],
      reload() {
        return Promise.all([
          whenVisible('#service-panel', () => app()?.loadServices()),
          whenVisible('#menu-panel', () => app()?.loadMenus()),
          whenVisible('#category-panel', () => app()?.loadMenus()),
          whenVisible('#quote-form-panel', () => app()?.loadQuoteReferences()),
          whenVisible('#ceremonial-panel', () => ceremonial()?.reloadCeremonialFilter())
        ]);
      }
    },
    {
      // Imagens de cardápio entram no banco como linhas em menu_images, então
      // upload e exclusão de imagem chegam aqui como INSERT/DELETE comuns.
      name: 'menus',
      tables: ['menus', 'menu_services', 'menu_images', 'menu_categories', 'menu_category_links'],
      reload() {
        return Promise.all([
          whenVisible('#menu-panel', () => app()?.loadMenus()),
          whenVisible('#service-panel', () => app()?.loadMenus()),
          whenVisible('#category-panel', () => app()?.loadMenus()),
          whenVisible('#quote-form-panel', () => app()?.loadQuoteReferences())
        ]);
      }
    },
    {
      // A trigger recalculate_quote_totals roda um UPDATE em quotes a cada
      // linha de quote_items alterada: sem o debounce isso viraria uma rajada.
      // quote_items também define se o evento tem serviço de Cerimonial.
      name: 'orcamentos',
      tables: ['quotes', 'quote_items'],
      reload() {
        return Promise.all([
          whenVisible('#quote-panel', () => app()?.loadQuotes()),
          whenVisible('#event-panel', () => events()?.reloadLookups()),
          whenVisible('#ceremonial-panel', () => ceremonial()?.reloadEventsList())
        ]);
      }
    },
    {
      name: 'estoque',
      tables: ['inventory_items', 'inventory_movements', 'inventory_categories', 'inventory_images', 'inventory_category_links'],
      reload() {
        return Promise.all([
          whenVisible('#inventory-panel', () => app()?.loadInventory()),
          whenVisible('#inventory-category-panel', () => app()?.loadInventoryCategories())
        ]);
      }
    },
    {
      name: 'eventos',
      tables: ['events', 'event_tables'],
      reload() {
        return Promise.all([
          whenVisible('#event-panel', () => Promise.all([
            events()?.reloadEvents(),
            events()?.reloadEventDetail()
          ])),
          whenVisible('#ceremonial-panel', () => ceremonial()?.reloadEventsList())
        ]);
      }
    },
    {
      name: 'cerimonial',
      tables: ['ceremonial_activities', 'ceremonialistas', 'guests'],
      reload() {
        return Promise.all([
          whenVisible('#ceremonial-panel', () => ceremonial()?.reloadCeremonial()),
          whenVisible('#event-panel', () => events()?.reloadEventDetail())
        ]);
      }
    },
    {
      // Modelos padrão de roteiro são compartilhados por toda a equipe, então
      // o painel de modelos acompanha as alterações dos outros usuários.
      name: 'modelos-padrao',
      tables: ['ceremonial_templates', 'ceremonial_template_activities'],
      reload() {
        return Promise.all([
          whenVisible('#ceremonial-panel', () => ceremonial()?.reloadTemplates())
        ]);
      }
    }
  ];

  const TOPIC_BY_TABLE = (() => {
    const index = new Map();
    TOPICS.forEach((topic) => {
      topic.tables.forEach((table) => {
        if (!index.has(table)) index.set(table, []);
        index.get(table).push(topic);
      });
    });
    return index;
  })();

  function markTopicDirty(name) {
    state.dirty.add(name);
  }

  function markDirty(table) {
    const topics = TOPIC_BY_TABLE.get(table);
    if (!topics) return;

    topics.forEach((topic) => markTopicDirty(topic.name));
  }

  function flush() {
    const pending = Array.from(state.dirty);
    state.dirty.clear();
    state.timer = null;

    pending.forEach((name) => {
      const topic = TOPICS.find((entry) => entry.name === name);
      if (!topic) return;

      // Uma carga ainda em andamento não pode engolir a alteração: ela volta
      // para a fila e roda de novo assim que a anterior terminar, senão a tela
      // ficaria desatualizada até a próxima navegação.
      if (state.running.has(name)) {
        markTopicDirty(name);
        return;
      }

      state.running.add(name);
      Promise.resolve()
        .then(() => topic.reload())
        .catch((error) => console.error(`[Realtime] Falha ao recarregar "${name}":`, error))
        .finally(() => {
          state.running.delete(name);
          if (state.dirty.has(name)) schedule();
        });
    });
  }

  function schedule() {
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(flush, DEBOUNCE_MS);
  }

  function start() {
    const sb = getSupabase();
    if (!sb || state.channel) return;

    const channel = sb.channel(CHANNEL_NAME);

    // Uma assinatura por tabela. Tabelas que aparecem em vários tópicos
    // compartilham o mesmo listener: o evento marca todos os tópicos
    // dependentes como pendentes de uma vez, e o debounce decide quantas
    // recarregamentos de tela realmente saem.
    TOPICS.forEach((topic) => {
      topic.tables.forEach((table) => {
        channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
          markDirty(table);
          schedule();
        });
      });
    });

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.info('[Realtime] Sincronização em tempo real ativa.');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('[Realtime] Falha ao assinar o canal — a aplicação continuará atualizando apenas ao recarregar a página.');
      }
    });

    state.channel = channel;
  }

  function stop() {
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
    state.dirty.clear();

    if (state.channel) {
      getSupabase()?.removeChannel(state.channel);
      state.channel = null;
    }
  }

  // Sem o teardown no logout, o WebSocket sobrevive ao signOut com o token
  // antigo e continua consumindo eventos de outra sessão.
  function bindAuth() {
    const sb = getSupabase();
    if (!sb) return;

    sb.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        stop();
        return;
      }
      start();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindAuth);
  } else {
    bindAuth();
  }

  window.plenitudeRealtime = {
    start,
    stop,
    status: () => (state.channel ? 'ativo' : 'inativo')
  };

})();
