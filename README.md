# Tudo Sobre Nada

Comunidade para publicar **imagens, vídeos, tutoriais e anotações de trabalho** —
um feed no estilo blog/Reddit, sem servidor, sem build e sem dependências.

```
beam-community/
├─ index.html          # página inicial (feed)
├─ post.html           # página individual de cada post (?id=<id>)
├─ supabase.sql        # esquema do banco compartilhado (roda no SQL Editor)
├─ supabase-storage.sql # só o Storage (repara upload recusado)
├─ iniciar-servidor.bat  # duplo clique sobe o servidor local no Windows
├─ iniciar-tunel.bat     # duplo clique sobe servidor + tunel publico HTTPS
├─ parar-tunel.bat       # desliga so o tunel publico (site local continua)
├─ parar-tudo.bat        # desliga tunel + servidor local
├─ assets/
│  ├─ styles.css       # sistema de design (tokens, componentes, temas)
│  ├─ data.js          # boards, usuários, posts e comentários de exemplo
│  ├─ config.js        # endereço e chave do Supabase (vazio = modo local)
│  ├─ db.js            # cliente REST do Supabase (PostgREST + Storage)
│  ├─ store.js         # persistência: localStorage + IndexedDB (mídia) + banco
│  ├─ poster.js        # miniaturas de vídeo: frame do começo, nunca preto
│  ├─ profile.js       # perfis, paletas, menu, masthead e transições
│  ├─ app.js           # página inicial: feed, filtros, navegação
│  └─ post.js          # página do post: votos, comentários, respostas
├─ tools/
│  └─ mock-supabase.js # Supabase de mentira (testes sem conta)
└─ demo/
   ├─ preview-desktop.html   # abre o site dentro de um iframe de 1440px
   └─ ensaio-liso.svg       # arquivo de imagem usado nos testes de upload
```

## Como rodar

```bash
cd beam-community
python -m http.server 8777
# abra http://localhost:8777
```

No Windows dá para **dar dois cliques** em `iniciar-servidor.bat` — ele sobe o
servidor já com `--bind 0.0.0.0` (aceita conexões da rede local) e mostra o
endereço no console. Para desligar, feche a janela.

## Banco compartilhado (Supabase)

Sem configuração o site funciona **100% local** (cada navegador tem a sua
cópia). Com o Supabase ligado, **todos os visitantes veem os mesmos posts,
imagens, vídeos, comentários e votos**.

### 1. Criar o projeto

1. Crie uma conta em <https://supabase.com/dashboard> e um projeto (o plano
   gratuito dá conta e_storage de sobra para uma comunidade pequena).
2. No painel, abra **SQL Editor → New query**.
3. Cole o conteúdo de [`supabase.sql`](supabase.sql) e clique em **Run**.
   Isso cria as tabelas (`profiles`, `posts`, `comments`, `votes`,
   `comment_votes`), o bucket público `post-media` e as políticas de acesso.

> Se o upload de imagem/vídeo for recusado com *"new row violates row-level
> security policy"*, rode [`supabase-storage.sql`](supabase-storage.sql) no
> SQL Editor: ele recria só as políticas do Storage (select, insert, update
> e delete). É o que o site usa para enviar, sobrescrever e apagar arquivos.

### 2. Apontar o site para o banco

No painel, em **Project Settings → API**, copie:

- **Project URL** — algo como `https://abcdefgh.supabase.co`
- **anon public** — a chave pública (começa com `eyJ...`)

Abra `assets/config.js` e preencha:

```js
window.BEAM_CONFIG = {
  supabaseUrl: 'https://abcdefgh.supabase.co',
  supabaseAnonKey: 'eyJhbGciOi...',
  bucket: 'post-media'
};
```

> **A chave `anon` é pública** — ela fica no JavaScript que todo mundo
> baixa. Isso é normal no Supabase: quem protege os dados são as políticas
> (RLS) do `supabase.sql`, não a chave. **Nunca** use a `service_role` no
> site: ela contorna as políticas e daria acesso a tudo.

### 3. Testar

