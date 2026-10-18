// ==========================================================================
// Conexão pública com o Supabase
// ==========================================================================
// Este é o único ponto do app que cria o cliente. A URL e a chave publicável
// são públicas por natureza (o navegador precisa delas); quem protege os dados
// é a RLS do Postgres, não o segredo da chave. Nunca coloque aqui a
// `service_role`, que ignora a RLS.
//
// O cliente é guardado em `window.plenitudeSupabase` porque o app não tem
// módulos/imports: cada arquivo .js se acha pelo `window`.
const supabaseClient = window.supabase.createClient(
  'https://evhyshjxqnfbabraxafs.supabase.co',
  'sb_publishable_voXbeFmyLAPxwzuvCfIwnA_9B1ktjT6'
);

window.plenitudeSupabase = supabaseClient;