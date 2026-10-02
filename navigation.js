// ============================================================================
// NAVEGAÇÃO
//
// O app não tem router: cada tela é uma <section> que aparece e some pelo
// atributo `hidden`. Este arquivo cuida da pilha dessas telas e entrega três
// coisas que antes não existiam:
//
//   - o botão de voltar, que fecha a última tela aberta e devolve para a tela
//     anterior, em vez de saltar direto para o início;
//   - o botão de ir para o início, que fecha tudo de uma vez;
//   - a integração com o histórico do navegador, que é o que faz o botão
//     físico de voltar do Android e do iPhone fecharem a tela em vez de
//     levarem o usuário para fora do app.
//
// A pilha é observada pelo atributo `hidden` das telas de SCREENS, e não por
// uma chamada em cada lugar que abre uma tela. Assim nenhum dos módulos
// existentes precisa ser alterado para participar da navegação.
// ============================================================================
(() => {
  'use strict';

  // Cada tela e o botão que a fecha. Voltar usa o mesmo botão do X, o que
  // preserva a limpeza de estado de cada módulo (listas recarregadas, campos
  // zerados, ids largados) em vez de só esconder a <section> por fora.
  const SCREENS = [
    ['client-panel', 'data-close-clients'],
    ['inventory-panel', 'data-close-inventory'],
    ['inventory-form-panel', 'data-close-inventory-form'],
    ['movement-form-panel', 'data-close-movement-form'],
    ['client-form-panel', 'data-close-client-form'],
    ['service-panel', 'data-close-services'],
    ['menu-panel', 'data-close-menus'],
    ['menu-form-panel', 'data-close-menu-form'],
    ['service-form-panel', 'data-close-service-form'],
    ['category-panel', 'data-close-categories'],
    ['inventory-category-panel', 'data-close-inventory-categories'],
    ['settings-panel', 'data-close-settings'],
    ['users-panel', 'data-close-users'],
    ['user-form-panel', 'data-close-user-form'],
    ['quote-panel', 'data-close-quotes'],
    ['quote-form-panel', 'data-close-quote-form'],
    ['quote-saved-panel', 'data-close-quote-saved'],
    ['event-panel', 'data-close-events'],
    ['event-form-panel', 'data-close-event-form'],
    ['event-detail-panel', 'data-close-event-detail'],
    ['ceremonial-panel', 'data-close-ceremonial'],
    ['finance-panel', 'data-close-finance'],
    ['finance-event-panel', 'data-close-finance-event'],
    ['ceremonial-activity-modal', 'data-close-activity-modal'],
    ['ceremonial-templates-modal', 'data-close-templates-modal'],
    ['ceremonial-guest-modal', 'data-close-guest-modal'],
    ['ceremonial-staff-modal', 'data-close-staff-modal'],
    ['ceremonial-table-modal', 'data-close-table-modal'],
    ['detail-view', 'data-close-detail'],
    ['image-viewer', 'data-close-image-viewer']
  ].map(([id, closeAttribute]) => ({ id, closeAttribute, element: document.getElementById(id) }))
    .filter((screen) => screen.element);

  const BY_ID = {};
  SCREENS.forEach((screen) => { BY_ID[screen.id] = screen; });

  // Telas abertas, da mais antiga para a mais nova. A última é a que o usuário
  // está vendo e a que voltar fecha.
  let stack = [];
  // Telas que seguem na pilha mesmo escondidas, porque outra abriu por cima
  // delas. É o caso de Configurações: as telas de apoio saem de lá, e voltar
  // precisa devolver para lá em vez de pular para o início.
  const covered = new Set();
  // Quantas entradas esta navegação empurrou para o histórico do navegador.
  let historyDepth = 0;
  // Alterações de `hidden` feitas por aqui. O MutationObserver chega depois do
  // código que mudou o atributo e reportaria esse fechamento de novo, o que
  // faria a tela fechar em laço.
  const ownChanges = [];
  // Um history.go() disparado por aqui: o popstate que chegar é o balanço da
  // operação, e não um pedido do usuário.
  let traversing = false;
  // Lote de mudanças que chegou com o histórico em movimento.
  let queued = null;

  function stateFor(screens) {
    return { plenitudeNavigation: true, screens: screens.slice() };
  }

  // Esconde a tela sem contar isso como fechamento do usuário.
  function hide(screen) {
    ownChanges.push(screen.id);
    if (!screen.element.hidden) screen.element.hidden = true;
  }

  // Fecha a tela pelo botão que ela já tem, para que a limpeza do módulo
  // aconteça igual acontece com o X.
  function closeScreen(screen) {
    ownChanges.push(screen.id);
    const button = document.querySelector(`[${screen.closeAttribute}]`);
    if (button) {
      button.click();
      return;
    }
    hide(screen);
  }

  // Depois de qualquer mudança na pilha, a tela do topo precisa estar de fato
  // visível. Ela pode não estar quando é uma tela coberta que outra abriu por
  // cima, e é ela que volta a aparecer quando o topo sai.
  function settleCovered() {
    const top = stack[stack.length - 1];
    if (!top || !covered.has(top)) return;
    const screen = BY_ID[top];
    // Já está à vista: era só o registro de cobertura que ficou para trás.
    if (!screen || !screen.element.hidden) {
      covered.delete(top);
      return;
    }
    covered.delete(top);
    ownChanges.push(top);
    screen.element.hidden = false;
  }

  // Mantém o histórico do navegador com a mesma quantidade de entradas que a
  // pilha tem de telas. Sem isso o botão do aparelho ficaria sem o que fechar,
  // ou fecharia uma tela duas vezes.
  function syncHistory() {
    const delta = stack.length - historyDepth;
    if (delta > 0) {
      window.history.pushState(stateFor(stack), '');
      historyDepth += 1;
      return;
    }
    if (delta === 0) {
      window.history.replaceState(stateFor(stack), '');
      return;
    }
    historyDepth = stack.length;
    traversing = true;
    window.history.go(delta);
  }

  // Fecha a tela do topo da pilha, sem mexer no histórico do navegador.
  function closeTop() {
    if (!stack.length) return false;
    const top = stack.pop();
    const screen = BY_ID[top];
    if (screen) closeScreen(screen);
    settleCovered();
    return true;
  }

  // Volta uma tela pelo botão da tela. O histórico anda junto porque aqui quem
  // pediu o movimento foi o app.
  function back() {
    if (!closeTop()) return;
    syncHistory();
  }

  // Voltar para o início fecha tudo de uma vez, e o histórico volta inteiro de
  // uma vez também: um history.go() por tela fecharia a pilha aos poucos, com
  // as telas passando uma a uma na frente do usuário.
  function home() {
    if (!stack.length) return;
    const open = stack.slice();
    stack = [];
    covered.clear();
    // Do topo para a base, que é a ordem em que as telas foram abertas.
    for (let index = open.length - 1; index >= 0; index -= 1) {
      const screen = BY_ID[open[index]];
      if (screen) closeScreen(screen);
    }
    settleCovered();
    syncHistory();
  }

  // Registra uma tela que vai ser escondida só porque outra abriu por cima
  // dela. Ela continua na pilha, e voltar a traz de volta.
  function cover(panel) {
    if (!panel || !BY_ID[panel.id]) return;
    if (!stack.includes(panel.id)) stack.push(panel.id);
    covered.add(panel.id);
    syncHistory();
  }

  // Uma tela que abre em cima de outra entra na pilha. Uma tela que fecha
  // sozinha é o X, o envio de um formulário ou o fim de uma etapa: nos três
  // casos a pilha encolhe, e a entrada que sobrou no histórico precisa sair
  // junto, senão o botão do aparelho não teria o que fechar.
  function applyBatch(batch) {
    if (traversing) {
      queued = batch;
      return;
    }

    const opened = batch.opened.filter((id) => !stack.includes(id));
    // Tela coberta não sai da pilha: ela só sumiu de vista.
    const closed = batch.closed.filter((id) => stack.includes(id) && !covered.has(id));
    if (!opened.length && !closed.length) return;

    stack = stack.filter((id) => !closed.includes(id)).concat(opened);
    settleCovered();
    syncHistory();
  }

  // Navegadores empurram a mesma URL: o app continua em index.html e quem
  // recarrega ou fecha a aba não leva nenhum estado de tela junto. É a primeira
  // entrada, a que representa a tela inicial.
  window.history.replaceState(stateFor(stack), '');

  // O observer chega depois do código que mudou o `hidden`, então um lote pode
  // trazer tela fechada e aberta juntas: quem salva um formulário, por exemplo,
  // fecha o formulário e abre a confirmação a seguir. Vem tudo junto.
  const observer = new MutationObserver((records) => {
    const batch = { opened: [], closed: [] };
    records.forEach((record) => {
      const id = record.target.id;
      if (!BY_ID[id]) return;
      const own = ownChanges.indexOf(id);
      if (own !== -1) {
        ownChanges.splice(own, 1);
        return;
      }
      if (record.target.hidden) batch.closed.push(id);
      else batch.opened.push(id);
    });
    if (!batch.opened.length && !batch.closed.length) return;
    applyBatch(batch);
  });
  SCREENS.forEach((screen) => observer.observe(screen.element, {
    attributes: true,
    attributeFilter: ['hidden']
  }));

  // Botão físico de voltar do Android e do iPhone. O navegador já andou no
  // histórico sozinho, então aqui só falta fechar a tela correspondente: chamar
  // syncHistory de novo faria o app dar mais um passo para trás.
  window.addEventListener('popstate', () => {
    if (traversing) {
      traversing = false;
      if (queued) {
        const batch = queued;
        queued = null;
        applyBatch(batch);
      }
      return;
    }
    historyDepth = Math.max(0, historyDepth - 1);
    closeTop();
  });

  // Os dois botões entram em todo cabeçalho de tela. O cabeçalho vira uma linha
  // de três áreas (voltar, título, ações), então o título é o que estica e as
  // pontas ficam sempre no lugar, mesmo com muitas ações no meio.
  const NAV_MARKUP = `
    <button class="icon-button" type="button" data-nav-back aria-label="Voltar para a tela anterior" title="Voltar">
      <i data-lucide="arrow-left"></i>
    </button>
    <button class="icon-button" type="button" data-nav-home aria-label="Ir para o início" title="Início">
      <i data-lucide="house"></i>
    </button>`;

  function buildNav() {
    const group = document.createElement('div');
    group.className = 'screen-nav';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Navegação da tela');
    group.innerHTML = NAV_MARKUP;

    document.querySelectorAll('.client-panel-header').forEach((header) => {
      if (header.querySelector('.screen-nav')) return;
      header.insertBefore(group.cloneNode(true), header.firstChild);
    });

    // O visualizador de imagem não tem cabeçalho, mas também é uma tela da
    // pilha: precisa dos dois botões para não ser um beco sem saída.
    const viewer = document.getElementById('image-viewer');
    if (viewer && !viewer.querySelector('.screen-nav')) {
      viewer.insertBefore(group, viewer.firstChild);
    }
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-nav-back], [data-nav-home]');
    if (button) {
      event.preventDefault();
      if (button.hasAttribute('data-nav-home')) home();
      else back();
      return;
    }

    // A marca do topo apontava para #inicio, o que empurrava uma entrada de
    // histórico a cada toque e desalinhava o voltar do aparelho. Ir para o
    // início é o mesmo destino, sem mexer no histórico.
    const brand = event.target.closest('.brand');
    if (brand) {
      event.preventDefault();
      home();
    }
  });

  buildNav();

  // Mesmo formato dos outros módulos, para quem precisar chamar voltar, ir
  // para o início ou abrir uma tela por cima de outra a partir do código.
  window.plenitudeNav = { back, home, cover, stack: () => stack.slice() };
})();