Abra `http://localhost:8777` e olhe a **luzinha** no topo (ao lado do botão
de tema):

| Luzinha | Significa |
| --- | --- |
| ⚪ apagada | modo local — sem banco configurado |
| 🟡 pulsando | sincronizando |
| 🟢 verde | banco conectado e sincronizado |
| 🔴 vermelha | falhou ao falar com o banco (clique para tentar de novo) |

Para conferir de verdade: abra o site em **duas janelas anônimas** (ou em
dois navegadores), publique em uma e veja aparecer na outra.

### 4. Publicar no GitHub Pages

`assets/config.js` já está no repositório — é só subir a pasta e o site
publicado já usa o mesmo banco. Nada de build, nada de `npm install`.

### Durante o desenvolvimento: apontar para outro banco

Para testar sem mexer no arquivo (e sem sujar o `config.js` do Git), grave
a configuração no próprio navegador — vale só nessa máquina:

```js
localStorage.setItem('beam.db.override', JSON.stringify({
  url: 'http://localhost:8787', key: 'chave-de-teste'
}));
location.reload();
```

Para voltar ao normal: `localStorage.removeItem('beam.db.override')`.

Existe um **Supabase de mentira** para testar sem conta nenhuma:

```bash
node tools/mock-supabase.js 8787
```

Ele imita a API REST e o Storage (inclusive `Range`, para vídeo) em memória:
`http://localhost:8787/__dump` mostra o que tem no banco e
`http://localhost:8787/__reset` limpa tudo. Serve para testar o fluxo
completo; some quando o processo é encerrado.

### Como os dados se misturam

- O `localStorage`/`IndexedDB` continua sendo o **cache local**: o site
  abre rápido e funciona mesmo com o banco fora do ar.
- Cada post/perfil guarda a marca de já ter sido enviado. O que **nunca**
  subiu continua só no seu navegador; o que já subiu passa a obedecer o
  banco (se não vem na leitura, foi apagado).
- As marcas valem **por banco**: se você trocar o endereço do Supabase, tudo
  é reenviado para o banco novo (o que foi para outro banco conta como
  nunca enviado).
- A mídia é enviada para o **Storage** com a extensão do arquivo no nome
  (sem isso o navegador recusa o vídeo). O arquivo também fica guardado no
  `IndexedDB` do seu navegador: é a reserva caso o endereço compartilhado
  suma, e permite reenviar o arquivo depois.
- A pontuação **não** é um número guardado no post: ela é a soma das linhas
  da tabela `votes` — por isso o post não nasce mais com "+1".

## Hospedagem local (rodar no seu próprio computador)

O site é 100% estático: **só precisa de um servidor de arquivos**. Não há
banco de dados, back-end, build nem `npm install`.

### Requisitos

| Item | Detalhe |
| --- | --- |
| Servidor HTTP | Qualquer um. Já vem com o Python (`python -m http.server`), mas serve igual com `npx serve`, `php -S`, Node, IIS, Apache ou Caddy |
| Python (opcional) | 3.8+ — o do sistema já resolve. Só para servir os arquivos |
| Navegador | Qualquer moderno: Chrome, Edge, Firefox, Safari. Precisa suportar `<dialog>`, IndexedDB e View Transitions (fallback incluído) |
| Rede | Só o **localhost** não precisa de nada. Para acessar de outros dispositivos é preciso estar na mesma rede Wi-Fi/cabo |
| Disco | **Menos de 1 MB** para o site (hoje são 328 KB) |
| Memória | ~14 MB de RAM para o processo do servidor |

### Armazenamento: onde os dados ficam

- **Os arquivos do site**: ~328 KB na pasta `beam-community/` (o `styles.css` e o
  `app.js` somam 127 KB). Nada mais é necessário no disco.
- **Sem banco configurado** (padrão): os posts e a mídia que você publica ficam
  só no **seu navegador** (`localStorage` para o texto, `IndexedDB` para os
  arquivos). Não ocupam o disco do servidor — ocupam o perfil do
  Chrome/Edge/Firefox.
  - Limite por arquivo: **25 MB** (`MAX_FILE` em `store.js`).
  - Limite total: a cota do navegador para a origem (no Chrome, ~60% do disco
    livre).
  - Consequência: **cada navegador tem seu próprio conteúdo**. Os posts de
    exemplo aparecem para todo mundo; o que você publica só existe na sua
    máquina, no seu navegador.
