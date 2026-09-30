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

### Sincronização em tempo real

Execute [supabase/migrations/012_realtime_publication.sql](supabase/migrations/012_realtime_publication.sql) no SQL Editor. **Sem ela nada sincroniza**, mesmo com o frontend correto: a publication `supabase_realtime` do Supabase é criada vazia e cada tabela precisa ser adicionada a ela explicitamente. As subscriptions do navegador respondem `SUBSCRIBED` mesmo quando a tabela não está publicada, então o sintoma é o app "parecer" sincronizado e nunca receber nada. A migração é idempotenta e emite um `NOTICE` com o resultado da verificação ao final.

A partir daí, [realtime.js](realtime.js) mantém um único canal que escuta as 20 tabelas do app. Quando qualquer usuário altera um registro, só as telas **visíveis naquele momento** são recarregadas, com 400 ms de debounce — salvar um orçamento dispara `UPDATE quotes` + `DELETE quote_items` + N `INSERT quote_items` e mesmo assim causa uma única recarga. Uploads de imagem sincronizam pelo mesmo caminho, porque cada imagem é uma linha em `menu_images` / `inventory_images`.

Dois pontos que dependem de manutenção futura:

- `app.js` não exportava nada. As funções que o `realtime.js` chama foram expostas em `window.plenitudeApp`. Ao adicionar uma tela nova, inclua o respective loader nessa lista, senão ela não sincroniza.
- A tabela `profiles` está publicada, mas não é assinada: nenhum módulo a consulta ainda. Quando o cabeçalho passar a exibir o nome do usuário autenticado, acrescente um tópico para ela em `realtime.js`.

### Instalar como PWA

O app agora possui [manifest.webmanifest](manifest.webmanifest), [sw.js](sw.js) e ícones em [icons](icons). Depois do deploy no Netlify:

1. Abra o endereço HTTPS do app no Google Chrome do celular.
2. Abra o menu de três pontos.
3. Toque em **Instalar app** ou **Adicionar à tela inicial**.

O service worker mantém o shell visual disponível quando a rede falha. Login, Supabase e uploads continuam dependendo de internet.