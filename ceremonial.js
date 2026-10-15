// ==========================================================================
// Plenitude Realizações - Módulo de Cerimonial & Operação do Evento
// ==========================================================================
/*
 * O roteiro do dia do evento: o que acontece, em que ordem, quem faz cada
 * coisa, quando os convidados chegam e em qual mesa sentam.
 *
 * A tela tem cinco abas (roteiro, recepção, equipe, mesas e modo ao vivo) sobre
 * um evento escolhido no seletor do topo. Quase todo o HTML é montado por
 * template string a partir de dados que o usuário digitou em cadastros
 * próprios — nome de convidado, nota de mesa, observação de equipe —, então
 * todo texto interpolado passa por sanitizeHtml(). Isso não é defesa contra
 * alguém hostil: é para um nome com "&" ou uma observação com aspa não
 * desmontar o HTML da lista inteira.
 *
 * Nenhuma query deste arquivo cria tabela. O módulo consome as migrations de
 * cerimonial (009 em diante, com modelos padrão e reordenação em 013/014) e,
 * quando o banco está sem elas, showSchemaError() traduz a mensagem do
 * Postgres em vez de mostrar erro cru ao usuário.
 *
 * A trava de evento já realizado (isEventLocked) é uma regra de interface:
 * os botões somem e as escritas abortam no primeiro blockIfLocked(). Quem
 * garante a regra no banco é o RLS, não este arquivo.
 */

