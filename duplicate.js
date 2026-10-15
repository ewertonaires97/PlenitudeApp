/* ==========================================================================
   DUPLICAR REGISTROS
   ==========================================================================
   Uma função global para copiar um card ou item de lista em qualquer módulo.
   Clicar no botão de duplicar não grava nada: ele abre o formulário de criação
   específico daquele módulo já preenchido com os campos do registro original,
   para a pessoa revisar e salvar. O novo registro nasce como qualquer outro,
   pelo caminho normal de salvamento do módulo.

   Por que assim e não um "INSERT" direto na tabela:
   - Cada módulo tem regras próprias ao salvar (vínculos N:N, imagens, trigger
     que recalcula totais, validações). Um clone no banco pelo navegador
     pularia todas elas — e ainda deixaria a cópia sem os vínculos.
   - Abrindo o formulário, quem decide o que copiar é o próprio módulo, e a
     pessoa vê exatamente o que vai ser criado.

   Como funciona:
   - Cada módulo registra, uma vez, um handler para o seu tipo:
       window.plenitudeDuplicate.register('client', (id) => { ... });
     O handler acha o item no estado do módulo e chama o abridor de formulário
     passando uma CÓPIA SEM `id` (ver `copy`). Como os abridores decidem entre
     criar e editar pelo `id`, a cópia cai no modo de criação já preenchido.
   - Os cards ganham um botão com `data-duplicate="<tipo>"` e
     `data-duplicate-id="<id>"`. Um único listener delegado aqui atende todos os
     módulos e todas as listas, inclusive as que são reconstruídas a cada render.

   Escopo dos dados copiados: só os campos do formulário. Imagens de cardápio e
   estoque, itens de orçamento e materiais de serviço NÃO são copiados — são
   arquivos de storage e vínculos que exigiriam tratamento próprio e não fazem
   parte de uma cópia rápida.
   ========================================================================== */
(function () {
  'use strict';

  // tipo -> função(id) que abre o formulário de criação do módulo já preenchido.
  const handlers = new Map();

  // Campos que identificam o original e são sempre gerados pelo banco. Saem da
  // cópia para o formulário abrir como criação e não tentar editar o original.
  const IDENTITY_FIELDS = ['id', 'created_at', 'updated_at'];

  // Cópia rasa sem os campos de identidade. Rasa de propósito: os objetos do
  // estado já estão prontos para o formulário, e uma cópia profunda copiaria
  // listas derivadas (categoryIds, imageUrls) que não devem ir para o novo
  // registro.
  function copy(item) {
    if (!item || typeof item !== 'object') return null;
    const clone = { ...item };
    IDENTITY_FIELDS.forEach((field) => delete clone[field]);
    return clone;
  }

  function register(type, handler) {
    if (!type || typeof handler !== 'function') {
      console.warn('[Duplicar] Registro inválido:', type);
      return;
    }
    handlers.set(type, handler);
  }

  // Executa a duplicação de um tipo. Sem handler registrado (módulo que ainda
  // não carregou), avisa no console em vez de estourar um erro no clique.
  function run(type, id) {
    const handler = handlers.get(type);
    if (!handler) {
      console.warn(`[Duplicar] Nenhum handler registrado para o tipo "${type}".`);
      return;
    }
    handler(id);
  }

  // Um listener só, delegado no documento: os cards são reconstruídos a cada
  // render, então prender o handler ao botão faria ele morrer com a lista. O
  // `closest('[data-duplicate]')` também evita reagir a cliques fora dos botões.
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-duplicate]');
    if (!button) return;
    // Os cards de ficha (detail-trigger) já ignoram clique em button, mas o
    // preventDefault garante que o botão não dispare nenhum comportamento de
    // link/âncora por engano em telas que não têm esse guarda.
    event.preventDefault();
    run(button.dataset.duplicate, button.dataset.duplicateId);
  });

  window.plenitudeDuplicate = { register, run, copy };

})();
