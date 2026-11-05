// ==========================================================================
// Plenitude Realizações - Módulo Financeiro
// ==========================================================================
// Rateio de cada evento confirmado: recebimentos menos custos, sobre o
// resultado incide o dízimo, e o saldo é dividido entre os cerimonialistas
// (por percentual ou valor fixo). A tela do evento é onde essa conta é
// conferida e salva.
//
// Regras que não são óbvias só de ler o código:
//   - O valor "contratado" vem do orçamento confirmado; o que o evento
//     recebeu de fato são os recebimentos lançados um a um.
//   - O sinal do orçamento é o MESMO dinheiro visto no Orçamento e aqui:
//     por isso ele vira um recebimento marcado e não pode ser editado nem
//     apagado nesta tela (só estornado, pelas functions da migration 020).
//   - Recebimentos não escrevem direto na tabela: passam por functions da
//     migration 019, que conferem se o novo valor não deixa dízimo/repasses
//     acima do saldo. Custos, sim, escrevem direto (migration 018).
// ==========================================================================
(() => {
  'use strict';

  const sb = () => window.plenitudeSupabase || null;
  const permissions = () => window.plenitudePermissions || null;
  // Referências fixas do DOM. A tela só é montada uma vez no index.html;
  // estas constantes evitam reconsultar o documento a cada render.
  const panel = document.querySelector('#finance-panel');
  const eventPanel = document.querySelector('#finance-event-panel');
  const feedback = document.querySelector('#finance-feedback');
  const eventList = document.querySelector('#finance-event-list');
  const monthInput = document.querySelector('#finance-month');
  const allPeriods = document.querySelector('#finance-all-periods');
  const shareRows = document.querySelector('#finance-share-rows');
  const allocationForm = document.querySelector('#finance-allocation-form');
  const allocationFeedback = document.querySelector('#finance-allocation-feedback');
  const receiptForm = document.querySelector('#finance-receipt-form');
  const receiptFeedback = document.querySelector('#finance-receipt-feedback');
  const receiptsList = document.querySelector('#finance-receipts-list');
  const receiptFormSubmitLabel = document.querySelector('#finance-receipt-submit-label');
  const receiptCancelButton = document.querySelector('[data-cancel-finance-receipt]');
  const costForm = document.querySelector('#finance-cost-form');
  const costFeedback = document.querySelector('#finance-cost-feedback');
  const costsList = document.querySelector('#finance-costs-list');
  const costFormSubmitLabel = document.querySelector('#finance-cost-submit-label');
  const titheMode = document.querySelector('#finance-tithe-mode');
  const tithePercent = document.querySelector('#finance-tithe-percent');
  const titheFixed = document.querySelector('#finance-tithe-fixed');

  // Cache local dos dados do Supabase. O realtime recarrega tudo por
  // loadFinance() em vez de aplicar o payload, então esta é a única fonte
  // para os cálculos e re-renders.
  const state = {
    events: [],
    receipts: [],
    costs: [],
    settings: new Map(),
    allocations: new Map(),
    staff: new Map(),
    activeEventId: null,
    draftShares: []
  };

  const formatMoney = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  // Todo HTML desta tela é montado por template string com dados do banco e
  // digitados pelo usuário; sem isto, um nome com "<" viraria marcação.
  const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  // Data local em YYYY-MM-DD sem passar por toISOString(): a conversão para UTC
  // mudaria o dia perto da meia-noite e o "hoje" do lançamento sairia errado.
  const localDateString = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };
  // Reaproveita o mesmo elemento .toast global do app; guarda o timer em uma
  // propriedade da própria função para não criar um segundo toast concorrente.
  const notify = (message) => {
    const toast = document.querySelector('.toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => toast.classList.remove('show'), 2600);
  };

  // Trava de tela. Não é a regra de escrita (essa é a RLS no banco): serve só
  // para não abrir o Financeiro para quem não tem a permissão.
  function requireAccess() {
    if (permissions()?.allow('financeiro')) return true;
    if (!permissions()) setFeedback('O controle de acesso ainda está carregando. Tente novamente.', true);
    return false;
  }

  function setFeedback(message, isError = false) {
    feedback.textContent = message;
    feedback.style.color = isError ? '#a0483d' : '';
  }

  // Núcleo do módulo: recalcula todo o dinheiro de um evento a partir do cache
  // local e devolve as peças que as telas exibem. É usado tanto no dashboard
  // (soma por evento) quanto no detalhe e nas validações antes de salvar.
  //
  // Ordem da conta, que é a ordem em que as telas mostram:
  //   recebido (soma dos lançamentos não estornados) - custos = resultado
  //   operacional; sobre ele incide o dízimo; o que sobra é a base do rateio;
  //   cada participante recebe percentual da base ou um valor fixo.
  // O arredondamento a 2 casas em cada passo evita centavo fantasma quando o
  // valor volta como number do Postgres.
  function financeFor(eventId) {
    const event = state.events.find((item) => item.id === eventId);
    // Sem configuração salva ainda, assume o padrão: dízimo de 10% sobre o
    // resultado (quando o evento tem recebimentos, é o caso mais comum).
    const setting = state.settings.get(eventId) || { tithe_mode: 'percentage', tithe_percent: 10, tithe_fixed_amount: 0 };
    // Recebimento estornado continua no histórico, mas não conta como caixa.
    const receipts = state.receipts.filter((item) => item.event_id === eventId && !item.voided_at);
    const collected = receipts.reduce((sum, receipt) => sum + Number(receipt.amount), 0);
    const costs = state.costs.filter((item) => item.event_id === eventId);
    const costsTotal = costs.reduce((sum, cost) => sum + Number(cost.amount), 0);
    const operatingResult = collected - costsTotal;
    // Dízimo percentual incide sobre o resultado positivo (prejuízo não gera
    // dízimo negativo); o modo fixo usa o valor informado, independente disso.
    const tithe = setting.tithe_mode === 'fixed' ? Number(setting.tithe_fixed_amount) : Math.round(Math.max(0, operatingResult) * Number(setting.tithe_percent) / 100 * 100) / 100;
    const base = Math.max(0, operatingResult - tithe);
    const shares = state.allocations.get(eventId) || [];
    const allocated = shares.reduce((sum, share) => sum + (share.calculation_mode === 'fixed' ? Number(share.fixed_amount) : Math.round(base * Number(share.percentage) / 100 * 100) / 100), 0);
    return { event, setting, receipts, costs, collected, costsTotal, operatingResult, tithe, base, shares, allocated, netProfit: operatingResult - tithe - allocated };
  }

  // Eventos exibidos no dashboard: todos, ou só os do mês selecionado. O
  // filtro mensal compara o início da string YYYY-MM-DD do evento, sem montar
  // Date — o agrupamento é por mês civil da data do evento.
  function monthEvents() {
    if (allPeriods.checked || !monthInput.value) return state.events;
    return state.events.filter((event) => (event.event_date || '').startsWith(monthInput.value));
  }

  // Monta os cartões de total do período e a lista de eventos do mês.
  function renderDashboard() {
    const events = monthEvents();
    // Acumula os totais somando o financeFor de cada evento do filtro.
    const totals = events.reduce((acc, event) => {
      const amount = financeFor(event.id);
      acc.received += amount.collected;
      acc.tithe += amount.tithe;
      acc.allocated += amount.allocated;
      acc.costs += amount.costsTotal;
      acc.balance += amount.netProfit;
      return acc;
    }, { received: 0, costs: 0, tithe: 0, allocated: 0, balance: 0 });
    document.querySelector('#finance-total-received').textContent = formatMoney(totals.received);
    document.querySelector('#finance-total-costs').textContent = formatMoney(totals.costs);
    document.querySelector('#finance-total-tithe').textContent = formatMoney(totals.tithe);
    document.querySelector('#finance-total-allocated').textContent = formatMoney(totals.allocated);
    document.querySelector('#finance-total-balance').textContent = formatMoney(totals.balance);

    if (!events.length) {
      eventList.innerHTML = '<div class="empty-clients">Nenhum evento confirmado neste período.</div>';
      return;
    }
    eventList.innerHTML = events.map((event) => {
      const amounts = financeFor(event.id);
      const contracted = Number(event.quotes?.total || 0);
      return `<article class="finance-event-row" data-finance-event="${event.id}">
        <div class="finance-event-date"><strong>${escapeHTML(event.event_date ? new Date(`${event.event_date}T12:00:00`).getDate() : '—')}</strong><span>${escapeHTML(event.event_date ? new Date(`${event.event_date}T12:00:00`).toLocaleDateString('pt-BR', { month: 'short' }) : '')}</span></div>
        <div class="finance-event-main"><strong>${escapeHTML(event.name || event.quotes?.name || 'Evento')}</strong><span>${escapeHTML(event.clients?.name || 'Cliente')} · contratado ${formatMoney(contracted)}</span></div>
        <div class="finance-event-numbers"><span>Recebido</span><strong>${formatMoney(amounts.collected)}</strong></div>
        <button class="finance-open-event" type="button" data-open-finance-event="${event.id}" aria-label="Abrir financeiro do evento ${escapeHTML(event.name)}"><i data-lucide="chevron-right"></i></button>
      </article>`;
    }).join('');
    window.lucide?.createIcons();
  }

  // Carrega tudo do módulo de uma vez: primeiro os eventos confirmados (o
  // `quotes!inner` + o filtro por status garantem que só entra evento com
  // orçamento confirmado e traz junto cliente e total do orçamento), depois as
  // cinco tabelas do rateio em paralelo por conta própria. Ler cada uma
  // separada é proposital: uma tabela ausente não pode derrubar a lista toda.
  async function loadFinance() {
    if (!requireAccess()) return;
    setFeedback('Carregando dados financeiros...');
    const { data: events, error } = await sb().from('events')
      .select('id, name, event_date, status, quote_id, quotes!inner(id, quote_number, name, total, status), clients(name)')
      .eq('quotes.status', 'confirmed')
      .order('event_date', { ascending: false });
    if (error) {
      setFeedback('Não foi possível carregar eventos. Confira se a migração 017 foi executada e se você tem acesso ao Financeiro.', true);
      eventList.innerHTML = '';
      return;
    }
    state.events = events || [];
    const ids = state.events.map((event) => event.id);
    let partial = false;
    if (ids.length) {
      const [settingsResult, receiptsResult, sharesResult, staffResult, costsResult] = await Promise.all([
        sb().from('event_finance_settings').select('*').in('event_id', ids),
        sb().from('event_finance_receipts').select('*').in('event_id', ids).order('received_on', { ascending: false }),
        sb().from('event_finance_allocations').select('*').in('event_id', ids).order('sort_order'),
        sb().from('ceremonialistas').select('id, event_id, name, specialty').in('event_id', ids).order('name'),
        sb().from('event_finance_costs').select('*').in('event_id', ids).order('incurred_on', { ascending: false })
      ]);
      // Cada tabela do rateio é lida por conta própria. Antes, uma única query
      // que falhasse (a de custos, que depende da migration 018) esvaziava
      // eventList — e é justamente da lista que o rateio abre, então o botão
      // sumia da tela sem nenhuma pista. Agora o que falta vira aviso e o resto
      // do rateio continua carregando.
      const missing = [];
      if (settingsResult.error) missing.push('configuração');
      if (receiptsResult.error) missing.push('recebimentos');
      if (sharesResult.error) missing.push('divisão da equipe');
      if (staffResult.error) missing.push('cerimonialistas');
      if (costsResult.error) missing.push('custos');
      partial = missing.length > 0;
      if (partial) {
        setFeedback(`Rateio parcial: não foi possível carregar ${missing.join(', ')}. Confira as migrations 017 e 018 e a permissão Financeiro.`, true);
      }
      state.settings = new Map(((settingsResult.error ? [] : settingsResult.data) || []).map((item) => [item.event_id, item]));
      state.receipts = (receiptsResult.error ? [] : receiptsResult.data) || [];
      state.costs = (costsResult.error ? [] : costsResult.data) || [];
      state.allocations = new Map();
      ((sharesResult.error ? [] : sharesResult.data) || []).forEach((item) => {
        if (!state.allocations.has(item.event_id)) state.allocations.set(item.event_id, []);
        state.allocations.get(item.event_id).push(item);
      });
      state.staff = new Map();
      ((staffResult.error ? [] : staffResult.data) || []).forEach((member) => {
        if (!state.staff.has(member.event_id)) state.staff.set(member.event_id, []);
        state.staff.get(member.event_id).push(member);
      });
    } else {
      state.settings = new Map();
      state.receipts = [];
      state.costs = [];
      state.allocations = new Map();
      state.staff = new Map();
    }
    // O aviso de rateio parcial fica na tela; a contagem de eventos só ocupa o
    // lugar dele quando deu para ler tudo.
    if (!partial) {
      setFeedback(`${state.events.length} ${state.events.length === 1 ? 'evento confirmado' : 'eventos confirmados'}`);
    }
    renderDashboard();
  }

  // Abre o painel principal e garante um mês no filtro (o mês corrente), para
  // a tela nunca abrir com o filtro vazio mostrando todos os eventos.
  function openFinance() {
    if (!requireAccess()) return;
    panel.hidden = false;
    if (!monthInput.value) monthInput.value = localDateString().slice(0, 7);
    loadFinance();
  }

  // Desenha as linhas do rateio a partir de um array. Serve tanto para o que
  // está salvo quanto para um rascunho (adicionar/remover participante), por
  // isso sempre substitui todo o conteúdo em vez de fazer append.
  function renderShareRows(rows) {
    state.draftShares = rows.map((row) => ({
      ceremonialista_id: row.ceremonialista_id || null,
      participant_name: row.participant_name || '',
      calculation_mode: row.calculation_mode || 'percentage',
      percentage: Number(row.percentage || 0),
      fixed_amount: Number(row.fixed_amount || 0)
    }));
    shareRows.innerHTML = state.draftShares.map((row, index) => `<div class="finance-share-row" data-share-index="${index}" data-ceremonialista-id="${escapeHTML(row.ceremonialista_id || '')}">
      <label class="finance-share-person"><span>Participante</span><input type="text" data-share-name value="${escapeHTML(row.participant_name)}" placeholder="Nome da pessoa" required /></label>
      <label><span>Tipo</span><select data-share-mode><option value="percentage" ${row.calculation_mode === 'percentage' ? 'selected' : ''}>Percentual</option><option value="fixed" ${row.calculation_mode === 'fixed' ? 'selected' : ''}>Valor direto</option></select></label>
      <label><span class="share-value-label">${row.calculation_mode === 'percentage' ? 'Percentual (%)' : 'Valor (R$)'}</span><input type="number" min="0" step="0.01" data-share-value value="${row.calculation_mode === 'percentage' ? row.percentage : row.fixed_amount}" /></label>
      <strong class="finance-share-preview">R$ 0,00</strong>
      <button class="client-action" type="button" data-remove-share aria-label="Remover participante"><i data-lucide="trash-2"></i></button>
    </div>`).join('');
    updateSharePreviews();
    window.lucide?.createIcons();
  }

  // Lê o que está no DOM (e não o rascunho em memória) para montar as linhas
  // do rateio. O usuário pode ter digitado desde o último render, e é esse
  // valor que precisa ir para o save. Linha sem nome é descartada.
  function readDraftShares() {
    return [...shareRows.querySelectorAll('.finance-share-row')].map((row) => {
      const mode = row.querySelector('[data-share-mode]').value;
      const value = Number(row.querySelector('[data-share-value]').value || 0);
      return {
        ceremonialista_id: row.dataset.ceremonialistaId || null,
        participant_name: row.querySelector('[data-share-name]').value.trim(),
        calculation_mode: mode,
        percentage: mode === 'percentage' ? value : 0,
        fixed_amount: mode === 'fixed' ? value : 0,
        sort_order: Number(row.dataset.shareIndex || 0)
      };
    }).filter((share) => share.participant_name);
  }

  // Recalcula, a cada digitação, a prévia de cada repasse e os totais da tela
  // do evento. Usa os valores ainda não salvos dos campos de dízimo e do
  // rateio, para o administrador conferir antes de gravar. A base de cálculo
  // (resultado operacional) sai do recebido atual menos os custos; o recebido
  // fica guardado em data-amount porque o texto já está formatado como moeda.
  function updateSharePreviews() {
    const collected = Number(document.querySelector('#finance-event-received').dataset.amount || 0);
    const eventAmounts = financeFor(state.activeEventId);
    const mode = titheMode.value;
    const operatingResult = collected - eventAmounts.costsTotal;
    const tithe = mode === 'fixed' ? Number(titheFixed.value || 0) : Math.round(Math.max(0, operatingResult) * Number(tithePercent.value || 0) / 100 * 100) / 100;
    const pool = Math.max(0, operatingResult - tithe);
    document.querySelector('#finance-event-tithe').textContent = formatMoney(tithe);
    let totalAllocated = 0;
    shareRows.querySelectorAll('.finance-share-row').forEach((row) => {
      const shareMode = row.querySelector('[data-share-mode]').value;
      const value = Number(row.querySelector('[data-share-value]').value || 0);
      const amount = shareMode === 'fixed' ? value : Math.round(pool * value / 100 * 100) / 100;
      row.querySelector('.finance-share-preview').textContent = formatMoney(amount);
      totalAllocated += amount;
    });
    document.querySelector('#finance-event-allocated').textContent = formatMoney(totalAllocated);
    document.querySelector('#finance-event-operating-result').textContent = formatMoney(operatingResult);
    document.querySelector('#finance-event-balance').textContent = formatMoney(operatingResult - tithe - totalAllocated);
    tithePercent.disabled = mode === 'fixed';
    titheFixed.disabled = mode !== 'fixed';
  }

  function renderReceipts(eventId) {
    const receipts = state.receipts.filter((receipt) => receipt.event_id === eventId);
    // O total fica ao lado do título da lista e ignora o que foi estornado,
    // para quem olha a seção saber a soma sem somar linha por linha.
    const total = receipts.reduce((sum, receipt) => sum + (receipt.voided_at ? 0 : Number(receipt.amount)), 0);
    const totalEl = document.querySelector('#finance-receipts-total');
    if (totalEl) totalEl.textContent = formatMoney(total);
    if (!receipts.length) {
      receiptsList.innerHTML = '<p class="field-hint">Ainda não há recebimentos registrados.</p>';
      return;
    }
    const methodLabels = { pix: 'Pix', cash: 'Dinheiro', card: 'Cartão', transfer: 'Transferência', other: 'Outra' };
    receiptsList.innerHTML = receipts.map((receipt) => {
      // O sinal do orçamento é o mesmo dinheiro visto pelas duas telas. Editar ou
      // apagar aqui mexeria só num dos lados, então esse recebimento fica sem
      // lápis e sem lixeira: quem muda o valor é a tela de sinal do orçamento.
      const fromQuote = Boolean(receipt.quote_deposit_id);
      const label = formatMoney(receipt.amount);
      let actions;
      if (receipt.voided_at) {
        actions = '<span class="finance-void-tag">Estornado</span>';
      } else {
        actions = `<div class="finance-receipt-row-actions">${fromQuote
          ? '<span class="finance-deposit-tag" title="Valor do sinal do orçamento. Para mudar, use a tela de sinal do orçamento.">Sinal do orçamento</span>'
          : `<button class="client-action" type="button" data-edit-finance-receipt="${receipt.id}" aria-label="Editar recebimento de ${label}" title="Editar"><i data-lucide="pencil"></i></button>`}<button class="client-action" type="button" data-duplicate="finance-receipt" data-duplicate-id="${receipt.id}" aria-label="Duplicar recebimento de ${label}" title="Duplicar"><i data-lucide="copy"></i></button><button class="client-action" type="button" data-void-receipt="${receipt.id}" aria-label="Estornar recebimento de ${label}" title="Estornar"><i data-lucide="rotate-ccw"></i></button>${fromQuote ? '' : `<button class="client-action" type="button" data-delete-finance-receipt="${receipt.id}" aria-label="Excluir recebimento de ${label}" title="Excluir"><i data-lucide="trash-2"></i></button>`}</div>`;
      }
      return `<div class="finance-receipt-row ${receipt.voided_at ? 'voided' : ''}">
      <div><strong>${label}</strong><span>${new Date(`${receipt.received_on}T12:00:00`).toLocaleDateString('pt-BR')} · ${methodLabels[receipt.payment_method] || 'Outra'}${receipt.notes ? ` · ${escapeHTML(receipt.notes)}` : ''}</span></div>
      ${actions}
    </div>`;
    }).join('');
    window.lucide?.createIcons();
  }

  // Custos do evento. Diferente dos recebimentos, custos são apagados de fato
  // (não há histórico de estorno), então a lista é só o que existe hoje.
  function renderCosts(eventId) {
    const costs = state.costs.filter((cost) => cost.event_id === eventId);
    const total = costs.reduce((sum, cost) => sum + Number(cost.amount), 0);
    document.querySelector('#finance-costs-total').textContent = formatMoney(total);
    document.querySelector('#finance-event-costs').textContent = formatMoney(total);
    document.querySelector('#finance-event-operating-result').textContent = formatMoney(financeFor(eventId).collected - total);
    if (!costs.length) {
      costsList.innerHTML = '<p class="field-hint">Ainda não há custos registrados para este evento.</p>';
      return;
    }
    costsList.innerHTML = costs.map((cost) => `<div class="finance-cost-row"><div><strong>${escapeHTML(cost.name)}</strong><span>${new Date(`${cost.incurred_on}T12:00:00`).toLocaleDateString('pt-BR')}${cost.notes ? ` · ${escapeHTML(cost.notes)}` : ''}</span></div><strong class="finance-cost-amount">${formatMoney(cost.amount)}</strong><div class="finance-cost-row-actions"><button class="client-action" type="button" data-edit-finance-cost="${cost.id}" aria-label="Editar custo ${escapeHTML(cost.name)}" title="Editar"><i data-lucide="pencil"></i></button><button class="client-action" type="button" data-duplicate="finance-cost" data-duplicate-id="${cost.id}" aria-label="Duplicar custo ${escapeHTML(cost.name)}" title="Duplicar"><i data-lucide="copy"></i></button><button class="client-action" type="button" data-delete-finance-cost="${cost.id}" aria-label="Excluir custo ${escapeHTML(cost.name)}" title="Excluir"><i data-lucide="trash-2"></i></button></div></div>`).join('');
    window.lucide?.createIcons();
  }

  // Cada formulário tem dois modos: cadastrar (id oculto vazio) e editar
  // (id preenchido). O reset volta ao modo cadastrar e já preenche a data com
  // hoje, para o campo mais usado não exigir digitação.
  function resetCostForm() {
    costForm.reset();
    document.querySelector('#finance-cost-id').value = '';
    document.querySelector('#finance-cost-date').value = localDateString();
    costFormSubmitLabel.textContent = 'Registrar custo';
    document.querySelector('[data-cancel-finance-cost]').hidden = true;
    costFeedback.textContent = '';
  }

  function resetReceiptForm() {
    receiptForm.reset();
    document.querySelector('#finance-receipt-id').value = '';
    document.querySelector('#finance-receipt-date').value = localDateString();
    receiptFormSubmitLabel.textContent = 'Registrar recebimento';
    receiptCancelButton.hidden = true;
    receiptFeedback.textContent = '';
  }

  // Preenche o formulário com um recebimento existente. O sinal do orçamento é
  // recusado aqui: ele tem uma ponta no Orçamento e editar só deste lado
  // deixaria as duas telas discordando do mesmo valor.
  function editReceipt(receiptId) {
    const receipt = state.receipts.find((item) => item.id === receiptId);
    if (!receipt) return;
    if (receipt.quote_deposit_id) {
      receiptFeedback.textContent = 'Este recebimento é o sinal do orçamento. Para mudar o valor, estorne e registre o sinal de novo.';
      return;
    }
    document.querySelector('#finance-receipt-id').value = receipt.id;
    document.querySelector('#finance-receipt-amount').value = receipt.amount;
    document.querySelector('#finance-receipt-date').value = receipt.received_on;
    document.querySelector('#finance-receipt-method').value = receipt.payment_method;
    document.querySelector('#finance-receipt-notes').value = receipt.notes || '';
    receiptFormSubmitLabel.textContent = 'Salvar alteração';
    receiptCancelButton.hidden = false;
    receiptFeedback.textContent = '';
  }

  // Preenche o formulário de custo com um registro existente (modo edição).
  function editCost(costId) {
    const cost = state.costs.find((item) => item.id === costId);
    if (!cost) return;
    document.querySelector('#finance-cost-id').value = cost.id;
    document.querySelector('#finance-cost-name').value = cost.name;
    document.querySelector('#finance-cost-amount').value = cost.amount;
    document.querySelector('#finance-cost-date').value = cost.incurred_on;
    document.querySelector('#finance-cost-notes').value = cost.notes || '';
    costFormSubmitLabel.textContent = 'Salvar alteração';
    document.querySelector('[data-cancel-finance-cost]').hidden = false;
  }

  // Duplicação de recebimento. O reset já deixa o formulário no modo criação
  // (id oculto vazio, botão de cancelar escondido); aqui só os campos do
  // original entram. O id e o vínculo com o sinal (quote_deposit_id) ficam de
  // fora, então a cópia nasce como um recebimento manual comum.
  function duplicateReceipt(receiptId) {
    const receipt = state.receipts.find((item) => item.id === receiptId);
    if (!receipt || receipt.voided_at) return;
    resetReceiptForm();
    document.querySelector('#finance-receipt-amount').value = receipt.amount;
    document.querySelector('#finance-receipt-date').value = receipt.received_on;
    document.querySelector('#finance-receipt-method').value = receipt.payment_method;
    document.querySelector('#finance-receipt-notes').value = receipt.notes || '';
  }

  // Duplicação de custo: mesma ideia, no formulário de custo.
  function duplicateCost(costId) {
    const cost = state.costs.find((item) => item.id === costId);
    if (!cost) return;
    resetCostForm();
    document.querySelector('#finance-cost-name').value = cost.name;
    document.querySelector('#finance-cost-amount').value = cost.amount;
    document.querySelector('#finance-cost-date').value = cost.incurred_on;
    document.querySelector('#finance-cost-notes').value = cost.notes || '';
  }

  // Abre a tela interna de um evento e preenche todos os campos: cabeçalho,
  // totais, config do dízimo, rateio, recebimentos e custos. Se o rateio ainda
  // não existe, parte da equipe vinculada ao evento com 0% — é mais rápido que
  // digitar nome por nome.
  function openFinanceEvent(eventId) {
    if (!requireAccess()) return;
    const event = state.events.find((item) => item.id === eventId);
    if (!event) return;
    state.activeEventId = eventId;
    const details = financeFor(eventId);
    document.querySelector('#finance-event-title').textContent = event.name || event.quotes?.name || 'Evento';
    document.querySelector('#finance-event-subtitle').textContent = `${event.clients?.name || 'Cliente'} · ${event.event_date ? new Date(`${event.event_date}T12:00:00`).toLocaleDateString('pt-BR') : 'Data a definir'}`;
    document.querySelector('#finance-event-contracted').textContent = formatMoney(event.quotes?.total);
    document.querySelector('#finance-event-received').textContent = formatMoney(details.collected);
    document.querySelector('#finance-event-received').dataset.amount = String(details.collected);
    document.querySelector('#finance-event-costs').textContent = formatMoney(details.costsTotal);
    document.querySelector('#finance-event-operating-result').textContent = formatMoney(details.operatingResult);
    document.querySelector('#finance-tithe-mode').value = details.setting.tithe_mode || 'percentage';
    document.querySelector('#finance-tithe-percent').value = details.setting.tithe_percent ?? 10;
    document.querySelector('#finance-tithe-fixed').value = details.setting.tithe_fixed_amount ?? 0;
    allocationFeedback.textContent = '';
    resetReceiptForm();
    resetCostForm();
    renderShareRows(details.shares.length ? details.shares : (state.staff.get(eventId) || []).map((member) => ({ ceremonialista_id: member.id, participant_name: member.name, calculation_mode: 'percentage', percentage: 0 })));
    renderReceipts(eventId);
    renderCosts(eventId);
    eventPanel.hidden = false;
    updateSharePreviews();
  }

  // Salva a config do dízimo + a divisão inteira pela function
  // save_event_finance, que no banco revalida dízimo e repasses contra o saldo
  // (o front repete a checagem só para dar erro na hora, sem ida ao servidor).
  // A function substitui todas as allocations do evento de uma vez.
  async function saveAllocations(event) {
    event.preventDefault();
    if (!requireAccess()) return;
    const button = allocationForm.querySelector('button[type="submit"]');
    const allocations = readDraftShares();
    // Percentuais que somam mais de 100% estourariam a base; valor fixo não
    // entra nesta soma porque não é percentual.
    const percentageSum = allocations.filter((share) => share.calculation_mode === 'percentage').reduce((sum, share) => sum + share.percentage, 0);
    if (percentageSum > 100) {
      allocationFeedback.textContent = 'A soma dos percentuais da equipe não pode passar de 100%.';
      return;
    }
    const totalCollected = financeFor(state.activeEventId).collected;
    const mode = titheMode.value;
    const operatingResult = totalCollected - financeFor(state.activeEventId).costsTotal;
    const titheValue = mode === 'fixed' ? Number(titheFixed.value || 0) : Math.round(Math.max(0, operatingResult) * Number(tithePercent.value || 0) / 100 * 100) / 100;
    const pool = Math.max(0, operatingResult - titheValue);
    const payout = allocations.reduce((sum, share) => sum + (share.calculation_mode === 'fixed' ? share.fixed_amount : pool * share.percentage / 100), 0);
    if (titheValue > Math.max(0, operatingResult) || payout > pool + 0.01) {
      allocationFeedback.textContent = 'Custos, dízimo ou repasses excedem o valor recebido disponível.';
      return;
    }
    button.disabled = true;
    button.querySelector('span').textContent = 'Salvando...';
    const { error } = await sb().rpc('save_event_finance', {
      target_event_id: state.activeEventId,
      target_tithe_mode: mode,
      target_tithe_percent: Number(tithePercent.value || 0),
      target_tithe_fixed_amount: Number(titheFixed.value || 0),
      target_allocations: allocations
    });
    button.disabled = false;
    button.querySelector('span').textContent = 'Salvar divisão';
    if (error) {
      allocationFeedback.textContent = error.message || 'Não foi possível salvar a divisão.';
      return;
    }
    notify('Divisão financeira salva.');
    await loadFinance();
    openFinanceEvent(state.activeEventId);
  }

  // Cria ou edita um recebimento pela function (insert direto foi revogado na
  // migration 019). O id oculto decide o modo; o banco confere o saldo.
  async function saveReceipt(event) {
    event.preventDefault();
    if (!requireAccess()) return;
    const receiptId = document.querySelector('#finance-receipt-id').value;
    const button = receiptForm.querySelector('button[type="submit"]');
    const payload = {
      target_event_id: state.activeEventId,
      target_amount: Number(document.querySelector('#finance-receipt-amount').value),
      target_received_on: document.querySelector('#finance-receipt-date').value,
      target_payment_method: document.querySelector('#finance-receipt-method').value,
      target_notes: document.querySelector('#finance-receipt-notes').value.trim() || null
    };
    if (!Number.isFinite(payload.target_amount) || payload.target_amount <= 0 || !payload.target_received_on) {
      receiptFeedback.textContent = 'Informe um valor maior que zero e a data do recebimento.';
      return;
    }
    button.disabled = true;
    // Vai pela function e não por insert direto: a migration 019 revogou o
    // insert na tabela e centraliza a conferência de dízimo e repasses.
    const { error } = await sb().rpc('save_event_finance_receipt', { target_receipt_id: receiptId || null, ...payload });
    button.disabled = false;
    if (error) {
      receiptFeedback.textContent = error.message || 'Não foi possível salvar o recebimento. Confira a migração 019 e suas permissões.';
      return;
    }
    resetReceiptForm();
    await loadFinance();
    openFinanceEvent(state.activeEventId);
    notify(receiptId ? 'Recebimento atualizado.' : 'Recebimento registrado.');
  }

  // Exclui um recebimento de verdade (não estorna). O sinal do orçamento segue
  // bloqueado: apagá-lo só deste lado deixaria o Orçamento ainda dando o valor
  // como pago.
  async function deleteReceipt(receiptId) {
    if (!requireAccess()) return;
    const receipt = state.receipts.find((item) => item.id === receiptId && item.event_id === state.activeEventId);
    if (!receipt) return;
    if (receipt.quote_deposit_id) {
      receiptFeedback.textContent = 'Este recebimento é o sinal do orçamento e não pode ser excluído aqui. Estorne o sinal na tela do orçamento.';
      return;
    }
    if (!window.confirm('Excluir este recebimento do evento?')) return;
    const { error } = await sb().rpc('delete_event_finance_receipt', { target_receipt_id: receiptId });
    if (error) {
      receiptFeedback.textContent = error.message || 'Não foi possível excluir o recebimento.';
      return;
    }
    resetReceiptForm();
    await loadFinance();
    openFinanceEvent(state.activeEventId);
    notify('Recebimento excluído.');
  }

  // Custos escrevem direto na tabela (a RLS controla o acesso); a diferença
  // para os recebimentos é essa, por isso aqui é insert/update em vez de RPC.
  // O id oculto decide entre criar e editar.
  async function saveCost(event) {
    event.preventDefault();
    if (!requireAccess()) return;
    const costId = document.querySelector('#finance-cost-id').value;
    const button = costForm.querySelector('button[type="submit"]');
    const payload = {
      event_id: state.activeEventId,
      name: document.querySelector('#finance-cost-name').value.trim(),
      amount: Number(document.querySelector('#finance-cost-amount').value),
      incurred_on: document.querySelector('#finance-cost-date').value,
      notes: document.querySelector('#finance-cost-notes').value.trim() || null
    };
    if (!payload.name || !Number.isFinite(payload.amount) || payload.amount <= 0 || !payload.incurred_on) {
      costFeedback.textContent = 'Informe um nome, valor maior que zero e data para o custo.';
      return;
    }
    button.disabled = true;
    const result = costId
      ? await sb().from('event_finance_costs').update(payload).eq('id', costId)
      : await sb().from('event_finance_costs').insert(payload);
    button.disabled = false;
    if (result.error) {
      costFeedback.textContent = 'Não foi possível salvar o custo. Confira se a migration 018 foi executada.';
      return;
    }
    resetCostForm();
    await loadFinance();
    openFinanceEvent(state.activeEventId);
    notify(costId ? 'Custo atualizado.' : 'Custo registrado.');
  }

  // Exclusão definitiva de custo (sem histórico). O confirm evita o clique
  // acidental, já que não há como desfazer.
  async function deleteCost(costId) {
    if (!requireAccess() || !window.confirm('Excluir este custo do evento?')) return;
    const { error } = await sb().from('event_finance_costs').delete().eq('id', costId);
    if (error) {
      costFeedback.textContent = 'Não foi possível excluir o custo.';
      return;
    }
    await loadFinance();
    openFinanceEvent(state.activeEventId);
    notify('Custo excluído.');
  }

  // Estorno preserva o registro (marca voided_at) em vez de apagar. Antes de
  // estornar, simula a conta sem este recebimento: se o dízimo ou os repasses
  // já salvos passariam do novo saldo, recusa e pede para ajustar o rateio —
  // senão o banco recusaria depois e a mensagem seria mais confusa.
  async function voidReceipt(receiptId) {
    if (!requireAccess()) return;
    const receipt = state.receipts.find((item) => item.id === receiptId && item.event_id === state.activeEventId);
    if (!receipt) return;
    const fromQuote = Boolean(receipt.quote_deposit_id);
    const question = fromQuote
      ? 'Estornar este sinal do orçamento? O orçamento volta a mostrar o valor como pendente.'
      : 'Estornar este recebimento? O registro ficará no histórico.';
    if (!window.confirm(question)) return;
    const current = financeFor(state.activeEventId);
    const nextCollected = Math.max(0, current.collected - Number(receipt.amount));
    const nextOperatingResult = nextCollected - current.costsTotal;
    const nextTithe = current.setting.tithe_mode === 'fixed'
      ? Number(current.setting.tithe_fixed_amount)
      : Math.round(Math.max(0, nextOperatingResult) * Number(current.setting.tithe_percent) / 100 * 100) / 100;
    const nextPool = Math.max(0, nextOperatingResult - nextTithe);
    const existingPayouts = current.shares.reduce((sum, share) => sum + (share.calculation_mode === 'fixed' ? Number(share.fixed_amount) : Math.round(nextPool * Number(share.percentage) / 100 * 100) / 100), 0);
    if (nextTithe > Math.max(0, nextOperatingResult) || existingPayouts > nextPool + 0.01) {
      receiptFeedback.textContent = 'Este estorno deixaria os repasses acima do saldo. Ajuste e salve a divisão antes de estornar.';
      return;
    }
    // O sinal do orçamento tem duas pontas guardadas: o depósito e o recebimento
    // do evento. Estornar só o recebimento deixaria o orçamento ainda dando o
    // valor como pago, então a chamada sai pela function que desfaz as duas.
    const { error } = fromQuote
      ? await sb().rpc('void_quote_deposit', { target_deposit_id: receipt.quote_deposit_id })
      : await sb().rpc('void_event_finance_receipt', { target_receipt_id: receiptId });
    if (error) {
      receiptFeedback.textContent = error.message || 'Não foi possível estornar o recebimento.';
      return;
    }
    await loadFinance();
    openFinanceEvent(state.activeEventId);
    notify(fromQuote ? 'Sinal estornado.' : 'Recebimento estornado.');
  }

  // ==========================================================================
  // Ligações de eventos
  // ==========================================================================
  // Os botões das listas usam delegação (um listener no container, resolvendo
  // o alvo por closest) porque cada render troca o innerHTML das linhas: um
  // listener preso a um botão morreria junto com a linha redesenhada.
  document.querySelector('[data-open-finance]')?.addEventListener('click', openFinance);
  document.querySelector('[data-close-finance]')?.addEventListener('click', () => { panel.hidden = true; });
  document.querySelector('[data-close-finance-event]')?.addEventListener('click', () => { eventPanel.hidden = true; });
  monthInput?.addEventListener('change', renderDashboard);
  allPeriods?.addEventListener('change', () => {
    monthInput.disabled = allPeriods.checked;
    renderDashboard();
  });
  eventList?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-open-finance-event]');
    if (button) openFinanceEvent(button.dataset.openFinanceEvent);
  });
  allocationForm?.addEventListener('submit', saveAllocations);
  receiptForm?.addEventListener('submit', saveReceipt);
  document.querySelector('[data-cancel-finance-receipt]')?.addEventListener('click', resetReceiptForm);
  costForm?.addEventListener('submit', saveCost);
  document.querySelector('[data-cancel-finance-cost]')?.addEventListener('click', resetCostForm);
  receiptsList?.addEventListener('click', (event) => {
    const editButton = event.target.closest('[data-edit-finance-receipt]');
    const deleteButton = event.target.closest('[data-delete-finance-receipt]');
    const voidButton = event.target.closest('[data-void-receipt]');
    if (editButton) editReceipt(editButton.dataset.editFinanceReceipt);
    if (deleteButton) deleteReceipt(deleteButton.dataset.deleteFinanceReceipt);
    if (voidButton) voidReceipt(voidButton.dataset.voidReceipt);
  });
  costsList?.addEventListener('click', (event) => {
    const editButton = event.target.closest('[data-edit-finance-cost]');
    const deleteButton = event.target.closest('[data-delete-finance-cost]');
    if (editButton) editCost(editButton.dataset.editFinanceCost);
    if (deleteButton) deleteCost(deleteButton.dataset.deleteFinanceCost);
  });
  document.querySelector('[data-add-finance-share]')?.addEventListener('click', () => {
    const rows = readDraftShares();
    rows.push({ participant_name: '', calculation_mode: 'percentage', percentage: 0, fixed_amount: 0 });
    renderShareRows(rows);
  });
  shareRows?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-share]');
    if (!button) return;
    const rows = readDraftShares();
    rows.splice(Number(button.closest('[data-share-index]').dataset.shareIndex), 1);
    renderShareRows(rows);
  });
  shareRows?.addEventListener('input', updateSharePreviews);
  shareRows?.addEventListener('change', (event) => {
    if (event.target.matches('[data-share-mode]')) {
      const row = event.target.closest('.finance-share-row');
      row.querySelector('.share-value-label').textContent = event.target.value === 'percentage' ? 'Percentual (%)' : 'Valor (R$)';
    }
    updateSharePreviews();
  });
  [titheMode, tithePercent, titheFixed].forEach((control) => control?.addEventListener('input', updateSharePreviews));
  titheMode?.addEventListener('change', updateSharePreviews);

  // API exposta ao realtime.js. `reload` recarrega o cache e, se o detalhe de
  // um evento estiver aberto, redesenha essa tela também, senão os totais
  // ficariam velhos depois de uma alteração feita em outro aparelho.
  window.plenitudeFinance = {
    open: openFinance,
    reload: async () => {
      await loadFinance();
      if (state.activeEventId && !eventPanel.hidden) openFinanceEvent(state.activeEventId);
    }
  };

  // Duplicação: os handlers abrem o formulário já no modo criação preenchido.
  // Só funcionam com o detalhe de um evento aberto (é de lá que os ids vêm).
  window.plenitudeDuplicate?.register('finance-receipt', duplicateReceipt);
  window.plenitudeDuplicate?.register('finance-cost', duplicateCost);
  if (monthInput && !monthInput.value) monthInput.value = localDateString().slice(0, 7);
})();