(() => {
  'use strict';

  // ==========================================================================
  // ESTADO DO MÓDULO E CLIENTE SUPABASE
  // ==========================================================================
  // Um único objeto guarda tudo o que a tela mostra: o evento escolhido e as
  // listas que pertencem a ele. Não existe cache por aba — cada render lê
  // daqui, e é por isso que recarregar o evento atualiza a tela inteira de uma
  // vez, sem depender de quem chamou.

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
    // Qual dos dois papéis o modal está cumprindo: criar (null) ou editar (id).
    // Os formulários carregam o id num campo hidden próprio; estes campos são
    // o espelho para a interface, e por isso são limpos no close de cada modal.
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
    templateDrag: { activityId: null, beforeId: null, started: false, row: null, pointerY: 0 },
    // Habilita drag-and-drop do roteiro (padrão desligado para evitar arrastes acidentais)
    dragEnabled: false
  };

  // ==========================================================================
  // AVISOS FLUTUANTES E ÍCONES
  // ==========================================================================
  // Existe um único toast na tela e o timer fica pendurado na própria função:
  // um segundo aviso antes do primeiro sumir substitui o anterior em vez de
  // empilhar dois avisos, que é o comportamento esperado numa sala de evento
  // com gente clicando sem parar.

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

  // Todo HTML gerado aqui é escrito com <i data-lucide="...">, que o Lucide
  // troca por <svg> quando roda. Como cada render faz innerHTML de novo, os
  // ícones precisam ser recriados depois de desenhar qualquer lista — por isso
  // quase todo render termina em refreshIcons().
  function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  // ==========================================================================
  // DATAS, HORAS E A TRAVA DE EVENTO JÁ REALIZADO
  // ==========================================================================
  // Datas do Postgres chegam como 'YYYY-MM-DD'. new Date('2026-05-04') é lida
  // como UTC e, no Brasil (UTC-3), vira o dia 3 à noite — o que jogaria a
  // contagem de dias e a comparação com "hoje" um dia para trás. Por isso
  // parseDateOnly monta a data com os números soltos, no fuso do navegador.

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

  // O banco guarda horário como 'HH:MM:SS'; o input de hora do formulário
  // trabalha com 'HH:MM'. O slice resolve os dois sem passar por Date, que
  // interpretaria '18:00' como data inválida.
  function formatTimeOnly(timeStr) {
    if (!timeStr) return '';
    return timeStr.slice(0, 5);
  }

  // Ao contrário do horário do roteiro, arrived_at é um carimbo de tempo real
  // (timestamptz). Aqui é legível usar o fuso do aparelho: o que importa é a
  // hora em que a pessoa chegou, vista do relógio que está na recepção.
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

    // Zerar as duas horas antes de subtrair faz a divisão cair sempre em dias
    // inteiros. Sem isso, um evento às 21h de amanhã daria 0,4 dia e o "hoje"
    // apareceria para quem está na véspera.
    const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return { text: 'É HOJE!', type: 'today' };
    if (diffDays === 1) return { text: 'Amanhã', type: 'soon' };
    if (diffDays > 1 && diffDays <= 7) return { text: `Em ${diffDays} dias`, type: 'soon' };
    if (diffDays > 7) return { text: `Em ${diffDays} dias`, type: 'future' };
    if (diffDays === -1) return { text: 'Ontem', type: 'past' };
    return { text: `${Math.abs(diffDays)}d atrás`, type: 'past' };
  }

  // Trava de edição: o cerimonial de um evento que já aconteceu não pode mais
  // ser alterado. A comparação é feita só pela data (sem hora) e a trava vale
  // quando hoje for estritamente maior que a data do evento — no próprio dia
  // do evento a equipe ainda pode registrar o que está acontecendo.
  // O status do evento não entra na conta de propósito: um evento atrasado e
  // ainda não realizado continua sendo o roteiro de trabalho de quem chega
  // para tocar a data no lugar.
  function isEventLocked() {
    const ev = state.selectedEvent;
    if (!ev || !ev.event_date) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const target = parseDateOnly(ev.event_date);
    if (!target || isNaN(target.getTime())) return false;
    target.setHours(0, 0, 0, 0);

    return today.getTime() > target.getTime();
  }

  // O mesmo aviso, em HTML, repetido no topo de cada aba. Existe como função
  // única para que o texto e o ícone não divirjam entre as cinco telas.
  function lockNoticeHtml() {
    return `
      <div class="ceremonial-lock-notice" style="font-size: 12px; color: var(--gold)">
        <i data-lucide="lock" style="width: 12px" ></i>
        <span>Este evento já aconteceu. O cerimonial está em modo somente leitura e não pode mais ser editado.</span>
      </div>
    `;
  }

  // Bloqueia qualquer tentativa de alteração em evento já realizado. Retorna
  // true quando a ação deve ser abortada.
  // Todo handler de escrita começa com `if (blockIfLocked()) return;`. É a
  // segunda linha de defesa: a primeira é o botão sumir no HTML.
  function blockIfLocked() {
    if (isEventLocked()) {
      notify('Este evento já aconteceu. O cerimonial está em modo somente leitura.');
      return true;
    }
    return false;
  }

  // ==========================================================================
  // RESPONSÁVEIS QUE VIRAM EQUIPE
  // ==========================================================================
  // O campo "responsável" do roteiro é texto livre e aceita mais de um nome
  // separado por vírgula. A aba Equipe é outra tabela. Estas duas funções
  // mantêm as duas em sincronia, porque na prática quem nomeia alguém no
  // roteiro está contando com a pessoa aparecendo na equipe.

  // Cadastra automaticamente o(s) responsável(is) informado(s) no cronograma
  // como membros da Equipe de Cerimonial, caso ainda não existam.
  async function ensureResponsibleInTeam(rawNames) {
    if (!rawNames || !state.selectedEventId) return;
    const names = rawNames.split(/[,;]+/).map(s => s.trim()).filter(Boolean);
    if (names.length === 0) return;

    const sb = getSupabase();
    if (!sb) return;

    try {
      // Busca nomes já existentes no evento (insensível a maiúsculas)
      const { data: existing } = await sb
        .from('ceremonialistas')
        .select('name')
        .eq('event_id', state.selectedEventId);
      const existingNames = new Set((existing || []).map(s => (s.name || '').toLowerCase()));

      // O insert acontece um a um, sem transação: quem é responsável por nome no
      // roteiro é texto solto e a consequência de uma linha faltando é pequena,
      // enquanto um INSERT em lote falharia inteiro por causa de um nome.
      for (const name of names) {
        if (existingNames.has(name.toLowerCase())) continue;
        const { error } = await sb
          .from('ceremonialistas')
          .insert({ event_id: state.selectedEventId, name });
        if (error) {
          console.warn('Não foi possível adicionar responsável à equipe:', error);
        } else {
          existingNames.add(name.toLowerCase());
        }
      }
    } catch (err) {
      console.warn('Erro ao cadastrar responsáveis na equipe:', err);
    }
  }

  // Varre todas as atividades do evento e cadastra os responsáveis
  // encontrados na Equipe de Cerimonial, sem duplicatas.
  // Roda a cada carga do evento, antes das mesas e dos convidados: é a rede de
  // segurança para responsáveis que ficaram no roteiro antes de existir a aba
  // Equipe, ou que vieram prontos de um modelo padrão clonado.
  async function scanActivitiesAndRegisterResponsibles() {
    if (!state.selectedEventId) return;
    const allNames = state.activities
      .map(a => a.responsible)
      .filter(Boolean)
      .flatMap(r => r.split(/[,;]+/).map(s => s.trim()))
      .filter(Boolean);

    if (allNames.length === 0) return;

    const sb = getSupabase();
    if (!sb) return;

    try {
      const { data: existing } = await sb
        .from('ceremonialistas')
        .select('name')
        .eq('event_id', state.selectedEventId);
      const existingNames = new Set((existing || []).map(s => (s.name || '').toLowerCase()));

      // O Set é atualizado depois de cada insert para que dois momentos com o
      // mesmo responsável não criem duas linhas iguais na equipe.
      for (const name of allNames) {
        const lower = name.toLowerCase();
        if (existingNames.has(lower)) continue;
        const { error } = await sb
          .from('ceremonialistas')
          .insert({ event_id: state.selectedEventId, name });
        if (error) {
          console.warn('Não foi possível adicionar responsável da varredura:', error);
        } else {
          existingNames.add(lower);
        }
      }
    } catch (err) {
      console.warn('Erro na varredura de responsáveis:', err);
    }
  }

  // ==========================================================================
  // ESCAPE DE TEXTO, WHATSAPP E RÓTULOS DE STATUS
  // ==========================================================================

  // Nome de convidado, observação de mesa e nota de equipe são texto livre e
  // entram em template strings. Sem escapar, um "&" viraria "&amp;" na tela e
  // uma aspa no meio de um atributo fecharia a tag antes da hora.
  function sanitizeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // O wa.me só aceita dígitos com DDI. Quem salva o telefone com parênteses,
  // espaço ou sem o 55 quebraria o link, então o prefixo é garantido aqui: um
  // número que já vem com 55 não o recebe de novo.
  function cleanPhoneForWhatsApp(phone) {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length <= 11 && !digits.startsWith('55')) {
      return `55${digits}`;
    }
    return digits;
  }

  // Os dois mapas de status abaixo caem em 'Pendente' como resposta padrão.
  // Atividade e convidado têm domínios de status diferentes, e o default cobre
  // tanto o valor ausente quanto um status vindo do banco que esta tela não
  // conhece — sem ele, o cartão apareceria sem etiqueta nenhuma.
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
  //
  // As tabelas deste módulo chegam por três tópicos diferentes lá:
  //   - `ceremonial`  -> ceremonial_activities, ceremonialistas, guests
  //   - `eventos`     -> events, event_tables (as mesas mudam aqui)
  //   - `orcamentos`  -> quotes e quote_items, que é o que muda o filtro do
  //                      seletor quando alguém marca um serviço como cerimonial
  // Por isso a lista de callbacks no fim do arquivo: cada tópico do outro lado
  // tem um método de recarga correspondente aqui.

  // ==========================================================================
  // Utilitários de Erro de Schema (orienta usuário sobre migrações pendentes)
  // ==========================================================================

  // O app roda com SQL puro, sem ORM, e o Postgres descreve a falha em texto:
  // "Could not find the column X. of table Y" ou "Could not find the table".
  // Traduzir aqui evita que o usuário veja erro de banco e conclua que o
  // módulo quebrou, quando na verdade só falta aplicar migration.
  // A orientação é sempre a mesma (009, a primeira do módulo): tabelas que só
  // nasceram depois — modelos padrão e roteiros reordenáveis, vindas da 013 e
  // da 014 — recebem a indicação da migration errada.
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
  // A query de longe já traz quotes.quote_items porque o filtro precisa saber,
  // para cada evento, quais serviços foram contratados — trazer isso em uma
  // segunda volta custaria uma requisição por evento.
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
      // hasCeremonial é calculado uma vez e guardado no próprio objeto. O
      // seletor, o filtro e a dica do rodapé leem a mesma marcação, em vez de
      // cada um refazer a travessia dos itens do orçamento.
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
      // A comparação com todayStr é entre duas strings 'YYYY-MM-DD', o que só
      // funciona porque os dois lados estão no mesmo formato. Atenção: o
      // todayStr vem de toISOString(), que é UTC — depois das 21h no Brasil a
      // string já aponta para amanhã, e o "próximo evento" escolhido aqui é o
      // do dia seguinte.
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

  // O filtro é aplicado aqui, no navegador, e não no where do select: a lista
  // completa já foi baixada porque o selector também mostra os eventos sem
  // serviço, apenas desabilitados.
  function visibleEvents() {
    if (!ceremonialFilterIsActive()) return state.events;
    return state.events.filter(event => event.hasCeremonial);
  }

  // O select é reconstruído inteiro a cada chamada, inclusive a lista de
  // opções que o navegador mantinha aberta. O que o usuário digitou nele não
  // existe: a única interação é escolher, e escolher chama selectEvent().
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

  // Lê do banco quais serviços estão marcados como `is_ceremonial`. É o que
  // permite decidir se um evento entra no filtro "só com cerimonial" a partir
  // dos itens do orçamento dele.
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
      // Falha aqui não pode esconder eventos: com o Set vazio o filtro se
      // desliga sozinho e a lista volta a ser completa.
      state.ceremonialServiceIds = new Set();
    }
  }

  async function toggleCeremonialFilter(onlyWithCeremonial) {
    state.onlyCeremonialEvents = onlyWithCeremonial;

    // A lista foi carregada antes do filtro mudar, então a marcação
    // hasCeremonial precisa ser recalculada antes de redesenhar.
    // Só ao ligar: desligado o filtro, todos os eventos são visíveis e a
    // marcação deixa de importar.
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

  // Só um lugar decide qual evento está na tela: a partir daqui todos os
  // renders leem state.selectedEvent, e o reload do realtime passa pelo mesmo
  // caminho para não manter duas fontes de verdade.
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

  // Carrega tudo o que pertence ao evento em cinco consultas em sequência.
  // São sequenciais, e não em paralelo, porque a varredura de responsáveis (3)
  // precisa do roteiro já populado e escreve em state, que o passo 4 e 5 ainda
  // não lêem.
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
        // O `or` traz duas coisas: a equipe deste evento e os cadastros
        // globais (event_id nulo), que são os profissionais que a empresa
        // reutiliza em todos os eventos. Excluir os globais da equipe do
        // evento deixaria a aba quase vazia logo no primeiro evento.
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

      // Auto-cadastra responsáveis das atividades na Equipe (varredura)
      await scanActivitiesAndRegisterResponsibles();

      // 4. Mesas do evento
      const { data: tables, error: tblErr } = await sb
        .from('event_tables')
        .select('*')
        .eq('event_id', eventId)
        .order('table_number', { ascending: true });

      if (tblErr) console.warn('Aviso ao buscar mesas:', tblErr);
      state.tables = tables || [];

      // 5. Convidados do evento com dados da mesa
      // A junção com event_tables vem na própria query: a lista de recepção
      // mostra a mesa de cada convidado e a de mesas conta os presentes, e
      // nenhuma das duas pode esperar uma consulta por linha.
      const { data: guests, error: gstErr } = await sb
        .from('guests')
        .select('*, event_tables ( id, table_number, capacity )')
        .eq('event_id', eventId)
        .order('name', { ascending: true });

      if (gstErr) console.warn('Aviso ao buscar convidados:', gstErr);
      state.guests = guests || [];

      if (feedbackEl) feedbackEl.textContent = '';

      // Atualiza as visualizações
      // Duas renderizações de uma carga só: o Hero tem os contadores (roteiro,
      // presentes, equipe, mesas) e a aba ativa tem a lista detalhada. A aba
      // anterior não é redesenhada — só volta a aparecer quando for escolhida.
      renderCeremonialHero();
      renderActiveTab();
      refreshIcons();
    } catch (err) {
      // Só o passo 1 (o evento) chega aqui: os demais capturam o erro no
      // console e seguem com a lista vazia, porque uma tabela faltando não
      // pode deixar o evento inteiro em branco.
      console.error('Erro ao buscar detalhes do evento:', err);
      if (feedbackEl) feedbackEl.textContent = 'Não foi possível carregar os dados: ' + err.message;
    }
  }

  // ==========================================================================
  // Renderização da Interface
  // ==========================================================================
  // Contrato de todo render*: ler o state, escrever o innerHTML do container
  // recebido e terminar em refreshIcons(). Nenhum deles consulta o banco — quem
  // busca dados é loadSelectedEventDetails(). Por isso qualquer ação que muda
  // algo no banco termina chamando loadSelectedEventDetails() de novo em vez
  // de repintar um pedaço só.

  // Estado sem evento selecionado: o Hero dá a instrução e todas as abas
  // recebem o mesmo aviso. Continua sendo a mesma tela, só esvaziada — nada de
  // esconder o painel inteiro.
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

    const locked = isEventLocked();

    const formattedDate = formatDisplayDate(ev.event_date);
    const formattedTime = formatTimeOnly(ev.event_time);
    const countdown = calculateCountdown(ev.event_date);
    const clientName = ev.clients ? ev.clients.name : 'Cliente não informado';
    const clientPhone = ev.clients ? ev.clients.whatsapp : '';
    const waNumber = cleanPhoneForWhatsApp(clientPhone);

    // Contadores para os mini-cards do Hero
    // Todos calculados aqui, sobre o state já carregado, e não somados durante
    // a renderização das listas: mudar um status reescreve o Hero inteiro e
    // os números precisam sair do mesmo lugar.
    const totalActivities = state.activities.length;
    const completedActivities = state.activities.filter(a => a.status === 'completed').length;
    const timelinePercent = totalActivities > 0 ? Math.round((completedActivities / totalActivities) * 100) : 0;

    const totalGuests = state.guests.length;
    const arrivedGuests = state.guests.filter(g => Boolean(g.arrived_at)).length;
    const arrivalPercent = totalGuests > 0 ? Math.round((arrivedGuests / totalGuests) * 100) : 0;

    const totalStaff = state.staff.length;
    const totalTables = state.tables.length;

    // Os dois primeiros mini-cards carregam data-ceremonial-tab-jump: clicar
    // no contador pula para a aba correspondente. É por isso que são <div> com
    // atributo de dado e não links.
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

        ${locked ? lockNoticeHtml() : ''}

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

  // Só uma aba é desenhada por vez. Esconder todas e depois mostrar a ativa é
  // mais barato que reconstruir a navegação: o HTML das abas pode ficar no
  // documento o tempo todo sem custo.
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
  // O roteiro é a lista de momentos do dia, ordenada por `position`. Essa
  // ordem é a canônica e mora no banco: ela vem no .order() do select e não é
  // refeita aqui. O filtro de status abaixo é só uma visão da lista.

  function renderTimelineTab(container) {
    if (!state.selectedEvent) {
      container.innerHTML = '<div class="empty-clients"><p>Nenhum evento selecionado.</p></div>';
      return;
    }

    // Filtrar não reordena: o card arrastado continua sendo o mesmo objeto, e
    // qualquer operação de reordenação monta a lista a partir de
    // state.activities, nunca daqui.
    let filtered = state.activities;
    if (state.timelineFilter !== 'all') {
      filtered = state.activities.filter(a => a.status === state.timelineFilter);
    }

    const locked = isEventLocked();
    const total = state.activities.length;
    const completed = state.activities.filter(a => a.status === 'completed').length;
    const pending = state.activities.filter(a => a.status === 'pending').length;

    container.innerHTML = `
      <div class="ceremonial-section-header">
        <div>
          <h4>Cronograma & Roteiro da Cerimônia</h4>
          <p class="section-subtitle">${completed} de ${total} momentos concluídos</p>
        </div>
        <div class="section-actions-right" style="flex-direction: column;">
          ${locked ? '' : `
            <button class="add-client-button" type="button" data-open-templates-modal style="font-size: 15px;">
              <i data-lucide="copy-check"></i><span>Modelo padrão</span>
            </button>
            <button class="add-client-button" type="button" data-open-activity-modal >
              <i data-lucide="plus"></i><span>Novo momento</span>
            </button>
            <button class="add-client-button ${state.dragEnabled ? 'active' : ''}" type="button" data-toggle-drag-enabled>
              <i data-lucide="${state.dragEnabled ? 'grip-vertical' : 'lock'}"></i>
              <span>Reordenar</span>
            </button>
          `}
        </div>
      </div>

      ${locked ? lockNoticeHtml() : ''}

      <!-- Filtros rápidos de status do roteiro -->
      <div class="event-filter-pills" style="margin-top: 10px;">
        <button class="event-pill ${state.timelineFilter === 'all' ? 'active' : ''}" type="button" data-timeline-filter="all">Todos (${total})</button>
        <button class="event-pill ${state.timelineFilter === 'pending' ? 'active' : ''}" type="button" data-timeline-filter="pending">Pendentes (${pending})</button>
        <button class="event-pill ${state.timelineFilter === 'completed' ? 'active' : ''}" type="button" data-timeline-filter="completed">Concluídos (${completed})</button>
      </div>

      <!-- Lista de Atividades do Cronograma -->
      <div class="ceremonial-timeline-list" id="timeline-activities-list">
        ${filtered.length === 0 ? `
          <div class="empty-clients" style="padding: 24px;">
            <p>Nenhum momento cadastrado no roteiro com o filtro selecionado.</p>
            ${locked ? '' : `
              <button class="text-button" type="button" data-open-activity-modal style="margin-top: 8px;">
                + Adicionar primeiro momento
              </button>
            `}
          </div>
        ` : filtered.map((act, index) => {
          const isDone = act.status === 'completed';
          const isSkipped = act.status === 'skipped';
          const timeFmt = act.scheduled_time ? act.scheduled_time.slice(0, 5) : '';

          return `
            <article class="timeline-activity-card ${act.status}" data-activity-id="${act.id}">
              <div class="activity-drag-order" style="${locked ? 'display:flex;flex-direction:column;align-items:center;gap:2px;' : ''}">
                ${(locked || !state.dragEnabled) ? '' : `
                  <button class="activity-grip" type="button" data-drag-grip="${act.id}" aria-label="Arrastar para reordenar" title="Arraste para reordenar">
                    <i data-lucide="grip-vertical"></i>
                  </button>
                `}
                <!-- O número vem do banco (position), com o índice da lista
                     como reserva para atividades antigas sem position gravado. -->
                <span class="activity-pos-badge">${act.position || index + 1}</span>
              </div>

              <div class="activity-check-col">
                <button class="activity-checkbox-btn ${isDone ? 'checked' : ''}" type="button" data-toggle-activity-check="${act.id}" title="${isDone ? 'Desmarcar' : 'Concluir momento'}" ${locked ? 'disabled' : ''}>
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
                ${locked ? '' : `
                  <div class="activity-mini-actions">
                    <button class="client-action" type="button" data-edit-activity="${act.id}" title="Editar momento">
                      <i data-lucide="pencil"></i>
                    </button>
                    <button class="client-action" type="button" data-duplicate="activity" data-duplicate-id="${act.id}" title="Duplicar momento">
                      <i data-lucide="copy"></i>
                    </button>
                    <button class="client-action" type="button" data-delete-activity="${act.id}" title="Excluir momento">
                      <i data-lucide="trash-2"></i>
                    </button>
                  </div>
                `}
              </div>
            </article>
          `;
        }).join('')}
      </div>

      ${locked ? '' : `
        <!-- Quick Add Inline Form -->
        <div class="inline-form-box" style="margin-top: 16px;">
          <h5>+ Adicionar momento rápido</h5>
          <form id="inline-activity-form">
            <div class="client-form-card">
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
      `}
    `;

    refreshIcons();
  }

  // ==========================================================================
  // TAB 2: RECEPÇÃO & CONTROLE DE CHEGADA (CHECK-IN)
  // ==========================================================================
  // Quem está na recepção precisa achar a pessoa em segundos. Por isso a lista
  // é uma só, com busca e três filtros, e não uma tela de cadastro.

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
    const locked = isEventLocked();

    // Filtros de convidados
    // `pending` aqui é "ainda não chegou", e não o status de confirmação do
    // convidado: são coisas diferentes e a tela as trata separadamente.
    let visibleGuests = state.guests.filter(g => {
      // Filtro de status de chegada
      if (state.arrivalFilter === 'arrived' && !g.arrived_at) return false;
      if (state.arrivalFilter === 'pending' && Boolean(g.arrived_at)) return false;
      if (state.arrivalFilter === 'confirmed' && g.status !== 'confirmed') return false;

      // Busca por nome, telefone, mesa ou observação
      // A mesa entra na busca porque é assim que a recepção funciona: a pessoa
      // chega perguntando por onde sentou, não pelo nome do convidado.
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
          ${locked ? '' : `
            <button class="add-client-button" type="button" data-open-guest-modal>
              <i data-lucide="user-plus"></i><span>Novo convidado</span>
            </button>
          `}
        </div>
      </div>

      ${locked ? lockNoticeHtml() : ''}

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
            ${locked ? '' : `
              <button class="text-button" type="button" data-open-guest-modal style="margin-top: 8px;">
                + Adicionar convidado à lista
              </button>
            `}
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
                ${locked ? '' : `
                  <button class="arrival-check-btn ${hasArrived ? 'is-arrived' : 'not-arrived'}" type="button" data-toggle-arrival="${g.id}" title="${hasArrived ? 'Desmarcar presença' : 'Registrar chegada'}">
                    <i data-lucide="${hasArrived ? 'user-check' : 'user-plus'}"></i>
                    <span>${hasArrived ? 'Presente' : 'Check-in'}</span>
                  </button>
                `}

                ${guestWa ? `
                  <a class="client-action whatsapp-action" href="https://wa.me/${guestWa}" target="_blank" rel="noopener noreferrer" title="WhatsApp com convidado">
                    <i data-lucide="message-circle"></i>
                  </a>
                ` : ''}

                ${locked ? '' : `
                  <button class="client-action" type="button" data-edit-guest="${g.id}" title="Editar convidado">
                    <i data-lucide="pencil"></i>
                  </button>
                  <button class="client-action" type="button" data-duplicate="guest" data-duplicate-id="${g.id}" title="Duplicar convidado">
                    <i data-lucide="copy"></i>
                  </button>
                  <button class="client-action" type="button" data-delete-guest="${g.id}" title="Remover da lista">
                    <i data-lucide="trash-2"></i>
                  </button>
                `}
              </div>
            </article>
          `;
        }).join('')}
      </div>
    `;

    // Conecta evento de busca em tempo real
    // A lista é redesenhada a cada tecla, o que destrói o input e tira o foco
    // de quem está digitando. Por isso o foco e o cursor voltam a ser
    // repostos logo depois do render.
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
  // A equipe é a soma da escala deste evento com os cadastros globais da
  // empresa (event_id nulo), como o .or() de loadSelectedEventDetails faz.

  function renderStaffTab(container) {
    if (!state.selectedEvent) {
      container.innerHTML = '<div class="empty-clients"><p>Nenhum evento selecionado.</p></div>';
      return;
    }

    const totalStaff = state.staff.length;
    const locked = isEventLocked();

    container.innerHTML = `
      <div class="ceremonial-section-header">
        <div>
          <h4>Equipe de Cerimonialistas & Produção</h4>
          <p class="section-subtitle">${totalStaff} profissionais alocados</p>
        </div>
        <div class="section-actions-right">
          ${locked ? '' : `
            <button class="add-client-button" type="button" data-open-staff-modal>
              <i data-lucide="user-plus"></i><span>Novo profissional</span>
            </button>
          `}
        </div>
      </div>

      ${locked ? lockNoticeHtml() : ''}

      <div class="ceremonial-staff-grid">
        ${state.staff.length === 0 ? `
          <div class="empty-clients" style="grid-column: 1 / -1; padding: 24px;">
            <p>Nenhum cerimonialista ou membro da equipe cadastrado para este evento.</p>
            ${locked ? '' : `
              <button class="text-button" type="button" data-open-staff-modal style="margin-top: 8px;">
                + Adicionar cerimonialista à equipe
              </button>
            `}
          </div>
        ` : state.staff.map(member => {
          const waClean = cleanPhoneForWhatsApp(member.whatsapp);

          return `
            <article class="staff-card" data-staff-id="${member.id}">
              <div class="staff-card-header">
                <!-- Avatar de letra: sem foto, a inicial já separa visualmente
                     dois nomes parecidos na grade. -->
                <span class="staff-avatar">${sanitizeHtml(member.name.charAt(0).toUpperCase())}</span>
                <div class="staff-info-col">
                  <h5 class="staff-name">${sanitizeHtml(member.name)}</h5>
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
                ${locked ? '' : `
                  <button class="client-action" type="button" data-edit-staff="${member.id}" title="Editar dados">
                    <i data-lucide="pencil"></i>
                  </button>
                  <button class="client-action" type="button" data-duplicate="staff" data-duplicate-id="${member.id}" title="Duplicar cerimonialista">
                    <i data-lucide="copy"></i>
                  </button>
                  <button class="client-action" type="button" data-delete-staff="${member.id}" title="Remover da equipe">
                    <i data-lucide="trash-2"></i>
                  </button>
                `}
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
  // Mesas (event_tables) e convidados (guests.table_id) são tabelas separadas:
  // a aba não cria nenhuma das duas por conta própria, só as conta e as mostra.

  function renderTablesTab(container) {
    if (!state.selectedEvent) {
      container.innerHTML = '<div class="empty-clients"><p>Nenhum evento selecionado.</p></div>';
      return;
    }

    const totalTables = state.tables.length;
    const locked = isEventLocked();

    container.innerHTML = `
      <div class="ceremonial-section-header">
        <div>
          <h4>Mesas & Setores do Salão</h4>
          <p class="section-subtitle">${totalTables} mesas cadastradas</p>
        </div>
        <div class="section-actions-right">
          ${locked ? '' : `
            <button class="add-client-button" type="button" data-open-table-modal>
              <i data-lucide="plus"></i><span>Nova mesa</span>
            </button>
          `}
        </div>
      </div>

      ${locked ? lockNoticeHtml() : ''}

      <div class="ceremonial-tables-grid">
        ${state.tables.length === 0 ? `
          <div class="empty-clients" style="grid-column: 1 / -1; padding: 24px;">
            <p>Nenhuma mesa cadastrada para este evento ainda.</p>
            ${locked ? '' : `
              <button class="text-button" type="button" data-open-table-modal style="margin-top: 8px;">
                + Adicionar primeira mesa
              </button>
            `}
          </div>
        ` : state.tables.map(tbl => {
          // Convidados alocados nesta mesa
          // A ocupação vem de quem está de fato alocado, e não do campo
          // `capacity`: para a recepção importa quantas pessoas estão sentadas
          // ali, e o limite cadastrado é só uma referência visual.
          const tableGuests = state.guests.filter(g => g.table_id === tbl.id);
          const occupied = tableGuests.length;
          const arrivedInTable = tableGuests.filter(g => Boolean(g.arrived_at)).length;

          return `
            <article class="table-card" data-table-id="${tbl.id}">
              <div class="table-card-top">
                <div class="table-number-box">
                  <span class="table-label">MESA</span>
                  <strong class="table-num">${sanitizeHtml(tbl.table_number)}</strong>
                </div>
                <div class="table-header-meta">
                  <span class="table-occupancy-badge avail">
                    ${occupied} convidados
                  </span>
                  <span class="table-arrived-count">
                    <i data-lucide="user-check"></i> ${arrivedInTable} presentes
                  </span>
                </div>
                <div class="table-actions">
                  ${locked ? '' : `
                    <button class="client-action" type="button" data-edit-table="${tbl.id}" title="Editar mesa">
                      <i data-lucide="pencil"></i>
                    </button>
                    <button class="client-action" type="button" data-duplicate="table" data-duplicate-id="${tbl.id}" title="Duplicar mesa">
                      <i data-lucide="copy"></i>
                    </button>
                    <button class="client-action" type="button" data-delete-table="${tbl.id}" title="Excluir mesa">
                      <i data-lucide="trash-2"></i>
                    </button>
                  `}
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
  // Tela de quem está conduzindo o evento no dia: um momento grande na tela,
  // o próximo embaixo e dois botões. Pensada para ser lida de longe, com o
  // celular apoiado.

  function renderLiveTab(container) {
    if (!state.selectedEvent) {
      container.innerHTML = '<div class="empty-clients"><p>Nenhum evento selecionado.</p></div>';
      return;
    }

    const activities = state.activities;
    // "Atual" é o primeiro momento pendente na ordem do roteiro, não o mais
    // próximo do horário: quem está conduzindo decide a ordem de Wagner, e o
    // campo de horário é só informação para consultar. Sem pendentes, a última
    // atividade é o que fica em destaque, para a tela não esvaziar no fim.
    const currentActivity = activities.find(a => a.status === 'pending') || activities[activities.length - 1];
    const currentIndex = currentActivity ? activities.indexOf(currentActivity) : -1;
    const nextActivity = currentIndex >= 0 && currentIndex + 1 < activities.length ? activities[currentIndex + 1] : null;

    const completedCount = activities.filter(a => a.status === 'completed').length;
    const totalCount = activities.length;
    const arrivedGuests = state.guests.filter(g => Boolean(g.arrived_at)).length;
    const totalGuests = state.guests.length;
    const locked = isEventLocked();

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
            ${locked ? '' : `<button class="text-button" type="button" data-open-activity-modal>+ Cadastrar cronograma</button>`}
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
              ${locked ? '' : `
                <button class="live-btn complete" type="button" data-live-action="complete" data-activity-id="${currentActivity.id}">
                  <i data-lucide="check-circle"></i>
                  <span>Concluir Momento</span>
                </button>
                <button class="live-btn skip" type="button" data-live-action="skip" data-activity-id="${currentActivity.id}">
                  <i data-lucide="fast-forward"></i>
                  <span>Pular</span>
                </button>
              `}
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
      </div>
    `;

    // Inicia relógio ao vivo
    startLiveClock();
    refreshIcons();
  }

  // Relógio de parede do modo ao vivo. Roda em intervalo de 1s e se autossusta:
  // quando a aba troca, o elemento some e o próprio tick dá clearInterval, em
  // vez de deixar um timer rodando atrás de uma tela fechada.
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
  // O padrão se repete em todas: grava no banco, mexe no objeto do state e
  // redesenha. Nada de atualização otimista de verdade — o estado local é
  // corrigido a partir do que o servidor aceitou, e a lista inteira volta por
  // loadSelectedEventDetails() para não divergir do que os outros usuários
  // enxergam.

  // --- Atividades ---
  async function toggleActivityCheck(actId) {
    if (blockIfLocked()) return;
    const sb = getSupabase();
    if (!sb) return;

    const act = state.activities.find(a => a.id === actId);
    if (!act) return;

    // Só alterna entre pendente e concluído: um momento marcado como ignorado
    // volta para pendente, nunca para concluído — quem pula algo por engano e
    // desmarca não deve ver o item aparecer como feito.
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

  // Usada pelo botão do modo ao vivo (concluir/pular) e pelo select de status
  // que aparece no roteiro. Aceita qualquer um dos quatro status, ao contrário
  // do toggle acima, que é binário.
  async function updateActivityStatus(actId, newStatus) {
    if (blockIfLocked()) return;
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
  // Atalho para a ordem atual; a reordenação de fato monta a lista em
  // moveActivityTo(), que já sabe onde o item foi solto.
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
    if (blockIfLocked()) return;
    const sb = getSupabase();
    if (!sb || !state.selectedEventId) return;

    // Vai para o banco como um array de ids na ordem desejada, e não como
    // vários UPDATEs: `unique (event_id, position)` impede gravar a ordem nova
    // linha a linha, porque a primeira esbarraria na posição que o vizinho ainda
    // ocupa. A RPC faz as duas fases dentro de uma transação.
    const { error } = await sb.rpc('reorder_ceremonial_activities', {
      target_event_id: state.selectedEventId,
      ordered_ids: orderedIds
    });

    // Nos dois desfechos a lista é recarregada: no erro, para desfazer o
    // arrasto que o usuário acabou de ver; no acerto, porque quem manda na
    // ordem é o banco.
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
    // O `to` é calculado depois do splice, porque o próprio item arrastado já
    // saiu da lista e encontrá-lo agora daria a posição errada. Se o vizinho
    // alvo não existir mais, cai no fim em vez de abortar.
    let to = beforeId ? list.findIndex(a => a.id === beforeId) : list.length;
    if (to === -1) to = list.length;
    list.splice(to, 0, moved);

    // Sem nenhuma mudança, não chama a RPC: arrasto que volta à posição de
    // origem não deve gastar ida e volta ao banco.
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

  // Os cards são lidos do DOM, e não de state.activities: o que está na tela é a
  // lista filtrada e pode já estar desatualizada em relação ao banco. Serve
  // para medir onde o ponteiro está e para pintar o marcador de destino.
  function activityCards() {
    const list = timelineList();
    return list ? Array.from(list.querySelectorAll('.timeline-activity-card')) : [];
  }

  // Decide em que posição o card arrastado deve cair, comparando o ponteiro com
  // o centro de cada card. Retorna o id do card anterior, que é o que
  // moveActivityTo espera, ou null para "colocar no fim".
  // O card arrastado é ignorado na conta: com ele dentro da lista, o ponteiro
  // nunca passaria do próprio centro dele.
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

  // O destino é marcado por classe CSS, sem criar nenhum elemento novo. Pisar
  // na borda superior do card alvo significa "entra antes dele"; sem card alvo,
  // a marca vai para a borda inferior do último.
  function paintDropTarget(beforeId) {
    clearDropMarkers();
    const others = activityCards().filter(c => c.dataset.activityId !== state.drag.activityId);
    if (!beforeId) {
      others[others.length - 1]?.classList.add('drag-over-bottom');
    } else {
      others.find(c => c.dataset.activityId === beforeId)?.classList.add('drag-over-top');
    }
  }

  // Encerramento do arraste. Grava só se houve arraste de verdade (`started`):
  // um toque seco no punho limpa o estado e não chama o banco.
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

    // Os três ouvintes ficam em window, não no card: durante o arraste o ponteiro
    // sai do elemento e, se o card fosse redesenhado, perderia o acompanhamento.
    const onMove = (moveEvent) => {
      // Um toque no punho sem deslocar é um clique, não um arraste.
      if (!state.drag.started && Math.abs(moveEvent.clientY - startY) < DRAG_THRESHOLD_PX) return;

      // A partir daqui o arraste é real: a classe no <body> é o que segura a
      // seleção de texto e o cursor durante o movimento.
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
    // pointercancel é o dedo interrompido pelo sistema (chamada, gesto do SO):
    // o arraste é desfeito sem gravar, porque o usuário não escolheu soltar.
    const onCancel = () => finish(false);

    // O move é passivo de propósito: o scroll continua vindo do toque em
    // Pointer Events e o preventDefault do pointerdown é o que segura a rolagem.
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
  // Não têm nada a ver com o RLS por evento: modelos são compartilhados por
  // toda a equipe, e é por isso que o realtime.js tem um tópico só para eles.

  // Mensagem de erro do modal de modelos. Fica dentro do modal, e não no toast,
  // porque a pessoa precisa ler o erro antes de ele sumir — e porque o modal
  // pode ficar aberto por muito tempo durante o trabalho.
  function setTemplatesFeedback(message, isError = false) {
    const el = document.getElementById('ceremonial-templates-feedback');
    if (!el) return;
    el.textContent = message;
    el.style.color = isError ? '#a0483d' : '';
  }

  // As duas leituras vão juntas: os momentos de todos os modelos vêm em uma
  // consulta só e a separação por modelo é feita no navegador. São poucas linhas
  // e assim um arraste ou uma edição no modal não custa uma ida e volta nova ao
  // banco a cada clique.
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

  // Modelo aberto no painel de modelos padrão (o id fica no state, não no DOM).
  function selectedTemplate() {
    return state.templates.find(t => t.id === state.editingTemplateId) || null;
  }

  // Ordem do roteiro do modelo. O .sort() aqui é defensivo: a consulta já vem
  // ordenada por position, mas todas as linhas de todos os modelos vêm juntas e
  // nada impede que isso mude.
  function templateActivities(templateId) {
    return state.templateActivities
      .filter(item => item.template_id === templateId)
      .sort((a, b) => a.position - b.position);
  }

  // Recarrega ao abrir, mesmo já tendo carregado antes: o realtime pode ter
  // trazido alteração de outro usuário enquanto o modal estava fechado. Sem
  // seleção, abre no primeiro modelo, que é o mais frequente em uso.
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

  // Lista da esquerda + detalhe da direita. Só o item ativo (editingTemplateId)
  // é destacado; o painel inteiro é redesenhado a cada mudança.
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

  // Detalhe do modelo: cabeçalho com renomear/excluir, o formulário de adição
  // rápida e a lista de momentos (arrastáveis pelo punho).
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
        <input class="inline-form-box" id="template-act-time" type="time" />
        <input class="inline-form-box" id="template-act-title" type="text" placeholder="Nome do momento (ex.: Entrada dos Noivos)" required />
        <input class="inline-form-box" id="template-act-resp" type="text" placeholder="Responsável" />
        <button class="add-client-button" type="submit"><i data-lucide="plus"></i><span>Adicionar</span></button>
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
    // O form é reconstruído junto com o resto do detalhe a cada render, então
    // o listener precisa ser religado aqui. Delegar para o document custaria
    // uma re-render por tecla digitada, já que o detalhe inteiro é redesenhado.
    if (form) form.addEventListener('submit', handleTemplateActivitySubmit);
  }

  // INSERT com select devolvendo a linha pronta: o modelo novo entra no state
  // sem nova consulta, e já fica selecionado para o usuário começar a montar
  // os momentos.
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

  // Renomear e confirmar exclusão usam prompt e confirm do navegador: são duas
  // ações raras e não valem um modal só para elas, como acontece com o resto do
  // app, em que formulário e exclusão pedem confirmação própria.
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

  // Exclui o modelo e, por cascade, seus momentos. Não há como desfazer, por
  // isso o confirm mostra quantos momentos vão junto.
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

  // Adiciona um momento ao modelo em edição. Difere do roteiro do evento: aqui
  // não há RPC de renumeração, então remover um item do meio deixa um buraco na
  // sequência de `position` (o próximo insert usa max+1 e não colide).
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
    // Aqui o modelo não tem RPC de renumeração, então remover um momento deixa
    // o buraco e a posição exibida pula um número.
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

  // Remove um momento do modelo. Só mexe no state local depois do sucesso,
  // evitando redesenhar com o item ainda no banco.
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

  // Copia o modelo para o roteiro do evento aberto. Com a caixa "substituir"
  // marcada troca o roteiro inteiro; sem ela, acrescenta os momentos ao fim.
  // Toda a cópia roda numa RPC transacional no banco.
  async function applyTemplateToEvent(templateId) {
    const sb = getSupabase();
    const template = state.templates.find(t => t.id === templateId);
    if (!sb || !template || !state.selectedEventId) return;

    // A caixa "substituir" é a diferença entre colar o modelo no fim do roteiro
    // e trocar o roteiro inteiro. Apagar o que a equipe já montou é uma decisão
    // irreversível, então ela vem com o número de momentos na pergunta.
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
    // A cópia inteira acontece dentro da RPC: ler o modelo, apagar o roteiro
    // antigo (se for substituir) e renumerar as posições são passos que não
    // podem ficar pela metade no navegador.
    const { data, error } = await sb.rpc('copy_ceremonial_template', {
      source_template_id: templateId,
      target_event_id: state.selectedEventId,
      replace_activity: replace
    });

    if (error) {
      setTemplatesFeedback('Não foi possível copiar o modelo: ' + error.message, true);
      return;
    }

    // A RPC devolve um inteiro, mas o supabase-js entrega a resposta como
    // array de linhas. Os dois formatos são aceitos para o aviso não depender
    // do detalhe do cliente.
    const copied = Array.isArray(data) ? data[0] : data;
    closeTemplatesModal();
    await loadSelectedEventDetails(state.selectedEventId);
    notify(`${copied || count} momentos do modelo "${template.name}" copiados para o roteiro.`, 4000);
  }

  // ==========================================================================
  // EXCLUSÕES E AÇÕES DE UM TOQUE
  // ==========================================================================
  // Tudo que cabe num clique: concluir, pular, registrar presença, remover.
  // Cada exclusão pergunta com o nome do registro antes, porque quem apaga
  // roteiro ou lista de convidado erra com frequência e o item some da tela
  // junto com o botão de desfazer que o app não tem.

  async function deleteActivity(actId) {
    if (blockIfLocked()) return;
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
      // É a mesma razão de existir do próximoActivityPosition() lá em cima,
      // aplicada depois de um buraco já formado em vez de antes do insert.
      await sb.rpc('pack_ceremonial_activities', { target_event_id: state.selectedEventId });

      notify('Momento excluído do cronograma.');
      await loadSelectedEventDetails(state.selectedEventId);
    } catch (err) {
      console.error('Erro ao excluir momento:', err);
      alert('Erro: ' + err.message);
    }
  }

  // --- Convidados & Recepção ---
  async function toggleGuestArrival(guestId) {
    if (blockIfLocked()) return;
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
    if (blockIfLocked()) return;
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
    if (blockIfLocked()) return;
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
    if (blockIfLocked()) return;
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

    // Edição vs. criação é decidido pelo id, não pela presença do objeto: a
    // cópia da duplicação (sem id) cai no modo criação já preenchida.
    const isEdit = Boolean(actData?.id);
    state.editingActivityId = isEdit ? actData.id : null;
    if (titleEl) titleEl.textContent = isEdit ? 'Editar Momento do Cerimonial' : 'Novo Momento no Cronograma';
    document.getElementById('modal-act-id').value = isEdit ? actData.id : '';
    document.getElementById('modal-act-title').value = actData?.title || '';
    document.getElementById('modal-act-time').value = actData?.scheduled_time ? actData.scheduled_time.slice(0, 5) : '';
    document.getElementById('modal-act-resp').value = actData?.responsible || '';
    document.getElementById('modal-act-status').value = actData?.status || 'pending';
    document.getElementById('modal-act-desc').value = actData?.description || '';

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
        state.tables.map(t => `<option value="${t.id}">Mesa ${sanitizeHtml(t.table_number)}</option>`).join('');
    }

    // Pelo id, e não pela presença do objeto: a cópia da duplicação abre como
    // criação já preenchida.
    const isEdit = Boolean(guestData?.id);
    state.editingGuestId = isEdit ? guestData.id : null;
    if (titleEl) titleEl.textContent = isEdit ? 'Editar Convidado' : 'Novo Convidado na Lista';
    document.getElementById('modal-guest-id').value = isEdit ? guestData.id : '';
    document.getElementById('modal-guest-name').value = guestData?.name || '';
    document.getElementById('modal-guest-phone').value = guestData?.whatsapp || '';
    document.getElementById('modal-guest-status').value = guestData?.status || 'confirmed';
    if (tableSelect && guestData?.table_id) tableSelect.value = guestData.table_id;
    document.getElementById('modal-guest-arrived').checked = Boolean(guestData?.arrived_at);
    document.getElementById('modal-guest-notes').value = guestData?.notes || '';

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

    const isEdit = Boolean(staffData?.id);
    state.editingStaffId = isEdit ? staffData.id : null;
    if (titleEl) titleEl.textContent = isEdit ? 'Editar Cerimonialista' : 'Adicionar à Equipe de Cerimonial';
    document.getElementById('modal-staff-id').value = isEdit ? staffData.id : '';
    document.getElementById('modal-staff-name').value = staffData?.name || '';
    document.getElementById('modal-staff-phone').value = staffData?.whatsapp || '';
    document.getElementById('modal-staff-email').value = staffData?.email || '';
    document.getElementById('modal-staff-notes').value = staffData?.notes || '';

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

    const isEdit = Boolean(tableData?.id);
    state.editingTableId = isEdit ? tableData.id : null;
    if (titleEl) titleEl.textContent = isEdit ? 'Editar Mesa' : 'Nova Mesa / Setor';
    document.getElementById('modal-table-id').value = isEdit ? tableData.id : '';
    if (isEdit) {
      document.getElementById('modal-table-number').value = tableData.table_number || '';
    } else {
      // Numa cópia o número do original não serve: a tabela tem
      // unique (event_id, table_number) e o salvamento bateria na chave. Só o
      // restante (descrição/observações) é aproveitado da cópia.
      const nextNum = state.tables.length + 1;
      document.getElementById('modal-table-number').value = String(nextNum).padStart(2, '0');
    }
    document.getElementById('modal-table-notes').value = tableData?.notes || '';

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

  // Salva o momento do roteiro vindo do modal. O id oculto decide entre editar
  // (id preenchido) e criar; ao criar, a posição é o fim da lista. Se foi
  // informado um responsável que ainda não está na equipe, ele entra nela
  // automaticamente (ensureResponsibleInTeam).
  async function handleActivitySubmit(e) {
    e.preventDefault();
    if (blockIfLocked()) return;
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

      if (resp) {
        await ensureResponsibleInTeam(resp);
      }

      closeActivityModal();
      await loadSelectedEventDetails(state.selectedEventId);
    } catch (err) {
      console.error('Erro ao salvar atividade:', err);
      if (feedbackEl) feedbackEl.textContent = 'Erro ao salvar: ' + err.message;
    }
  }

  // Adição rápida pela própria linha do roteiro (sem abrir modal): sempre cria
  // um momento novo no fim, com status inicial 'pending'. É o caminho para
  // lançar vários itens seguidos durante a montagem do cronograma.
  async function handleInlineActivitySubmit(e) {
    e.preventDefault();
    if (blockIfLocked()) return;
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

      if (resp) {
        await ensureResponsibleInTeam(resp);
      }

      await loadSelectedEventDetails(state.selectedEventId);
    } catch (err) {
      console.error('Erro ao adicionar inline:', err);
      showSchemaError(err, 'adicionar momento');
    }
  }

  // Salva o convidado do modal (criar/editar). `arrived_at` é ligado ao
  // marcar/desmarcar a caixa de chegada: guarda o instante da entrada na
  // recepção, e não uma simples presença, porque a contagem da recepção usa
  // essa data.
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

  // Salva um membro da equipe de cerimonial (criar/editar). Os campos opcionais
  // vão como null em vez de string vazia para o banco guardar NULL.
  async function handleStaffSubmit(e) {
    e.preventDefault();
    if (blockIfLocked()) return;
    const sb = getSupabase();
    if (!sb) return;

    const id = document.getElementById('modal-staff-id').value.trim();
    const name = document.getElementById('modal-staff-name').value.trim();
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

  // Salva a mesa/setor (criar/editar). O número é livre (string), não um id:
  // cada evento pode numerar as mesas do seu jeito.
  async function handleTableSubmit(e) {
    e.preventDefault();
    if (blockIfLocked()) return;
    const sb = getSupabase();
    if (!sb || !state.selectedEventId) return;

    const id = document.getElementById('modal-table-id').value.trim();
    const tableNumber = document.getElementById('modal-table-number').value.trim();
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

      // Ações do Cronograma (Checkbox, Edit, Delete)
      if (target.hasAttribute('data-toggle-activity-check')) {
        e.preventDefault();
        toggleActivityCheck(target.dataset.toggleActivityCheck);
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

    // Toggle para habilitar/desabilitar drag-and-drop do roteiro
    document.addEventListener('click', e => {
      const toggle = e.target.closest('[data-toggle-drag-enabled]');
      if (toggle) {
        e.preventDefault();
        state.dragEnabled = !state.dragEnabled;
        renderTimelineTab(document.getElementById('ceremonial-tab-timeline'));
        notify(state.dragEnabled ? 'Modo reordenar ativado. Arraste pelos punhos.' : 'Modo reordenar desativado.');
      }
    });

    // 2c. Arraste do roteiro. Delegado porque os cards são redesenhados a
    // cada recarga e um listener direto seria perdido.
    document.addEventListener('pointerdown', e => {
      if (!state.dragEnabled) return;
      onGripPointerDown(e);
    });

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

    // inline-activity-form é renderizado dinamicamente, usa delegação
    document.addEventListener('submit', e => {
      if (e.target.id === 'inline-activity-form') {
        handleInlineActivitySubmit(e);
      }
    });

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

  // Duplicação: a cópia (sem id) abre o modal em modo criação já preenchido.
  // Cada tipo vive no estado do evento selecionado; sem evento, não há o que
  // duplicar.
  window.plenitudeDuplicate?.register('activity', (id) => {
    const item = state.activities.find((activity) => activity.id === id);
    if (item) openActivityModal(window.plenitudeDuplicate.copy(item));
  });
  window.plenitudeDuplicate?.register('guest', (id) => {
    const item = state.guests.find((guest) => guest.id === id);
    if (item) openGuestModal(window.plenitudeDuplicate.copy(item));
  });
  window.plenitudeDuplicate?.register('staff', (id) => {
    const item = state.staff.find((member) => member.id === id);
    if (item) openStaffModal(window.plenitudeDuplicate.copy(item));
  });
  window.plenitudeDuplicate?.register('table', (id) => {
    const item = state.tables.find((table) => table.id === id);
    if (item) openTableModal(window.plenitudeDuplicate.copy(item));
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setupEventListeners();
    });
  } else {
    setupEventListeners();
  }

})();
