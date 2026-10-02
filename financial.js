(() => {
  'use strict';

  const sb = () => window.plenitudeSupabase || null;
  const permissions = () => window.plenitudePermissions || null;
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
  const receiptSubmitLabel = document.querySelector('#finance-receipt-submit-label');
  const costForm = document.querySelector('#finance-cost-form');
  const costFeedback = document.querySelector('#finance-cost-feedback');
  const costsList = document.querySelector('#finance-costs-list');
  const costFormSubmitLabel = document.querySelector('#finance-cost-submit-label');
  const titheMode = document.querySelector('#finance-tithe-mode');
  const tithePercent = document.querySelector('#finance-tithe-percent');
  const titheFixed = document.querySelector('#finance-tithe-fixed');

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
  const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const localDateString = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };
  const notify = (message) => {
    const toast = document.querySelector('.toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => toast.classList.remove('show'), 2600);
  };

  function requireAccess() {
    if (permissions()?.allow('financeiro')) return true;
    if (!permissions()) setFeedback('O controle de acesso ainda está carregando. Tente novamente.', true);
    return false;
  }

  function setFeedback(message, isError = false) {
    feedback.textContent = message;
    feedback.style.color = isError ? '#a0483d' : '';
  }

  function financeFor(eventId) {
    const event = state.events.find((item) => item.id === eventId);
    const setting = state.settings.get(eventId) || { tithe_mode: 'percentage', tithe_percent: 10, tithe_fixed_amount: 0 };
    const receipts = state.receipts.filter((item) => item.event_id === eventId && !item.voided_at);
    const collected = receipts.reduce((sum, receipt) => sum + Number(receipt.amount), 0);
    const costs = state.costs.filter((item) => item.event_id === eventId);
    const costsTotal = costs.reduce((sum, cost) => sum + Number(cost.amount), 0);
    const operatingResult = collected - costsTotal;
    const tithe = setting.tithe_mode === 'fixed' ? Number(setting.tithe_fixed_amount) : Math.round(Math.max(0, operatingResult) * Number(setting.tithe_percent) / 100 * 100) / 100;
    const base = Math.max(0, operatingResult - tithe);
    const shares = state.allocations.get(eventId) || [];
    const allocated = shares.reduce((sum, share) => sum + (share.calculation_mode === 'fixed' ? Number(share.fixed_amount) : Math.round(base * Number(share.percentage) / 100 * 100) / 100), 0);
    return { event, setting, receipts, costs, collected, costsTotal, operatingResult, tithe, base, shares, allocated, netProfit: operatingResult - tithe - allocated };
  }

  function monthEvents() {
    if (allPeriods.checked || !monthInput.value) return state.events;
    return state.events.filter((event) => (event.event_date || '').startsWith(monthInput.value));
  }

  function renderDashboard() {
    const events = monthEvents();
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
    if (ids.length) {
      const [settingsResult, receiptsResult, sharesResult, staffResult, costsResult] = await Promise.all([
        sb().from('event_finance_settings').select('*').in('event_id', ids),
        sb().from('event_finance_receipts').select('*').in('event_id', ids).order('received_on', { ascending: false }),
        sb().from('event_finance_allocations').select('*').in('event_id', ids).order('sort_order'),
        sb().from('ceremonialistas').select('id, event_id, name, specialty').in('event_id', ids).order('name'),
        sb().from('event_finance_costs').select('*').in('event_id', ids).order('incurred_on', { ascending: false })
      ]);
      const failed = [settingsResult, receiptsResult, sharesResult, staffResult, costsResult].find((result) => result.error);
      if (failed) {
        setFeedback('Não foi possível carregar recebimentos, custos, rateios ou equipe. Confira as migrations 017 e 018 e a permissão Financeiro.', true);
        eventList.innerHTML = '';
        return;
      }
      state.settings = new Map((settingsResult.data || []).map((item) => [item.event_id, item]));
      state.receipts = receiptsResult.data || [];
      state.costs = costsResult.data || [];
      state.allocations = new Map();
      (sharesResult.data || []).forEach((item) => {
        if (!state.allocations.has(item.event_id)) state.allocations.set(item.event_id, []);
        state.allocations.get(item.event_id).push(item);
      });
      state.staff = new Map();
      (staffResult.data || []).forEach((member) => {
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
    setFeedback(`${state.events.length} ${state.events.length === 1 ? 'evento confirmado' : 'eventos confirmados'}`);
    renderDashboard();
  }

  function openFinance() {
    if (!requireAccess()) return;
    panel.hidden = false;
    if (!monthInput.value) monthInput.value = localDateString().slice(0, 7);
    loadFinance();
  }

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
    const total = receipts.reduce((sum, receipt) => sum + (receipt.voided_at ? 0 : Number(receipt.amount)), 0);
    document.querySelector('#finance-receipts-total').textContent = formatMoney(total);
    if (!receipts.length) {
      receiptsList.innerHTML = '<p class="field-hint">Ainda não há recebimentos registrados.</p>';
      return;
    }
    const methodLabels = { pix: 'Pix', cash: 'Dinheiro', card: 'Cartão', transfer: 'Transferência', other: 'Outra' };
    receiptsList.innerHTML = receipts.map((receipt) => `<div class="finance-receipt-row ${receipt.voided_at ? 'voided' : ''}">
      <div><strong>${formatMoney(receipt.amount)}</strong><span>${new Date(`${receipt.received_on}T12:00:00`).toLocaleDateString('pt-BR')} · ${methodLabels[receipt.payment_method] || 'Outra'}${receipt.notes ? ` · ${escapeHTML(receipt.notes)}` : ''}</span></div>
      ${receipt.voided_at ? '<span class="finance-void-tag">Estornado</span>' : `<div class="finance-receipt-row-actions"><button class="client-action" type="button" data-edit-finance-receipt="${receipt.id}" aria-label="Editar recebimento" title="Editar"><i data-lucide="pencil"></i></button><button class="client-action" type="button" data-delete-finance-receipt="${receipt.id}" aria-label="Excluir recebimento" title="Excluir"><i data-lucide="trash-2"></i></button></div>`}
    </div>`).join('');
    window.lucide?.createIcons();
  }

  function resetReceiptForm() {
    receiptForm.reset();
    document.querySelector('#finance-receipt-id').value = '';
    document.querySelector('#finance-receipt-date').value = localDateString();
    receiptSubmitLabel.textContent = 'Registrar recebimento';
    document.querySelector('[data-cancel-finance-receipt]').hidden = true;
    receiptFeedback.textContent = '';
  }

  function editReceipt(receiptId) {
    const receipt = state.receipts.find((item) => item.id === receiptId && item.event_id === state.activeEventId && !item.voided_at);
    if (!receipt) return;
    document.querySelector('#finance-receipt-id').value = receipt.id;
    document.querySelector('#finance-receipt-amount').value = receipt.amount;
    document.querySelector('#finance-receipt-date').value = receipt.received_on;
    document.querySelector('#finance-receipt-method').value = receipt.payment_method;
    document.querySelector('#finance-receipt-notes').value = receipt.notes || '';
    receiptSubmitLabel.textContent = 'Salvar alteração';
    document.querySelector('[data-cancel-finance-receipt]').hidden = false;
    document.querySelector('#finance-receipt-amount').focus();
  }

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
    costsList.innerHTML = costs.map((cost) => `<div class="finance-cost-row"><div><strong>${escapeHTML(cost.name)}</strong><span>${new Date(`${cost.incurred_on}T12:00:00`).toLocaleDateString('pt-BR')}${cost.notes ? ` · ${escapeHTML(cost.notes)}` : ''}</span></div><strong class="finance-cost-amount">${formatMoney(cost.amount)}</strong><div class="finance-cost-row-actions"><button class="client-action" type="button" data-edit-finance-cost="${cost.id}" aria-label="Editar custo ${escapeHTML(cost.name)}" title="Editar"><i data-lucide="pencil"></i></button><button class="client-action" type="button" data-delete-finance-cost="${cost.id}" aria-label="Excluir custo ${escapeHTML(cost.name)}" title="Excluir"><i data-lucide="trash-2"></i></button></div></div>`).join('');
    window.lucide?.createIcons();
  }

  function resetCostForm() {
    costForm.reset();
    document.querySelector('#finance-cost-id').value = '';
    document.querySelector('#finance-cost-date').value = localDateString();
    costFormSubmitLabel.textContent = 'Registrar custo';
    document.querySelector('[data-cancel-finance-cost]').hidden = true;
    costFeedback.textContent = '';
  }

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
    document.querySelector('#finance-cost-name').focus();
  }

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
    receiptFeedback.textContent = '';
    resetReceiptForm();
    resetCostForm();
    renderShareRows(details.shares.length ? details.shares : (state.staff.get(eventId) || []).map((member) => ({ ceremonialista_id: member.id, participant_name: member.name, calculation_mode: 'percentage', percentage: 0 })));
    renderReceipts(eventId);
    renderCosts(eventId);
    eventPanel.hidden = false;
    updateSharePreviews();
  }

  async function saveAllocations(event) {
    event.preventDefault();
    if (!requireAccess()) return;
    const button = allocationForm.querySelector('button[type="submit"]');
    const allocations = readDraftShares();
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

  async function saveReceipt(event) {
    event.preventDefault();
    if (!requireAccess()) return;
    const receiptId = document.querySelector('#finance-receipt-id').value;
    const amount = Number(document.querySelector('#finance-receipt-amount').value);
    if (!Number.isFinite(amount) || amount <= 0) {
      receiptFeedback.textContent = 'Informe um valor maior que zero.';
      return;
    }
    const button = receiptForm.querySelector('button[type="submit"]');
    const previousLabel = receiptSubmitLabel.textContent;
    button.disabled = true;
    receiptSubmitLabel.textContent = 'Salvando...';
    const { error } = await sb().rpc('save_event_finance_receipt', {
      target_receipt_id: receiptId || null,
      target_event_id: state.activeEventId,
      target_amount: amount,
      target_received_on: document.querySelector('#finance-receipt-date').value,
      target_payment_method: document.querySelector('#finance-receipt-method').value,
      target_notes: document.querySelector('#finance-receipt-notes').value.trim() || null
    });
    button.disabled = false;
    if (error) {
      receiptSubmitLabel.textContent = previousLabel;
      receiptFeedback.textContent = error.message || 'Não foi possível salvar o recebimento. Confira a migration 019 e suas permissões.';
      return;
    }
    resetReceiptForm();
    await loadFinance();
    openFinanceEvent(state.activeEventId);
    notify(receiptId ? 'Recebimento atualizado.' : 'Recebimento registrado.');
  }

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

  async function deleteReceipt(receiptId) {
    if (!requireAccess() || !window.confirm('Excluir este recebimento? Esta ação não pode ser desfeita.')) return;
    const receipt = state.receipts.find((item) => item.id === receiptId && item.event_id === state.activeEventId);
    if (!receipt || receipt.voided_at) return;
    const { error } = await sb().rpc('delete_event_finance_receipt', { target_receipt_id: receiptId });
    if (error) {
      receiptFeedback.textContent = error.message || 'Não foi possível excluir o recebimento.';
      return;
    }
    await loadFinance();
    openFinanceEvent(state.activeEventId);
    notify('Recebimento excluído.');
  }

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
    if (editButton) editReceipt(editButton.dataset.editFinanceReceipt);
    if (deleteButton) deleteReceipt(deleteButton.dataset.deleteFinanceReceipt);
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
    shareRows.lastElementChild?.querySelector('[data-share-name]')?.focus();
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

  window.plenitudeFinance = {
    open: openFinance,
    reload: async () => {
      await loadFinance();
      if (state.activeEventId && !eventPanel.hidden) openFinanceEvent(state.activeEventId);
    }
  };
  if (monthInput && !monthInput.value) monthInput.value = localDateString().slice(0, 7);
})();
