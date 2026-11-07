/* Beam — persistência: estado em localStorage, mídia em IndexedDB */

(function (global) {
  'use strict';

  var KEY = 'beam.state.v1';
  var BACKUP_KEY = 'beam.state.v1.bak';
  var DB_NAME = 'beam-media-db';
  var DB_STORE = 'blobs';
  var MAX_FILE = 25 * 1024 * 1024;

  var state = null;
  var db = null;
  var urlCache = {};

  function defaults() {
    return {
      posts: [],
      votes: {},
      commentVotes: {},
      saved: [],
      /* Perfis marcados como favoritos (ids). */
      favoriteProfiles: [],
      settings: { theme: 'dark', palette: 'jade', currentProfileId: null },
      profiles: [],
      /* Registro de mídias: id -> { id, type, name, size, url }.
         O "url" é a endereço público no Storage (quando o banco está ligado)
         ou uma data URL (quando o navegador guardou o arquivo localmente). */
      media: {},
      /* Linhas de voto vindas do banco compartilhado, como vieram.
         Null = site local, sem contagem coletiva.
         A divisão entre "meu voto" e "voto dos outros" é feita na hora
         (ver score): guardar a soma pronta envelhece quando a pessoa
         troca de perfil ou vira visitante. */
      voteRows: null,
      commentVoteRows: null,
      mediaFallback: {},
      removedPosts: {},
      /* Perfis apagados (ids): impedem que uma aba antiga recrie o perfil. */
      removedProfiles: {},
      /* O que já foi para o banco compartilhado (id -> quando).
         Serve para reenviar o que ficou para trás (posts e perfis que
         estavam no navegador antes de o banco ser configurado). */
      syncedPosts: {},
      syncedProfiles: {}
    };
  }

  /* Converte o texto do localStorage em estado. Devolve null se estiver
     corrompido — nunca inventa um estado vazio a partir de um erro. */
  function parseState(raw) {
    if (!raw) return null;
    try {
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      var base = defaults();
      for (var k in base) if (!(k in parsed)) parsed[k] = base[k];
      if (!Array.isArray(parsed.posts)) parsed.posts = [];

      /* Migracao: antes os perfis se chamavam "contas". */
      if (!Array.isArray(parsed.profiles) && Array.isArray(parsed.accounts)) {
        parsed.profiles = parsed.accounts;
      }
      delete parsed.accounts;
      if (!parsed.profiles) parsed.profiles = [];
      if (!Array.isArray(parsed.favoriteProfiles)) parsed.favoriteProfiles = [];
      if (!parsed.settings) parsed.settings = {};
      if (!parsed.settings.currentProfileId && parsed.settings.currentAccountId) {
        parsed.settings.currentProfileId = parsed.settings.currentAccountId;
      }
      delete parsed.settings.currentAccountId;
      return parsed;
    } catch (err) {
      return null;
    }
  }

  /* Le o estado salvo. Se o valor estiver corrompido (acontece quando varias
     abas gravam ao mesmo tempo), tenta o backup antes de qualquer coisa:
     perder os posts silenciosamente seria muito pior do que esperar. */
  function load() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (err) { }

    var parsed = parseState(raw);
    if (parsed) return parsed;

    if (raw) {
      /* O valor gravado pode ter sido lido pela metade. Tenta de novo. */
      try { raw = localStorage.getItem(KEY); } catch (err) { }
      parsed = parseState(raw);
      if (parsed) return parsed;

      var backup = null;
      try { backup = parseState(localStorage.getItem(BACKUP_KEY)); } catch (err) { }
      if (backup) {
        console.warn('[beam] estado local corrompido, restaurando do backup');
        return backup;
      }
      console.warn('[beam] estado local ilegível e sem backup — não vou apagar nada');
      return null;
    }
    return defaults();
  }

  /* Grava o estado e confere se o que voltou a leitura é o mesmo que foi
     gravado. Em caso de corruption (escrita concorrente), tenta de novo. */
  function persist(value) {
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        /* O backup vai primeiro: se a escrita principal sair pela metade,
           ainda existe uma copia boa. */
        localStorage.setItem(BACKUP_KEY, value);
        localStorage.setItem(KEY, value);
        if (localStorage.getItem(KEY) === value) return true;
      } catch (err) {
        console.warn('[beam] não foi possível salvar o estado', err);
        return false;
      }
    }
    console.warn('[beam] gravação instável — tente novamente');
    return false;
  }

  /* Une os posts guardados em memoria com os que ja estao no localStorage.
     Sem isso, uma aba antiga sobrescreve o estado inteiro e apaga posts
     publicados em outra aba. */
  function mergePosts(persisted) {
    if (!persisted || !Array.isArray(persisted.posts)) return;
    var byId = {};
    persisted.posts.forEach(function (p) { if (p && p.id) byId[p.id] = p; });
    state.posts.forEach(function (p) { if (p && p.id) byId[p.id] = p; });

    var removed = state.removedPosts || {};
    var seed = seedMap().posts;
    Object.keys(byId).forEach(function (id) {
      /* Post apagado ou post de exemplo: nao volta. */
      if (removed[id] || seed[id]) delete byId[id];
    });

    var ids = Object.keys(byId);
    /* Mantem a ordem do post mais recente no topo, como no insert. */
    var order = {};
    state.posts.forEach(function (p, i) { if (p && p.id) order[p.id] = i; });
    ids.sort(function (a, b) {
      var ia = order[a] === undefined ? 9999 : order[a];
      var ib = order[b] === undefined ? 9999 : order[b];
      if (ia !== ib) return ia - ib;
      var pa = byId[a].createdAt || 0;
      var pb = byId[b].createdAt || 0;
      return pb - pa;
    });
    state.posts = ids.map(function (id) { return byId[id]; });
  }

  /* Junta os perfis de todas as abas. Uma aba que abre o site depois
     nao pode perder o perfil que outra aba acabou de criar, e um perfil
     apagado nao pode voltar so porque uma aba antiga salvou por cima. */
  function mergeProfiles(persisted) {
    if (!persisted || !Array.isArray(persisted.profiles)) return;
    if (!state.removedProfiles) state.removedProfiles = {};

    /* Perfis apagados em outra aba: respeita o tombstones dela. */
    var removedElsewhere = persisted.removedProfiles || {};
    Object.keys(removedElsewhere).forEach(function (id) {
      state.removedProfiles[id] = removedElsewhere[id];
    });

    var byId = {};
    var add = function (p) {
      if (!p || !p.id) return;
      if (state.removedProfiles[p.id]) return;
      byId[p.id] = p;
    };
    persisted.profiles.forEach(add);
    state.profiles.forEach(add);

    state.profiles = Object.keys(byId).map(function (id) { return byId[id]; });
  }

  /* ---------------- banco compartilhado (Supabase) ----------------
     Tudo aqui é opcional: sem configuração, o site segue 100% local. */

  var remoteStatus = 'off';

  /* Endereco do banco que esta em uso: serve para saber quando as marcas
     de "ja enviado" ficam sem valido (banco trocado). */
  function dbStamp() {
    var db = global.Beam.db;
    if (!db || !db.enabled()) return '';
    if (db.base) return db.base();
    return String((global.BEAM_CONFIG || {}).supabaseUrl || '');
  }

  function notifyStatus() {
    try {
      global.dispatchEvent(new CustomEvent('beam:sync-status', { detail: { status: remoteStatus } }));
    } catch (err) { }
  }

  /* Sobe as mídias de um post que ainda estão só no navegador: a capa,
     as imagens dos slides e as miniaturas dos vídeos.

     Uma mídia que já tem URL só é considerada enviada quando essa URL
     pertence ao banco configurado agora. Se vier de outro projeto (ou de
     um teste antigo), o arquivo local é enviado de novo. */
  function uploadPostMedia(post) {
    var db = global.Beam.db;
    if (!db || !db.enabled()) return Promise.resolve();
    if (!state.media) state.media = {};
    var jobs = [];

    /* `video` recebe a url da miniatura quando a mídia é o pôster dele. */
    function pushMedia(m, video) {
      if (!m || !m.id) return;
      var known = state.media[m.id];
      var knownUrl = known && known.url ? known.url : null;

      /* Já está no Storage deste projeto: só copia o endereço para o post. */
      if (knownUrl && db.ownsURL(knownUrl)) {
        m.url = knownUrl;
        m.path = (known && known.path) || null;
        if (video) {
          video.posterUrl = knownUrl;
          video.posterPath = m.path;
        } else {
          state.media[m.id] = m;
        }
        return;
      }

      jobs.push(idbGet(m.id).then(function (blob) {
        if (!blob) {
          /* Sem cópia local não há como reenviar: a url antiga é de outro
             projeto e não serve, então some com ela. */
          if (knownUrl && !db.ownsURL(knownUrl)) {
            delete m.url;
            delete m.path;
          }
          return null;
        }
        return db.uploadMedia(blob, m.id, m.name, m.type).then(function (res) {
          m.url = res.url;
          m.path = res.path;
          /* O endereço mudou: a tela passa a usar o arquivo compartilhado. */
          delete urlCache[m.id];
          if (video) {
            video.posterUrl = res.url;
            video.posterPath = res.path;
            state.media[m.id] = { id: m.id, type: 'image', url: res.url, path: res.path };
          } else {
            state.media[m.id] = m;
          }
          return res.url;
        });
      }).catch(function () { return null; }));
    }

    (post.media || []).forEach(function (m) {
      if (!m) return;
      pushMedia(m, null);
      /* A miniatura do vídeo é uma mídia separada: precisa subir também. */
      if (m.posterId) {
        pushMedia({ id: m.posterId, type: 'image', name: (m.name || 'capa') + '.jpg' }, m);
      }
    });
    (post.slides || []).forEach(function (s) { if (s && s.media && s.media.id) pushMedia(s.media, null); });

    return Promise.all(jobs);
  }

  /* Envia um post para o banco compartilhado. */
  function pushPost(post) {
    var db = global.Beam.db;
    if (!db || !db.enabled() || !post) return Promise.resolve(false);
    return uploadPostMedia(post).then(function () {
      return db.upsertPost(post);
    }).then(function () {
      delete post.pending;
      if (!state.syncedPosts) state.syncedPosts = {};
      state.syncedPosts[post.id] = Date.now();
      save();
      return true;
    }).catch(function (err) {
      /* Fica marcado como pendente: a proxima sincronizacao tenta de novo. */
      post.pending = 1;
      save();
      console.warn('[beam] o post não foi para o banco compartilhado', err);
      return false;
    });
  }

  /* Envia um perfil para o banco compartilhado. */
  function pushProfile(profile) {
    var db = global.Beam.db;
    if (!db || !db.enabled() || !profile) return Promise.resolve(false);
    return db.upsertProfile(profile).then(function () {
      if (!state.syncedProfiles) state.syncedProfiles = {};
      state.syncedProfiles[profile.id] = Date.now();
      save();
      return true;
    }).catch(function (err) {
      console.warn('[beam] o perfil não foi para o banco compartilhado', err);
      return false;
    });
  }

  /* Reconstroi a arvore de comentarios (respostas ficam dentro do pai). */
  function buildCommentTree(list) {
    var byId = {};
    var roots = [];
    list.forEach(function (c) {
      byId[c.id] = {
        id: c.id, author: c.author || null, body: c.body || '',
        votes: c.votes || 0, createdAt: c.created_at || 0, replies: []
      };
    });
    list.forEach(function (c) {
      var node = byId[c.id];
      var parent = c.parent_id ? byId[c.parent_id] : null;
      if (parent) parent.replies.push(node);
      else roots.push(node);
    });
    return roots;
  }

  /* Registra as midias dos posts para conseguir a URL de exibicao. */
  function rebuildMedia() {
    if (!state.media) state.media = {};
    (state.posts || []).forEach(function (p) {
      (p.media || []).forEach(function (m) {
        if (!m) return;
        if (m.id) state.media[m.id] = m;
        /* A miniatura do vídeo viaja junto com o post. */
        if (m.posterId && m.posterUrl) {
          state.media[m.posterId] = {
            id: m.posterId, type: 'image', url: m.posterUrl, path: m.posterPath || null
          };
        }
      });
      (p.slides || []).forEach(function (s) { if (s && s.media && s.media.id) state.media[s.media.id] = s.media; });
    });
  }

  /* Junta o que veio do banco com o que esta no navegador. */
  function mergeRemote(data) {
    if (!data) return;
    var removed = state.removedPosts || {};
    var removedProfiles = state.removedProfiles || {};

    /* --- perfis --- */
    if (!state.syncedProfiles) state.syncedProfiles = {};
    var currentId = state.settings.currentProfileId;
    var profilesById = {};
    (state.profiles || []).forEach(function (p) {
      if (!p || !p.id || removedProfiles[p.id]) return;
      /* Perfil que nunca subiu continua so aqui. O perfil em uso nunca some,
         mesmo se o banco ainda nao o conhece. */
      if (!state.syncedProfiles[p.id] || p.id === currentId) profilesById[p.id] = p;
    });
    (data.profiles || []).forEach(function (p) {
      if (!p || !p.id || removedProfiles[p.id]) return;
      profilesById[p.id] = {
        id: p.id,
        name: p.name || p.username || p.id,
        username: p.username || p.id,
        avatar: p.avatar || 'rocket',
        hue: p.hue || null,
        avatarImage: p.avatar_image || null,
        createdAt: p.created_at || Date.now()
      };
      /* Ja veio do banco: nao precisa reenviar. */
      state.syncedProfiles[p.id] = p.created_at || Date.now();
    });
    state.profiles = Object.keys(profilesById).map(function (id) { return profilesById[id]; });

    /* --- posts --- */
    if (!state.syncedPosts) state.syncedPosts = {};
    var postsById = {};
    (state.posts || []).forEach(function (p) {
      if (!p || !p.id || removed[p.id]) return;
      /* Post que nunca subiu continua so aqui. Post que ja estava no banco
         obedece o banco: se nao veio na busca, foi apagado por alguem. */
      if (!state.syncedPosts[p.id]) postsById[p.id] = p;
    });
    (data.posts || []).forEach(function (p) {
      if (!p || !p.id || removed[p.id]) return;
      postsById[p.id] = {
        id: p.id,
        kind: p.kind || 'texto',
        board: p.board,
        author: p.author,
        title: p.title || '',
        body: p.body || '',
        tags: p.tags || [],
        votes: p.votes || 0,
        createdAt: p.created_at || Date.now(),
        media: p.media || [],
        slides: p.slides || [],
        links: p.links || [],
        comments: []
      };
      /* Ja veio do banco: nao precisa reenviar. */
      state.syncedPosts[p.id] = p.created_at || Date.now();
    });
    state.posts = Object.keys(postsById).map(function (id) { return postsById[id]; })
      .sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });

    /* --- comentarios --- */
    var byPost = {};
    (data.comments || []).forEach(function (c) {
      if (!c || !c.id || !c.post_id) return;
      if (!byPost[c.post_id]) byPost[c.post_id] = [];
      byPost[c.post_id].push(c);
    });
    state.posts.forEach(function (post) {
      var list = byPost[post.id];
      if (list) post.comments = buildCommentTree(list);
    });

    /* --- votos --- */
    /* As linhas cruas ficam guardadas: quem é "meu" depende do perfil que
       está em uso agora, e isso pode mudar a qualquer momento (trocar de
       perfil, sair, entrar). Separar os votos em "meus" e "dos outros"
       na hora da leitura evita a contagem dobrada. */
    var me = state.settings.currentProfileId;
    state.voteRows = data.votes || [];
    state.commentVoteRows = data.commentVotes || [];

    var mine = {};
    state.voteRows.forEach(function (v) {
      if (!v || !v.post_id || !me || v.voter !== me) return;
      mine[v.post_id] = v.value;
    });
    if (!state.votes) state.votes = {};
    /* Sem perfil não há voto "meu": o que sobrou no navegador é de
       outra pessoa e não pode ser contado duas vezes. */
    if (!me) {
      state.votes = {};
      state.commentVotes = {};
    }
    Object.keys(mine).forEach(function (id) { state.votes[id] = mine[id]; });

    var cMine = {};
    state.commentVoteRows.forEach(function (v) {
      if (!v || !v.comment_id || !me || v.voter !== me) return;
      cMine[v.comment_id] = v.value;
    });
    if (!state.commentVotes) state.commentVotes = {};
    Object.keys(cMine).forEach(function (id) { state.commentVotes[id] = cMine[id]; });

    rebuildMedia();
  }

  /* Busca o conteudo compartilhado e atualiza a tela. */
  function syncRemote() {
    var db = global.Beam.db;
    if (!db || !db.enabled()) {
      remoteStatus = 'off';
      notifyStatus();
      return Promise.resolve(null);
    }
    remoteStatus = 'loading';
    notifyStatus();

    /* Primeiro sobe o que ficou para tras (posts e perfis que existiam no
       navegador antes de o banco ser configurado), depois busca o que ha
       de novo. */
    if (!state.syncedPosts) state.syncedPosts = {};
    if (!state.syncedProfiles) state.syncedProfiles = {};

    /* As marcas de "ja enviado" valem so para o banco atual. Se o endereco
       do Supabase mudar (ou a pessoa configurar o banco depois de usar um
       teste), tudo e reenviado: o que foi para outro banco conta como
       nunca enviado. */
    var stamp = dbStamp();
    if (stamp && state.syncedDb !== stamp) {
      state.syncedPosts = {};
      state.syncedProfiles = {};
      state.syncedDb = stamp;
      save();
    }

    var pendentes = (state.posts || []).filter(function (p) {
      return p && p.id && !state.syncedPosts[p.id];
    });
    var perfisPendentes = (state.profiles || []).filter(function (p) {
      return p && p.id && !state.syncedProfiles[p.id];
    });

    var chain = perfisPendentes.reduce(function (acc, p) {
      return acc.then(function () { return pushProfile(p); });
    }, Promise.resolve());

    chain = pendentes.reduce(function (acc, p) {
      return acc.then(function () { return pushPost(p); });
    }, chain);

    return chain.then(function () { return db.pull(); })
      .then(function (data) {
        mergeRemote(data);
        remoteStatus = 'ok';
        notifyStatus();
        save();
        global.dispatchEvent(new CustomEvent('beam:remote-changed'));
        return data;
      })
      .catch(function (err) {
        remoteStatus = 'error';
        notifyStatus();
        console.warn('[beam] não foi possível falar com o banco compartilhado', err);
        return null;
      });
  }

  function save() {
    try {
      var persisted = load();
      if (!persisted) {
        /* Estado corrompido e sem backup: guarda o texto quebrado para
           inspecao e nao sobrescreve nada ainda. */
        try {
          var raw = localStorage.getItem(KEY);
          if (raw) localStorage.setItem(KEY + '.corrupt', raw);
        } catch (err) { }
        console.warn('[beam] estado corrompido — gravação suspensa');
        return;
      }
      mergePosts(persisted);
      mergeProfiles(persisted);
      persist(JSON.stringify(state));
    } catch (err) {
      console.warn('[beam] não foi possível salvar o estado', err);
    }
  }

  function keepOnly(map, ids) {
    var out = {};
    Object.keys(map || {}).forEach(function (key) {
      if (ids.indexOf(key) !== -1) out[key] = map[key];
    });
    return out;
  }

  /* ---------------- posts de exemplo ----------------

     O site comeca vazio: so entram os posts que a pessoa publica. Os
     posts de exemplo (p1, p2, ...) sao gerados por codigo e nao devem
     voltar a aparecer. Os ids sao guardados aqui para limpar tudo o que
     ja tinha ficado salvo no navegador. */

  var seedCache = null;

  function seedMap() {
    if (seedCache) return seedCache;
    seedCache = { posts: {}, comments: {} };
    var seeds = [];
    try { seeds = Beam.util.seedPosts() || []; } catch (err) { }
    seeds.forEach(function (p) {
      seedCache.posts[p.id] = true;
      (function walk(list) {
        (list || []).forEach(function (c) {
          seedCache.comments[c.id] = true;
          if (c.replies) walk(c.replies);
        });
      })(p.comments);
    });
    return seedCache;
  }

  /* Os posts que a pessoa criou: tudo que nao for exemplo. */
  function userPosts(list) {
    var seed = seedMap().posts;
    return (list || []).filter(function (p) { return !seed[p.id]; });
  }

  /* ---------- IndexedDB (mídia) ---------- */

  function openDB() {
    if (db) return Promise.resolve(db);
    if (!global.indexedDB) return Promise.reject(new Error('IndexedDB indisponível'));
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        var database = req.result;
        if (!database.objectStoreNames.contains(DB_STORE)) database.createObjectStore(DB_STORE);
      };
      req.onsuccess = function () { db = req.result; resolve(db); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function idbPut(key, blob) {
    return openDB().then(function (database) {
      return new Promise(function (resolve, reject) {
        var tx = database.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).put(blob, key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function idbGet(key) {
    return openDB().then(function (database) {
      return new Promise(function (resolve, reject) {
        var tx = database.transaction(DB_STORE, 'readonly');
        var req = tx.objectStore(DB_STORE).get(key);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function idbDelete(key) {
    return openDB().then(function (database) {
      return new Promise(function (resolve, reject) {
        var tx = database.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).delete(key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function readAsDataURL(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsDataURL(file);
    });
  }

  var store = {
    MAX_FILE: MAX_FILE,

    init: function () {
      var loaded = load();

      if (!loaded) {
        /* O estado gravado esta corrompido e nao ha backup: em vez de
           apagar tudo, comeca do zero sem sobrescrever o que esta no disco. */
        console.warn('[beam] estado corrompido — começando do zero sem gravar');
        state = defaults();
        return state;
      }

      state = loaded;
      var stored = state.posts || [];
      var mine = userPosts(stored);
      var stale = stored.some(function (p) {
        return Beam.boards.every(function (b) { return b.id !== p.board; });
      });
      var changed = false;

      /* O site comeca vazio: os posts de exemplo nao voltam sozinhos.
         O que a pessoa publicou continua la. */
      if (mine.length !== stored.length) {
        state.posts = mine;
        changed = true;
      } else if (!stored.length) {
        state.posts = [];
        changed = true;
      } else if (stale) {
        /* Boards foram renomeados ou removidos: mantem o que o usuario
           publicou e descarta o resto. */
        state.posts = mine;
        changed = true;
      }
      if (!state.commentVotes) state.commentVotes = {};

      /* Migracao: votos, salvos e votos de comentario que apontavam para
         os posts de exemplo vao junto com eles. */
      var seedComments = seedMap().comments;
      var ids = state.posts.map(function (p) { return p.id; });
      var votesBefore = Object.keys(state.votes || {}).length;
      state.votes = keepOnly(state.votes, ids);
      if (Object.keys(state.votes).length !== votesBefore) changed = true;
      var savedBefore = (state.saved || []).length;
      state.saved = (state.saved || []).filter(function (id) { return ids.indexOf(id) !== -1; });
      if (state.saved.length !== savedBefore) changed = true;
      Object.keys(state.commentVotes || {}).forEach(function (id) {
        if (seedComments[id]) { delete state.commentVotes[id]; changed = true; }
      });

      /* Favoritos: some com os posts que nao existem mais, senao o contador
         marca favoritos que nao aparecem na lista. */
      var existingIds = state.posts.map(function (p) { return p.id; });
      state.saved = (state.saved || []).filter(function (id) { return existingIds.indexOf(id) !== -1; });

      /* Perfis: quem não tem perfil é visitante — só pode ler. */
      if (!Array.isArray(state.profiles)) state.profiles = [];
      /* Entradas quebradas (vindas de uma versão antiga do estado) saem:
         um perfil sem id quebra a lista de perfis e a busca por autor. */
      var beforeProfiles = state.profiles.length;
      state.profiles = state.profiles.filter(function (acc) {
        return acc && typeof acc === 'object' && acc.id;
      });
      if (state.profiles.length !== beforeProfiles) changed = true;
      state.profiles.forEach(function (acc, idx) {
        if (!acc.id) { acc.id = 'acc-' + idx + '-' + Date.now().toString(36); changed = true; }
        if (!acc.username) { acc.username = acc.id; changed = true; }
        if (!acc.name) { acc.name = acc.username; changed = true; }
        if (!acc.avatar) { acc.avatar = 'rocket'; changed = true; }
        if (!acc.hue) { acc.hue = Beam.avatarHues[idx % Beam.avatarHues.length]; changed = true; }
        if (acc.avatarImage && !Beam.util.isImageData(acc.avatarImage)) { acc.avatarImage = null; changed = true; }
      });
      /* O perfil atual precisa existir; senão a pessoa volta a ser visitante. */
      if (state.settings.currentProfileId &&
          !state.profiles.some(function (a) { return a.id === state.settings.currentProfileId; })) {
        state.settings.currentProfileId = null;
        changed = true;
      }
      /* Sem perfil ativo não existe voto "meu": o mapa local é zerado,
         senão o visitante veria o voto do perfil antigo somado por cima
         da pontuação do banco. */
      if (!state.settings.currentProfileId) {
        if (Object.keys(state.votes || {}).length) { state.votes = {}; changed = true; }
        if (Object.keys(state.commentVotes || {}).length) { state.commentVotes = {}; changed = true; }
      }
      /* Perfis favoritos: some com quem não existe mais (perfil apagado
         ou membro de exemplo que ficou sem post). */
      var favBefore = (state.favoriteProfiles || []).length;
      state.favoriteProfiles = (state.favoriteProfiles || []).filter(function (id) {
        var key = String(id == null ? '' : id).toLowerCase();
        if ((state.profiles || []).some(function (p) { return String(p.id).toLowerCase() === key; })) return true;
        return state.posts.some(function (p) { return String(p.author).toLowerCase() === key; });
      });
      if (state.favoriteProfiles.length !== favBefore) changed = true;
      if (!state.settings.palette || !Beam.palettes.some(function (p) { return p.id === state.settings.palette; })) {
        state.settings.palette = 'jade';
        changed = true;
      }

      /* Campos que foram removidos do site (Duração, Nível, Ferramentas):
         posts antigos podem ainda ter esses dados guardados. */
      state.posts.forEach(function (p) {
        ['duration', 'level', 'tools'].forEach(function (field) {
          if (field in p) { delete p[field]; changed = true; }
        });
      });

      /* So grava quando algo mudou: escrever a cada carregamento de pagina
         aumenta o risco de corrupcao quando ha varias abas abertas. */
      if (changed) save();

      /* Banco compartilhado: o site abre na hora com o que esta no navegador
         e completa em segundo plano com o que todo mundo publicou. */
      syncRemote();
      return state;
    },

    get state() { return state; },

    save: save,

    /* ---------------- perfis ---------------- */

    /* Todos os perfis cadastrados. */
    profiles: function () {
      return state.profiles || [];
    },

    /* O perfil em uso agora. Devolve null quando a pessoa é visitante
       (ainda não criou nenhum perfil). */
    currentProfile: function () {
      var id = state.settings && state.settings.currentProfileId;
      if (!id) return null;
      var list = state.profiles || [];
      for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
      return null;
    },

    /* Todos os perfis que podem ter publicado no site: os perfis criados
       pelo usuario e os membros fixos que ainda tem posts (os do usuario
       tem prioridade). */
    authors: function () {
      var list = [];
      var seen = {};
      (state.profiles || []).forEach(function (p) {
        var key = String(p.id).toLowerCase();
        if (seen[key]) return;
        seen[key] = true;
        list.push(p);
      });
      (Beam.users || []).forEach(function (u) {
        var key = String(u.id).toLowerCase();
        if (seen[key]) return;
        /* Membro de exemplo so entra na lista se ainda tiver post. */
        if (!state.posts.some(function (p) { return String(p.author) === String(u.id); })) return;
        seen[key] = true;
        list.push(u);
      });
      return list;
    },

    /* Quantos posts um autor publicou. */
    postsByAuthor: function (id) {
      var key = String(id == null ? '' : id).toLowerCase();
      if (!key) return 0;
      return (state.posts || []).filter(function (p) {
        return String(p.author == null ? '' : p.author).toLowerCase() === key;
      }).length;
    },

    /* ---------------- perfis favoritos ---------------- */

    /* Ids dos perfis marcados como favoritos. */
    favoriteProfiles: function () {
      if (!Array.isArray(state.favoriteProfiles)) state.favoriteProfiles = [];
      return state.favoriteProfiles;
    },

    /* O perfil esta marcado como favorito? */
    isFavoriteProfile: function (id) {
      var key = String(id == null ? '' : id).toLowerCase();
      return state.favoriteProfiles.some(function (pid) {
        return String(pid).toLowerCase() === key;
      });
    },

    /* Marca ou desmarca um perfil como favorito. */
    toggleFavoriteProfile: function (id) {
      if (!Array.isArray(state.favoriteProfiles)) state.favoriteProfiles = [];
      var key = String(id == null ? '' : id).toLowerCase();
      if (!key) return { favorite: false };
      var index = -1;
      state.favoriteProfiles.forEach(function (pid, i) {
        if (String(pid).toLowerCase() === key) index = i;
      });
      var favorite;
      if (index === -1) {
        /* Guarda o id como o post usa (o que o U.user resolve). */
        var original = null;
        state.profiles.forEach(function (p) {
          if (String(p.id).toLowerCase() === key) original = p.id;
        });
        if (!original) {
          (Beam.users || []).forEach(function (u) {
            if (String(u.id).toLowerCase() === key) original = u.id;
          });
        }
        state.favoriteProfiles.push(original || id);
        favorite = true;
      } else {
        state.favoriteProfiles.splice(index, 1);
        favorite = false;
      }
      save();
      return { favorite: favorite };
    },

    /* Troca de perfil. Passar null volta para o modo visitante. */
    switchProfile: function (id) {
      if (id === null) {
        state.settings.currentProfileId = null;
        /* Os votos que sobraram no navegador eram do perfil que saiu:
           no modo visitante eles nao podem ser contados de novo. */
        state.votes = {};
        state.commentVotes = {};
        save();
        return state;
      }
      if (!(state.profiles || []).some(function (a) { return a.id === id; })) return state;
      state.settings.currentProfileId = id;
      /* Trocar de perfil limpa os votos "meus": o novo perfil tem os
         dele, que chegam no proximo sync do banco. */
      state.votes = {};
      state.commentVotes = {};
      save();
      return state;
    },

    /* Cria um perfil novo. O id nunca colide com o de outro perfil. */
    addProfile: function (data) {
      var username = Beam.util.normalizeUsername(data.username || data.name);
      if (!username) return { error: 'Escolha um nome de usuário.' };
      if ((state.profiles || []).some(function (a) { return a.username === username; })) {
        return { error: 'Esse nome de usuário já está em uso.' };
      }
      var id = 'acc-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
      var profile = {
        id: id,
        name: String(data.name || username).trim().slice(0, 40) || username,
        username: username,
        avatar: data.avatar || 'rocket',
        hue: data.hue || Beam.avatarHues[state.profiles.length % Beam.avatarHues.length],
        avatarImage: Beam.util.isImageData(data.avatarImage) ? data.avatarImage : null,
        createdAt: Date.now()
      };
      state.profiles = (state.profiles || []).concat([profile]);
      state.settings.currentProfileId = id;
      save();
      /* O perfil vai para o banco compartilhado: todo mundo passa a ver
         os posts de quem publica aqui. */
      pushProfile(profile);
      return { profile: profile };
    },

    /* Atualiza nome, usuario, avatar, imagem ou cor de um perfil. */
    updateProfile: function (id, data) {
      var list = state.profiles || [];
      var profile = null;
      for (var i = 0; i < list.length; i++) if (list[i].id === id) profile = list[i];
      if (!profile) return { error: 'Perfil não encontrado.' };

      if (data.username !== undefined) {
        var username = Beam.util.normalizeUsername(data.username);
        if (!username) return { error: 'Escolha um nome de usuário.' };
        if (list.some(function (a) { return a.id !== id && a.username === username; })) {
          return { error: 'Esse nome de usuário já está em uso.' };
        }
        profile.username = username;
      }
      if (data.name !== undefined) {
        profile.name = String(data.name || '').trim().slice(0, 40) || profile.username;
      }
      if (data.avatar !== undefined) profile.avatar = data.avatar;
      if (data.hue !== undefined) profile.hue = data.hue;
      if (data.avatarImage !== undefined) {
        profile.avatarImage = Beam.util.isImageData(data.avatarImage) ? data.avatarImage : null;
      }
      save();
      /* O perfil atualizado vai para o banco compartilhado. */
      pushProfile(profile);
      return { profile: profile };
    },

    /* Remove um perfil e tudo que ele publicou. Sem perfil nenhum a pessoa
       volta para o modo visitante. */
    removeProfile: function (id) {
      var list = state.profiles || [];
      if (!list.some(function (a) { return a.id === id; })) {
        return { error: 'Perfil não encontrado.' };
      }
      var removed = 0;
      var mediaToDrop = [];
      var removedIds = [];
      state.posts = state.posts.filter(function (p) {
        if (p.author !== id) return true;
        removed++;
        removedIds.push(p.id);
        if (!state.removedPosts) state.removedPosts = {};
        state.removedPosts[p.id] = Date.now();
        (p.media || []).forEach(function (m) {
          if (m.id) mediaToDrop.push(m.id);
          if (m.posterId) mediaToDrop.push(m.posterId);
        });
        (p.slides || []).forEach(function (s) { if (s.media && s.media.id) mediaToDrop.push(s.media.id); });
        return false;
      });
      /* Os posts apagados nao podem continuar nos favoritos. */
      if (removedIds.length) {
        state.saved = (state.saved || []).filter(function (postId) { return removedIds.indexOf(postId) === -1; });
      }
      /* Comentarios do perfil tambem saem: ninguem fica com a assinatura de
         um perfil que nao existe mais. */
      var dropComments = function (list) {
        (list || []).forEach(function (c) {
          if (c.author === id) c.author = null;
          if (c.replies && c.replies.length) dropComments(c.replies);
        });
      };
      state.posts.forEach(function (p) { dropComments(p.comments); });
      state.profiles = list.filter(function (a) { return a.id !== id; });
      /* O perfil fica marcado como apagado: outra aba com o estado velho
         nao pode recria-lo quando salvar. */
      if (!state.removedProfiles) state.removedProfiles = {};
      state.removedProfiles[id] = Date.now();
      /* O perfil deletado tambem sai dos favoritos. */
      if (Array.isArray(state.favoriteProfiles)) {
        state.favoriteProfiles = state.favoriteProfiles.filter(function (pid) {
          return String(pid).toLowerCase() !== String(id).toLowerCase();
        });
      }
      /* Sem perfil ativo a pessoa volta a ser visitante. */
      if (state.settings.currentProfileId === id) {
        state.settings.currentProfileId = null;
        /* Os votos do perfil apagado saem com ele: no modo visitante a
           pontuacao e so a soma do banco. */
        state.votes = {};
        state.commentVotes = {};
      }
      save();
      mediaToDrop.forEach(function (mediaId) { idbDelete(mediaId).catch(function () { }); });
      /* Apaga também no banco compartilhado: os posts somem para todo mundo. */
      var db = global.Beam.db;
      if (db && db.enabled()) {
        removedIds.forEach(function (postId) { db.deletePost(postId).catch(function () { }); });
        db.deleteProfile(id).catch(function (err) {
          console.warn('[beam] não foi possível apagar o perfil no banco', err);
        });
      }
      return { removed: removed };
    },

    /* Atualiza campos de um post (usado para trocar a miniatura de um
       vídeo que ficou preta). */
    updatePost: function (id, patch) {
      var post = null;
      (state.posts || []).forEach(function (p) { if (p.id === id) post = p; });
      if (!post) return { error: 'Post não encontrado.' };
      Object.keys(patch || {}).forEach(function (key) { post[key] = patch[key]; });
      save();
      return { post: post };
    },

    /* Remove um post de forma definitiva (fica marcado para as outras abas). */
    removePost: function (id) {
      state.posts = state.posts.filter(function (p) { return p.id !== id; });
      if (!state.removedPosts) state.removedPosts = {};
      state.removedPosts[id] = Date.now();
      /* Post apagado sai dos favoritos junto. */
      state.saved = (state.saved || []).filter(function (postId) { return postId !== id; });
      save();
      /* Some também do banco compartilhado. */
      var db = global.Beam.db;
      if (db && db.enabled()) db.deletePost(id).catch(function () { });
      return state;
    },

    reset: function () {
      state = defaults();
      save();
      return state;
    },

    /* Recoloca os posts de exemplo (util para testar o site vazio de novo). */
    seedDemoPosts: function () {
      state.posts = (Beam.util.seedPosts() || []).concat(state.posts || []);
      save();
      return state;
    },

    /* Salva um arquivo de mídia. Retorna o descriptor usado nos posts.
       Com o banco compartilhado ligado, o arquivo vai para o Storage e o
       descriptor ganha a URL pública — é ela que os outros visitantes
       conseguem abrir. Sem o banco, o arquivo fica no IndexedDB. */
    addMedia: function (file) {
      if (file.size > MAX_FILE) {
        return Promise.reject(new Error('Arquivo maior que 25 MB: ' + file.name));
      }
      var id = Beam.util.uid('media');
      var type = file.type.indexOf('video') === 0 ? 'video' : 'image';
      var descriptor = { id: id, type: type, name: file.name, size: file.size };
      var db = global.Beam.db;

      var keepLocal = function () {
        return idbPut(id, file).then(function () {
          return descriptor;
        }).catch(function () {
          return readAsDataURL(file).then(function (dataUrl) {
            state.mediaFallback[id] = dataUrl;
            descriptor.url = dataUrl;
            save();
            return descriptor;
          });
        });
      };

      /* O arquivo fica SEMPRE também no IndexedDB. É a reserva quando o
         endereço compartilhado some e o que permite reenviar o arquivo
         para o banco depois. */
      var local = keepLocal();

      if (!db || !db.enabled()) {
        return local.then(function (d) {
          if (!state.media) state.media = {};
          state.media[d.id] = d;
          save();
          return d;
        });
      }

      return db.uploadMedia(file, id).then(function (res) {
        return local.then(function () {
          /* Se o IndexedDB falhou, o keepLocal deixou uma data URL: o
             endereço do Storage tem prioridade. */
          descriptor.url = res.url;
          descriptor.path = res.path;
          if (!state.media) state.media = {};
          state.media[id] = descriptor;
          save();
          return descriptor;
        });
      }).catch(function (err) {
        /* Sem internet ou storage fora do ar: guarda localmente e tenta
           subir de novo na próxima sincronização. */
        console.warn('[beam] upload falhou, o arquivo ficou só neste navegador', err);
        return local.then(function (d) {
          d.pending = 1;
          if (!state.media) state.media = {};
          state.media[d.id] = d;
          save();
          return d;
        });
      });
    },

    /* Resolve a URL de exibição de uma mídia. */
    mediaURL: function (id) {
      if (!id) return Promise.resolve(null);
      if (urlCache[id]) return Promise.resolve(urlCache[id]);
      var db = global.Beam.db;
      var entry = (state.media || {})[id];
      var shared = entry && entry.url ? entry.url : null;
      /* A url compartilhada só vale se pertence ao banco configurado agora.
         Sem isso, uma url de outro projeto (ou de um teste antigo) deixa a
         imagem quebrada e o vídeo sem som. */
      if (shared && db && db.enabled() && db.ownsURL(shared)) {
        urlCache[id] = shared;
        return Promise.resolve(shared);
      }
      /* Fora do banco (ou com url de outro projeto): a cópia local do
         IndexedDB é a reserva. */
      return idbGet(id).then(function (blob) {
        if (blob) {
          var url = URL.createObjectURL(blob);
          urlCache[id] = url;
          return url;
        }
        if (shared) {
          urlCache[id] = shared;
          return shared;
        }
        var fallback = state.mediaFallback[id];
        if (fallback) {
          urlCache[id] = fallback;
          return fallback;
        }
        return null;
      }).catch(function () {
        return shared || state.mediaFallback[id] || null;
      });
    },

    /* A mídia só do navegador (IndexedDB), ignorando o endereço compartilhado.
       Serve de reserva quando o arquivo no Storage some ou muda de lugar. */
    localMediaURL: function (id) {
      if (!id) return Promise.resolve(null);
      return idbGet(id).then(function (blob) {
        if (!blob) return state.mediaFallback[id] || null;
        return URL.createObjectURL(blob);
      }).catch(function () {
        return state.mediaFallback[id] || null;
      });
    },

    /* Recupera uma mídia que não carregou: troca o endereço pela cópia
       guardada neste navegador (IndexedDB). Devolve true se deu certo. */
    recoverMedia: function (node, id) {
      if (!node || !id) return Promise.resolve(false);
      return store.localMediaURL(id).then(function (url) {
        if (!url) return false;
        node.src = url;
        return true;
      }).catch(function () { return false; });
    },

    removeMedia: function (id) {
      delete urlCache[id];
      delete state.mediaFallback[id];
      var known = state.media ? state.media[id] : null;
      if (state.media) delete state.media[id];
      save();
      var db = global.Beam.db;
      if (db && db.enabled()) {
        /* Apaga o arquivo no Storage: o caminho precisa ser o mesmo que
           foi usado no envio. */
        var path = known && known.path ? known.path : db.mediaPath(id, known || { name: '', type: '' });
        db.removeMediaFile(path).catch(function () { });
      }
      return idbDelete(id).catch(function () { });
    },

    /* ---------------- banco compartilhado ---------------- */

    /* 'off' (sem banco) | 'loading' | 'ok' | 'error' */
    syncStatus: function () { return remoteStatus; },

    /* Busca o conteudo compartilhado agora. */
    sync: function () { return syncRemote(); },

    /* Envia um post para o banco compartilhado. */
    syncPost: function (post) { return pushPost(post); },

    /* Apaga um post do banco compartilhado. */
    syncDeletePost: function (id) {
      var db = global.Beam.db;
      if (!db || !db.enabled()) return Promise.resolve(false);
      return db.deletePost(id).then(function () { return true; })
        .catch(function (err) { console.warn('[beam] não foi possível apagar o post no banco', err); return false; });
    },

    /* Envia um comentário. */
    syncComment: function (postId, comment, parentId) {
      var db = global.Beam.db;
      if (!db || !db.enabled() || !comment) return Promise.resolve(false);
      return db.upsertComment(postId, comment, parentId).then(function () { return true; })
        .catch(function (err) { console.warn('[beam] não foi possível enviar o comentário', err); return false; });
    },

    /* Apaga um comentário do banco compartilhado. */
    syncDeleteComment: function (commentId) {
      var db = global.Beam.db;
      if (!db || !db.enabled()) return Promise.resolve(false);
      return db.deleteComment(commentId).then(function () { return true; })
        .catch(function (err) { console.warn('[beam] não foi possível apagar o comentário', err); return false; });
    },

    /* Envia o voto da pessoa atual. value = 1, -1 ou 0 (tirar o voto). */
    syncVote: function (postId, value) {
      var db = global.Beam.db;
      var me = state.settings.currentProfileId;
      if (!db || !db.enabled() || !me) return Promise.resolve(false);
      return db.setVote(me, postId, value).then(function () { return true; })
        .catch(function (err) { console.warn('[beam] não foi possível enviar o voto', err); return false; });
    },

    /* Envia o voto da pessoa atual em um comentário. */
    syncCommentVote: function (commentId, value) {
      var db = global.Beam.db;
      var me = state.settings.currentProfileId;
      if (!db || !db.enabled() || !me) return Promise.resolve(false);
      return db.setCommentVote(me, commentId, value).then(function () { return true; })
        .catch(function (err) { console.warn('[beam] não foi possível enviar o voto', err); return false; });
    },

    /* Envia um perfil para o banco compartilhado. */
    syncProfile: function (profile) {
      var db = global.Beam.db;
      if (!db || !db.enabled() || !profile) return Promise.resolve(false);
      return db.upsertProfile(profile).then(function () { return true; })
        .catch(function (err) { console.warn('[beam] não foi possível enviar o perfil', err); return false; });
    },

    /* Apaga um perfil do banco compartilhado (e os posts dele). */
    syncDeleteProfile: function (id) {
      var db = global.Beam.db;
      if (!db || !db.enabled()) return Promise.resolve(false);
      var mine = (state.posts || []).filter(function (p) { return p.author === id; });
      return mine.reduce(function (acc, p) {
        return acc.then(function () { return db.deletePost(p.id).catch(function () { }); });
      }, Promise.resolve())
        .then(function () { return db.deleteProfile(id); })
        .then(function () { return true; })
        .catch(function (err) { console.warn('[beam] não foi possível apagar o perfil no banco', err); return false; });
    },

    /* Pontuação de um post: a soma dos votos de todo mundo.
       O voto da pessoa que está olhando entra por conta própria (vai
       para o banco logo depois), para a pontuação mudar na hora.
       O `post.votes` antigo NÃO entra: ele contava o "+1" automático
       que os posts velhos nasceram com.

       A conta é feita na hora, com o perfil que está em uso AGORA:
       - logado: o voto dos outros + o meu voto;
       - visitante: só a soma de todos (não existe "meu voto"), e o que
         sobrou no navegador do perfil anterior é ignorado — senão o
         visitante veria um ponto a mais. */
    score: function (post) {
      if (!post) return 0;
      var db = global.Beam.db;
      var temBanco = state.voteRows && db && db.enabled();
      var me = state.settings.currentProfileId;

      if (!temBanco) {
        /* Site local: só vale o voto guardado no navegador. */
        return me ? ((state.votes || {})[post.id] || 0) : 0;
      }

      var dosOutros = 0;
      var meuNoBanco = 0;
      (state.voteRows || []).forEach(function (v) {
        if (!v || v.post_id !== post.id) return;
        if (me && v.voter === me) { meuNoBanco = v.value || 0; return; }
        dosOutros += (v.value || 0);
      });

      /* O voto local entra junto para a pontuação mudar na hora. Se a
         linha já está no banco, o valor local é o mesmo e não conta
         duas vezes. */
      var local = me ? ((state.votes || {})[post.id] || 0) : 0;
      if (local && local !== meuNoBanco) return dosOutros + local;
      return dosOutros + meuNoBanco;
    },

    /* Pontuação de um comentário (mesma regra do post). */
    commentScore: function (comment) {
      if (!comment) return 0;
      var db = global.Beam.db;
      var temBanco = state.commentVoteRows && db && db.enabled();
      var me = state.settings.currentProfileId;

      if (!temBanco) {
        return me ? ((state.commentVotes || {})[comment.id] || 0) : 0;
      }

      var dosOutros = 0;
      var meuNoBanco = 0;
      (state.commentVoteRows || []).forEach(function (v) {
        if (!v || v.comment_id !== comment.id) return;
        if (me && v.voter === me) { meuNoBanco = v.value || 0; return; }
        dosOutros += (v.value || 0);
      });

      var local = me ? ((state.commentVotes || {})[comment.id] || 0) : 0;
      if (local && local !== meuNoBanco) return dosOutros + local;
      return dosOutros + meuNoBanco;
    }
  };

  global.Beam = global.Beam || {};
  global.Beam.store = store;

  /* Quando outra aba salva o estado, recarrega aqui para nao ficar
     com dados velhos (e sobrescrever o que ela acabou de publicar). */
  global.addEventListener('storage', function (event) {
    if (!event.key || event.key !== KEY) return;
    var fresh = load();
    if (!fresh) return;
    state = fresh;
    global.dispatchEvent(new CustomEvent('beam:state-changed'));
  });
})(window);
