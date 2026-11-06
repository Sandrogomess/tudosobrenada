/* ---------------------------------------------------------------------------
   Configuração do site.

   COLE AQUI o endereço do seu projeto Supabase e a chave anônima:

     1. https://supabase.com/dashboard -> seu projeto -> Project Settings
     2. "API" -> copie "Project URL" e "anon public"

   Enquanto os campos estiverem vazios (ou com o texto de exemplo), o site
   funciona 100% local: cada visitante continua vendo apenas o que publicou
   no próprio navegador. Preenchidos, o conteúdo passa a ser compartilhado.

   A chave anônima é pública por desenho (é a mesma para todo mundo) — o que
   protege os dados são as políticas RLS do banco, definidas em supabase.sql.
--------------------------------------------------------------------------- */

window.BEAM_CONFIG = {
  /* Endereço do projeto, sem barra no final. Ex.: https://abc123.supabase.co
     (dá para colar a "API URL" também: o /rest/v1 do fim é descartado) */
  supabaseUrl: 'https://ocwmjhzpxbdllargjwve.supabase.co',

  /* Chave pública (publishable / anon public). NUNCA a secret. */
  supabaseAnonKey: 'sb_publishable_NZeG-n65AtAbJUKdDL4AEQ_xLgIlsAP',

  /* Bucket do Storage onde ficam as imagens e os vídeos. */
  bucket: 'post-media'
};

/* Durante o desenvolvimento dá para apontar o site para outro banco sem
   editar este arquivo, gravando a configuração no próprio navegador:

     JSON.stringify({ url: 'http://localhost:8787', key: 'teste' })
     -> localStorage.setItem('beam.db.override', ...)

   Isso vale só para a máquina de quem fez a configuração. */
try {
  var override = JSON.parse(localStorage.getItem('beam.db.override') || 'null');
  if (override && override.url && override.key) {
    window.BEAM_CONFIG.supabaseUrl = override.url;
    window.BEAM_CONFIG.supabaseAnonKey = override.key;
    if (override.bucket) window.BEAM_CONFIG.bucket = override.bucket;
  }
} catch (err) {
  /* Configuração inválida: segue com o que está no arquivo. */
}