- **Com o Supabase configurado** (veja [Banco compartilhado](#banco-compartilhado-supabase)):
  os posts, comentários, votos e os arquivos de mídia vão para o banco e o
  Storage — e todo mundo vê o mesmo conteúdo. O navegador local vira cache.

### Comandos

```bash
# servidor simples (só esta máquina)
python -m http.server 8777 --directory beam-community

# servidor com acesso pela rede local
python -m http.server 8777 --bind 0.0.0.0 --directory beam-community
```

Depois, em outro dispositivo na mesma rede:
`http://<IP-DO-PC>:8777` (veja o IP com `ipconfig`).

### Permitir no Firewall do Windows

O firewall bloqueia conexões de entrada por padrão. Abra o **PowerShell como
Administrador** e rode uma vez:

```powershell
New-NetFirewallRule -DisplayName "Tudo Sobre Nada 8777" `
  -Direction Inbound -LocalPort 8777 -Protocol TCP -Action Allow `
  -Profile Private
```

Só abra a porta na rede **Privada** — nunca em rede pública.

### Ligar junto com o Windows

1. `Win + R` → `shell:startup` → Enter.
2. Crie um atalho para `iniciar-servidor.bat` (ou para o comando do Python)
   nessa pasta.

### Se quiser acesso pela internet

Como não há back-end, **não há login nem servidor de dados** — o site é só
uma página. Expor a porta 8777 para a internet significa que qualquer um
com o endereço consegue abrir a mesma página (mas os dados continuam no
navegador de cada um). Se ainda assim quiser:

- **Cloudflare Tunnel** (recomendado): `cloudflared tunnel --url http://localhost:8777`
  — gera um HTTPS público sem mexer no roteador.
- **ngrok**: `ngrok http 8777`.
- **Port forwarding** no roteador + DDNS: exige IP público fixo ou
  ddns e **não** é recomendado para expor um servidor de desenvolvimento.

### Acesso pelo celular: túnel público (funciona de qualquer rede)

A rota da rede local (`http://192.168.1.2:8777`) só funciona se o celular
estiver **na mesma rede** que o PC. Para-accessar de qualquer lugar — inclusive
por dados móveis — use um túnel HTTPS público.

**Instalar (uma vez):**

```powershell
winget install --id Cloudflare.cloudflared --exact
```

**Ligar:**

```bash
cloudflared tunnel --url http://localhost:8777 --no-autoupdate
```

O comando imprime uma URL no formato
`https://<algo>.trycloudflare.com` — é só abrir essa URL no celular.
Não exige conta na Cloudflare e não pede configuração de roteador.

No Windows dá para fazer tudo com **dois cliques** em `iniciar-tunel.bat`:
ele sobe o servidor local (se não estiver no ar), abre o túnel e mostra a URL.

**Para desligar** — nada precisa reiniciar, porque túnel e servidor são
processos separados:

| Script | O que desliga | O que continua |
| --- | --- | --- |
| `parar-tunel.bat` | Só o túnel público (a URL morre na hora) | Servidor local em `http://localhost:8777` |
| `parar-tudo.bat` | Túnel **e** servidor local | Nada |

Pelo console, com o túnel aberto numa janela do `iniciar-tunel.bat`, basta
**Ctrl+C** (ou fechar a janela). Para matar por processos:

```powershell
Stop-Process -Name cloudflared -Force   # só o túnel
Stop-Process -Name python -Force        # o servidor local também
```

> A URL é **temporária**: muda a cada execução e morre se o PC dormir ou
> reiniciar. Para uma URL fixa é preciso criar uma conta na Cloudflare e
> configurar um túnel nomeado com um domínio próprio.

### Alternativa: hospedar de verdade (grátis)

O projeto é estático e não tem build, então qualquer hospedagem de arquivos
estáticos serve:

| Opção | Como |
| --- | --- |
| GitHub Pages | Suba a pasta para um repositório e ative Pages (URL `https://<user>.github.io/<repo>/`) |
| Cloudflare Pages | Conecte o repositório; build = "None", output = `/` |
| Netlify / Vercel | Conecte o repositório; sem comando de build |
| itch.io / Neocities | Upload direto da pasta |

Em todos esses casos **siga usando `localhost:8777` para desenvolver** e
publicar o `beam-community/` como está.


## Estrutura da navegação

- **Página inicial** (`index.html`): feed com ordenação (*Em alta*, *Novos*,
  *Mais comentados*), visualização em lista ou grade, busca ao vivo, filtro por board
  e por tag.
- **Página do post** (`post.html?id=<id>`): cada post é uma página própria, com URL
  compartilhável — clicar no título navega, não abre popup. Traz mídia, texto completo,
  especificações de tutorial, votos, salvar, copiar link, comentários com resposta e
  uma lista de posts relacionados ao final.
- **Barra lateral recolhível**: boards (sempre visíveis) + um bloco **Tags** que começa
  recolhido e, ao ser aberto, lista as tags em **ordem alfabética**. O botão no canto
  superior esquerdo recolhe a barra inteira — no desktop o padrão é recolhido, no
  mobile ela vira gaveta.

## O que já funciona

- **Publicar** com 4 tipos: imagem, vídeo, tutorial e texto.
  - **Tutorial com "slides" tipo PowerPoint**: ao escolher tutorial, o compositor vira um construtor de slides — você adiciona quantos slides quiser, cada um com **imagem própria** (upload independente, até 25 MB) e **texto próprio**, sem precisar ter o mesmo tamanho que a imagem de capa do feed.
  - Upload por clique ou arrastar (imagem/vídeo de capa, até 25 MB por arquivo), com preview.
    Para vídeo, a miniatura é um **frame real do começo** — nunca o frame preto inicial.
  - Link de material de apoio opcional, com rótulo detectado automaticamente.
- **Votos** em posts e em comentários (a favor/contra).
  - Comentários são ordenados pelo placar: o mais votado sobe, o menos desce.
  - Respostas ficam aninhadas sob o comentário pai, também ordenadas por placar.
- **Salvar** post, **compartilhar** link e **excluir** os posts que você publicou.
- **Descoberta**: busca (título, corpo, autor, tags), filtro por board, clique em tag
  (com chip removível no topo do feed) e ordenação por ranking, data ou comentários.
- **Tema claro/escuro** — o símbolo de infinito acompanha o modo (branco no escuro,
  preto no claro). Layout responsivo, atalhos `/` e `n`.
- **Persistência real**: posts, votos, votos de comentário, salvos e tema em
  `localStorage`; arquivos de mídia em `IndexedDB`. Tudo sobrevive ao recarregar.
- **Conteúdo compartilhado (opcional)**: com o Supabase configurado, posts,
  mídia, comentários e votos ficam num banco único — todo visitante vê a mesma
  coisa. Sem configuração, o site continua 100% local.

### Boards

Geral · Fotografia · Vídeo · Tutoriais · Áudio

## Modelo de dados

```jsonc
{
  "id": "post-abc123",
  "kind": "image | video | tutorial | text",
  "board": "foto",
  "author": "você",
  "title": "…",
  "body": "…",
  "tags": ["iluminação", "entrevista"],
  "createdAt": 1730000000000,
  "media": [{ "id": "media-xyz", "type": "image", "name": "foto.png", "size": 183424,
              "url": "https://…/storage/v1/object/public/post-media/media/media-xyz.png",
              "path": "media/media-xyz.png" }],
  "duration": "14 min",         // só em tutorial
  "level": "iniciante",         // só em tutorial
  "tools": "…",                 // só em tutorial
  "slides": [                   // só em tutorial — builder tipo PowerPoint
    { "body": "texto do slide", "media": { "id", "type", "name", "size" } },
    { "body": "próximo passo", "media": null }
  ],
  "link": "https://…",
  "comments": [
    { "id": "c-1", "author": "rui", "body": "…", "createdAt": 0,
      "replies": [{ "id": "c-2", "author": "você", "body": "…", "createdAt": 0 }] }
  ]
}
```

> A pontuação **não** mora no post. No modo local ela é o voto de quem está
> olhando; com o banco ligado ela é a soma das linhas da tabela `votes`
> (uma linha por pessoa por post). Por isso o post não nasce mais com "+1".

Estado guardado no navegador:

```jsonc
{
  "posts": [ /* … */ ],
  "votes":         { "post-abc123": 1 },          // 1 = a favor, -1 = contra
  "commentVotes":  { "c-1": -1 },
  "voteTotals":    { "post-abc123": 12 },         // soma dos votos dos outros
  "saved":         ["post-abc123"],
  "settings":      { "theme": "dark", "railHidden": true },
  "mediaFallback": { "media-xyz": "data:…" }      // só quando o IndexedDB não existe
}
```

## Sistema de design

| Token | Valor (escuro) | Uso |
| --- | --- | --- |
| `--ink` | `#0E2A2C` | fundo da página |
| `--surface` | `#16393B` | cards e campos |
| `--paper` | `#EDF3F1` | texto principal e símbolo do logo |
| `--muted` | `#9FB6B4` | texto secundário |
| `--sun` | `#FFB23F` | ação primária, upvotes, destaque |
| `--coral` | `#FF5E5B` | vídeo, accent dos boards |
| `--mint` | `#6FE3B0` | tutoriais e acentos frios |

- Display: **Bricolage Grotesque**; texto: **IBM Plex Sans**; metadados: **IBM Plex Mono**.
- Tema claro reescreve os mesmos tokens — nenhum valor de cor está fixo no HTML.
- O logo é um **símbolo de infinito** desenhado em SVG, sem fundo, herdando a cor do
  texto do tema.
- A coluna de votos, os chips de board e a barra de especificações do tutorial são
  elementos estruturais: eles codificam informação, não decoram.

## Acessibilidade e robustez

- HTML semântico, `dialog` nativo no compositor, `aria-label` nos botões de ícone,
  `role="tab"`/`aria-selected` nas abas de ordenação.
- Foco visível em todo elemento interativo, link "pular para o feed",
  `prefers-reduced-motion` respeitado.
- Todo texto vindo do usuário passa por escape de HTML antes de ir para o DOM.

## Limites conhecidos

- **Sem login**: o perfil é escolhido por quem publica (nome + avatar) e a
  identidade é uma chave anônima guardada no navegador. Ela é pública por
  desenho — o que protege o conteúdo são as políticas (RLS) do banco. Se um
  dia você quiser que só moderadores apaguem posts, é em `supabase.sql` que
  se mexe.
- **Chave anon no cliente**: a `anon public` fica no JavaScript do site. Nunca
  use a `service_role` lá.
- O estado fica no `localStorage`, que é compartilhado entre as abas do mesmo
  navegador. Postos e perfis criados numa aba não se perdem quando outra aba
  salva, e um perfil apagado não volta.
- A URL do post usa `post.html?id=…` (sem regra de rewrite no servidor). Com um
  roteador real, vira `/posts/<slug>` sem mudar nada na UI.
- Arquivos de mídia que existam **só** no Storage de outro projeto (ou de um
  banco de teste) não são aproveitados: o site reenvia a cópia local quando
  ela ainda existe no `IndexedDB`.

## Posts e dados

O site **começa vazio**: o feed só mostra o que você publica.

- Os posts de exemplo (`p1`, `p2`, …) são gerados por código em `data.js`, mas
  **não são criados automaticamente** — uma migração em `store.js` remove os que
  já estavam salvos no navegador, junto com os votos, salvos e votos de comentário
  que apontavam para eles.
- Se quiser repor os exemplos para testar, chame no console do navegador:
  `Beam.store.seedDemoPosts()`.
- As datas aparecem apenas como **dia/mês/ano** (`05/11/2026`). Passando o mouse
  sobre a data, o `title` mostra a data por extenso (`5 de novembro de 2026`).

