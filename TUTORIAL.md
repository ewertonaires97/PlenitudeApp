# Tutorial: como editar o PlenitudeApp na mão

Guia para quem nunca abriu este código e quer mudar a **aparência** ou o
**comportamento** de um botão, card, campo ou tela do aplicativo — sem saber
programar.

---

## Índice

1. [O que este projeto é](#1-o-que-este-projeto-é)
2. [Rodar o projeto na sua máquina](#2-rodar-o-projeto-na-sua-máquina)
3. [A regra de ouro: os 3 arquivos](#3-a-regra-de-oro-os-3-arquivos)
4. [As 4 ferramentas do DevTools que você precisa](#4-as-4-ferramentas-do-devtools-que-você-precisa)
5. [Os 3 caminhos para achar o código de um elemento](#5-os-3-caminhos-para-achar-o-código-de-um-elemento)
6. [Como o app funciona por dentro (o ciclo da tela)](#6-como-o-app-funciona-por-dentro-o-ciclo-da-tela)
7. [Guia por tela: onde está o CSS e o JS de cada uma](#7-guia-por-tela-onde-está-o-css-e-o-js-de-cada-uma)
8. [Receitas prontas](#8-receitas-prontas)
9. [Criando uma tela nova do zero](#9-criando-uma-tela-nova-do-zero)
10. [Armadilhas: o que vai te morder](#10-armadilhas-o-que-vai-te-morder)
11. [Glossário](#11-glossário)

> **Aviso sobre números de linha.** Este guia cita linhas para facilitar a
> busca, mas elas mudam assim que você edita alguma coisa. Use sempre o
> **nome da função ou da classe** como âncora de busca. O código é a fonte
> da verdade, não este documento.
>
> ⚠️ **REGRA OBRIGATÓRIA:** Toda alteração feita no código **DEVE** ser
> refletida neste `TUTORIAL.md`. Se você mudou uma função, uma tela, um
> fluxo, um bloco CSS ou adicionou um módulo novo, atualize este documento
> antes de considerar a tarefa concluída. O tutorial desatualizado engana
> quem vem depois de você.

---

## 1. O que este projeto é

- **App web mobile-first**, feito para tela de celular (largura máxima de
  520 px, centralizado no desktop).
- **100% JavaScript puro** ("vanilla"). Sem React, sem Vue, sem Angular.
- **Sem build, sem `npm install`, sem framework.** Não existe `package.json`.
  Você edita o arquivo, salva, recarrega. É isso.
- **Tudo em HTML, CSS e JS estático.** O backend é o
  [Supabase](https://supabase.com) (Postgres + login + tempo real).
- **É um PWA** (app instalável). Isso tem uma consequência importante para
  você: *as mudanças podem não aparecer na primeira recarga*. Ver
  [Armadilha nº 1](#armadilha-1--o-app-serve-uma-versao-antiga-do-seu-código).

### Os arquivos que você vai mexer

| Arquivo | Tamanho | O que é | Quando editar |
|---|---|---|---|
| `index.html` | ~1160 linhas | **O esqueleto do app.** Todas as telas fixas, o cabeçalho, o menu de baixo, os formulários. | Criar/renomear/mostrar-esconder um elemento fixo |
| `styles.css` | ~1690 linhas | **Toda a aparência.** Cores, tamanhos, espaçamentos, animações. Está organizado em 61 blocos comentados + um sumário no topo. | Qualquer mudança visual |
| `app.js` | ~3060 linhas | Clientes, serviços, cardápios, estoque, orçamentos, sinal, lembretes, configurações, ficha de detalhes, visualizador de imagem, PDF | O "coração" do app |
| `events.js` | ~1570 linhas | Agenda de eventos, criar/editar evento, tela de detalhe do evento | Eventos |
| `ceremonial.js` | ~2970 linhas | Cerimônia: roteiro, recepção, equipe, mesas, modo ao vivo, modelos | Cerimônia |
| `financial.js` | ~600 linhas | Financeiro: indicadores, recebimentos, custos, rateio | Financeiro |
| `permissions.js` | ~820 linhas | Quem pode ver o quê, tela de Usuários, saudação do topo | Permissões e usuários |
| `navigation.js` | ~377 linhas | Pilha de telas, botão voltar/início, botão físico do celular | Telas novas, navegação |
| `alerts.js` | ~392 linhas | Sino do topo e central de avisos | Avisos |
| `realtime.js` | ~349 linhas | Sincronização em tempo real entre celulares | Sincronização |
| `sw.js` | 50 linhas | Service worker (cache offline) | Só quando o app não atualiza |
| `supabase-config.js` | 5 linhas | Conexão com o banco (**contém a chave da API**) | ⚠️ Não mexa sem motivo |

---

## 2. Rodar o projeto na sua máquina

O app **precisa de um servidor HTTP**. Abrir o `index.html` com dois cliques
(`file://`) não funciona: o login e o banco não carregam.

```bash
cd /caminho/para/PlenitudeApp

# opção 1 (tem Python instalado)
python3 -m http.server 8080

# opção 2 (tem Node instalado)
npx serve .
```

Depois abra **http://localhost:8080** no navegador.

Para testar no celular de verdade, com a tela espelhada e recarga automática,
veja a seção de Live Server / rede local nas dicas do fim do
[README](README.md).

### Antes de começar: faça uma conta

O app exige login (Supabase Auth). Sem login você só vê a tela verde de acesso
e não consegue chegar em nenhuma tela para inspecionar.

---

## 3. A regra de ouro: os 3 arquivos

```
        index.html                    styles.css                    *.js
     (O QUE existe)              (COMO parece)              (O QUE acontece)
            │                           │                          │
            └───────────────────────────┴──────────────────────────┘
                                  mesma coisa
```

Tudo se liga por **um único identificador**. Isso vale para o elemento que
está escrito no HTML e para o que o JS cria depois.

### Os três "nomes" de um elemento

| Tipo | Exemplo | Quem usa | Quando usar |
|---|---|---|---|
| **`id="..."`** | `id="client-panel"` | JS direto: `document.querySelector('#client-panel')` | Quando há **um só** elemento com aquele papel (painel, campo de formulário) |
| **`class="..."`** | `class="client-row"` | CSS (e alguns JS) | Quando o elemento se **repete** (cada linha da lista) |
| **`data-algo="..."`** | `data-edit-client="42"` | **Só o JS** | Para dizer ao JS "quando este botão for clicado, faça isto" |

**Como achar o CSS de um elemento:** quase sempre pela **classe**.
`class="client-row"` → procure `.client-row` no `styles.css`.

**Como achar o JS de um elemento:** quase sempre pelo **`data-*`**.
`data-edit-client="42"` → procure `data-edit-client` nos arquivos `.js`.

**Como achar o JS de um painel/elemento único:** pelo **`id`**.
`id="client-panel"` → procure `'client-panel'` ou `#client-panel` nos `.js`.

> 💡 Por que o CSS não usa `id`? Porque **id tem prioridade sobre class** no
> CSS. Se o estilo do painel estivesse num `#client-panel`, nenhuma classe
> depois conseguiria sobrescrever. Por isso **aparência mora na classe** e
> **comportamento mora no `data-*`**.

### Nem tudo está no `index.html`

Este é o ponto que mais confunde iniciante.

> **A maior parte das linhas que você vê na tela NÃO está no `index.html`.**
> Elas são strings de HTML montadas pelo JavaScript.

Exemplo: a lista de clientes. O `<div id="client-list"></div>` está no HTML
(index.html linha 189). Mas os cards que aparecem dentro dele são criados por
JavaScript, em `app.js`, na função `renderClients()` (app.js:302).

```js
// app.js:302  renderClients()
clientList.innerHTML = visibleClients.map((client) => `
  <article class="client-row" data-detail-type="client" data-detail-id="${client.id}">
    <span class="client-initial">${iniciais(client.name)}</span>
    <div class="client-details">
      <strong>${client.name}</strong>
      <span>${client.whatsapp || 'sem WhatsApp'}</span>
    </div>
    <div class="client-actions">
      <button class="client-action" data-edit-client="${client.id}">…</button>
      <button class="client-action" data-delete-client="${client.id}">…</button>
    </div>
  </article>
`).join('');
```

Para mudar **o que cada linha da lista tem dentro** (um botão a mais, um texto
novo, uma cor), você edita **`renderClients()` no app.js**, não o HTML.

**Resumo:**

| O que você quer mudar | Onde está |
|---|---|
| Cor, tamanho, espaçamento, sombra, animação | `styles.css` |
| O esqueleto fixo (cabeçalho, menu, painel, formulário) | `index.html` |
| O conteúdo que se repete (linhas da lista, cards, abas) | a função `render*()` no `.js` |

---

## 4. As 4 ferramentas do DevTools que você precisa

DevTools = botão direito na página → **Inspecionar** (ou `F12` / `Cmd+Opt+I`).
Aprenda só estas quatro coisas e você consegue achar qualquer coisa.

### 4.1 Inspecionar: achar o elemento e ver de onde ele veio

1. Botão direito no elemento → **Inspecionar**.
2. Ele acende na aba **Elements**.
3. No canto superior direito da aba **Elements**, clique na seta `↗`
   (*Open styles*). Aparecerão os arquivos com o número da linha.

O DevTools **sublinha o trecho exato** do `styles.css` que estiliza o
elemento. Clicar leva você direto à linha.

### 4.2 Styles: ver as regras que valem

Aba **Styles** (à direita). Você verá a lista de regras aplicadas, da menos
específica para a mais específica. Regras riscadas = não valem.

- A **caixa pontilhada** é o modelo de caixa. `Styles` mostra como o tamanho
  que você escreve é decomposto em `padding` + `border` + `conteúdo`.
- Se a regra vier de outra folha/arquivo, aparece `arquivo.html:linha:coluna`
  ao lado — clique para ir até lá.

### 4.3 Computed: ver o valor final

Aba **Computed**. É o valor **real** depois de todas as regras, heranças e
media queries. Use quando o `Styles` não fizer sentido.

Truque: filtre por `font` ou `padding` no campo de busca do Computed para
acharem rápido.

### 4.4 Event Listeners: achar o JavaScript que trata o clique

**Esta é a ferramenta que resolve 80% do seu problema.**

1. Selecione o elemento na aba **Elements**.
2. No painel da direita, procure a aba **Event Listeners**.
3. Tudo que estiver lá é o que reage a esse elemento.

Exemplo para o botão de editar cliente:

```
click  ▼  app.js:398   (em clientList.addEventListener → delegation)
```

O DevTools mostra **o arquivo e a linha** onde o `addEventListener` foi
chamado. Clique no link e você cai direto na linha. Se a linha estiver longe
do elemento, é porque o app usa **delegação** (veja a seção seguinte).

**Atalho no Console** (só Chrome/Edge):

```js
getEventListeners($0)     // $0 = o elemento que você selecionou no DevTools
```

### O que é "delegação de eventos" (e por que o JS parece longe do botão)

Em vez de prender o clique em cada botão, o app **prende um único ouvinte no
pai** e pergunta "o que foi clicado dentro de mim?":

```js
// app.js:398 — um ouvinte só, na lista inteira de clientes
clientList.addEventListener('click', (event) => {
  const editButton = event.target.closest('[data-edit-client]');
  if (editButton) {
    const client = clients.find((c) => c.id === editButton.dataset.editClient);
    openClientForm(client);
  }
});
```

Vantagem: quando o JS cria 50 linhas novas de cliente, **não precisa prender
50 ouvintes** — o botão novo já funciona sozinho porque tem o `data-edit-client`.

Consequência para você: **para criar um botão novo que funcione, você precisa
de duas coisas:**

1. o atributo `data-*` no HTML do botão (no `index.html` ou dentro de uma
   função `render*()`);
2. um `if` correspondente dentro do ouvinte.

---

## 5. Os 3 caminhos para achar o código de um elemento

### Caminho A — pelo DevTools (funciona sempre, começando do zero)

Você **vê** o elemento na tela e quer chegar no código.

```
Clicar no elemento
      ↓
Botão direito → Inspecionar
      ↓
┌─────────────────────┬──────────────────────────────┐
│  Elements           │  Styles   │ Event Listeners  │
│  <button class=     │  .xxx {    │ click → app.js:360│
│    "client-action"  │   ...     │                  │
│    data-edit-client │  ...      │                  │
│    ="42">           │            │                  │
└─────────────────────┴──────────────────────────────┘
      │                      │               │
      │         CSS: procure │               │ JS: vá até app.js:360
      │         a classe     │               │ e leia a função openClients()
      ▼                      ▼               ▼
   styles.css            styles.css          app.js
```

### Caminho B — pelo `index.html` (para o esqueleto fixo)

Você sabe o **nome da tela** e quer achar o HTML dela.

1. Abra `index.html`.
2. `Ctrl+F` e procure `id="` seguido do nome. Ex.: `id="quote-panel"`.

O `index.html` está organizado assim (linhas do arquivo):

| Linha | O quê |
|---|---|
| 21 | Tela de login (`#auth-screen`) |
| 47 | O app (`<main class="app-shell">`) |
| 48 | Topo / cabeçalho (`.topbar`) |
| 66 | Painel de boas-vindas (`.welcome-panel`) |
| 98 | Resumo do dia (`.today-row`) |
| 106 | Ações rápidas (`.quick-actions`) |
| 121 | Grade de módulos (`.modules-section`) |
| 181 | Menu de baixo (`.bottom-nav`) |
| **187 em diante** | **Todas as telas sobrepostas** (os painéis) |
| 1146 | Documento de impressão (`.print-doc`) |
| 1148 | Toast (`.toast`) |
| 1150–1160 | As tags `<script>` (veja a ordem de carregamento abaixo) |

**A ordem dos `<script>` importa** e está em `index.html` linhas 1150–1160:

```
lucide (CDN)  →  supabase-js (CDN)  →  supabase-config.js  →  navigation.js
→  realtime.js  →  permissions.js  →  alerts.js  →  app.js
→  events.js  →  ceremonial.js  →  financial.js
```

`app.js` vem **depois** de `permissions.js` e `alerts.js` porque ele conversa
com eles. Se você criar um arquivo novo, coloque-o **no fim**.

### Caminho C — pelo `styles.css` (para achar a regra)

1. Abra `styles.css`.
2. Leia o **sumário no topo do arquivo** (linhas 1–39). Ele tem o mapa das
   27 telas.
3. Ache o bloco que te interessa. Cada bloco começa com um banner:

```css
/* ==========================================================================
   BLOCO 13 — PAINEL DE CLIENTES (.client-panel)
   ========================================================================== */
/* Fim do bloco do visualizador de imagem; daqui em diante é a lista de
   clientes: cabeçalho, busca, mensagens e a linha de cada cliente. */
```

4. Dentro do bloco, as classes começam com o prefixo do módulo:
   `client-`, `inventory-`, `service-`, `menu-`, `quote-`, `event-`,
   `finance-`, `ceremonial-`, `live-`, `staff-`, `table-`, `guest-`,
   `activity-`, `user-`, `permission-`, `role-`, `notice-`, `pd-`,
   `overview-`, `templates-`, `settings-`, `auth-`, `module-`, `nav-`.

> 💡 **Truque de busca no `styles.css`:** como o arquivo é "comprimido"
> (várias regras na mesma linha), `Ctrl+F` por seletor funciona, mas clique
> na seta `▼` do DevTools e prefira o **link com arquivo:linha** — ele é
> mais preciso.

---

## 6. Como o app funciona por dentro (o ciclo da tela)

Não existe "roteador" (router). Abrir uma tela é literalmente **tirar o
atributo `hidden` de uma `<section>`**.

Todo módulo segue o mesmo roteiro de 4 funções. Sequência:

```
  botão data-open-algo
            │
            ▼
   openAlgoritmo()   "abre a tela"
   ├─ if (!permitir('chave')) return;   ← trava se sem permissão
   ├─ painel.hidden = false;            ← APARECE
   └─ loadAlgoritmos();                 ← busca no banco
            │
            ▼
   loadAlgoritmos()    "busca no Supabase"
   └─ await supabaseClient.from('tabela').select(...)
   └─ guarda num array: clientes = [...]
            │
            ▼
   renderAlgoritmos()  "desenha na tela"
   ├─ lista.innerHTML = itens.map(...).join('')   ← o HTML das linhas
   └─ lucide.createIcons();                       ← desenha os ícones
```

E quando você salva um formulário:

```
  form submit
      ├─ await supabaseClient.from('tabela').insert(...) ou .update(...)
      ├─ painel.hidden = true;        ← fecha
      ├─ await loadAlgoritmos();      ← busca de novo
      │    └─ (o load chama o render)
      └─ showToast('Cliente cadastrado');
```

> **Conclusão prática:** para mudar o que aparece na lista, você edita a
> função `render*()`. Para mudar o que acontece quando abre, edita `open*()`.

### O que NÃO existe (para você não procurar)

- ❌ **Não existe `localStorage` nem `sessionStorage`.** Nenhum dado fica salvo
  no navegador. Tudo é buscado do banco a cada vez que a tela abre.
- ❌ **Não existe `const $ = seletor`.** Não há atalho de jQuery.
  O app usa `document.querySelector('#id')` e `document.getElementById('id')`.
- ❌ **Não existe framework nem `import`/`export`.** Os arquivos se conversaram
  por variáveis globais em `window.*`:
  `window.plenitudeApp`, `window.plenitudeEvents`, `window.plenitudeCeremonial`,
  `window.plenitudeFinance`, `window.plenitudePermissions`,
  `window.plenitudeAlerts`, `window.plenitudeNav`, `window.plenitudeRealtime`,
  `window.plenitudeSupabase`.

### A nomenclatura (é consistente, use para navegar)

| Prefixo | Significado | Onde fica |
|---|---|---|
| `open*()` | Abre um painel (`panel.hidden = false`) | no módulo dono da tela |
| `close*()` | Fecha um painel | idem |
| `load*()` | Busca no Supabase e guarda num array | idem |
| `render*()` | Desenha na tela (`innerHTML`) | idem |
| `render` no plural + `*Panel` | desenha o painel inteiro | idem |
| `open*Form()` / `close*Form()` | Abre/fecha um formulário | idem |
| `set*Feedback()` | Escreve a mensagem de erro/sucesso da tela | idem |
| `reload*()` | Recarrega para o realtime | idem |
| `permitir()` / `allow()` / `requireAccess()` | Trava por permissão | app.js / permissions.js / financial.js |

---

## 7. Guia por tela: onde está o CSS e o JS de cada uma

Colunas:
- **HTML** → a `<section>` que é a tela (id + linha no `index.html`)
- **Classes CSS** → prefixo que identifica o visual
- **Bloco CSS** → número do bloco comentado no `styles.css`
- **Abrir** → função que mostra a tela
- **Carregar** → função que busca no banco
- **Desenhar** → função que monta o HTML das linhas
- **Abrir a partir de** → o `data-*` do botão

### 7.0 Índice rápido

| Tela | HTML (linha) | Prefixo CSS | Bloco CSS | JS |
|---|---|---|---|---|
| Login | `#auth-screen` (21) | `auth-` | 03 | `app.js` |
| Topo / marca | `.topbar` (48) | `topbar`, `brand`, `icon-button`, `avatar` | 05 | `app.js` + `permissions.js` |
| Boas-vindas | `.welcome-panel` (66) | `welcome-`, `eyebrow` | 06 | `app.js` |
| Resumo do dia | `.today-row` (98) | `today-` | 07 | `events.js` |
| Ações rápidas | `.quick-actions` (106) | `quick-` | 08 | `app.js` |
| Módulos | `.modules-section` (121) | `module-`, `card-*` | 09 | `app.js` + `permissions.js` |
| Menu de baixo | `.bottom-nav` (181) | `nav-item` | 10 | `app.js` + `events.js` |
| Toast | `.toast` (1148) | `toast` | 11 | `app.js:1237` |
| **Clientes** | `#client-panel` (187) | `client-` | 13 | `app.js` |
| Estoque | `#inventory-panel` (207) | `inventory-` | 17, 18 | `app.js` |
| Formul. estoque | `#inventory-form-panel` (236) | `client-form-`, `inline-form-` | 12, 36 | `app.js` |
| Movimentação | `#movement-form-panel` (282) | `movement-` | 17 | `app.js` |
| Formul. cliente | `#client-form-panel` (307) | `client-form-` | 12 | `app.js` |
| **Serviços** | `#service-panel` (329) | `service-`, `visual-card` | 00, 20 | `app.js` |
| Formul. serviço | `#service-form-panel` (554) | `service-menu-`, `menu-category-` | 23, 24 | `app.js` |
| **Cardápios** | `#menu-panel` (355) | `menu-`, `linked-menu-chip`, `visual-card` | 16, 20, 24 | `app.js` |
| Formul. cardápio | `#menu-form-panel` (521) | `image-preview`, `category-option` | 15 | `app.js` |
| Categorias cardápio | `#category-panel` (505) | `category-` | 15 | `app.js` |
| Categorias estoque | `#inventory-category-panel` (488) | `category-` | 15 | `app.js` |
| **Orçamentos** | `#quote-panel` (585) | `quote-` | 21, 22 | `app.js` |
| Formul. orçamento | `#quote-form-panel` (595) | `quote-service-`, `quote-totals` | 22 | `app.js` |
| Orçamento salvo | `#quote-saved-panel` (1128) | `quote-saved-actions` | 48 | `app.js` |
| Sinal | `#quote-deposit-panel` (613) | `quote-deposit-`, `finance-receipt-` | 54, 55 | `app.js` |
| Lembretes | `#quote-reminder-panel` (639) | `quote-reminder-`, `quote-template-` | 56, 57, 58 | `app.js` |
| **Eventos** | `#event-panel` (685) | `event-` | 30–33 | `events.js` |
| Formul. evento | `#event-form-panel` (720) | `quote-form-` | 22 | `events.js` |
| Detalhe evento | `#event-detail-panel` (767) | `event-detail-`, `event-tab-` | 33 | `events.js` |
| **Financeiro** | `#finance-panel` (800) | `finance-` | 34, 60 | `financial.js` |
| Rateio evento | `#finance-event-panel` (823) | `finance-event-`, `finance-form-`, `finance-cost-` | 59 | `financial.js` |
| **Cerimônia** | `#ceremonial-panel` (887) | `ceremonial-`, `live-` | 37–45 | `ceremonial.js` |
| Roteiro | (aba) | `timeline-activity-card`, `activity-`, `order-btn` | 40, 41, 43 | `ceremonial.js` |
| Recepção | (aba) | `arrival-`, `guest-` | (em 552 da v. antiga → bloco 40/43) | `ceremonial.js` |
| Equipe | (aba) | `staff-` | 45 | `ceremonial.js` |
| Mesas | (aba) | `table-`, `table-guest-chip` | (BLOCO 50) | `ceremonial.js` |
| Ao vivo | (aba) | `live-` | 44, 45 | `ceremonial.js` |
| Modelos roteiro | `#ceremonial-templates-modal` (997) | `templates-` | 42 | `ceremonial.js` |
| Modais cerim. | `#ceremonial-*-modal` (957/1027/1074/1107) | `client-form-` | 12 | `ceremonial.js` |
| Visão geral | (bloco) | `overview-` | 35 | `events.js` |
| **Configurações** | `#settings-panel` (377) | `settings-` | (banner CONFIGURAÇÕES) | `app.js` |
| **Usuários** | `#users-panel` (412) | `user-`, `role-badge` | 52 | `permissions.js` |
| Formul. usuário | `#user-form-panel` (441) | `permission-grid`, `role-default` | 53 | `permissions.js` |
| Central avisos | `#notice-panel` (670) | `notice-`, `notice-bell` | (BLOCO 56) | `alerts.js` |
| Visualizador img | `#image-viewer` (787) | `image-viewer` | 18 | `app.js` |
| Ficha detalhes | `#detail-view` (791) | `detail-view`, `detail-card`, `detail-row` | 19, 25 | `app.js` |
| Impressão/PDF | `#quote-print` (1146) | `print-doc`, `pd-` | 49, 51 | `app.js` |

### 7.1 Login

| | |
|---|---|
| **HTML** | `index.html:21` — `<section class="auth-screen" id="auth-screen">` |
| **CSS** | `styles.css` **BLOCO 03** (linha 79) — `.auth-screen`, `.auth-card`, `.login-form`, `.login-button` |
| **CSS extra** | BLOCO 01 (tokens de cor), banner **LOGIN COM GOOGLE** (linha 1399) para `.google-button` |
| **JS mostrar/ocultar** | `setAuthenticated(bool)` — `app.js:125` |
| **JS boot** | `supabaseClient.auth.getSession().then(...)` — `app.js:187` |
| **JS botão Google** | `app.js:162` |
| **JS enviar e-mail/senha** | `appForm.addEventListener('submit', ...)` — `app.js:241` |
| **JS sair** | `logoutButton.addEventListener('click', ...)` — `app.js:263` |
| **JS mostrar erro** | `showLoginError(msg)` — `app.js:145` |
| **Como abrir** | É a tela inicial; aparece sozinha enquanto não há sessão |

**Exemplo — mudar a cor do botão de login:**
edite `.login-button { ... background: var(--moss); }` no BLOCO 03.

### 7.2 Topo do app (`.topbar`)

| | |
|---|---|
| **HTML** | `index.html:48` — `<header class="topbar">` (marca, sino, avatar) |
| **CSS** | BLOCO 05 (linha 95) — `.topbar`, `.brand`, `.brand-mark`, `.icon-button`, `.notification-dot`, `.avatar` |
| **JS saudação/avatar** | `applyIdentity()` — `permissions.js:189` (troca o texto de `#welcome-greeting` e as iniciais em `#profile-avatar`) |
| **JS sino** | `renderBell()` — `alerts.js:263` |
| **JS sair (ícone)** | `data-logout` → `app.js:263` |

**Exemplo — trocar o ícone do sino:**
```html
<!-- index.html, dentro do .topbar -->
<button id="notice-bell" class="icon-button" data-lucide="bell">…</button>
```
Troque `"bell"` por outro nome. Para ver os nomes disponíveis:
https://lucide.dev/icons/

### 7.3 Início (dashboard)

O Início é **HTML fixo** (`index.html:66`–`185`). Só três partes são montadas
por JS:

| Bloco | HTML | CSS | JS |
|---|---|---|---|
| Saudação + data | `.welcome-panel` (66) | BLOCO 06 (110) | `updateWelcomeDate()` — `app.js:5`; texto via `permissions.js:189` |
| Faixa de aviso de sinal | `#quote-alert-banner` (89) | (BLOCO 26) | `renderQuoteAlerts()` — `app.js:2470` |
| Resumo do dia | `.today-row` (98) | BLOCO 07 (128) | `updateTodaySummary()` — `events.js:228` |
| Ações rápidas | `.quick-actions` (106) | BLOCO 08 (135) | genérico `data-action` → `app.js:1244` |
| Grade de módulos | `.modules-section` (121) | BLOCO 09 (140) | `applyToUI()` — `permissions.js:155` (esconde o que não pode ver) |
| Menu de baixo | `.bottom-nav` (181) | BLOCO 10 (147) | `app.js:1248` (`data-nav`) |

**As cores de cada card de módulo** estão no fim do BLOCO 09, todas na mesma
linha (styles.css ~156):
`.card-clientes`, `.card-orcamentos`, `.card-servicos`, `.card-estoque`,
`.card-config`, `.card-cerimonial`, `.card-financeiro`
e `.card-usuarios` (este último está no bloco de Controle de acesso, ~1358).

### 7.4 Clientes

| | |
|---|---|
| **HTML** | `index.html:187` — `<section class="client-panel" id="client-panel">` (lista + busca) |
| **HTML** | `index.html:307` — `#client-form-panel` (formulário) |
| **CSS** | BLOCO 13 (linha 179) — `.client-row`, `.client-initial`, `.client-details`, `.client-actions`, `.client-action` |
| **CSS do form** | BLOCO 12 (linha 157) — `.client-form-card`, `.client-form-panel` |
| **JS abrir** | `openClients()` — `app.js:341` |
| **JS carregar** | `loadClients()` — `app.js:328` |
| **JS desenhar** | **`renderClients()` — `app.js:302`** ← é aqui que se edita a linha da lista |
| **JS abrir form** | `openClientForm(cliente)` — `app.js:348` |
| **JS salvar** | `clientForm.addEventListener('submit', ...)` — `app.js:366` |
| **JS apagar** | dentro do listener de `clientList` — `app.js:398` (ramo `data-delete-client`) |
| **Abrir a partir de** | `data-open-clients` → `app.js:360` |

**Receita: adicionar um botão "Enviar WhatsApp" em cada linha de cliente**
1. Em `app.js`, dentro de `renderClients()`, no bloco `.client-actions`, adicione:
```js
<button class="client-action" data-whatsapp-client="${client.id}"
        title="Enviar WhatsApp"><i data-lucide="message-circle"></i></button>
```
2. Ainda em `renderClients()`, **logo no fim**, garanta `lucide.createIcons();`
3. No listener de `clientList` (app.js:398), adicione um ramo:
```js
const wa = event.target.closest('[data-whatsapp-client]');
if (wa) { enviarWhatsappCliente(clients.find(c => c.id === wa.dataset.whatsappClient)); return; }
```
4. Escreva `enviarWhatsappCliente()` perto das outras funções.
5. O CSS **não precisa mudar**: `.client-action` já tem tamanho e cor prontos.

### 7.5 Estoque

| | |
|---|---|
| **HTML** | `index.html:207` `#inventory-panel` (lista) · `236` `#inventory-form-panel` (item) · `282` `#movement-form-panel` (movimentação) · `488` `#inventory-category-panel` (categorias) |
| **CSS** | BLOCO 17 (linha 209) — `.inventory-row`, `.inventory-balance`, `.inventory-thumb`, `.movement-select`, `.inventory-low-filter` |
| **CSS** | BLOCO 18 (linha 215) — `.inventory-filter-row` + `.image-viewer` |
| **JS abrir** | `openInventory(options)` — `app.js:1342` |
| **JS carregar** | `loadInventory()` — `app.js:1308` |
| **JS desenhar** | **`renderInventory()` — `app.js:1276`** |
| **JS form item** | `openInventoryForm(item)` — `app.js:1359` |
| **JS movimentação** | `openMovementForm(item)` — `app.js:1382` |
| **JS categorias** | `renderInventoryCategories()` — `app.js:979` |
| **Abrir a partir de** | `data-open-inventory` → `app.js:1394` |

### 7.6 Serviços

| | |
|---|---|
| **HTML** | `index.html:329` `#service-panel` (lista) · `554` `#service-form-panel` (formulário) |
| **CSS** | BLOCO 00 (linha 41) — a **primeira linha de serviço** (`.service-row`, `.service-status`, `.service-price`) |
| **CSS** | BLOCO 20 (linha 227) — o card visual completo (`.visual-card*`) |
| **CSS** | BLOCO 29 (linha 347) — a linha de serviço em telas pequenas |
| **JS abrir** | `openServices()` — `app.js:539` |
| **JS carregar** | `loadServices()` — `app.js:468` |
| **JS desenhar** | **`renderServices()` — `app.js:432`** |
| **JS form** | `openServiceForm(servico)` — `app.js:623` |
| **Abrir a partir de** | `data-open-services` → `app.js:641` |

### 7.7 Cardápios

| | |
|---|---|
| **HTML** | `index.html:355` `#menu-panel` (lista) · `521` `#menu-form-panel` (formulário) · `505` `#category-panel` (categorias) |
| **CSS** | BLOCO 15 (linha 197) — `#menu-form-panel`, `.image-preview`, `.category-option` |
| **CSS** | BLOCO 16 (linha 204) — `.menu-filter-row` |
| **CSS** | BLOCO 24 (linha 274) — `.menu-category-*` (a sanfona por categoria) |
| **CSS** | BLOCO 20 (linha 227) — `.visual-card*` |
| **CSS** | BLOCO 23 (linha 255) — `.service-menu-option` (vincular cardápio a um serviço) |
| **JS abrir** | `openMenus()` — `app.js:861` |
| **JS carregar** | `loadMenus()` — `app.js:823` |
| **JS desenhar** | **`renderMenus()` — `app.js:788`** e `renderCategories()` — `app.js:764` |
| **JS form** | `openMenuForm(cardapio)` — `app.js:884` |
| **JS chip** | `menuChip()` — `app.js:521` |
| **Abrir a partir de** | `data-open-menus` → `app.js:901` |

### 7.8 Orçamentos

| | |
|---|---|
| **HTML** | `index.html:585` `#quote-panel` (lista) · `595` `#quote-form-panel` (formulário) · `1128` `#quote-saved-panel` (salvo) |
| **CSS** | BLOCO 21 (linha 233) — `.quote-panel-card`, `.quote-status`, `.quote-card` |
| **CSS** | BLOCO 22 (linha 239) — `.quote-service-option`, `.quote-totals` |
| **CSS** | BLOCO 26 (linha 312) — a versão empilhada em tela estreita |
| **CSS** | BLOCO 48 (linha 1140) — os botões da tela "orçamento salvo" |
| **JS abrir** | `openQuotes()` — `app.js:2815` |
| **JS carregar** | `loadQuotes()` — `app.js:1836` |
| **JS desenhar** | **`renderQuotes()` — `app.js:1789`** |
| **JS form** | `openQuoteForm()` — `app.js:2823` |
| **JS seletor de serviços** | `renderQuoteServices()` — `app.js:2743` |
| **JS PDF** | `renderQuotePrint()` — `app.js:1905`, `printQuotePdf()` — `app.js:1952` |
| **Abrir a partir de** | `data-open-quotes` → `app.js:2849` |

### 7.9 Sinal, lembretes e avisos

| Tela | HTML | CSS | JS abrir | JS desenhar |
|---|---|---|---|---|
| Sinal | `#quote-deposit-panel` (613) | BLOCO 54 (1421), 55 (1432) | `openQuoteDepositPanel()` `app.js:2106` | `renderQuoteDepositHistory()` `app.js:2094` |
| Lembretes | `#quote-reminder-panel` (639) | BLOCO 56 (1534), 57 (1541), 58 (1561) | `openQuoteReminders()` `app.js:2539` | `renderQuoteReminders()` `app.js:2434` |
| Central de avisos | `#notice-panel` (670) | BLOCO 56 (1534) | `open()` `alerts.js:358` | `render()` `alerts.js:314` |
| Sino do topo | `.icon-button` em `.topbar` | BLOCO 56 / 52 | — | `renderBell()` `alerts.js:263` |

O **alerts.js** é um sistema de "fontes" (estoque baixo, convidado pendente,
sinal vencido). Cada fonte se cadastra com
`window.plenitudeAlerts.register(...)` e devolve uma lista de avisos.

### 7.10 Eventos (`events.js`)

| | |
|---|---|
| **HTML da lista** | `index.html:685` `#event-panel` |
| **HTML do form** | `index.html:720` `#event-form-panel` |
| **HTML do detalhe** | `index.html:767` `#event-detail-panel` (3 abas) |
| **CSS** | BLOCO 30 (linha 367) filtros · BLOCO 31 (377) card da lista · BLOCO 32 (385) caixa de data · BLOCO 33 (394) badges e abas · BLOCO 35 (562) visão geral |
| **JS abrir lista** | `openEventsPanel(filtro)` — `events.js:412` |
| **JS carregar** | `loadEvents()` — `events.js:181` |
| **JS desenhar lista** | **`renderEventsList()` — `events.js:281`** |
| **JS abrir form** | `openEventForm()` — `events.js:439` |
| **JS abrir detalhe** | `openEventDetail(id)` — `events.js:616` |
| **JS desenhar detalhe** | `renderEventDetailHero()` `events.js:698`, `renderEventTabContent()` `events.js:752` |
| **JS sumário do dia** | `updateTodaySummary()` — `events.js:228` |
| **JS atualizar status automático** | `updatePastEventsStatus()` — `events.js:146` (marca eventos passados como "Realizado") |
| **JS todos os cliques** | `setupEventListeners()` — `events.js:1234` (um listener gigante no `document`) |
| **Abrir a partir de** | `data-open-events` / `data-action="Agenda de hoje"` |

**Comportamento automático de status:** ao carregar a lista de eventos, a função
`updatePastEventsStatus()` verifica todos os eventos com data anterior a hoje e
status `planned` (Planejado) ou `in_progress` (Em andamento) e os atualiza
automaticamente para `completed` (Realizado) no banco de dados. Isso evita que
eventos passados fiquem com status incorreto.

### 7.11 Financeiro (`financial.js`)

| | |
|---|---|
| **HTML** | `index.html:800` `#finance-panel` (indicadores) · `823` `#finance-event-panel` (rateio do evento) |
| **CSS** | BLOCO 34 (linha 533) responsivo · BLOCO 59 (linha 1584) custos · BLOCO 60 (linha 1611) tipografia do painel |
| **JS abrir** | `openFinance()` — `financial.js:185` |
| **JS carregar** | `loadFinance()` — `financial.js:119` |
| **JS desenhar** | `renderDashboard()` — `financial.js:85`, `renderReceipts()` — `:249`, `renderCosts()` — `:283` |
| **JS evento** | `openFinanceEvent()` — `financial.js:344` |
| **JS salvar rateio** | `saveAllocations()` — `financial.js:370` |
| **JS salvar recebimento** | `saveReceipt()` — `financial.js:410` · `voidReceipt()` — `:504` |
| **Abrir a partir de** | `data-open-finance` → `financial.js:540` |

### 7.12 Cerimônia (`ceremonial.js`) — o maior módulo

| | |
|---|---|
| **HTML** | `index.html:887` `#ceremonial-panel` (5 abas) |
| **HTML** | `957` modal Momento · `997` modal Modelos · `1027` modal Convidado · `1074` modal Profissional · `1107` modal Mesa |
| **CSS** | BLOCO 37 (625) herói · 38 (657) estatísticas · 39 (675) cabeçalhos · 40 (684) roteiro · 41 (712) arraste · 42 (764) responsivo modelos · 43 (770) colunas do card · 44 (899) controles ao vivo · 45 (917) equipe ao vivo · 46 (1078) ≤320px · 47 (1092) ≤360px · 50 (1286) ícones |
| **JS abrir** | `openCeremonialPanel(idEvento, aba)` — `ceremonial.js:2588` |
| **JS carregar** | `loadEventsList()` — `ceremonial.js:319`; `loadSelectedEventDetails()` — `:535` |
| **JS desenhar** | **`renderActiveTab()` — `ceremonial.js:737`** (despachante) que chama: |
| ↳ Roteiro | `renderTimelineTab()` — `ceremonial.js:776` |
| ↳ Recepção | `renderArrivalTab()` — `ceremonial.js:921` |
| ↳ Equipe | `renderStaffTab()` — `ceremonial.js:1094` |
| ↳ Mesas | `renderTablesTab()` — `ceremonial.js:1182` |
| ↳ Ao vivo | `renderLiveTab()` — `ceremonial.js:1276` |
| **JS abas** | delegated em `setupEventListeners()` — `ceremonial.js:2628` (`data-ceremonial-tab`) |
| **JS abrir modelos** | `openTemplatesModal()` — `ceremonial.js:1656` |
| **JS aplicar modelo** | `applyTemplateToEvent()` — `ceremonial.js:2034` |
| **Abrir a partir de** | `data-open-ceremonial` → `ceremonial.js:2635` |

> 💡 **Este é o exemplo didático mais bonito do projeto.** Uma única função
> (`renderActiveTab`) decide qual das 5 abas desenhar, chamando a `render*`
> correspondente. Para mudar a aba de Roteiro, você mexe só em
> `renderTimelineTab()`. Nada mais é afetado.

### 7.13 Configurações

| | |
|---|---|
| **HTML** | `index.html:377` `#settings-panel` — é um **índice de botões**, não uma lista dinâmica |
| **CSS** | banner **CONFIGURAÇÕES** no `styles.css` (~linha 1318) — `.settings-list`, `.settings-item`, `.settings-chevron` |
| **JS abrir** | `openSettings()` — `app.js:919` |
| **JS navegar para dentro** | `abrirDeConfiguracoes(destino)` — `app.js:932` (trata `data-settings-goto`) |
| **Abrir a partir de** | `data-open-settings` → `app.js:948` |

Os botões de Configurações que levam a outras telas usam `data-settings-goto`:
```html
<button class="settings-item" data-settings-goto="menus">…</button>
```

### 7.14 Usuários e permissões (`permissions.js`)

| | |
|---|---|
| **HTML** | `index.html:412` `#users-panel` (lista) · `441` `#user-form-panel` (formulário + matriz) |
| **CSS** | BLOCO 52 (linha 1355) lista · BLOCO 53 (linha 1369) matriz · banner **CONTROLE DE ACESSO** (~1340) |
| **JS abrir** | `openUsersPanel()` — `permissions.js:410` |
| **JS carregar** | `loadUsers()` — `permissions.js:388` |
| **JS desenhar** | `renderUsers()` — `permissions.js:348` · `renderRoleDefaults()` — `:444` · `permissionGridMarkup()` — `:525` |
| **JS verificar permissão** | `can(chave)` — `permissions.js:141` · `allow(chave)` — `:149` |
| **JS aplicar na tela** | `applyToUI()` — `permissions.js:155` (esconde tudo que tem `data-permission`) |
| **Lista de permissões possíveis** | `PERMISSIONS` — `permissions.js:29` |
| **Abrir a partir de** | `data-open-users` → `permissions.js:426` |

**O `data-permission` é o interruptor de visibilidade do app inteiro:**
```js
// permissions.js:155
document.querySelectorAll('[data-permission]').forEach((element) => {
  element.hidden = !can(element.dataset.permission);
});
```
Qualquer elemento do `index.html` com `data-permission="clientes"` some para
quem não tem essa permissão. Valores válidos: `dashboard`, `clientes`,
`orcamentos`, `eventos`, `servicos`, `cardapios`, `estoque`, `configuracoes`,
`cerimonial`, `financeiro`, `usuarios`.

### 7.15 Ficha de detalhes e visualizador de imagem

Estes dois são **os mais reutilizáveis** do app (um só painel serve para
cliente, serviço, cardápio, item, categoria e orçamento).

| | |
|---|---|
| **HTML** | `index.html:791` `#detail-view` · `787` `#image-viewer` |
| **CSS** | BLOCO 19 (linha 221) `.detail-view` · BLOCO 18 (215) `.image-viewer` · BLOCO 25 (295) as caixas internas |
| **JS abrir ficha** | **`openDetail(tipo, id)` — `app.js:1501`** (o `innerHTML` é montado na própria função, ~1605) |
| **JS fechar ficha** | `closeDetail()` — `app.js:1625` · `closeDetailLayer()` — `:1633` |
| **JS abrir imagem** | `openImageViewer(url)` — `app.js:1426` |
| **JS fechar imagem** | `closeImageViewer()` — `app.js:1431` |
| **Quem dispara** | Um único listener no `document` — `app.js:1659` |

**Como a ficha é aberta:** qualquer elemento com estes dois atributos:
```html
<article class="client-row"
         data-detail-type="client"      <!-- o TIPO -->
         data-detail-id="42">            <!-- o ID   -->
```
Tipos aceitos: `client`, `service`, `menu`, `inventory`, `category`, `quote`.
Para adicionar um tipo novo, edite o `switch` dentro de `openDetail()`.

**Abrir a imagem em tela cheia:** qualquer elemento com
`data-view-image="https://..."`.

### 7.16 Impressão / PDF

| | |
|---|---|
| **HTML** | `index.html:1146` — `<section class="print-doc" id="quote-print" aria-hidden="true"></section>` (vazia; o JS preenche) |
| **CSS na tela** | BLOCO 49 (linha 1152) — `.print-doc { display: none }` |
| **CSS na impressão** | BLOCO 51 (linha 1300) — `@media print`, `@page`, esconde todo o resto |
| **JS montar** | `renderQuotePrint()` — `app.js:1905` |
| **JS imprimir** | `printQuotePdf()` — `app.js:1952` |
| **Botão** | `data-quote-pdf` → `app.js:2064` |

> Para o PDF mudar de formato, edite `renderQuotePrint()` (o HTML) e as
> regras `.pd-*` do BLOCO 49.

---

## 8. Receitas prontas

### 8.1 Mudar a cor de um elemento

**Do jeito certo (no CSS):** a regra existe em `styles.css`. Procure a **classe** do elemento.

```css
/* 1. Ctrl+F no styles.css pela classe. Ex.: .module-card */
.module-card { ... }

/* 2. Troque a cor. Use sempre as variáveis, nunca cores soltas. */
.module-card { background: var(--sage-light); }
```

**Nunca** edite a cor direto no HTML (`style="..."`). Use CSS.

### 8.2 Mudar a cor de TUDO de uma vez

As cores do app estão todas em `styles.css` **BLOCO 01** (`linha 51`):

```css
:root {
  --moss: #31483b;      /* verde principal */
  --moss-deep: #24382e; /* verde escuro */
  --sage: #a8b39d;      /* verde médio */
  --sage-light: #dfe5d8;/* verde claro */
  --cream: #f6f1e8;     /* creme */
  --paper: #fcfaf6;     /* branco do papel */
  --gold: #b38a4d;      /* dourado */
  --ink: #253129;       /* cor do texto */
  --muted: #7f867b;     /* texto apagado */
  --line: #e9e5dc;      /* linhas e bordas */
}
```

Trocar `--moss` redesenha o app inteiro.

### 8.3 Mudar o texto de um elemento fixo

Vá no `index.html`, ache pelo `id` ou pela `class`, edite o texto.

```html
<strong class="brand-name">Plenitude</strong>   →   <strong class="brand-name">Plenitude Cerimônios</strong>
```

### 8.4 Mudar o texto de um elemento que vem do JS

O texto está dentro da função `render*()`, na template literal. Procure o
texto antigo com `Ctrl+F` **nos arquivos `.js`** (não no HTML).

```js
// app.js, dentro de renderClients()
`<span>${client.whatsapp || 'sem WhatsApp'}</span>`
//    ↑ esse texto padrão
```

**Atalho infalível:** clique com o botão direito no texto na tela → **Inspecionar**.
O DevTools mostra o HTML gerado; copie o trecho e cole no `Ctrl+F` dos `.js`.

### 8.5 Adicionar um campo novo a um formulário

1. **`index.html`** — adicione o `<label>` e o `<input>` dentro do `<form>`:
```html
<form id="client-form" class="client-form-card">
  <label for="client-name">Nome</label>
  <input id="client-name" required>
  <input id="client-email">              <!-- novo -->
  <button class="login-button" type="submit">Salvar</button>
</form>
```
2. **`styles.css`** — o estilo já vem de `.client-form-card > label` e
   `.client-form-card > input` (BLOCO 12/13). Se quiser mudar, crie uma regra
   nova para o `id`:
```css
#client-email { border-color: var(--gold); }
```
3. **`app.js`** — leia o valor no `submit` e envie:
```js
// app.js:366, dentro do listener de clientForm
const payload = {
  name:  document.querySelector('#client-name').value,
  email: document.querySelector('#client-email').value   // novo
};
```
4. **Banco** — a coluna `email` precisa existir na tabela `clients`. Se não
   existir, crie uma migration em `supabase/migrations/` (veja o README).

### 8.6 Esconder um elemento

**Do jeito certo (do CSS):**
```css
/* styles.css, no fim */
.minha-classe { display: none !important; }
```

**Do jeito do app (quando é por permissão):** adicione `data-permission="..."`
no `index.html`. O `permissions.js:155` esconde sozinho.

**Atenção:** o atributo `hidden` sozinho **não funciona** neste app, porque
muitas classes definem `display` e isso vence a regra do navegador. Por isso
existe a regra no BLOCO de Controle de Acesso:
```css
[data-permission][hidden] { display: none !important; }
```
Se você criar um elemento novo que precisa desaparecer, **repita esse padrão**.

### 8.7 Criar um botão novo que funcione

Sempre são **dois lugares**. Exemplo, criar "Duplicar orçamento":

**Passo 1 — o botão (HTML ou dentro de uma `render*()`):**
```js
// app.js, dentro de renderQuotes(), no bloco .client-actions
<button class="client-action" data-duplicate-quote="${quote.id}"
        title="Duplicar"><i data-lucide="copy"></i></button>
```

**Passo 2 — o ouvinte (no listener do container):**
```js
// app.js, no listener de click de quoteList
const dup = event.target.closest('[data-duplicate-quote]');
if (dup) { duplicarOrcamento(quotes.find(q => q.id === dup.dataset.duplicateQuote)); return; }
```

**Passo 3 — a função:**
```js
async function duplicarOrcamento(origem) {
  if (!origem) return;
  const { id, created_at, ...campos } = origem;
  await supabaseClient.from('quotes').insert(campos);
  await loadQuotes();
  showToast('Orçamento duplicado');
}
```

**Passo 4 — o ícone (só se for novo):** confira o nome em
https://lucide.dev/icons/ e use `data-lucide="nome-do-icone"`.

### 8.8 Criar uma coluna nova em um card

1. **`index.html`** ou `render*()` — adicione o elemento ao card.
2. **`styles.css`** — crie a regra da coluna, no bloco do módulo:

```css
/* BLOCO 13 */
.client-row { display: flex; align-items: center; gap: 11px; }
.client-email { color: var(--muted); font-size: 10px; }
```
3. **Lembre-se do `flex`**: se o card é `display: flex`, cada filho vira uma
   "coluna". Se não couber, provavelmente falta `flex-shrink: 0` ou
   `min-width: 0` (sem isso o texto não quebra e empurra a linha).

### 8.9 Trocar um ícone

```html
<!-- antes -->
<i data-lucide="bell"></i>
<!-- depois -->
<i data-lucide="bell-ring"></i>
```
Nomes em https://lucide.dev/icons/.
O **tamanho** do ícone é CSS: procure `svg { width... }` do bloco da tela.

### 8.10 Fazer algo só no celular (ou só no desktop)

No `styles.css`, use `@media`:

```css
/* só em telas de até 480px */
@media (max-width: 480px) {
  .module-card { padding: 10px 8px; }
}

/* só a partir de 600px */
@media (min-width: 600px) {
  .app-shell { box-shadow: 0 0 45px rgba(40,48,39,.13); }
}
```

> ⚠️ **Ordem importa.** As media queries **por largura** do cerimonial
> (BLOCO 46/47) precisam vir **depois** do bloco que os aumenta para toque
> (BLOCO 50) — senão elas sobrescrevem os alvos grandes.

---

## 9. Criando uma tela nova do zero

Exemplo: criar a tela "Fornecedores".

### Passo 1 — O HTML (o esqueleto fixo)

Copie a estrutura de um painel de lista já pronto e mude o conteúdo.
Cole no `index.html` logo antes de `<section class="print-doc"`:

```html
<section class="service-panel" id="supplier-panel" hidden aria-labelledby="suppliers-title">
  <div class="service-panel-card">
    <header class="client-panel-header">
      <h2 id="suppliers-title">Fornecedores</h2>
    </header>
    <div class="client-list" id="supplier-list"></div>
    <button class="add-client-button" data-new-supplier>
      <i data-lucide="plus"></i> Novo fornecedor
    </button>
  </div>
</section>
```

Repare que você **reaproveitou as classes existentes**
(`service-panel`, `client-panel-header`, `client-list`, `add-client-button`) —
por isso a tela já nasce com a aparência certa.

### Passo 2 — O CSS

**Não precisa criar nada.** As classes acima já estão estilizadas. Se quiser
ajustar algo, crie um bloco no `styles.css`:

```css
/* ==========================================================================
   BLOCO NN — TELA DE FORNECEDORES
   ========================================================================== */
.supplier-row { display: flex; align-items: center; gap: 10px; }
.supplier-note { color: var(--muted); font-size: 10px; }
```

### Passo 3 — O botão que abre (HTML)

Adicione um card de módulo ou uma ação rápida:

```html
<button class="module-card card-config"
        data-open-suppliers data-permission="fornecedores">
  …
</button>
```

> ⚠️ Se usar `data-permission` com um valor novo, adicione o valor à lista
> `PERMISSIONS` em `permissions.js:29` **e** crie a coluna no banco.

### Passo 4 — Registrar a tela na navegação (**OBRIGATÓRIO**)

Abra `navigation.js` e adicione uma linha na tabela `SCREENS` (linha 27):

```js
const SCREENS = [
  ['client-panel', 'data-close-clients'],
  // …
  ['supplier-panel', 'data-close-suppliers'],   // ← nova linha
]
```

Sem isso a tela aparece, **mas não tem botão de voltar e o botão físico do
celular não fecha ela.**

### Passo 5 — O JavaScript

No arquivo do módulo dono da tela (ou em `app.js`), siga o padrão:

```js
// ── 1. referência ao painel e ao container da lista
const supplierPanel = document.querySelector('#supplier-panel');
const supplierList  = document.querySelector('#supplier-list');

// ── 2. o dado em memória
let suppliers = [];

// ── 3. carregar do banco
async function loadSuppliers() {
  const { data, error } = await supabaseClient.from('suppliers').select('*').order('name');
  if (error) { setFeedback('Não foi possível carregar.'); return; }
  suppliers = data || [];
  renderSuppliers();
}

// ── 4. desenhar
function renderSuppliers() {
  if (!suppliers.length) {
    supplierList.innerHTML = '<div class="empty-clients">Nenhum fornecedor ainda.</div>';
    return;                                  // ← note: return SEM createIcons
  }
  supplierList.innerHTML = suppliers.map((s) => `
    <article class="client-row">
      <span class="client-initial">${s.name.charAt(0)}</span>
      <div class="client-details">
        <strong>${s.name}</strong>
        <span>${s.phone || ''}</span>
      </div>
      <div class="client-actions">
        <button class="client-action" data-edit-supplier="${s.id}">
          <i data-lucide="pencil"></i>
        </button>
      </div>
    </article>
  `).join('');
  lucide.createIcons();                     // ← SEMPRE a última linha
}

// ── 5. abrir e fechar
function openSuppliers() {
  if (!permitir('fornecedores')) return;     // ← trava por permissão
  supplierPanel.hidden = false;             // ← isto é o que "abre" a tela
  loadSuppliers();
}
function closeSuppliers() { supplierPanel.hidden = true; }

// ── 6. prender os botões
document.querySelectorAll('[data-open-suppliers]').forEach((b) =>
  b.addEventListener('click', openSuppliers));
document.querySelectorAll('[data-close-suppliers]').forEach((b) =>
  b.addEventListener('click', closeSuppliers));

supplierList.addEventListener('click', (event) => {
  const edit = event.target.closest('[data-edit-supplier]');
  if (edit) { /* abrir o formulário */ return; }
});
```

### Passo 6 — Verificar

Recarregue. Se algo não funcionar, use o **Console** (`F12` → `Console`) e o
**Event Listeners** para descobrir onde parou.

---

## 10. Armadilhas: o que vai te morder

### Armadilha 1 — O app serve uma versão antiga do seu código

Este é o problema **nº 1**. O app é um PWA e o `sw.js` guarda
`styles.css` e todos os `.js` em cache.

**Solução na ordem:**

1. Recarregue ignorando o cache: **Ctrl+Shift+R** (Windows/Linux) ou
   **Cmd+Shift+R** (macOS).
2. Se não resolveu, **suba o número do cache** em `sw.js:6`:
   ```js
   const CACHE_NAME = 'plenitude-static-v10';   // → v11
   ```
   O comentário lá em cima explica: é o mecanismo oficial do projeto.
   **Toda vez que a alteração não aparecer, faça isso.**
3. Ainda assim? `F12` → **Application** → **Service Workers** → **Unregister**.
   Depois **Storage** → **Clear site data**. Recarregue duas vezes.

> 💡 Dica: deixe o DevTools **aberto** com a aba **Network** marcada
> "Disable cache" durante o desenvolvimento. Isso economiza o passo 2.

### Armadilha 2 — Ícone novo aparece invisível

Todo ícone é `<i data-lucide="nome"></i>` e o Lucide o troca por um `<svg>`.
Se você injetou HTML novo e o ícone **não apareceu**,esqueceu de chamar:

```js
lucide.createIcons();   // como ÚLTIMA linha da sua função render*()
```

### Armadilha 3 — Elemento com `hidden` continua aparecendo

`hidden` não funciona se a classe definir `display`. A solução do app:

```css
[data-permission][hidden] { display: none !important; }
```

Aplique o mesmo padrão a qualquer elemento novo que precise sumir.

### Armadilha 4 — Texto que não quebra

Card com muitas ações espreme o nome a ~0px. O app resolve assim (BLOCO 28):

```css
.card-row .client-details strong { overflow: visible; white-space: normal; }
.card-row .client-actions      { flex: 1 0 100%; }   /* desce para a linha de baixo */
```

Ao adicionar conteúdo a um card, lembre do `min-width: 0` (permite encolher)
e do `flex-shrink: 0` (não deixa sumir).

### Armadilha 5 — A tela nova aparece sem botão de voltar

Falta a linha na tabela `SCREENS` do `navigation.js:27`. Veja o
[Passo 4](#passo-4--registrar-a-tela-na-navegação-obrigatório).

### Armadilha 6 — `data-action` mostra "em breve"

```js
// app.js:1237
function showToast(message) {
  toast.textContent = `${message} em breve`;   // ← SEMPRE acrescenta isto
}
```

Se o seu botão novo usa `data-action="..."`, ele **não faz nada** além de
mostrar um toast de "em breve". Use um `data-*` com nome próprio
(`data-open-algo`, `data-edit-algo`…) e trate no listener.

### Armadilha 7 — Mexer em `id` que o JS procura

Se você renomear `id="client-panel"` para `id="lista-clientes"`, o
`app.js` inteiro para de encontrar o painel e a tela quebra com um erro no
Console. **ID é contrato entre o HTML e o JS.** Se precisar renomear, renomeie
nos dois lados (e procure o id antigo no `navigation.js` também).

### Armadilha 8 — `id` duplicado

`document.querySelector('#x')` devolve **só o primeiro**. Nunca repita um id.
Se precisar de vários elementos iguais, use `class` + `querySelectorAll`.

### Armadilha 9 — Editar o `supabase-config.js`

Esse arquivo tem a **chave da API do seu projeto**. Nunca suba uma chave nova
para o GitHub e nunca use a chave de outra pessoa aqui.

### Armadilha 10 — Reformatar o `styles.css`

O arquivo usa o formato "uma linha por bloco" para caber na tela. Se você
rodar um formatador automático (Prettier, por exemplo), o `git diff` vira
um desastre. **Edite no lugar.**

---

## 11. Glossário

| Termo | O que significa aqui |
|---|---|
| **Painel / `<section>`** | Uma tela que aparece por cima do app. Tem `hidden` enquanto fechada. |
| **`hidden`** | Atributo HTML que esconde o elemento. O `navigation.js` observa esse atributo. |
| **`casca`** | A estrutura visual compartilhada por vários painéis (`.service-panel` e `.client-panel`). |
| **`card` / `linha`** | Um item de uma lista. Ex.: um cliente, um orçamento, um evento. |
| **`render*()`** | A função que **escreve o HTML** dentro de um container. É onde a lista nasce. |
| **`load*()`** | A função que **busca os dados no banco** e chama a `render*()`. |
| **`open*()`** | A função que **abre** um painel (`panel.hidden = false`). |
| **`delegação`** | Um único ouvinte no pai que pergunta qual filho foi clicado. |
| **`data-*`** | Atributo personalizado que o JS lê para decidir o que fazer. |
| **`innerHTML`** | Substitui todo o HTML de dentro de um elemento. É o que `render*()` usa. |
| **`z-index`** | A ordem das camadas. No app: menu de baixo `5` · central de avisos `7` · painéis de lista `8` · formulários `9` · toast e form de cardápio `10` · rateio financeiro `12` · ficha de detalhes `25` · visualizador de imagem `30`. Se algo não "passa por cima", oculte o número. |
| **`lucide`** | A biblioteca de ícones. Transforma `<i data-lucide="x">` em `<svg>`. |
| **PWA / Service worker** | O app instalado no celular. Cacheia os arquivos — causa a Armadilha 1. |
| **`--variável`** | Cor ou medida reutilizável, definida em `:root` no BLOCO 01. |
| **`MutationObserver`** | O que permite ao `navigation.js` saber que uma tela abriu sem ninguém avisar. |

---

## Resumo em 5 linhas

1. **Aparência** → `styles.css`, procurando pela **classe** (BLOCO 01–60).
2. **Esqueleto fixo** → `index.html`, procurando pelo **`id`** (linha 21–1144).
3. **Conteúdo das listas** → a função **`render*()`** no `.js`.
4. **Comportamento** → o **`data-*`** do elemento + o `if` dentro do listener.
5. **Não apareceu?** → `Ctrl+Shift+R`; se não, suba o `CACHE_NAME` em `sw.js:6`.

Bom trabalho. 🚀