# PlenitudeApp

## Banco de dados

O banco foi modelado para Supabase/PostgreSQL. A migração inicial está em [supabase/migrations/001_initial_schema.sql](supabase/migrations/001_initial_schema.sql).

Ela inclui:

- usuários internos e perfis;
- clientes, serviços e materiais de estoque;
- orçamentos com itens, subtotal, desconto e total automáticos;
- criação automática de um evento quando o orçamento fica `confirmed`;
- atividades do cerimonial, mesas, convidados e movimentações de estoque;
- Row Level Security para usuários autenticados.

O controle de acesso por permissões é uma migration separada, a [015](supabase/migrations/015_access_control.sql). Está nesta seção porque muda o que cada usuário enxerga, mas ela **reescreve** as políticas criadas aqui e precisa rodar depois da 001.

### Como aplicar no Supabase

1. Crie um projeto em [supabase.com](https://supabase.com).
2. Abra o **SQL Editor**, cole o conteúdo da migração e execute uma única vez.
3. Crie os usuários em **Authentication > Users**.
4. Não publique a `service_role` key no frontend. A integração usará apenas a URL do projeto e a chave pública `anon`.

O frontend já possui a conexão pública inicial em [supabase-config.js](supabase-config.js), usando a URL do projeto e a chave `publishable`. A autenticação e os módulos ainda serão implementados nas próximas etapas.

### Deploy no Netlify

O arquivo [netlify.toml](netlify.toml) configura a raiz do repositório como pasta publicada. No Netlify, use **Build command** vazio e **Publish directory** como `.`. Depois de enviar este arquivo ao GitHub, acione um novo deploy em **Deploys > Trigger deploy > Deploy site**.

### Cardápios

Para habilitar cardápios, execute também [supabase/migrations/002_menus.sql](supabase/migrations/002_menus.sql) no SQL Editor. Depois disso, o módulo Serviços permitirá cadastrar cardápios, vincular cada serviço a um ou mais cardápios e filtrar o catálogo. A coluna `quotes.menu_id` já está preparada para a próxima etapa de orçamentos.

Para imagens e categorias, execute em seguida [supabase/migrations/003_menu_images_categories.sql](supabase/migrations/003_menu_images_categories.sql). Essa migração cria o bucket `menu-images`, aceita várias imagens por cardápio e cadastra categorias iniciais como Doces, Salgados, Bolos, Bebidas, Sobremesas e Frutas.

### Cardápio por serviço

Execute [supabase/migrations/010_menus_service_link.sql](supabase/migrations/010_menus_service_link.sql). Ela conclui a `002_menus.sql`, que criou `menus` e `menu_services` mas não chegou a alterar a tabela `quotes`. Sem ela o módulo de Orçamentos não carrega e o erro aparece como `column quotes.menu_id does not exist`.

Execute depois [supabase/migrations/011_menu_services_nn.sql](supabase/migrations/011_menu_services_nn.sql). Ela transforma o vínculo cardápio ↔ serviço em muitos-para-muitos: um mesmo cardápio pode participar de vários serviços ao mesmo tempo. Os vínculos gravados em `menus.service_id` são copiados para a tabela `menu_services` e a coluna é removida, para não sobrar fonte duplicada.

Depois de aplicada a `011`, a `010` já não é mais necessária para o vínculo de cardápios — basta a `011`, que sozinha também conclui a `002`. As duas podem ser executadas nesta ordem e mais de uma vez.

No formulário de serviço, os cardápios marcados são os que aquele serviço inclui; desmarcar remove o vínculo **apenas daquele serviço**, mantendo o cardápio nos outros. No formulário de cardápio, os serviços marcados são os que incluem aquele cardápio.

### Estoque

Para habilitar as movimentações de estoque, execute [supabase/migrations/004_inventory_stock.sql](supabase/migrations/004_inventory_stock.sql). O módulo permite cadastrar itens, definir estoque mínimo e registrar entradas, saídas e ajustes com histórico no banco.

Para categorias e imagens dos itens, execute [supabase/migrations/005_inventory_categories_images.sql](supabase/migrations/005_inventory_categories_images.sql). As imagens ficam no bucket `inventory-images`, podem ser múltiplas e abrem em tela cheia ao toque. O mesmo visualizador é usado nas imagens dos cardápios.

### Cerimonial

Execute [supabase/migrations/013_ceremonial_templates_reorder.sql](supabase/migrations/013_ceremonial_templates_reorder.sql) no SQL Editor. Ela é idempotente e faz quatro coisas:

**1. `services.is_ceremonial`** — coluna booleana que marca quais serviços o módulo de Cerimonial atende. A marcação aparece como uma caixa no cadastro de serviço. A migração já preenche automaticamente os serviços existentes cujo nome ou categoria contenham a palavra "cerimonial" ("Cerimonial Completo", "Recepção / Cerimonial", "CERIMONIAL PREMIUM"); "Cerimônia" não entra, por ser outra palavra. O seletor de evento do Cerimonial só lista eventos cujo orçamento tenha algum item apontando para um serviço marcado. A caixa *"Somente eventos com serviço de Cerimonial"* liga e desliga esse filtro, e se nenhum serviço estiver marcado o filtro é ignorado para o módulo não ficar inutilizável.

**2. Modelos padrão** — tabelas `ceremonial_templates` e `ceremonial_template_activities`. Em Roteiro, o botão **Modelo padrão** abre o cadastro: crie tantos modelos quiser, monte o roteiro de cada um e depois **Copiar para o evento**. A cópia pode *anexar* ao roteiro existente (padrão) ou *substituir* tudo, com confirmação.

**3. Reordenação** — a coluna `unique (event_id, position)` de `ceremonial_activities` impedia a reordenação: trocar duas atividades de lugar exige dois `UPDATE`s e o primeiro esbarra na posição que a segunda ainda ocupa. Como o `supabase-js` resolve com `{ error }` em vez de lançar exceção, o botão de seta recarregava a lista sem mudar nada. As funções `reorder_ceremonial_activities` e `pack_ceremonial_activities` resolvem dentro do banco, em duas fases e de forma atômica.

**4. `copy_ceremonial_template`** — copia as atividades de um modelo para um evento numa transação só, respeitando o `append` ou o `replace`.

Execute [supabase/migrations/014_reorder_ceremonial_template_activities.sql](supabase/migrations/014_reorder_ceremonial_template_activities.sql) no SQL Editor. Ela cria a função `reorder_ceremonial_template_activities`, que faz o mesmo pelos momentos de um modelo padrão. Sem ela, arrastar os momentos do modelo falha: a coluna `unique (template_id, position)` não deixa gravar a nova ordem em `UPDATE`s avulsos, e o movimento funciona com a reordenação do roteiro e não com o do modelo.

O roteiro se reordena arrastando pelo punho `⠿`. O arraste usa Pointer Events, então funciona com dedo no celular e com mouse, já que a API nativa de drag-and-drop não funciona em touchscreen. Funciona tanto no roteiro do evento quanto nos momentos de cada modelo padrão.

### Sincronização em tempo real

Execute [supabase/migrations/012_realtime_publication.sql](supabase/migrations/012_realtime_publication.sql) no SQL Editor. **Sem ela nada sincroniza**, mesmo com o frontend correto: a publication `supabase_realtime` do Supabase é criada vazia e cada tabela precisa ser adicionada a ela explicitamente. As subscriptions do navegador respondem `SUBSCRIBED` mesmo quando a tabela não está publicada, então o sintoma é o app "parecer" sincronizado e nunca receber nada. A migração é idempotenta e emite um `NOTICE` com o resultado da verificação ao final.

A partir daí, [realtime.js](realtime.js) mantém um único canal que escuta as 20 tabelas do app. Quando qualquer usuário altera um registro, só as telas **visíveis naquele momento** são recarregadas, com 400 ms de debounce — salvar um orçamento dispara `UPDATE quotes` + `DELETE quote_items` + N `INSERT quote_items` e mesmo assim causa uma única recarga. Uploads de imagem sincronizam pelo mesmo caminho, porque cada imagem é uma linha em `menu_images` / `inventory_images`.

Dois pontos que dependem de manutenção futura:

- `app.js` não exportava nada. As funções que o `realtime.js` chama foram expostas em `window.plenitudeApp`. Ao adicionar uma tela nova, inclua o respective loader nessa lista, senão ela não sincroniza.
- A tabela `profiles` é lida pelo `permissions.js` e tem um tópico (`acesso`) em `realtime.js`, para que uma mudança de permissão chegue a quem está com o app aberto. Ao adicionar um módulo que depende de `profiles`, inclua o loader dele nesse mesmo tópico.

### Navegação entre telas

O app não tem router: cada tela é uma `<section>` fixa que aparece e some pelo atributo `hidden`. A pilha dessas telas mora em [navigation.js](navigation.js), que observa esse atributo por `MutationObserver` em vez de ser avisado por cada abertura. Nenhum módulo precisa chamar nada para participar: basta a tela existir e ter o botão que a fecha.

Todo cabeçalho de tela recebe dois botões à esquerda do título — **voltar** (fecha a última tela e devolve para a anterior) e **início** (fecha tudo de uma vez) — e o visualizador de imagem recebe os dois no canto, para não ser um beco sem saída.

O botão físico de voltar do Android e do iPhone funciona porque a pilha é espelhada no `history` do navegador. Abrir uma tela empurra uma entrada; fechar uma consome a entrada. Quando o app fecha uma tela sozinho (o X, o envio de um formulário, o fim de uma etapa), a entrada sai junto: sem isso o aparelho teria uma entrada sem tela nenhuma para fechar e o primeiro toque não faria nada.

Dois pontos que dependem de manutenção futura:

- **Tela nova precisa entrar em `SCREENS`** no [navigation.js](navigation.js), com o seletor do painel e o atributo do botão que a fecha. Uma tela fora dessa lista aparece, mas não entra na pilha: não tem botão de voltar e o do aparelho não age nela. O nome do atributo segue o padrão `data-close-*`.
- **A brand do topo apontava para `#inicio`**, o que empurrava uma entrada de histórico a cada toque e desalinhava o botão do aparelho. Ela agora passa pelo mesmo caminho do botão de início, sem mexer no histórico.

`window.plenitudeNav` expõe `back()`, `home()`, `stack()` e `cover(panel)`. O `cover()` é para quando uma tela abre **por cima** de outra em vez de por baixo: a de baixo continua na pilha e volta a aparecer quando a de cima fecha. É o que faz Configurações devolver em vez de sumir quando se volta de Usuários, Cardápios ou Categorias.

### Instalar como PWA

O app agora possui [manifest.webmanifest](manifest.webmanifest), [sw.js](sw.js) e ícones em [icons](icons). Depois do deploy no Netlify:

1. Abra o endereço HTTPS do app no Google Chrome do celular.
2. Abra o menu de três pontos.
3. Toque em **Instalar app** ou **Adicionar à tela inicial**.

O service worker mantém o shell visual disponível quando a rede falha. Login, Supabase e uploads continuam dependendo de internet.

### Usuários, níveis e permissões

Execute [supabase/migrations/015_access_control.sql](supabase/migrations/015_access_control.sql) no SQL Editor. Ela é idempotente e pode ser executada quantas vezes for necessário. **Rode-a depois da 001**, porque reescreve as políticas de acesso que a 001 criou.

Para o **login com Google** e para as **contas fechadas por padrão**, execute também a [016](supabase/migrations/016_login_google_closed_accounts.sql), depois da 015.

Até aqui qualquer conta autenticada enxergava e alterava tudo: as 22 políticas da 001 eram todas `using (true)` e a coluna `profiles.role` (`admin`/`staff`) não era lida nem pelo banco nem pelo app. A 015 transforma a permissão em regra do banco.

O que ela acrescenta:

- **`app_permissions`** — as 10 telas que existem no app, com a mesma chave do atributo `data-permission` do [index.html](index.html);
- **`app_roles`** — os níveis: `owner` (Proprietário), `admin` (Administrador), `gestor` (Gestor), `operador` (Operador) e `consulta` (Consulta);
- **`app_role_permissions`** — quais telas cada nível abre por padrão;
- **`profiles`** — ganha `email`, `whatsapp`, `permissions` e `active`. `permissions` é a lista de telas da pessoa: **nulo** significa "herda do padrão do nível", lista vazia significa "nenhuma tela".

A permissão efetiva é resolvida por `has_permission()`, nesta ordem: `owner`/`admin` passam direto (é o que impede que um erro de configuração tranque o app inteiro), senão vale a lista da pessoa, senão o padrão do nível.

**Quem entra vê o quê é regra do RLS**, não do JavaScript. Cada tabela exige a permissão da tela que a alimenta. Um módulo também lê o que ele precisa: quem tem Cerimonial lê eventos, clientes e orçamentos, porque o módulo monta a operação a partir deles — mas não pode escrever neles.

#### Cadastrar uma pessoa

A conta de login é criada por você em **Authentication > Users** no painel do Supabase. Isso é deliberado: o frontend só tem a chave pública, e a `service_role` jamais pode ir para o navegador. Quando a conta é criada lá, a trigger `handle_new_user` já gera a linha em `profiles` sozinha.

Depois disso, tudo o mais é na tela **Usuários** do app: nome, WhatsApp, nível e as telas. O e-mail informado precisa bater com o da conta criada no painel; se não existir, o banco avisa exatamente isso.

O caminho inverso também existe: `link_profile_by_email()` acha a conta em `auth.users` pelo e-mail e cria o perfil. Isso cobre quem foi criado no painel antes da trigger existir.

#### Se a tela de Usuários não aparecer

Ela fica em **Configurações → Usuários e acessos** (último item) e também como card na tela inicial.

Se nenhum dos dois estiver lá, a migration 015 ainda não foi aplicada. Nesse caso o app mostra um aviso em vermelho logo abaixo da saudação, e a tela de Usuários fica indisponível de propósito: sem as colunas e as políticas, ela não teria o que salvar. Aplique a 015 e o aviso some sozinho.

#### Entrar com Google

Execute [supabase/migrations/016_login_google_closed_accounts.sql](supabase/migrations/016_login_google_closed_accounts.sql) depois da 015. Ela faz duas coisas: cria o perfil com a conta **inativa** e dá ao cadastro a opção de ligar a conta.

O login em si é configurado fora do código, em dois lugares:

1. **Google Cloud Console** → *Credenciais* → *Criar credenciais* → **ID do cliente OAuth**, do tipo **Aplicativo da Web**. Em *URIs de redirecionamento autorizados*:
   ```
   https://evhyshjxqnfbabraxafs.supabase.co/auth/v1/callback
   ```
2. **Supabase** → *Authentication > Providers > Google*: liga o provedor e cola o Client ID e a Client Secret.
3. **Supabase** → [*Authentication → URL Configuration*](https://supabase.com/dashboard/project/_/auth/url-configuration). Tem dois campos:

   | Campo | O que colocar |
   |---|---|
   | **Site URL** | `https://seu-site.netlify.app` |
   | **Redirect URLs** | `https://seu-site.netlify.app/**` |

   O **Site URL** vem por padrão como `http://localhost:3000` e precisa mudar: é ele que define para onde o usuário volta quando o app não manda um `redirectTo`, e é o endereço usado nos e-mails de confirmação e de recuperação de senha. Deixando como `localhost`, um e-mail do Supabase levaria a pessoa para a máquina do desenvolvedor.

No Google Cloud, além das *URIs de redirecionamento autorizadas*, vale preencher também **Origens JavaScript autorizadas** com `https://seu-site.netlify.app`. O fluxo implícito do Supabase funciona sem isso, mas o Google usa essa lista em validações e para proteger contra o uso do seu Client ID em outro site.

O endereço do site está no Netlify em **Deploys**, no deploy mais recente, ou em *Site configuration → Domain management*.

A Client Secret do Google **nada disso entra no app**: o Supabase troca o token no servidor. O [supabase-config.js](supabase-config.js) não muda.

Com isso, a pessoa clica em **Entrar com Google** na tela de login e nunca vê senha. Quando o Supabase reconhece o e-mail, ela entra **na mesma conta que já estava cadastrada**, e as permissões são as que você definiu.

Se o endereço estiver errado, o Google volta o erro na URL e o app mostra *"O endereço deste app ainda não foi liberado no painel do Supabase"* em vez de voltar pro login sem explicação. Foi por isso que existe o tratamento de erro em `mostrarErroDoOAuth()`.

> Se a pessoa aparecer duplicada na tela de Usuários depois do primeiro login, é sinal de que o Google não fez o vínculo por e-mail. Aí não é problema de permissão: é a conta no Supabase que precisa ter o mesmo e-mail da que você cadastrou.

#### Contas fechadas por padrão

Publicar o app OAuth no Google significa que **qualquer conta Google que descobrir o endereço do aplicativo consegue entrar**. Sem a 016, essa pessoa receberia um perfil com o nível `consulta` e passaria a ler a agenda, os convidados e o WhatsApp de cada convidado.

Com a 016, a conta nasce **inativa**. Quem entra sozinho pelo Google vê:

> Esta conta está desativada. Fale com um administrador para reativá-la.

Para liberar, você vai na tela de **Usuários** e cadastra a pessoa — e é o próprio cadastro que ativa a conta, com o nível e as telas que você escolher. Nada de conceito novo: é a mesma tela e o mesmo botão de ativar que já existem para suspender alguém.

Se quiser que a pessoa entre cadastrada e **sem** conseguir entrar, desmarque **Conta ativa** no cadastro.

A conta do administrador do app é a exceção: a seção 11 da 015 promove `ewertonaires97@gmail.com` a proprietário **e reativa a conta**, porque sem isso a própria mudança bloquearia a única pessoa capaz de destravar o app.

Se a conta do administrador ainda não existir quando você rodar a 015, o `WARNING` avisa. Rode a 015 de novo depois de criar a conta no Supabase: as duas se corrigem sozinhas.

#### Níveis

| Nível | Telas por padrão |
|---|---|
| Proprietário | todas |
| Administrador | todas |
| Gestor | todas menos Usuários |
| Operador | Início, Clientes, Orçamentos, Eventos, Cardápios, Cerimonial |
| Consulta | Início, Eventos |

O padrão de cada nível se edita na própria tela de Usuários. `owner` e `admin` não são editáveis porque as funções os tratam como acesso total antes de olhar qualquer lista.

Uma pessoa pode ter telas marcadas no cadastro, e aí o padrão do nível é ignorado para ela. Desmarcar "Usar o padrão do nível" volta para a herança.

#### O que o banco recusa

Estas regras valem mesmo que alguém ignore a interface e chame a API direto:

- **Promover-se.** O `UPDATE` em `profiles` é limitado por coluna a `full_name` e `whatsapp`. Nível, telas e situação só mudam pelas funções, que exigem a permissão `usuarios`.
- **Rebaixar ou desativar a si mesmo.** Não há como ficar sem ninguém capaz de devolver o acesso.
- **Rebaixar o último proprietário ativo.** É o caminho de volta quando todo mundo já perdeu acesso por engano.
- **Desligar o dono.** Desligar o acesso de alguém é uma ação legítima e continua permitido. A trava aqui é só para o caso de não sobrar nenhuma conta capaz de abrir a tela de Usuários — que, com o bloqueio de auto-desativação, já não é alcançável pela API e existe como rede de proteção.
- **Apagar alguém.** Não existe: apagar a linha deixaria a conta do Supabase órfã, sem caminho para dentro do app. Desativar é o caminho reversível.
- **Apagar ou editar o padrão de `owner`/`admin`.**

A resolução da permissão está em uma função só, `effective_permissions()`, chamada por `has_permission()`, por `my_permissions()` e pela trava do último administrador. Três cópias da mesma condição divergindo é o que deixaria alguém com acesso a mais do que o dono cadastrou sem nenhum erro aparecer.

Uma conta desativada continua conseguindo ler o próprio perfil — é o que permite o app explicar o motivo — mas `has_permission()` responde `false` para tudo, e nenhuma política libera nada.

#### Manutenção

- `profiles` agora é lida pelo [permissions.js](permissions.js) e escutada pelo [realtime.js](realtime.js). Ao mexer em permissões de alguém, a tela da pessoa atualiza sozinha, e as telas que ela perdeu fecham sozinhas.
- `my_access()` é a única fonte da permissão do usuário logado. Se algum dia a lista que o navegador mostra divergir da que o banco aplica, é porque o `permissions.js` drifted, e não porque a pessoa tem outra regra.
- A limpeza de políticas da 015 apaga **toda** política permissiva (`using (true)`) das tabelas listadas, e não só as conhecidas pelo nome. Foi preciso porque este banco criou a mesma política com nomes diferentes: `authenticated users can manage ceremonialistas` (espaços, 006/008) e `authenticated_users_can_manage_ceremonialistas` (sublinhados, 009), além de outras na 013. Um `DROP POLICY` pelo nome deixaria três delas valendo.
- A trigger `handle_new_user` e a função `assert_access_change()` são substituídas pela 015. Se um dia mudar `profiles.role` ou `permissions`, atualize as duas.