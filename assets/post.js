/* Beam - pagina individual de post */

(function () {
  'use strict';

  var U = Beam.util;
  var S = Beam.store;

  var root = document.getElementById('postRoot');
  var toastEl = document.getElementById('toast');
  var toastTimer = null;

  var postId = readId();
  var replyTo = null;
  var editingCommentId = null;
  /* Respostas comecam recolhidas. O valor aqui so existe quando o usuario
     mexe no botao: false = aberto a mao, true = fechado a mao. */
  var collapsedReplies = {};

  var commentsPerPage = 10;
  var commentCurrentPage = 1;
  /* A partir deste nivel as respostas param de inclinar para dentro. */
  var MAX_REPLY_DEPTH = 3;

  /* O perfil em uso: define quem pode editar o que e assina os comentarios.
     Sem perfil (visitante) devolve null — nada e editado por ninguem. */
  function currentAccountId() {
    var profile = S.currentProfile();
    return profile ? profile.id : null;
  }

  /* Um comentario com respostas esta recolhido por padrao; so fica aberto
     se o usuario abriu explicitamente. */
  function isCollapsed(comment) {
    if (!comment) return false;
    if (!U.countReplies(comment)) return false;
    return collapsedReplies[comment.id] !== false;
  }

  /* Procura um comentario (e suas respostas) dentro do post. */
  function findComment(list, id) {
    var out = null;
    (list || []).forEach(function (c) {
      if (out) return;
      if (c.id === id) { out = c; return; }
      if (c.replies && c.replies.length) out = findComment(c.replies, id);
    });
    return out;
  }

  /* Abre todos os fios acima de um comentario, para o usuario enxergar
     aquilo que esta respondendo. */
  function expandAncestors(commentId) {
    var post = findPost(postId);
    if (!post) return;
    var path = [];
    (function walk(list, ancestors) {
      (list || []).forEach(function (c) {
        if (path.length) return;
        if (c.id === commentId) { path = ancestors.slice(); return; }
        if (c.replies && c.replies.length) walk(c.replies, ancestors.concat([c.id]));
      });
    })(post.comments || [], []);
    path.forEach(function (id) { collapsedReplies[id] = false; });
  }

  function readId() {
    var params = new URLSearchParams(location.search);
    if (params.get('id')) return params.get('id');
    if (location.hash.indexOf('#post-') === 0) return location.hash.replace('#post-', '');
    return null;
  }

  function icon(id, cls) {
    return '<svg class="icon ' + (cls || '') + '"><use href="#' + id + '"/></svg>';
  }

  function toast(message, isError) {
    toastEl.textContent = message;
    toastEl.classList.toggle('is-error', !!isError);
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 3600);
  }

  function findPost(id) {
    for (var i = 0; i < S.state.posts.length; i++) {
      if (S.state.posts[i].id === id) return S.state.posts[i];
    }
    return null;
  }

  /* Pontuação: base + votos de todo mundo (quando há banco compartilhado). */
  function scoreOf(post) {
    return S.score(post);
  }

  function isSaved(id) {
    return S.state.saved.indexOf(id) !== -1;
  }

  function commentScore(comment) {
    return S.commentScore(comment);
  }

  function sortComments(list) {
    return (list || []).slice().sort(function (a, b) {
      var diff = commentScore(b) - commentScore(a);
      if (diff !== 0) return diff;
      return a.createdAt - b.createdAt;
    });
  }

  /* Achata um fio: comentario e suas respostas, na ordem em que aparecem.
     Guarda tambem os ancestrais, para saber o que esta recolhido. */
  function flattenThread(list, parent, ancestors) {
    var out = [];
    sortComments(list).forEach(function (c) {
      out.push({ comment: c, parent: parent || null, ancestors: ancestors || [] });
      if (c.replies && c.replies.length) {
        out = out.concat(flattenThread(c.replies, c, (ancestors || []).concat([c.id])));
      }
    });
    return out;
  }

  /* Monta as paginas de comentarios: cada pagina comporta ate 10 comentarios
     de topo. As respostas nao entram na conta da pagina — elas viajam
     inteiras com o comentario que respondem, entao dois comentarios com
     muitas respostas ainda cabem numa pagina so. */
  function commentPages(comments) {
    var roots = sortComments(comments);
    var pages = [];
    for (var i = 0; i < roots.length; i += commentsPerPage) {
      pages.push(roots.slice(i, i + commentsPerPage));
    }
    return pages.length ? pages : [[]];
  }

  function slidesHTML(post) {
    if (!post.slides || !post.slides.length) return '';
    /* Slide sem imagem e sem texto nao tem o que mostrar: some da pagina
       em vez de virar uma caixa vazia. */
    var useful = post.slides.filter(function (s) {
      return (s.media && s.media.id) || (s.body && String(s.body).trim());
    });
    if (!useful.length) return '';
    var items = useful.map(function (s) {
      var img = '';
      if (s.media && s.media.id) {
        img = '<div class="slide__preview"><img alt="Exemplo do slide" src="" data-media-id="' + s.media.id + '"></div>';
      }
      return '<div class="slide-card' + (img ? '' : ' slide-card--text-only') + '">' +
        img +
        '<div class="slide__text-body">' + U.escape(s.body || '') + '</div>' +
      '</div>';
    }).join('');
    return '<div class="slides">' + items + '</div>';
  }

  function mediaHTML(post) {
    var media = post.media || [];
    if (!media.length) return '';
    var m = media[0];
    if (m.type === 'video') {
      var posterAttr = m.poster ? ' poster="' + m.poster + '"' : '';
      var videoSrc = m.id ? ' data-media-id="' + U.escape(m.id) + '"' : '';
      var posterId = m.posterId ? ' data-poster-id="' + U.escape(m.posterId) + '"' : '';
      return '<figure class="postpage__media postpage__media--video">' +
        '<video class="post__video" controls playsinline preload="metadata"' + posterAttr + posterId + videoSrc + '></video>' +
        '</figure>';
    }
    var imgSrc = m.poster
      ? ' src="' + m.poster + '"'
      : (m.id ? ' data-media-id="' + U.escape(m.id) + '"' : '');
    return '<figure class="postpage__media"><img alt="Mídia do post: ' + U.escape(post.title) + '"' + imgSrc + '></figure>';
  }

  function hydrateMedia() {
    var nodes = document.querySelectorAll('img[data-media-id], video[data-media-id]');
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

  /* Monta a arvore de comentarios da pagina atual: cada resposta fica
     dentro do comentario que ela responde, para o recuo deixar claro
     a hierarquia. */
  function buildCommentTree(items) {
    var nodes = {};
    var roots = [];
    items.forEach(function (it) {
      var node = { comment: it.comment, children: [], depth: 0 };
      nodes[it.comment.id] = node;
      if (it.parent && nodes[it.parent.id]) {
        var parent = nodes[it.parent.id];
        parent.children.push(node);
        node.depth = parent.depth + 1;
      } else {
        roots.push(node);
      }
    });
    return roots;
  }

  /* A partir do quarto nivel as respostas param de inclinar: ficariam
     sempre mais para dentro e quebrariam a simetria da pagina. */
  function depthClass(depth) {
    if (!depth) return '';
    if (depth > MAX_REPLY_DEPTH) return ' comment--dflat';
    return ' comment--d' + depth;
  }

  function commentHTML(comment, post, children, depth) {
    var user = U.user(comment.author);
    var mine = comment.author === currentAccountId();
    var guest = !currentAccountId();
    var vote = (S.state.commentVotes || {})[comment.id] || 0;
    var score = commentScore(comment);
    var editing = editingCommentId === comment.id;
    var replyTotal = U.countReplies(comment);
    var collapsed = isCollapsed(comment);
    var isReply = depth > 0;

    var avatarInner = U.isImageData(user.avatarImage)
      ? '<img src="' + U.escape(user.avatarImage) + '" alt="">'
      : '<svg class="icon"><use href="#i-av-' + U.avatarIcon(user) + '"/></svg>';

    var html = '<div class="comment' + (editing ? ' is-editing' : '') + (isReply ? ' comment--reply' + depthClass(depth) : '') + '" data-comment="' + U.escape(comment.id) + '">' +
      '<span class="comment__who" style="--av:' + (user.hue || '#9FB6B4') + '">' +
        avatarInner + '</span>' +
      '<div>' +
        '<div class="comment__head">' +
        (isReply ? '<span class="comment__branch" aria-hidden="true">↳</span>' : '') +
        '<b>' + U.escape(user.name) + '</b>' +
        '<time datetime="' + new Date(comment.createdAt).toISOString() + '" title="' + U.escape(U.dateLongBR(comment.createdAt)) + '">' +
          U.escape(U.dateBR(comment.createdAt)) +
        '</time>' +
        (comment.editedAt ? '<em class="comment__edited">editado</em>' : '') + '</div>' +
        (editing
          ? editForm(comment)
          : '<p class="comment__text">' + U.escape(comment.body) + '</p>') +
        '<div class="comment__tools">' +
          '<span class="comment__score">' +
            '<button class="vote vote--sm vote--up' + (vote === 1 ? ' is-on' : '') + (guest ? ' is-locked' : '') + '" data-action="vote-comment" data-dir="1" data-comment="' + U.escape(comment.id) + '" aria-label="Votar a favor do comentario"' + (guest ? ' title="Crie um perfil para votar"' : '') + '>' + icon('i-up') + '</button>' +
            '<span>' + score + '</span>' +
            '<button class="vote vote--sm vote--down' + (vote === -1 ? ' is-on' : '') + (guest ? ' is-locked' : '') + '" data-action="vote-comment" data-dir="-1" data-comment="' + U.escape(comment.id) + '" aria-label="Votar contra o comentario"' + (guest ? ' title="Crie um perfil para votar"' : '') + '>' + icon('i-down') + '</button>' +
          '</span>' +
          (!guest
            ? '<button class="act" data-action="reply" data-comment="' + U.escape(comment.id) + '">Responder</button>'
            : '') +
          (replyTotal
            ? '<button class="act act--replies' + (collapsed ? ' is-collapsed' : '') + '" data-action="toggle-replies" data-comment="' + U.escape(comment.id) + '" aria-expanded="' + (collapsed ? 'false' : 'true') + '">' +
              '<svg class="icon"><use href="#i-chevron"/></svg>' +
              '<span>' + replyTotal + (replyTotal === 1 ? ' resposta' : ' respostas') + '</span>' +
            '</button>'
            : '') +
          (mine && !editing
            ? '<button class="act" data-action="edit-comment" data-comment="' + U.escape(comment.id) + '">' + icon('i-text') + 'Editar</button>'
            : '') +
          (mine ? '<button class="act act--danger" data-action="delete-comment" data-comment="' + U.escape(comment.id) + '">' + icon('i-trash') + 'Excluir</button>' : '') +
        '</div>' +
        (replyTo === comment.id ? replyForm(comment.id) : '') +
        (children && children.length
          ? '<div class="comment__reply">' + children.map(function (child) {
              return commentHTML(child.comment, post, child.children, child.depth);
            }).join('') + '</div>'
          : '') +
      '</div>' +
    '</div>';

    return html;
  }

  /* Formulario de edicao inline do comentario. */
  function editForm(comment) {
    return '<form class="comment-form comment-form--edit" data-edit-for="' + U.escape(comment.id) + '">' +
      '<textarea name="edit" rows="3" required>' + U.escape(comment.body) + '</textarea>' +
      '<div class="comment-form__foot">' +
        '<button type="button" class="act" data-action="cancel-edit-comment">Cancelar</button>' +
        '<button type="submit" class="btn btn--primary">Salvar</button>' +
      '</div>' +
    '</form>';
  }

  function replyForm(commentId) {
    return '<form class="comment-form" data-reply-for="' + U.escape(commentId) + '">' +
      '<textarea name="reply" rows="2" placeholder="Escreva uma resposta" required></textarea>' +
      '<div class="comment-form__foot">' +
        '<button type="button" class="act" data-action="cancel-reply">Cancelar</button>' +
        '<button type="submit" class="btn btn--primary">Responder</button>' +
      '</div>' +
    '</form>';
  }

  function renderNotFound() {
    root.innerHTML = '<div class="notfound">' +
      '<h1>Este post nao existe mais</h1>' +
      '<p>Ele pode ter sido excluido ou o link pode estar errado.</p>' +
      '<a class="btn btn--primary" href="index.html">Voltar ao feed</a>' +
      '</div>';
  }

  function render() {
    var post = findPost(postId);
    if (!post) { renderNotFound(); return; }

    var board = U.board(post.board);
    var user = U.user(post.author);
    var vote = S.state.votes[post.id] || 0;
    var saved = isSaved(post.id);
    var guest = !currentAccountId();
    var comments = post.comments || [];
    var commentTotal = U.countComments(post);
    var pages = commentPages(comments);
    var commentTotalPages = pages.length;
    if (commentCurrentPage > commentTotalPages) commentCurrentPage = commentTotalPages;
    if (commentCurrentPage < 1) commentCurrentPage = 1;

    /* Comentarios de topo da pagina atual. As respostas de cada um vem
       junto, inteiras, e so sao escondidas se o usuario recolheu o fio. */
    var pageRoots = pages[commentCurrentPage - 1] || [];
    var pageItems = [];
    pageRoots.forEach(function (root) {
      pageItems = pageItems.concat(flattenThread([root], null, []));
    });
    /* Respostas de um fio recolhido ficam escondidas junto com ele. */
    var visibleItems = pageItems.filter(function (it) {
      for (var i = 0; i < it.ancestors.length; i++) {
        var ancestor = findComment(comments, it.ancestors[i]);
        if (isCollapsed(ancestor)) return false;
      }
      return true;
    });
    var tree = buildCommentTree(visibleItems);
    var commentsHTML = tree.map(function (node) {
      return commentHTML(node.comment, post, node.children, node.depth);
    }).join('');

    document.title = post.title + ' — Tudo Sobre Nada';

    root.innerHTML =
      '<div class="postpage">' +
        '<div class="postpage__meta">' +
          '<a class="board" href="index.html?board=' + U.escape(board.id) + '">' + U.boardIconHTML(board) + U.escape(board.name) + '</a>' +
          '<span class="by">por ' + U.avatarHTML(user, 'avatarchip--sm') +
            ' <a class="by__name" href="index.html?perfil=' + encodeURIComponent(post.author) + '" title="Ver todos os posts de ' + U.escape(user.name) + '">' + U.escape(user.name) + '</a>' +
            ' <small>@' + U.escape(user.username || user.name) + '</small></span>' +
          '<time datetime="' + new Date(post.createdAt).toISOString() + '" title="' + U.escape(U.dateLongBR(post.createdAt)) + '">' +
            U.escape(U.dateBR(post.createdAt)) + '</time>' +
        '</div>' +
        '<h1 style="view-transition-name: post-title">' + U.escape(post.title) + '</h1>' +
        mediaHTML(post) +
        '<p class="postpage__body">' + U.escape(post.body || '') + '</p>' +
        slidesHTML(post) +
        linksHTML(post) +
        '<div class="postpage__actions">' +
          '<span class="vote-group">' +
            '<button class="vote vote--up' + (vote === 1 ? ' is-on' : '') + (guest ? ' is-locked' : '') + '" data-action="vote-up" aria-label="Votar a favor"' + (guest ? ' title="Crie um perfil para votar"' : '') + '>' + icon('i-up') + '</button>' +
            '<span class="vote__score">' + scoreOf(post) + '</span>' +
            '<button class="vote vote--down' + (vote === -1 ? ' is-on' : '') + (guest ? ' is-locked' : '') + '" data-action="vote-down" aria-label="Votar contra"' + (guest ? ' title="Crie um perfil para votar"' : '') + '>' + icon('i-down') + '</button>' +
          '</span>' +
          (guest ? '' :
            '<button class="btn" data-action="save">' + icon('i-bookmark') + (saved ? 'Salvo' : 'Salvar') + '</button>') +
          '<button class="btn" data-action="share">' + icon('i-share') + 'Copiar link</button>' +
          (post.author === currentAccountId()
            ? '<span class="postpage__actions-sep" aria-hidden="true"></span>' +
              '<button class="btn" data-action="edit-post" data-id="' + U.escape(post.id) + '">' + icon('i-text') + 'Editar post</button>' +
              '<button class="btn btn--danger" data-action="delete-post" data-id="' + U.escape(post.id) + '">' + icon('i-trash') + 'Excluir post</button>'
            : '') +
        '</div>' +
      '</div>' +
      '<section class="comments-block" id="comentarios">' +
        '<div class="comments__head"><h3>Comentários</h3><span>' + commentTotal + '</span></div>' +
        (commentTotalPages > 1
          ? '<p class="comments__page">Página ' + commentCurrentPage + ' de ' + commentTotalPages + '</p>'
          : '') +
        (guest
          ? '<div class="comment-guest">' +
              '<p>Para comentar, crie um perfil com seu nome e avatar.</p>' +
              '<button class="btn btn--primary" data-action="create-profile">' + icon('i-user') + ' Criar Perfil</button>' +
            '</div>'
          : '<form class="comment-form" id="commentForm">' +
              '<textarea name="comment" rows="3" placeholder="O que voce aprendeu com isso?" required></textarea>' +
              '<div class="comment-form__foot"><span>Seja específico. Comentários vagos somem.</span>' +
              '<button type="submit" class="btn btn--primary">Comentar</button></div>' +
            '</form>') +
        (commentTotal
          ? '<div class="comments">' + commentsHTML + '</div>' +
            '<nav class="comment-pagination" id="commentPagination" aria-label="Paginacao de comentarios"></nav>'
          : '<p class="post__excerpt">Nenhum comentário ainda. Abra a conversa.</p>') +
      '</section>';

    renderAside(post);
    hydrateMedia();
    repairPoster(post);
    U.zoom(root);
    renderCommentPagination(commentTotal, commentTotalPages);
  }

  /* Refaz a miniatura do vídeo quando ela ficou preta.
     O post volta com a thumbnail nova no lugar. */
  function repairPoster(post) {
    if (!Beam.poster || !post) return;
    Beam.poster.repair(post).then(function (url) {
      if (!url) return;
      var video = document.querySelector('.postpage__media--video video');
      if (video) video.setAttribute('poster', url);
    });
  }

  function linksHTML(post) {
    var links = [];
    if (Array.isArray(post.links) && post.links.length) {
      links = post.links;
    } else if (post.link) {
      links = [{ url: post.link, label: U.linkName(post.link) }];
    }
    if (!links.length) return '';
    var items = links.map(function (l) {
      var url = String(l.url || '').trim();
      if (!url) return '';
      var label = l.label || U.linkName(url);
      return '<a class="btn btn--ghost material-link" href="' + U.escape(url) + '" target="_blank" rel="noopener">' +
        icon('i-link') + '<span>' + U.escape(label) + '</span></a>';
    }).filter(Boolean);
    if (!items.length) return '';
    return '<div class="materials"><h3 class="materials__title">Material de apoio</h3>' +
      '<div class="materials__list">' + items.join('') + '</div></div>';
  }

  function renderAside(post) {
    var board = U.board(post.board);
    var related = S.state.posts
      .filter(function (p) { return p.id !== post.id && p.board === post.board; })
      .sort(function (a, b) { return scoreOf(b) - scoreOf(a); })
      .slice(0, 4);

    var html =
      '<section class="related">' +
        '<h2>Mais em ' + U.boardIconHTML(board) + U.escape(board.name) + '</h2>' +
        '<ul>' +
          (related.length
            ? related.map(function (p) {
                return '<li><a href="post.html?id=' + encodeURIComponent(p.id) + '"><b>' + U.escape(p.title) + '</b>' +
                  '<small>' + scoreOf(p) + ' pontos · ' + (p.comments || []).length + ' comentários</small></a></li>';
              }).join('')
            : '<li><a href="index.html?board=' + U.escape(board.id) + '"><b>Ver o board completo</b><small>' + U.escape(board.desc || '') + '</small></a></li>') +
        '</ul>' +
      '</section>';

    var host = document.getElementById('postRelated');
    if (host) host.innerHTML = html;
  }

  function scrollToComments() {
    var block = document.querySelector('.comments-block');
    if (!block) return;
    var top = block.getBoundingClientRect().top + window.pageYOffset - 24;
    if (window.scrollY > top - 8) window.scrollTo({ top: top, behavior: 'smooth' });
  }

  /* Vai direto para a conversa, sem animacao — usado quando o post e
     aberto pelo botao de comentarios do feed (#comentarios). */
  function jumpToComments() {
    var block = document.querySelector('.comments-block');
    if (!block) return;
    var top = block.getBoundingClientRect().top + window.pageYOffset - 24;
    if (top < 0) top = 0;
    window.scrollTo(0, top);
  }

  function renderCommentPagination(total, totalPages) {
    var container = document.getElementById('commentPagination');
    if (!container) return;
    if (totalPages <= 1) {
      container.hidden = true;
      container.innerHTML = '';
      return;
    }
    container.hidden = false;
    var html = '';
    html += '<button class="btn btn--ghost' + (commentCurrentPage === 1 ? ' disabled' : '') + '" data-action="comment-prev" data-page="' + (commentCurrentPage - 1) + '">‹ Anterior</button> ';
    for (var i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= commentCurrentPage - 1 && i <= commentCurrentPage + 1)) {
        html += '<button class="btn btn--ghost' + (commentCurrentPage === i ? ' is-active' : '') + '" data-action="comment-page" data-page="' + i + '">' + i + '</button> ';
      } else if (i === commentCurrentPage - 2 || i === commentCurrentPage + 2) {
        html += '<span class="btn btn--ghost disabled">…</span> ';
      }
    }
    html += '<button class="btn btn--ghost' + (commentCurrentPage === totalPages ? ' disabled' : '') + '" data-action="comment-next" data-page="' + (commentCurrentPage + 1) + '">Próximo ›</button>';
    container.innerHTML = html;
  }

  function vote(dir) {
    var post = findPost(postId);
    if (!post) return;
    /* Sem perfil a pessoa só lê: não vota. */
    if (!currentAccountId()) {
      toast('Crie um perfil para votar.', true);
      return;
    }
    var current = S.state.votes[post.id] || 0;
    S.state.votes[post.id] = current === dir ? 0 : dir;
    if (!S.state.votes[post.id]) delete S.state.votes[post.id];
    S.save();
    /* O voto vai para o banco compartilhado. */
    S.syncVote(post.id, S.state.votes[post.id] || 0);
    render();
  }

  function voteComment(commentId, dir) {
    if (!currentAccountId()) {
      toast('Crie um perfil para votar.', true);
      return;
    }
    if (!S.state.commentVotes) S.state.commentVotes = {};
    var current = S.state.commentVotes[commentId] || 0;
    S.state.commentVotes[commentId] = current === dir ? 0 : dir;
    if (!S.state.commentVotes[commentId]) delete S.state.commentVotes[commentId];
    S.save();
    S.syncCommentVote(commentId, S.state.commentVotes[commentId] || 0);
    render();
  }

  function toggleSave() {
    if (!currentAccountId()) {
      toast('Crie um perfil para salvar favoritos.', true);
      return;
    }
    var index = S.state.saved.indexOf(postId);
    if (index === -1) S.state.saved.push(postId); else S.state.saved.splice(index, 1);
    S.save();
    render();
    toast(index === -1 ? 'Post salvo na sua lista.' : 'Post removido da sua lista.');
  }

  /* Marca ou desmarca um perfil como favorito. */
  function toggleFavoriteProfile(id) {
    if (!currentAccountId()) {
      toast('Crie um perfil para favoritar perfis.', true);
      return;
    }
    var result = S.toggleFavoriteProfile(id);
    var author = U.user(id);
    toast(result.favorite
      ? author.name + ' está nos seus perfis favoritos.'
      : author.name + ' saiu dos seus perfis favoritos.');
    /* Atualiza o coração do painel de busca, se estiver aberto. */
    if (searchPanel && !searchPanel.hidden) renderSearchResults();
  }

  function share() {
    var url = location.origin + location.pathname + '?id=' + encodeURIComponent(postId);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () { toast('Link copiado.'); }, function () { toast(url); });
    } else {
      toast(url);
    }
  }

  function deletePost() {
    var post = findPost(postId);
    if (!post) return;
    if (!confirm('Excluir este post? Essa ação não pode ser desfeita.')) return;
    (post.media || []).forEach(function (m) {
      S.removeMedia(m.id);
      if (m.posterId) S.removeMedia(m.posterId);
    });
    S.removePost(post.id);
    Beam.profile.navigateTo('index.html');
  }

  function addComment(body, parentId) {
    var post = findPost(postId);
    if (!post) return;
    var author = currentAccountId();
    /* Visitante não comenta: é preciso ter um perfil. */
    if (!author) {
      toast('Crie um perfil para comentar.', true);
      Beam.profile.openProfilesDialog();
      return;
    }
    post.comments = post.comments || [];
    var comment = { id: U.uid('c'), author: author, body: body, createdAt: Date.now() };
    if (parentId) {
      var parent = findComment(post.comments, parentId);
      if (parent) {
        parent.replies = parent.replies || [];
        parent.replies.push(comment);
      }
    } else {
      post.comments.push(comment);
    }
    S.save();
    /* O comentário vai para o banco compartilhado: todo mundo lê. */
    S.syncComment(post.id, comment, parentId || null);
  }

  function findComment(list, id) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
      if (list[i].replies) {
        var found = findComment(list[i].replies, id);
        if (found) return found;
      }
    }
    return null;
  }

  /* Descobre de quem é a resposta: o banco guarda o pai direto. */
  function findParentId(list, id, parentId) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return parentId || null;
      if (list[i].replies) {
        var found = findParentId(list[i].replies, id, list[i].id);
        if (found !== undefined) return found;
      }
    }
    return undefined;
  }

  /* Remove um comentario em qualquer nivel (topo ou resposta). */
  function removeComment(list, id) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        list.splice(i, 1);
        return true;
      }
      if (list[i].replies && removeComment(list[i].replies, id)) return true;
    }
    return false;
  }

  document.addEventListener('click', function (event) {
    var target = event.target.closest('[data-action]');
    if (!target) return;
    var action = target.getAttribute('data-action');

    if (action === 'vote-up') { vote(1); }
    else if (action === 'vote-down') { vote(-1); }
    else if (action === 'vote-comment') { voteComment(target.getAttribute('data-comment'), Number(target.getAttribute('data-dir'))); }
    else if (action === 'save') { toggleSave(); }
    else if (action === 'favorite-profile') { toggleFavoriteProfile(target.getAttribute('data-id')); }
    else if (action === 'create-profile') { Beam.profile.openProfilesDialog(); }
    else if (action === 'share') { share(); }
    else if (action === 'delete-post') { deletePost(); }
    else if (action === 'edit-post') { Beam.profile.navigateTo('index.html?edit=' + encodeURIComponent(postId)); }
    else if (action === 'play') {
      var video = document.querySelector('.post__video');
      if (video && video.src) {
        video.play();
      } else {
        toast('Este post usa um arquivo de exemplo: o vídeo original não está no repositório.');
      }
    }
    else if (action === 'reply') {
      replyTo = target.getAttribute('data-comment');
      /* Abre os fios acima para o formulario ficar a vista. */
      expandAncestors(replyTo);
      render();
      var field = document.querySelector('[data-reply-for] textarea');
      if (field) field.focus();
    }
    else if (action === 'cancel-reply') {
      replyTo = null;
      render();
    }
    else if (action === 'edit-comment') {
      editingCommentId = target.getAttribute('data-comment');
      render();
      var editField = document.querySelector('[data-edit-for] textarea');
      if (editField) {
        editField.focus();
        editField.setSelectionRange(editField.value.length, editField.value.length);
      }
    }
    else if (action === 'cancel-edit-comment') {
      editingCommentId = null;
      render();
    }
    else if (action === 'toggle-replies') {
      var toggleId = target.getAttribute('data-comment');
      var togglePost = findPost(postId);
      var toggleComment = togglePost ? findComment(togglePost.comments, toggleId) : null;
      /* Por padrao esta recolhido: o botao abre, e a partir dai o usuario
         escolhe se mantem aberto ou fecha de novo. */
      collapsedReplies[toggleId] = isCollapsed(toggleComment) ? false : true;
      render();
    }
    else if (action === 'delete-comment') {
      var post = findPost(postId);
      if (!post || !post.comments) return;
      var deletedId = target.getAttribute('data-comment');
      removeComment(post.comments, deletedId);
      S.save();
      /* Some também do banco compartilhado. */
      S.syncDeleteComment(deletedId);
      commentCurrentPage = 1;
      editingCommentId = null;
      render();
      toast('Comentário excluído.');
    }
    else if (action === 'comment-prev') {
      var page = Number(target.getAttribute('data-page'));
      if (page >= 1) { commentCurrentPage = page; render(); scrollToComments(); }
    }
    else if (action === 'comment-page') {
      var page = Number(target.getAttribute('data-page'));
      if (page >= 1) { commentCurrentPage = page; render(); scrollToComments(); }
    }
    else if (action === 'comment-next') {
      var page = Number(target.getAttribute('data-page'));
      commentCurrentPage = page;
      render();
      scrollToComments();
    }
  });

  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (form.id === 'commentForm') {
      event.preventDefault();
      var text = form.comment.value.trim();
      if (!text) return;
      addComment(text, null);
      commentCurrentPage = 1;
      render();
      scrollToComments();
      toast('Comentário publicado.');
    } else if (form.hasAttribute('data-reply-for')) {
      event.preventDefault();
      var replyText = form.reply.value.trim();
      if (!replyText) return;
      var parentId = form.getAttribute('data-reply-for');
      addComment(replyText, parentId);
      replyTo = null;
      /* Revela a resposta recem-publicada e todos os fios acima dela. */
      collapsedReplies[parentId] = false;
      expandAncestors(parentId);
      render();
      toast('Resposta publicada.');
    } else if (form.hasAttribute('data-edit-for')) {
      event.preventDefault();
      var editId = form.getAttribute('data-edit-for');
      var newText = form.edit.value.trim();
      if (!newText) {
        toast('O comentário não pode ficar vazio.', true);
        return;
      }
      var targetPost = findPost(postId);
      if (!targetPost) return;
      var comment = findComment(targetPost.comments || [], editId);
      if (!comment || comment.author !== currentAccountId()) {
        toast('Você só pode editar seus próprios comentários.', true);
        editingCommentId = null;
        render();
        return;
      }
      if (comment.body === newText) {
        editingCommentId = null;
        render();
        return;
      }
      comment.body = newText;
      comment.editedAt = Date.now();
      S.save();
      /* Atualiza também no banco compartilhado. */
      S.syncComment(postId, comment, findParentId(targetPost.comments || [], editId));
      editingCommentId = null;
      render();
      toast('Comentário atualizado.');
    }
  });

  document.getElementById('themeToggle').addEventListener('click', function () {
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    S.state.settings.theme = next;
    S.save();
  });

  /* ---------------- busca de perfis ---------------- */

  var searchInput = document.getElementById('searchInput');
  var searchPanel = document.getElementById('searchResults');
  var searchActive = -1;

  function renderSearchResults() {
    if (!searchPanel || !searchInput) return;
    var query = searchInput.value.trim();
    var list = Beam.profile.matchingAuthors(query);
    searchActive = -1;
    searchPanel.innerHTML = Beam.profile.authorsPanelHTML(list, query, !Beam.profile.isGuest());
    searchPanel.hidden = false;
    searchInput.setAttribute('aria-expanded', 'true');
  }

  function hideSearchResults() {
    if (!searchPanel) return;
    searchPanel.hidden = true;
    searchActive = -1;
    if (searchInput) searchInput.setAttribute('aria-expanded', 'false');
  }

  if (searchInput) {
    searchInput.addEventListener('input', renderSearchResults);
    searchInput.addEventListener('focus', renderSearchResults);
    searchInput.addEventListener('blur', function () { setTimeout(hideSearchResults, 160); });
    searchInput.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') { hideSearchResults(); searchInput.blur(); return; }
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
  }

  /* Escolher um perfil leva para o feed com os posts daquela pessoa. */
  if (searchPanel) {
    searchPanel.addEventListener('click', function (event) {
      var row = event.target.closest('[data-action="open-profile"]');
      if (!row) return;
      Beam.profile.navigateTo('index.html?perfil=' + encodeURIComponent(row.getAttribute('data-id')));
    });
    document.addEventListener('click', function (event) {
      var box = document.getElementById('searchForm');
      if (box && !box.contains(event.target)) hideSearchResults();
    });
  }

  document.getElementById('searchForm').addEventListener('submit', function (event) {
    event.preventDefault();
    /* Enter escolhe o perfil destacado no painel. */
    var rows = searchPanel ? searchPanel.querySelectorAll('.searchrow') : [];
    if (searchActive >= 0 && rows[searchActive]) {
      var open = rows[searchActive].querySelector('.searchrow__open');
      if (open) open.click();
      return;
    }
    var query = document.getElementById('searchInput').value.trim();
    Beam.profile.navigateTo('index.html?q=' + encodeURIComponent(query));
  });

  S.init();
  document.documentElement.setAttribute('data-theme', S.state.settings.theme || 'dark');
  /* Perfis e cores do site: os mesmos controles do feed, dentro do post. */
  Beam.profile.init();
  render();

  /* O perfil mudou nesta aba: o post e redesenhado (dono dos comentarios, avatar). */
  window.addEventListener('beam:profile-changed', function () {
    render();
  });

  /* Link vindo do feed com #comentarios: cai direto na conversa. */
  if (location.hash === '#comentarios') {
    requestAnimationFrame(function () { jumpToComments(); });
    /* Refaz o ajuste quando as imagens terminarem de carregar, para o
       destino nao sair de lugar. */
    window.addEventListener('load', function () { jumpToComments(); });
  }

  /* Outra aba mudou o estado: redesenha o post. */
  window.addEventListener('beam:state-changed', function () {
    render();
  });

  /* O banco compartilhado devolveu conteúdo novo: redesenha o post. */
  window.addEventListener('beam:remote-changed', function () {
    render();
  });
})();
