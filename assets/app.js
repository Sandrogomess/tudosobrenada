/* Beam — página inicial: feed, filtros e navegação */

(function () {
  'use strict';

  var U = Beam.util;
  var S = Beam.store;

  var el = {
    feed: document.getElementById('feed'),
    empty: document.getElementById('emptyState'),
    emptyHint: document.getElementById('emptyHint'),
    count: document.getElementById('resultCount'),
    boards: document.getElementById('boardList'),
    tagFilter: document.getElementById('tagFilter'),
    tagCloud: document.getElementById('tagCloud'),
    spotlight: document.getElementById('spotlight'),
    search: document.getElementById('searchInput'),
    toast: document.getElementById('toast'),
    composer: document.getElementById('composerDialog'),
    composerForm: document.getElementById('composerForm'),
    railLeft: document.getElementById('leftRail'),
    navScrim: document.getElementById('navScrim'),
    mediaList: document.getElementById('mediaList'),
    dropzone: document.getElementById('dropzone'),
    fileInput: document.getElementById('fMedia'),
    formError: document.getElementById('formError'),
    fTitle: document.getElementById('fTitle'),
    fBody: document.getElementById('fBody'),
    fBoard: document.getElementById('fBoard'),
    fTags: document.getElementById('fTags'),
    fLink: document.getElementById('fLink'),    navButton: document.getElementById('openNav')
  };

  var view = {
    sort: 'top',
    board: 'todos',
    tag: null,
    query: '',
    /* Perfil aberto: quando tem valor, o feed mostra so os posts dele. */
    author: null,
    mode: 'feed',
    pendingMedia: [],
    slides: [],
    postsPerPage: 10,
    currentPage: 1
  };

  var toastTimer = null;
  var isMobile = function () { return window.matchMedia('(max-width: 900px)').matches; };

  /* ---------------- utilidades ---------------- */

  function icon(id, cls) {
    return '<svg class="icon ' + (cls || '') + '"><use href="#' + id + '"/></svg>';
  }

  function toast(message, isError) {
    el.toast.textContent = message;
    el.toast.classList.toggle('is-error', !!isError);
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.hidden = true; }, 3600);
  }

  function boardOf(id) { return U.board(id); }

  /* Pontuação: base + votos de todo mundo (quando há banco compartilhado). */
  function scoreOf(post) { return S.score(post); }

  function isSaved(id) { return S.state.saved.indexOf(id) !== -1; }

  function commentCount(post) { return U.countComments(post); }

  /* ---------------- perfis e cores ----------------
     A lógica vive em assets/profile.js, compartilhada com a página do post. */

  function currentProfile() { return Beam.profile.currentProfile(); }

  function isGuest() { return Beam.profile.isGuest(); }

  function isMyPost(post) { return Beam.profile.isMyPost(post); }

  /* Bloco do rail: meus posts e favoritos (só para quem tem perfil). */
  function renderYouNav() {
    var nav = document.getElementById('youNav');
    if (!nav) return;
    var profile = currentProfile();
    if (!profile) { nav.innerHTML = ''; return; }
    var mine = S.state.posts.filter(function (p) { return p.author === profile.id; }).length;
    /* Conta só os favoritos que ainda existem: post apagado não conta. */
    var saved = S.state.saved.filter(function (id) {
      return S.state.posts.some(function (p) { return p.id === id; });
    }).length;
    nav.innerHTML =
      '<button data-view-filter="meus" class="' + (view.board === 'meus' ? 'is-active' : '') + '">' +
        icon('i-text') + 'Meus posts<span class="count">' + mine + '</span></button>' +
      '<button data-view-filter="favoritos" class="' + (view.board === 'favoritos' ? 'is-active' : '') + '">' +
        icon('i-heart') + 'Favoritos<span class="count">' + saved + '</span></button>' +
      renderFavoriteProfiles();
  }

  /* Perfis marcados como favoritos: ficam listados embaixo de "Favoritos".
     Clicar no perfil abre o feed dele; o coracao remove dos favoritos. */
  function renderFavoriteProfiles() {
    var ids = S.favoriteProfiles();
    if (!ids.length) return '';
    var rows = ids.map(function (id) {
      var author = U.user(id);
      var isFav = S.isFavoriteProfile(id);
      var count = S.postsByAuthor(id);
      return '<li class="favprofile">' +
        '<button type="button" class="favprofile__open" data-action="open-profile" data-id="' + U.escape(id) + '" title="Ver todos os posts de ' + U.escape(author.name) + '">' +
          U.avatarHTML(author, 'avatarchip--sm') +
          '<span class="favprofile__name">' + U.escape(author.name) + '</span>' +
          '<span class="favprofile__count">' + count + '</span>' +
        '</button>' +
        '<button type="button" class="favbtn favbtn--sm' + (isFav ? ' is-on' : '') + '" data-action="favorite-profile" data-id="' + U.escape(id) + '" title="Remover dos favoritos" aria-label="Remover ' + U.escape(author.name) + ' dos favoritos">' + icon('i-heart') + '</button>' +
        '</li>';
    }).join('');
    return '<ul class="favprofiles">' + rows + '</ul>';
  }

  /* Marca ou desmarca um perfil como favorito. */
  function toggleFavoriteProfile(id) {
    if (isGuest()) {
      toast('Crie um perfil para favoritar perfis.', true);
      return;
    }
    var result = S.toggleFavoriteProfile(id);
    var author = U.user(id);
    toast(result.favorite
      ? author.name + ' está nos seus perfis favoritos.'
      : author.name + ' saiu dos seus perfis favoritos.');
    renderYouNav();
    renderProfileFilter();
    /* Atualiza o coração do painel de busca, se estiver aberto. */
    if (searchPanel && !searchPanel.hidden) renderSearchResults();
  }

  function openPost(id) {
    writeFeedMemory();
    /* O titulo do card viaja para a pagina do post (View Transitions). */
    var cards = el.feed.querySelectorAll('.post');
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].getAttribute('data-id') !== id) continue;
      var title = cards[i].querySelector('.post__title button');
      if (title) title.style.viewTransitionName = 'post-title';
      break;
    }
    Beam.profile.navigateTo('post.html?id=' + encodeURIComponent(id));
  }

  /* Abre o post ja na secao de comentarios (usado pelo botao de comentarios
     do feed). */
  function openComments(id) {
    writeFeedMemory();
    Beam.profile.navigateTo('post.html?id=' + encodeURIComponent(id) + '#comentarios');
  }

  /* ---------------- memoria da posicao do feed ---------------- */

  /* Guarda onde o usuario estava no feed (pagina, scroll e filtros)
     para voltar ao mesmo ponto depois de abrir um post. */
  var FEED_MEM_KEY = 'beam.feedmem.v1';

  function writeFeedMemory() {
    try {
      var scrollY = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
      sessionStorage.setItem(FEED_MEM_KEY, JSON.stringify({
        page: view.currentPage,
        scrollY: Math.round(scrollY),
        query: view.query,
        sort: view.sort,
        board: view.board,
        tag: view.tag,
        author: view.author,
        mode: view.mode,
        ts: Date.now()
      }));
    } catch (err) {
      /* sessionStorage indisponivel: segue sem restaurar */
    }
  }

  function readFeedMemory() {
    try {
      var raw = sessionStorage.getItem(FEED_MEM_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return null;
      return data;
    } catch (err) {
      return null;
    }
  }

  function clearFeedMemory() {
    try { sessionStorage.removeItem(FEED_MEM_KEY); } catch (err) { }
  }

  /* Aplica a memoria salva no estado atual do feed. */
  function restoreFeedMemory() {
    var memory = readFeedMemory();
    if (!memory) return null;
    clearFeedMemory();
    if (memory.page && memory.page >= 1) view.currentPage = memory.page;
    if (typeof memory.query === 'string') view.query = memory.query;
    if (memory.sort) view.sort = memory.sort;
    if (memory.board) view.board = memory.board;
    if (memory.tag) view.tag = memory.tag;
    if (memory.author) view.author = memory.author;
    if (memory.mode === 'feed' || memory.mode === 'grid') view.mode = memory.mode;
    if (view.query) el.search.value = view.query;
    return memory;
  }

  /* Devolve o scroll para a posicao salva (o feed e renderizado por JS,
     entao o scroll nativo do navegador nao se aplica). */
  function restoreScroll(y) {
    if (!y) return;
    var tries = 0;
    function attempt() {
      window.scrollTo(0, y);
      tries++;
      if (tries < 10 && Math.abs((window.scrollY || 0) - y) > 4) {
        setTimeout(attempt, 60);
      }
    }
    setTimeout(attempt, 0);
  }

  function matches(post) {
    /* Perfil aberto: so os posts daquela pessoa. */
    if (view.author && !sameAuthor(post.author, view.author)) return false;
    if (view.board === 'favoritos') {
      if (!isSaved(post.id)) return false;
    } else if (view.board === 'meus') {
      if (!isMyPost(post)) return false;
    } else if (view.board !== 'todos' && post.board !== view.board) return false;
    if (view.tag && (post.tags || []).indexOf(view.tag) === -1) return false;
    if (view.query) {
      var user = U.user(post.author);
      var hay = [post.title, post.body, post.author, user.name, user.username, post.board]
        .concat(post.tags || []).join(' ').toLowerCase();
      if (hay.indexOf(view.query.toLowerCase()) === -1) return false;
    }
    return true;
  }

  /* Dois ids de autor iguais (sem diferenciar maiuscula e minuscula). */
  function sameAuthor(a, b) {
    return String(a == null ? '' : a).toLowerCase() === String(b == null ? '' : b).toLowerCase();
  }

  function sortPosts(list) {
    var copy = list.slice();
    if (view.sort === 'new') {
      copy.sort(function (a, b) { return b.createdAt - a.createdAt; });
    } else if (view.sort === 'discussed') {
      copy.sort(function (a, b) { return commentCount(b) - commentCount(a); });
    } else {
      copy.sort(function (a, b) {
        var sa = scoreOf(a) + commentCount(a) * 3;
        var sb = scoreOf(b) + commentCount(b) * 3;
        if (sb !== sa) return sb - sa;
        return b.createdAt - a.createdAt;
      });
    }
    return copy;
  }

  function findPost(id) {
    for (var i = 0; i < S.state.posts.length; i++) {
      if (S.state.posts[i].id === id) return S.state.posts[i];
    }
    return null;
  }

  /* ---------------- feed ---------------- */

  function mediaHTML(post) {
    var media = post.media || [];
    if (!media.length) return '';
    var m = media[0];
    if (m.type === 'video') {
      var posterAttr = m.poster ? ' poster="' + m.poster + '"' : '';
      var posterId = m.posterId ? ' data-poster-id="' + U.escape(m.posterId) + '"' : '';
      var videoSrc = m.id ? ' data-media-id="' + U.escape(m.id) + '"' : '';
      return '<figure class="post__media post__media--video">' +
        '<video class="post__video" playsinline preload="metadata"' + posterAttr + posterId + videoSrc + '></video>' +
        '<button type="button" class="media-play" data-action="play-video" aria-label="Reproduzir vídeo">' +
        '<span>' + icon('i-play') + '</span></button>' +
        '</figure>';
    }
    var srcAttr = m.poster
      ? ' src="' + m.poster + '"'
      : (m.id ? ' data-media-id="' + U.escape(m.id) + '"' : '');
    return '<figure class="post__media"><img alt="Mídia do post: ' + U.escape(post.title) + '"' + srcAttr + '></figure>';
  }

  /* Gera um frame do vídeo para usar como thumbnail.
     O primeiro frame de quase todo vídeo é preto, então o módulo de
     posters procura um frame logo no começo que tenha imagem de verdade. */
  function makeVideoPoster(file) {
    if (!Beam.poster) return Promise.resolve(null);
    return Beam.poster.frame(file).then(function (blob) {
      return blob || null;
    }).catch(function () {
      return null;
    });
  }

  function cardHTML(post) {
    var board = boardOf(post.board);
    var vote = S.state.votes[post.id] || 0;
    var user = U.user(post.author);
    var saved = isSaved(post.id);
    var tags = (post.tags || []).map(function (t) {
      return '<button class="tag" data-action="tag" data-tag="' + U.escape(t) + '">#' + U.escape(t) + '</button>';
    }).join('');

    var isMine = isMyPost(post);
    var guest = isGuest();
    var textActions = isMine
      ? '<div class="post__text-actions">' +
        '<button class="btn" data-action="edit-post" data-id="' + U.escape(post.id) + '">' + icon('i-text') + ' Editar post</button>' +
        '<button class="btn btn--danger" data-action="delete-post" data-id="' + U.escape(post.id) + '">' + icon('i-trash') + ' Excluir post</button>' +
        '</div>'
      : '';
    var bottomActions = '';

    /* O resumo do post: no modo lista fica acima da capa, no modo grade
       fica embaixo (a imagem é o que chama o olho primeiro). */
    var excerpt = post.body ? '<p class="post__excerpt">' + U.escape(post.body.split('\n')[0]) + '</p>' : '';
    var media = mediaHTML(post);
    var resumoEMidia = view.mode === 'grid' ? media + excerpt : excerpt + media;

    return '' +
      '<article class="post" data-id="' + U.escape(post.id) + '">' +
        '<div class="post__vote">' +
          '<button class="vote vote--up' + (vote === 1 ? ' is-on' : '') + (guest ? ' is-locked' : '') + '" data-action="vote-up" data-id="' + U.escape(post.id) + '" aria-label="Votar a favor"' + (guest ? ' title="Crie um perfil para votar"' : '') + '>' + icon('i-up') + '</button>' +
          '<span class="vote__score">' + scoreOf(post) + '</span>' +
          '<button class="vote vote--down' + (vote === -1 ? ' is-on' : '') + (guest ? ' is-locked' : '') + '" data-action="vote-down" data-id="' + U.escape(post.id) + '" aria-label="Votar contra"' + (guest ? ' title="Crie um perfil para votar"' : '') + '>' + icon('i-down') + '</button>' +
        '</div>' +
        '<div class="post__body">' +
          '<div class="post__meta">' +
            U.boardHTML(board) +
            '<span class="by">por ' + U.avatarHTML(user, 'avatarchip--sm') +
              ' <button type="button" class="by__name" data-action="open-profile" data-id="' + U.escape(post.author) + '" title="Ver todos os posts de ' + U.escape(user.name) + '">' + U.escape(user.name) + '</button>' +
            '</span>' +
            '<time datetime="' + new Date(post.createdAt).toISOString() + '" title="' + U.escape(U.dateLongBR(post.createdAt)) + '">' +
              U.escape(U.dateBR(post.createdAt)) + '</time>' +
          '</div>' +
          '<h3 class="post__title"><button data-action="open" data-id="' + U.escape(post.id) + '">' + U.escape(post.title) + '</button></h3>' +
          resumoEMidia +
          '<div class="post__foot">' +
            tags +
            '<button class="act" data-action="open-comments" data-id="' + U.escape(post.id) + '">' + icon('i-comment') + commentCount(post) + (commentCount(post) === 1 ? ' comentário' : ' comentários') + '</button>' +
            (guest ? '' :
              '<button class="act' + (saved ? ' is-on' : '') + '" data-action="save" data-id="' + U.escape(post.id) + '">' + icon('i-bookmark') + (saved ? 'Salvo' : 'Salvar') + '</button>') +
          '</div>' +
          textActions +
        '</div>' +
        bottomActions +
      '</article>';
  }

  function getPostsPerPage() {
    return view.mode === 'grid' ? 15 : 10;
  }

  function renderFeed() {
    view.postsPerPage = getPostsPerPage();
    var list = sortPosts(S.state.posts.filter(matches));
    var totalPages = Math.ceil(list.length / view.postsPerPage) || 1;
    if (view.currentPage > totalPages) view.currentPage = totalPages;
    if (view.currentPage < 1) view.currentPage = 1;

    var start = (view.currentPage - 1) * view.postsPerPage;
    var pageList = list.slice(start, start + view.postsPerPage);

    el.feed.classList.toggle('grid', view.mode === 'grid');
    el.feed.innerHTML = pageList.map(cardHTML).join('');
    el.count.textContent = list.length + (list.length === 1 ? ' post' : ' posts');
    el.empty.hidden = list.length > 0;
    el.feed.hidden = list.length === 0;
    if (!list.length) {
      el.emptyHint.textContent = view.query && view.author
        ? 'Nenhum post de ' + U.user(view.author).name + ' para "' + view.query + '".'
        : view.query
          ? 'Não achamos nada para "' + view.query + '".'
          : view.author
            ? 'Este perfil ainda não publicou nada.'
            : view.board === 'favoritos'
              ? 'Você ainda não salvou nenhum post. Use o marcador para guardar os favoritos.'
              : view.board === 'meus'
                ? 'Você ainda não publicou nada com esta conta.'
                : view.board !== 'todos'
                  ? 'Este board ainda não tem posts com esses filtros.'
                  : 'Seja a primeira pessoa a publicar aqui.';
    }
    renderPagination(list.length, totalPages);
    renderTagFilter();
    renderProfileFilter();
    hydrateMedia(el.feed);
    repairVideoPosters();
  }

  /* ---------------- perfil aberto ---------------- */

  /* Barra que aparece acima do feed quando o filtro de perfil esta ativo:
     mostra quem e, quantos posts tem e um botao para voltar ao feed todo. */
  function renderProfileFilter() {
    var box = document.getElementById('profileFilter');
    if (!box) return;
    if (!view.author) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    var author = U.user(view.author);
    var count = S.postsByAuthor(view.author);
    var isFav = S.isFavoriteProfile(view.author);
    box.hidden = false;
    box.innerHTML =
      '<span class="profilefilter__avatar">' + U.avatarHTML(author) + '</span>' +
      '<span class="profilefilter__info">' +
        '<strong>' + U.escape(author.name) + '</strong>' +
        '<small>@' + U.escape(author.username || author.name) + ' · ' +
          count + (count === 1 ? ' post publicado' : ' posts publicados') + '</small>' +
      '</span>' +
      (isGuest() ? '' :
        '<button type="button" class="favbtn' + (isFav ? ' is-on' : '') + '" data-action="favorite-profile" data-id="' + U.escape(view.author) + '" title="' + (isFav ? 'Remover dos favoritos' : 'Adicionar aos favoritos') + '" aria-label="' + (isFav ? 'Remover dos favoritos' : 'Adicionar aos favoritos') + '">' + icon('i-heart') + '</button>') +
      '<button type="button" class="btn btn--ghost btn--small" data-action="clear-profile">Ver todo o feed</button>';
  }

  /* Abre o feed de um perfil: todos os posts daquela pessoa. */
  function openAuthor(id) {
    var author = U.user(id);
    view.author = author.id;
    view.query = '';
    view.tag = null;
    view.board = 'todos';
    el.search.value = '';
    view.currentPage = 1;
    hideSearchResults();
    renderBoards();
    renderYouNav();
    renderFeed();
    syncURL();
    window.scrollTo(0, 0);
  }

  /* Fecha o filtro de perfil e volta ao feed completo. */
  function clearAuthor() {
    view.author = null;
    view.currentPage = 1;
    renderFeed();
    syncURL();
  }

  /* Mantem a URL de acordo com o que esta na tela (perfil e busca). */
  function syncURL() {
    if (!window.history || !history.replaceState) return;
    var params = new URLSearchParams(location.search);
    if (view.author) params.set('perfil', view.author); else params.delete('perfil');
    if (view.query) params.set('q', view.query); else params.delete('q');
    var url = location.pathname + (params.toString() ? '?' + params.toString() : '');
    try { history.replaceState(null, '', url); } catch (err) { }
  }

  /* ---------------- busca de perfis ---------------- */

  var searchPanel = document.getElementById('searchResults');
  var searchActive = -1;

  /* Desenha o painel de perfis que desce do campo de busca. */
  function renderSearchResults() {
    if (!searchPanel) return;
    var query = el.search.value.trim();
    var list = Beam.profile.matchingAuthors(query);
    searchActive = -1;
    searchPanel.innerHTML = Beam.profile.authorsPanelHTML(list, query, !isGuest());
    searchPanel.hidden = false;
    el.search.setAttribute('aria-expanded', 'true');
  }

  function hideSearchResults() {
    if (!searchPanel) return;
    searchPanel.hidden = true;
    searchActive = -1;
    el.search.setAttribute('aria-expanded', 'false');
  }

  function renderPagination(total, totalPages) {
    var container = document.getElementById('pagination');
    if (!container) return;
    if (totalPages <= 1) {
      container.hidden = true;
      return;
    }
    container.hidden = false;
    var html = '';
    html += '<button class="btn btn--ghost' + (view.currentPage === 1 ? ' disabled' : '') + '" data-action="pagination-prev" data-page="' + (view.currentPage - 1) + '">‹ Anterior</button> ';
    for (var i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= view.currentPage - 1 && i <= view.currentPage + 1)) {
        html += '<button class="btn btn--ghost' + (view.currentPage === i ? ' is-active' : '') + '" data-action="pagination-page" data-page="' + i + '">' + i + '</button> ';
      } else if (i === view.currentPage - 2 || i === view.currentPage + 2) {
        html += '<span class="btn btn--ghost disabled">…</span> ';
      }
    }
    html += '<button class="btn btn--ghost' + (view.currentPage === totalPages ? ' disabled' : '') + '" data-action="pagination-next" data-page="' + (view.currentPage + 1) + '">Próximo ›</button>';
    container.innerHTML = html;
  }

  function renderTagFilter() {
    if (!el.tagFilter) return;
    if (!view.tag) {
      el.tagFilter.hidden = true;
      el.tagFilter.textContent = '';
      return;
    }
    el.tagFilter.hidden = false;
    el.tagFilter.textContent = '#' + view.tag + ' ×';
    el.tagFilter.setAttribute('aria-label', 'Remover filtro da tag ' + view.tag);
  }

  function hydrateMedia(root) {
    var nodes = root.querySelectorAll('img[data-media-id], video[data-media-id]');
    for (var i = 0; i < nodes.length; i++) {
      (function (node) {
        var mediaId = node.getAttribute('data-media-id');
        var posterId = node.getAttribute('data-poster-id');
        if (posterId) {
          S.mediaURL(posterId).then(function (url) {
            if (!url) return;
            node.setAttribute('poster', url);
            node.removeAttribute('data-poster-id');
          });
        }
        S.mediaURL(mediaId).then(function (url) {
          if (!url) {
            if (node.tagName === 'VIDEO') {
              if (!U.videoFallback(node)) U.mediaMissing(node);
            } else {
              U.mediaMissing(node);
            }
            return;
          }
          node.src = url;
          node.removeAttribute('data-media-id');
          /* O arquivo compartilhado pode ter sumido (banco trocado, Storage
             limpo). Aí entra a cópia guardada neste navegador. */
          node.onerror = function () {
            node.onerror = null;
            S.recoverMedia(node, mediaId).then(function (ok) {
              if (ok) return;
              if (node.tagName === 'VIDEO') {
                if (!U.videoFallback(node)) U.mediaMissing(node);
              } else {
                U.mediaMissing(node);
              }
            });
          };
        });
      })(nodes[i]);
    }
  }

  /* Refaz a miniatura dos vídeos que ficaram pretos.
     Só olha os cards que estão perto da tela: decodificar vídeo é caro. */
  function repairVideoPosters() {
    if (!Beam.poster) return;
    var cards = el.feed.querySelectorAll('.post[data-id]');
    for (var i = 0; i < cards.length; i++) {
      (function (card) {
        var video = card.querySelector('video');
        if (!video) return;
        var rect = card.getBoundingClientRect();
        if (rect.bottom < -400 || rect.top > window.innerHeight + 400) return;
        var post = findPost(card.getAttribute('data-id'));
        if (!post) return;
        Beam.poster.repair(post).then(function (url) {
          if (!url) return;
          var player = card.querySelector('video');
          if (player) player.setAttribute('poster', url);
        });
      })(cards[i]);
    }
  }

  /* ---------------- rails ---------------- */

  function renderBoards() {
    var counts = {};
    S.state.posts.forEach(function (p) { counts[p.board] = (counts[p.board] || 0) + 1; });
    var html = '<li><button data-board="todos" class="' + (view.board === 'todos' ? 'is-active' : '') + '">' +
      '<svg class="icon board__icon" style="color:#EDF3F1"><use href="#i-board-geral"/></svg>Todos os boards<span class="count">' + S.state.posts.length + '</span></button></li>';
    Beam.boards.forEach(function (b) {
      html += '<li><button data-board="' + b.id + '" class="' + (view.board === b.id ? 'is-active' : '') + '">' +
        U.boardIconHTML(b) + U.escape(b.name) +
        '<span class="count">' + (counts[b.id] || 0) + '</span></button></li>';
    });
    el.boards.innerHTML = html;
  }

  function renderTags() {
    if (!el.tagCloud) return;
    var counts = {};
    S.state.posts.forEach(function (p) {
      (p.tags || []).forEach(function (t) { counts[t] = (counts[t] || 0) + 1; });
    });
    var tags = Object.keys(counts).sort(function (a, b) {
      return a.localeCompare(b, 'pt-BR');
    });
    el.tagCloud.innerHTML = tags.map(function (t) {
      return '<button data-action="tag" data-tag="' + U.escape(t) + '" class="' + (view.tag === t ? 'is-active' : '') + '" title="' + counts[t] + ' posts">#' + U.escape(t) + '</button>';
    }).join('');
  }

  function renderSpotlight() {
    var pick = S.state.posts.filter(function (p) { return p.media && p.media.length; })
      .sort(function (a, b) { return scoreOf(b) - scoreOf(a); })[0];
    if (!pick) { el.spotlight.hidden = true; return; }
    var media = pick.media[0] || {};
    el.spotlight.innerHTML =
      '<div>' +
        '<p class="spotlight__kicker">Destaque da semana · ' + U.escape(boardOf(pick.board).name) + '</p>' +
        '<h2>' + U.escape(pick.title) + '</h2>' +
        '<p>' + U.escape((pick.body || '').split('\n')[0]) + '</p>' +
        '<button class="btn btn--primary" data-action="open" data-id="' + U.escape(pick.id) + '">Abrir post</button>' +
      '</div>' +
      '<div class="spotlight__art"></div>';

    var art = el.spotlight.querySelector('.spotlight__art');

    /* A capa pode estar embutida no post ou guardada no IndexedDB
       (upload). Nos dois casos a gente resolve a url antes de mostrar. */
    function showArt(url) {
      if (!url || !art.isConnected) return;
      art.innerHTML = '<img alt="Capa do post em destaque" src="' + url + '">';
    }

    if (media.poster) {
      showArt(media.poster);
      return;
    }
    if (!media.id) return;
    /* Video: a capa e o frame gerado no upload. */
    if (media.posterId) {
      S.mediaURL(media.posterId).then(showArt);
      return;
    }
    if (media.type === 'video') return;
    S.mediaURL(media.id).then(showArt);
  }

  /* ---------------- ações ---------------- */

  function vote(id, dir) {
    /* Sem perfil a pessoa só lê: não vota. */
    if (isGuest()) {
      toast('Crie um perfil para votar.', true);
      return;
    }
    var current = S.state.votes[id] || 0;
    S.state.votes[id] = current === dir ? 0 : dir;
    if (!S.state.votes[id]) delete S.state.votes[id];
    S.save();
    /* O voto vai para o banco compartilhado: a pontuação é a de todo mundo. */
    S.syncVote(id, S.state.votes[id] || 0);
    renderFeed();
  }

  function toggleSave(id) {
    if (isGuest()) {
      toast('Crie um perfil para salvar favoritos.', true);
      return;
    }
    var index = S.state.saved.indexOf(id);
    if (index === -1) S.state.saved.push(id); else S.state.saved.splice(index, 1);
    S.save();
    renderFeed();
    renderYouNav();
    toast(index === -1 ? 'Post salvo nos favoritos.' : 'Post removido dos favoritos.');
  }

  function openComposer() {
    /* Sem perfil não dá para publicar: o caminho é criar o perfil. */
    if (isGuest()) {
      Beam.profile.openProfilesDialog('create');
      toast('Crie um perfil para publicar.', true);
      return;
    }
    resetComposer();
    el.composer.showModal();
    setTimeout(function () { el.fTitle.focus(); }, 60);
  }

  function resetComposer() {
    el.composerForm.reset();
    el.formError.hidden = true;
    el.formError.textContent = '';
    view.pendingMedia = [];
    el.mediaList.innerHTML = '';
    view.slides = [{ id: Beam.util.uid('slide'), body: '', media: null }];
    updateTitleHint();
    renderSlidesList();
    renderLinks([]);
  }

  /* ---------------- links de apoio ---------------- */

  function linksContainer() {
    return document.querySelector('#linkField .links-editor');
  }

  function linkRowHTML(value, label) {
    var preview = label ? '<span class="links-editor__badge">' + U.escape(label) + '</span>' : '';
    return '<div class="links-editor__row">' +
      '<input type="url" name="links" placeholder="https://youtube.com/watch?v=..." value="' + U.escape(value || '') + '" data-link-input>' +
      preview +
      '<button type="button" class="act act--danger" data-action="remove-link" aria-label="Remover link">' +
      '<svg class="icon"><use href="#i-trash"/></svg></button>' +
      '</div>';
  }

  function renderLinks(items) {
    var box = linksContainer();
    if (!box) return;
    if (!items.length) items = [{ url: '', label: '' }];
    box.innerHTML = items.map(function (it) { return linkRowHTML(it.url, it.label); }).join('');
  }

  function collectLinks() {
    var rows = document.querySelectorAll('#linkField [data-link-input]');
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var url = rows[i].value.trim();
      if (!url) continue;
      out.push({ url: url, label: U.linkName(url) });
    }
    return out;
  }

  function updateLinkLabels() {
    var rows = document.querySelectorAll('#linkField [data-link-input]');
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i].closest('.links-editor__row');
      if (!row) continue;
      var badge = row.querySelector('.links-editor__badge');
      var url = rows[i].value.trim();
      if (!url) {
        if (badge) badge.remove();
        continue;
      }
      var label = U.linkName(url);
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'links-editor__badge';
        row.insertBefore(badge, row.querySelector('[data-action="remove-link"]'));
      }
      badge.textContent = label;
    }
  }

  function updateTitleHint() {
    var hint = el.composerForm.querySelector('[data-hint="title"]');
    if (hint) hint.textContent = el.fTitle.value.length + '/140';
  }

  /* Confere se o endereço do arquivo ainda entrega o conteúdo. */
  function probeFile(url, type) {
    return new Promise(function (resolve) {
      if (!url) return resolve(false);
      var node = document.createElement(type === 'video' ? 'video' : 'img');
      var done = false;
      var finish = function (ok) {
        if (done) return;
        done = true;
        resolve(ok);
      };
      node.addEventListener('load', function () { finish(true); });
      node.addEventListener('error', function () { finish(false); });
      setTimeout(function () { finish(false); }, 8000);
      node.src = url;
      if (type === 'video') node.load();
    });
  }

  function addFiles(files) {
    var list = Array.prototype.slice.call(files || []);
    if (!list.length) return;
    var accepted = 0;
    list.forEach(function (file) {
      if (!/^(image|video)\//.test(file.type)) {
        toast('Arquivo ignorado (tipo não suportado): ' + file.name, true);
        return;
      }
      if (file.size > S.MAX_FILE) {
        toast('Arquivo maior que 25 MB: ' + file.name, true);
        return;
      }
      accepted++;
      S.addMedia(file).then(function (descriptor) {
        descriptor.preview = URL.createObjectURL(file);
        /* A capa antiga não existe mais: o arquivo novo ocupa o lugar
           (é assim que o post se conserta). */
        if (view.pendingMedia[0] && view.pendingMedia[0].dead) {
          var velho = view.pendingMedia.shift();
          if (velho && velho.id) S.removeMedia(velho.id);
        }
        view.pendingMedia.push(descriptor);
        renderMediaList();
        if (descriptor.type === 'video') {
          /* A miniatura leva alguns segundos: o video é aberto e o
             compositor procura um frame no começo que não seja preto. */
          descriptor.posterBusy = true;
          renderMediaList();
          makeVideoPoster(file).then(function (blob) {
            descriptor.posterBusy = false;
            if (!blob) {
              renderMediaList();
              return;
            }
            var posterFile = new File([blob], 'poster.jpg', { type: 'image/jpeg' });
            S.addMedia(posterFile).then(function (pd) {
              descriptor.posterId = pd.id;
              descriptor.posterPreview = URL.createObjectURL(blob);
              /* A url da miniatura viaja com o post: é ela que os outros
                 visitantes conseguem abrir. */
              if (pd.url) descriptor.posterUrl = pd.url;
              if (pd.path) descriptor.posterPath = pd.path;
              renderMediaList();
            }).catch(function () { renderMediaList(); });
          });
        }
      }).catch(function (err) {
        toast(err.message || 'Não foi possível ler o arquivo.', true);
      });
    });
    if (accepted) toast(accepted + (accepted === 1 ? ' arquivo adicionado.' : ' arquivos adicionados.'));
  }

  function renderMediaList() {
    el.mediaList.innerHTML = view.pendingMedia.map(function (m, i) {
      var thumb = m.dead
        ? '<span class="thumb thumb--busy" style="display:grid;place-items:center">' +
          icon('i-image') + '<em>sem arquivo</em></span>'
        : (m.type === 'image'
          ? '<img class="thumb" alt="" src="' + m.preview + '">'
          : (m.posterPreview
            ? '<img class="thumb" alt="" src="' + m.posterPreview + '">'
            : '<span class="thumb thumb--busy" style="display:grid;place-items:center">' +
              icon('i-video') + (m.posterBusy ? '<em>gerando…</em>' : '') + '</span>'));
      return '<li>' + thumb +
        '<span style="flex:1;min-width:0"><span class="name">' + U.escape(m.name) + '</span>' +
        '<span class="size">' + U.bytes(m.size) + '</span></span>' +
        '<button type="button" class="act act--danger" data-action="remove-media" data-index="' + i + '" aria-label="Remover ' + U.escape(m.name) + '">' + icon('i-trash') + '</button>' +
        '</li>';
    }).join('');
  }

  function renderSlidesList() {
    var list = document.getElementById('slidesList');
    var count = document.getElementById('slidesCount');
    if (!list) return;
    var last = view.slides.length - 1;
    list.innerHTML = view.slides.map(function (s, i) {
      var preview = s.media && s.media.preview
        ? '<img alt="Imagem do slide" src="' + s.media.preview + '">'
        : '';
      return '<div class="slide-card" data-slide-id="' + s.id + '">' +
        '<div class="slide-card__bar">' +
          '<span class="slide__num">' + (i + 1) + '</span>' +
          '<span class="slide__drag" draggable="true" title="Arraste para reordenar" aria-label="Arraste para mover o slide">⠿</span>' +
          '<span class="slide-card__spacer"></span>' +
          '<button type="button" class="slide__move" data-action="move-slide-up" data-slide-id="' + s.id + '" aria-label="Mover slide para cima"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
          '<button type="button" class="slide__move" data-action="move-slide-down" data-slide-id="' + s.id + '" aria-label="Mover slide para baixo"' + (i === last ? ' disabled' : '') + '>↓</button>' +
          '<button type="button" class="slide__remove" data-action="remove-slide" data-slide-id="' + s.id + '" aria-label="Remover slide">×</button>' +
        '</div>' +
        '<label class="slide__media">' +
          '<input type="file" class="slide__input" accept="image/*" data-slide-id="' + s.id + '" hidden>' +
          '<svg class="icon"><use href="#i-image"/></svg>' +
          '<span class="slide__label">Adicionar imagem deste slide</span>' +
          '<span class="slide__hint">opcional · até 25 MB</span>' +
        '</label>' +
        '<div class="slide__preview" id="slidePreview-' + s.id + '">' + preview + '</div>' +
        '<label class="field field--inner slide__text">' +
          '<span class="field__label">Texto do slide</span>' +
          '<textarea name="slideBody-' + s.id + '" rows="4" placeholder="Conte esta parte do passo a passo.">' + U.escape(s.body) + '</textarea>' +
        '</label>' +
      '</div>';
    }).join('');
    if (count) count.textContent = view.slides.length + (view.slides.length === 1 ? ' slide' : ' slides');
  }

  /* Le os textos digitados antes de reordenar, para o texto viajar com o slide. */
  function syncSlidesFromDom() {
    var textareas = document.querySelectorAll('#slidesList textarea[name^="slideBody-"]');
    for (var i = 0; i < textareas.length; i++) {
      var id = textareas[i].name.replace('slideBody-', '');
      var slide = view.slides.find(function (s) { return s.id === id; });
      if (slide) slide.body = textareas[i].value;
    }
  }

  /* Move um slide (com imagem e texto) para outra posicao. */
  function moveSlide(id, targetIndex) {
    syncSlidesFromDom();
    var from = view.slides.findIndex(function (s) { return s.id === id; });
    if (from === -1) return;
    var to = Math.max(0, Math.min(view.slides.length - 1, targetIndex));
    if (to === from) return;
    var slide = view.slides.splice(from, 1)[0];
    view.slides.splice(to, 0, slide);
    renderSlidesList();
    var field = document.querySelector('textarea[name="slideBody-' + id + '"]');
    if (field) field.focus();
  }

  function addSlideFile(file, slideId) {
    if (!/^image\//.test(file.type)) {
      toast('Apenas imagens são aceitas nos slides.', true);
      return;
    }
    if (file.size > S.MAX_FILE) {
      toast('Imagem maior que 25 MB.', true);
      return;
    }
    S.addMedia(file).then(function (descriptor) {
      descriptor.preview = URL.createObjectURL(file);
      var slide = view.slides.find(function (s) { return s.id === slideId; });
      if (slide) slide.media = descriptor;
      renderSlidesList();
    }).catch(function (err) {
      toast(err.message || 'Não foi possível ler a imagem.', true);
    });
  }

  function editPost(id) {
    var post = findPost(id);
    if (!post) return;

    view.editingPostId = id;

    el.fTitle.value = post.title;
    el.fTitle.dispatchEvent(new Event('input', {bubbles:true}));
    el.fBody.value = post.body;
    el.fBoard.value = post.board;
    el.fTags.value = (post.tags || []).join(', ');

    // Links de apoio - aceita formato novo (array) e legado (string)
    var existingLinks = [];
    if (Array.isArray(post.links)) {
      existingLinks = post.links.map(function (l) {
        return { url: l.url || '', label: l.label || U.linkName(l.url || '') };
      });
    } else if (post.link) {
      existingLinks = [{ url: post.link, label: U.linkName(post.link) }];
    }
    renderLinks(existingLinks);

    // Slides - carregar pré-visualização das imagens
    var slidePromises = (post.slides || []).map(function (s) {
      return new Promise(function (resolve) {
        var slide = { id: s.id || Beam.util.uid('slide'), body: s.body || '', media: s.media || null };
        if (slide.media && slide.media.id) {
          S.mediaURL(slide.media.id).then(function (url) {
            slide.media.preview = url;
            resolve(slide);
          });
        } else {
          resolve(slide);
        }
      });
    });
    Promise.all(slidePromises).then(function (slidesList) {
      view.slides = slidesList;
      renderSlidesList();
    });

    // Mídia de capa - carregar pré-visualização do IndexedDB
    var pendingMediaPromises = (post.media || []).map(function (m) {
      return S.mediaURL(m.id).then(function (url) {
        var entry = { id: m.id, type: m.type, name: m.name, size: m.size, preview: url };
        /* Guarda o endereço do arquivo no Storage: ao republicar, o post
           continua apontando para o mesmo lugar. */
        if (m.url) entry.url = m.url;
        if (m.path) entry.path = m.path;
        if (m.posterUrl) entry.posterUrl = m.posterUrl;
        if (m.posterPath) entry.posterPath = m.posterPath;

        /* O arquivo pode ter sumido do Storage. A cópia local é a prova
           de que ele ainda existe; sem ela, o endereço é testado. */
        var check = S.localMediaURL(m.id).then(function (localUrl) {
          if (localUrl) {
            entry.preview = localUrl;
            return entry;
          }
          return probeFile(url, m.type).then(function (ok) {
            if (!ok) entry.dead = true;
            return entry;
          });
        });

        if (m.posterId) {
          entry.posterId = m.posterId;
          return S.mediaURL(m.posterId).then(function (posterUrl) {
            entry.posterPreview = posterUrl;
            return check;
          });
        }
        return check;
      });
    });
    Promise.all(pendingMediaPromises).then(function (mediaList) {
      var mortos = mediaList.filter(function (m) { return m.dead; }).length;
      if (mortos) {
        toast('A mídia deste post não está mais disponível: anexe o arquivo de novo.', true);
      }
      view.pendingMedia = mediaList;
      renderMediaList();
    });

    el.composer.showModal();
    setTimeout(function () { el.fTitle.focus(); }, 60);
  }

  function publish() {
    var title = el.fTitle.value.trim();
    var body = el.fBody.value.trim();
    var board = el.fBoard.value;

    /* Sem perfil não há publicação: é preciso criar o perfil primeiro. */
    if (isGuest()) {
      el.composer.close();
      Beam.profile.openProfilesDialog('create');
      toast('Crie um perfil para publicar.', true);
      return;
    }

    if (!title) {
      el.formError.textContent = 'Dê um título ao post — é o que as pessoas veem primeiro.';
      el.formError.hidden = false;
      el.fTitle.focus();
      return;
    }

    var tags = el.fTags.value.split(',')
      .map(function (t) { return t.trim().toLowerCase().replace(/\s+/g, '-'); })
      .filter(Boolean).slice(0, 5);

    var post = {
      id: view.editingPostId || U.uid('post'),
      board: board,
      author: view.editingPostId ? (findPost(view.editingPostId) && findPost(view.editingPostId).author) || currentProfile().id : currentProfile().id,
      title: title,
      body: body,
      tags: tags,
      /* Post novo começa sem votos: o "+1" automatico inflava a pontuacao. */
      /* A pontuação vem dos votos (tabela votes). O campo antigo do post
         guardava o "+1" automático: ele não entra mais na conta. */
      votes: 0,
      createdAt: view.editingPostId ? (findPost(view.editingPostId) && findPost(view.editingPostId).createdAt || Date.now()) : Date.now(),
      /* A url do arquivo precisa ir junto: sem ela, quem abre o post de
         outro navegador ve a imagem quebrada. */
      media: view.pendingMedia.map(function (m) {
        var entry = { id: m.id, type: m.type, name: m.name, size: m.size };
        /* Midia que ja nao existe: nao viaja o endereco morto. */
        if (!m.dead) {
          if (m.url) entry.url = m.url;
          if (m.path) entry.path = m.path;
          if (m.posterUrl) entry.posterUrl = m.posterUrl;
          if (m.posterPath) entry.posterPath = m.posterPath;
        }
        if (m.posterId) entry.posterId = m.posterId;
        return entry;
      }),
      /* Slide em branco (sem imagem e sem texto) nao e salvo. */
      slides: view.slides.filter(function (s) {
        return (s.media && s.media.id) || (s.body && String(s.body).trim());
      }).map(function (s) {
        var entry = null;
        if (s.media) {
          entry = { id: s.media.id, type: s.media.type, name: s.media.name, size: s.media.size };
          if (s.media.url) entry.url = s.media.url;
          if (s.media.path) entry.path = s.media.path;
        }
        return { body: s.body || '', media: entry };
      }),
      comments: view.editingPostId ? (findPost(view.editingPostId) && findPost(view.editingPostId).comments || []) : []
    };
    var links = collectLinks();
    if (links.length) post.links = links;

    if (view.editingPostId) {
      // Atualizar post existente
      S.state.posts = S.state.posts.map(function (p) {
        return p.id === post.id ? post : p;
      });
      toast('Post atualizado.');
    } else {
      S.state.posts.unshift(post);
      toast('Publicado.');
    }
    S.save();
    /* Envia para o banco compartilhado: é o que faz todo mundo ver o post. */
    S.syncPost(post);
    el.composer.close();
    view.editingPostId = null;
    renderYouNav();
    setTimeout(function () { openPost(post.id); }, 350);
  }

  function deletePost(id) {
    var post = findPost(id);
    if (!post) return;
    (post.media || []).forEach(function (m) {
      S.removeMedia(m.id);
      if (m.posterId) S.removeMedia(m.posterId);
    });
    S.removePost(id);
    renderFeed();
    renderYouNav();
    toast('Post excluído.');
  }


  /* ---------------- eventos ---------------- */

  /* Reproduz o video do feed sem sair da lista. */
  function startFeedVideo(figure, player) {
    function begin() {
      player.setAttribute('controls', '');
      figure.classList.add('is-playing');
      var promise = player.play();
      if (promise && promise.catch) {
        promise.catch(function () {
          toast('Não foi possível reproduzir este vídeo.', true);
        });
      }
    }
    if (player.getAttribute('src')) { begin(); return; }
    var mediaId = player.getAttribute('data-media-id');
    if (!mediaId) {
      toast('Este post usa um arquivo de exemplo: o vídeo original não está no repositório.');
      return;
    }
    S.mediaURL(mediaId).then(function (url) {
      if (!url) {
        toast('Este post usa um arquivo de exemplo: o vídeo original não está no repositório.');
        return;
      }
      player.src = url;
      player.removeAttribute('data-media-id');
      begin();
    }).catch(function () {
      toast('Não foi possível carregar este vídeo.', true);
    });
  }

  /* O overlay do play precisa sair assim que o video comeca,
     inclusive quando o play vem dos controles nativos do navegador.
     Ele so volta se o post for renderizado de novo (feed recarregado). */
  document.addEventListener('play', function (event) {
    var node = event.target;
    if (!node || node.tagName !== 'VIDEO') return;
    var figure = node.closest ? node.closest('.post__media') : null;
    if (figure) figure.classList.add('is-playing');
  }, true);

  document.addEventListener('click', function (event) {
    var target = event.target.closest('[data-action]');
    if (!target) return;
    var action = target.getAttribute('data-action');
    var id = target.getAttribute('data-id');

    if (action === 'vote-up') { vote(id, 1); }
    else if (action === 'vote-down') { vote(id, -1); }
    else if (action === 'save') { toggleSave(id); }
    else if (action === 'open') { openPost(id); }
    else if (action === 'open-comments') { openComments(id); }
    else if (action === 'open-profile') { openAuthor(id); }
    else if (action === 'clear-profile') { clearAuthor(); }
    else if (action === 'favorite-profile') { toggleFavoriteProfile(id); }
    else if (action === 'tag') {
      view.tag = view.tag === target.getAttribute('data-tag') ? null : target.getAttribute('data-tag');
      renderTags();
      renderFeed();
    }
    else if (action === 'play-video') {
      var figure = target.closest('.post__media');
      var player = figure ? figure.querySelector('video') : null;
      if (!player) {
        toast('Este post usa um arquivo de exemplo: o vídeo original não está no repositório.');
        return;
      }
      startFeedVideo(figure, player);
    }
    else if (action === 'play') {
      toast('Este post usa um arquivo de exemplo: o vídeo original não está no repositório.');
    }
    else if (action === 'remove-media') {
      var index = Number(target.getAttribute('data-index'));
      var removed = view.pendingMedia.splice(index, 1)[0];
      if (removed) {
        S.removeMedia(removed.id);
        if (removed.posterId) S.removeMedia(removed.posterId);
      }
      renderMediaList();
    }
    else if (action === 'add-link') {
      var box = linksContainer();
      if (!box) return;
      var row = document.createElement('div');
      row.className = 'links-editor__row';
      row.innerHTML = linkRowHTML('', '');
      box.appendChild(row);
      var input = row.querySelector('[data-link-input]');
      if (input) input.focus();
    }
    else if (action === 'remove-link') {
      var linkRow = target.closest('.links-editor__row');
      var linkBox = linksContainer();
      if (!linkRow || !linkBox) return;
      var rows = linkBox.querySelectorAll('.links-editor__row');
      if (rows.length > 1) {
        linkRow.remove();
      } else {
        var only = linkRow.querySelector('[data-link-input]');
        if (only) only.value = '';
        var badge = linkRow.querySelector('.links-editor__badge');
        if (badge) badge.remove();
      }
    }
    else if (action === 'add-slide') {
      view.slides.push({ id: Beam.util.uid('slide'), body: '', media: null });
      renderSlidesList();
    }
    else if (action === 'remove-slide') {
      var slideId = target.getAttribute('data-slide-id');
      var slideIndex = view.slides.findIndex(function (s) { return s.id === slideId; });
      if (slideIndex === -1) return;
      var removed = view.slides.splice(slideIndex, 1)[0];
      if (removed && removed.media) S.removeMedia(removed.media.id);
      renderSlidesList();
    }
    else if (action === 'move-slide-up') {
      var upId = target.getAttribute('data-slide-id');
      var upIndex = view.slides.findIndex(function (s) { return s.id === upId; });
      if (upIndex > 0) moveSlide(upId, upIndex - 1);
    }
    else if (action === 'move-slide-down') {
      var downId = target.getAttribute('data-slide-id');
      var downIndex = view.slides.findIndex(function (s) { return s.id === downId; });
      if (downIndex !== -1 && downIndex < view.slides.length - 1) moveSlide(downId, downIndex + 1);
    }
    else if (action === 'pagination-prev') {
      var page = Number(target.getAttribute('data-page'));
      if (page >= 1) { view.currentPage = page; renderFeed(); window.scrollTo(0, 0); }
    }
    else if (action === 'pagination-page') {
      var page = Number(target.getAttribute('data-page'));
      if (page >= 1) { view.currentPage = page; renderFeed(); window.scrollTo(0, 0); }
    }
    else if (action === 'pagination-next') {
      var page = Number(target.getAttribute('data-page'));
      view.currentPage = page;
      renderFeed();
      window.scrollTo(0, 0);
    }
    else if (action === 'edit-post') {
      const id = target.getAttribute('data-id');
      editPost(id);
    }
    else if (action === 'delete-post') {
      const id = target.getAttribute('data-id');
      if (confirm('Tem certeza que deseja excluir este post?')) {
        deletePost(id);
      }
    }
  });

  if (el.tagFilter) {
    el.tagFilter.addEventListener('click', function () {
      view.tag = null;
      view.currentPage = 1;
      renderFeed();
    });
  }

  el.boards.addEventListener('click', function (event) {
    var btn = event.target.closest('[data-board]');
    if (!btn) return;
    view.board = btn.getAttribute('data-board');
    view.currentPage = 1;
    renderBoards();
    renderYouNav();
    renderFeed();
    closeDrawer();
  });

  /* Bloco "Você": meus posts e favoritos. */
  var youNav = document.getElementById('youNav');
  if (youNav) {
    youNav.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-view-filter]');
      if (!btn) return;
      view.board = btn.getAttribute('data-view-filter');
      view.currentPage = 1;
      renderBoards();
      renderYouNav();
      renderFeed();
      closeDrawer();
    });
  }

  el.search.addEventListener('input', function () {
    view.query = el.search.value.trim();
    view.currentPage = 1;
    renderFeed();
    syncURL();
    renderSearchResults();
  });

  el.search.addEventListener('focus', renderSearchResults);

  /* O clique no resultado acontece depois do blur: espera um instante
     antes de fechar o painel para nao sumir antes do clique. */
  el.search.addEventListener('blur', function () {
    setTimeout(hideSearchResults, 160);
  });

  el.search.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      hideSearchResults();
      el.search.blur();
      return;
    }
    var rows = searchPanel ? searchPanel.querySelectorAll('.searchrow') : [];
    if (!rows.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      var next = searchActive + (event.key === 'ArrowDown' ? 1 : -1);
      if (next < 0) next = rows.length - 1;
      if (next >= rows.length) next = 0;
      searchActive = next;
      Array.prototype.forEach.call(rows, function (row, i) {
        row.classList.toggle('is-active', i === searchActive);
        if (i === searchActive && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
      });
    }
  });

  document.getElementById('searchForm').addEventListener('submit', function (event) {
    event.preventDefault();
    /* Enter escolhe o perfil destacado no painel. */
    var rows = searchPanel ? searchPanel.querySelectorAll('.searchrow') : [];
    if (searchActive >= 0 && rows[searchActive]) {
      var open = rows[searchActive].querySelector('.searchrow__open');
      if (open) open.click();
      return;
    }
    view.query = el.search.value.trim();
    view.currentPage = 1;
    renderFeed();
    syncURL();
    hideSearchResults();
    el.search.blur();
  });

  /* Clicar fora do campo de busca fecha o painel de perfis. */
  document.addEventListener('click', function (event) {
    var box = document.getElementById('searchForm');
    if (box && !box.contains(event.target)) hideSearchResults();
  });

  document.querySelectorAll('.feedbar__tabs .tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      view.sort = tab.getAttribute('data-sort');
      syncTabs();
      renderFeed();
    });
  });

  document.querySelectorAll('.segmented__btn[data-view]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      view.mode = btn.getAttribute('data-view');
      view.currentPage = 1;
      S.state.settings.viewMode = view.mode;
      S.save();
      document.querySelectorAll('.segmented__btn[data-view]').forEach(function (other) {
        var on = other === btn;
        other.classList.toggle('is-active', on);
        other.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      renderFeed();
    });
  });

  function syncTabs() {
    document.querySelectorAll('.feedbar__tabs .tab').forEach(function (tab) {
      var on = tab.getAttribute('data-sort') === view.sort;
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  /* composer */

  document.getElementById('openComposer').addEventListener('click', openComposer);
  document.getElementById('emptyPublish').addEventListener('click', openComposer);
  document.getElementById('emptyReset').addEventListener('click', function () {
    view.board = 'todos'; view.tag = null; view.query = ''; view.author = null;
    el.search.value = '';
    renderBoards(); renderFeed(); syncURL();
  });
  document.querySelector('[data-close-composer]').addEventListener('click', function () { el.composer.close(); });

  document.getElementById('addSlide').addEventListener('click', function () {
    view.slides.push({ id: Beam.util.uid('slide'), body: '', media: null });
    renderSlidesList();
  });

  document.getElementById('slidesList').addEventListener('change', function (event) {
    var input = event.target;
    if (!input.classList.contains('slide__input')) return;
    var slideId = input.getAttribute('data-slide-id');
    addSlideFile(input.files[0], slideId);
    input.value = '';
  });

  document.getElementById('slidesList').addEventListener('input', function (event) {
    var textarea = event.target;
    if (!textarea.name || !textarea.name.startsWith('slideBody-')) return;
    var slideId = textarea.name.replace('slideBody-', '');
    var slide = view.slides.find(function (s) { return s.id === slideId; });
    if (slide) slide.body = textarea.value;
  });

  /* ---------- arrastar slides para reordenar ---------- */

  var dragSlideId = null;

  function slideCardFrom(node) {
    return node && node.closest ? node.closest('.slide-card') : null;
  }

  document.getElementById('slidesList').addEventListener('dragstart', function (event) {
    var handle = event.target.closest('.slide__drag');
    if (!handle) return;
    var card = slideCardFrom(handle);
    if (!card) return;
    dragSlideId = card.getAttribute('data-slide-id');
    card.classList.add('is-dragging');
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', dragSlideId);
      try { event.dataTransfer.setDragImage(card, 24, 24); } catch (err) { }
    }
  });

  document.getElementById('slidesList').addEventListener('dragend', function () {
    Array.prototype.forEach.call(document.querySelectorAll('.slide-card'), function (el) {
      el.classList.remove('is-dragging');
      el.classList.remove('is-over');
    });
    dragSlideId = null;
  });

  document.getElementById('slidesList').addEventListener('dragover', function (event) {
    if (!dragSlideId) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    var card = slideCardFrom(event.target);
    Array.prototype.forEach.call(document.querySelectorAll('.slide-card.is-over'), function (el) {
      el.classList.remove('is-over');
    });
    if (card && card.getAttribute('data-slide-id') !== dragSlideId) card.classList.add('is-over');
  });

  document.getElementById('slidesList').addEventListener('drop', function (event) {
    if (!dragSlideId) return;
    event.preventDefault();
    var card = slideCardFrom(event.target);
    var fromId = dragSlideId;
    if (!card) return;
    var toId = card.getAttribute('data-slide-id');
    if (!toId || toId === fromId) return;

    var from = view.slides.findIndex(function (s) { return s.id === fromId; });
    var to = view.slides.findIndex(function (s) { return s.id === toId; });
    if (from === -1 || to === -1) return;
    moveSlide(fromId, to);
    toast('Slide movido para a posição ' + (to + 1) + '.');
  });

  el.fTitle.addEventListener('input', updateTitleHint);
  el.fileInput.addEventListener('change', function () {
    addFiles(el.fileInput.files);
    el.fileInput.value = '';
  });

  ['dragenter', 'dragover'].forEach(function (evt) {
    el.dropzone.addEventListener(evt, function (e) {
      e.preventDefault();
      el.dropzone.classList.add('is-over');
    });
  });
  ['dragleave', 'drop'].forEach(function (evt) {
    el.dropzone.addEventListener(evt, function (e) {
      e.preventDefault();
      el.dropzone.classList.remove('is-over');
    });
  });
  el.dropzone.addEventListener('drop', function (e) {
    if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
  });

  el.composerForm.addEventListener('submit', function (event) {
    event.preventDefault();
    publish();
  });

  el.composerForm.addEventListener('input', function (event) {
    if (event.target.matches('[data-link-input]')) updateLinkLabels();
  });

  el.composerForm.addEventListener('change', function (event) {
    if (event.target.matches('[data-link-input]')) updateLinkLabels();
  });

  /* tema */

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    /* So grava quando o tema realmente muda: escrever a cada carregamento
       multiplica o risco de corrupcao com varias abas abertas. */
    if (S.state.settings.theme !== theme) {
      S.state.settings.theme = theme;
      S.save();
    }
  }

  document.getElementById('themeToggle').addEventListener('click', function () {
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    toast(next === 'dark' ? 'Tema escuro.' : 'Tema claro.');
  });

  /* barra lateral: recolhe no desktop, abre como gaveta no mobile */

  function openDrawer() {
    el.railLeft.classList.add('is-open');
    el.navScrim.hidden = false;
    el.navButton.setAttribute('aria-expanded', 'true');
    el.navButton.setAttribute('aria-label', 'Fechar boards');
  }

  function closeDrawer() {
    el.railLeft.classList.remove('is-open');
    el.navScrim.hidden = true;
    el.navButton.setAttribute('aria-expanded', 'false');
    el.navButton.setAttribute('aria-label', 'Abrir boards');
  }

  function applyRailState(hidden) {
    document.body.classList.toggle('rail-hidden', hidden);
    el.navButton.setAttribute('aria-expanded', hidden ? 'false' : 'true');
    el.navButton.setAttribute('aria-label', hidden ? 'Mostrar boards' : 'Recolher boards');
    el.navButton.setAttribute('title', hidden ? 'Mostrar boards' : 'Recolher boards');
  }

  el.navButton.addEventListener('click', function () {
    if (isMobile()) {
      if (el.railLeft.classList.contains('is-open')) closeDrawer(); else openDrawer();
      return;
    }
    var hidden = !document.body.classList.contains('rail-hidden');
    applyRailState(hidden);
    S.state.settings.railHidden = hidden;
    S.save();
  });

  el.navScrim.addEventListener('click', closeDrawer);

  /* teclado */

  document.addEventListener('keydown', function (event) {
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (event.key === '/' && !typing) {
      event.preventDefault();
      el.search.focus();
      el.search.select();
    }
    if (event.key === 'n' && !typing && !event.ctrlKey && !event.metaKey && !el.composer.open) {
      event.preventDefault();
      openComposer();
    }
  });

  /* ---------------- boot ---------------- */

  function readParams() {
    var params = new URLSearchParams(location.search);
    var q = params.get('q');
    if (q) { view.query = q; el.search.value = q; }
    /* Perfil aberto pela URL (?perfil=id): mostra os posts daquela pessoa. */
    var perfil = params.get('perfil');
    if (perfil) view.author = perfil;
    var board = params.get('board');
    if (board && (board === 'todos' || Beam.boards.some(function (b) { return b.id === board; }))) {
      view.board = board;
    }
    var editId = params.get('edit');
    if (editId) { view.editingPostId = editId; }
    return params.get('compose') === '1';
  }

  function init() {
    S.init();
    applyTheme(S.state.settings.theme || 'dark');
    /* Perfis e cores do site (módulo compartilhado com a página do post). */
    Beam.profile.init();

    /* O scroll nativo do navegador sobrescreveria a posicao restaurada. */
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

    el.fBoard.innerHTML = Beam.boards.map(function (b) {
      return '<option value="' + b.id + '">' + U.escape(b.name) + '</option>';
    }).join('');

    /* Onde o usuario estava no feed antes de abrir um post. */
    var memory = restoreFeedMemory();

    var compose = readParams();

    // Restaurar modo de visualização salvo (feed ou grid)
    if (!memory) {
      var savedMode = S.state.settings.viewMode;
      if (savedMode === 'feed' || savedMode === 'grid') {
        view.mode = savedMode;
      }
    }
    document.querySelectorAll('.segmented__btn[data-view]').forEach(function (btn) {
      var on = btn.getAttribute('data-view') === view.mode;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });

    renderBoards();
    renderYouNav();
    renderTags();
    renderFeed();
    renderSpotlight();
    syncTabs();

    if (memory && memory.scrollY > 0) {
      restoreScroll(memory.scrollY);
      window.addEventListener('load', function () { restoreScroll(memory.scrollY); }, { once: true });
    }

    if (!isMobile()) {
      applyRailState(S.state.settings.railHidden !== false);
    } else {
      closeDrawer();
    }

    if (compose) setTimeout(openComposer, 180);
    if (view.editingPostId) setTimeout(function () { editPost(view.editingPostId); }, 180);
  }

  /* Outra aba publicou ou excluiu algo: redesenha o feed. */
  window.addEventListener('beam:state-changed', function () {
    renderBoards();
    renderYouNav();
    renderTags();
    renderFeed();
    renderSpotlight();
    Beam.profile.renderProfileUI();
  });

  /* O banco compartilhado devolveu conteúdo novo: redesenha tudo. */
  window.addEventListener('beam:remote-changed', function () {
    renderBoards();
    renderYouNav();
    renderTags();
    renderFeed();
    renderSpotlight();
    Beam.profile.renderProfileUI();
  });

  /* O perfil mudou nesta aba (criou, editou, trocou ou excluiu). */
  window.addEventListener('beam:profile-changed', function () {
    renderYouNav();
    renderBoards();
    renderFeed();
  });

  /* Ao rolar, novos cards de vídeo entram na tela: confere se algum
     deles ficou com a miniatura preta. */
  var repairScrollTimer = null;
  window.addEventListener('scroll', function () {
    if (repairScrollTimer) return;
    repairScrollTimer = setTimeout(function () {
      repairScrollTimer = null;
      repairVideoPosters();
    }, 400);
  }, { passive: true });

  init();
})();
