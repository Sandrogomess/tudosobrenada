/* Beam — compositor de posts (publicar e editar).
   Fica num modulo proprio porque as duas paginas precisam dele:
   o feed publica e a pagina do post edita sem sair do lugar. */

(function (global) {
  'use strict';

  var U = Beam.util;
  var S = Beam.store;

  var DIALOG_ID = 'composerDialog';

  /* Estado do compositor. O post em edicao mora aqui: as duas paginas
     compartilham o mesmo modulo, nao o mesmo estado. */
  var state = {
    pendingMedia: [],
    slides: [],
    editingPostId: null,
    wired: false
  };

  var el = {};
  var toastTimer = null;

  /* ---------------- utilidades ---------------- */

  function icon(id, cls) {
    return '<svg class="icon ' + (cls || '') + '"><use href="#' + id + '"/></svg>';
  }

  function toast(message, isError) {
    var node = document.getElementById('toast');
    if (!node) return;
    node.textContent = message;
    node.classList.toggle('is-error', !!isError);
    node.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { node.hidden = true; }, 3600);
  }

  function currentProfile() { return Beam.profile.currentProfile(); }

  function isGuest() { return Beam.profile.isGuest(); }

  function findPost(id) {
    for (var i = 0; i < S.state.posts.length; i++) {
      if (S.state.posts[i].id === id) return S.state.posts[i];
    }
    return null;
  }

  /* ---------------- markup ----------------
     O dialogo e criado por JS: assim o feed e a pagina do post usam
     exatamente o mesmo compositor, sem copiar o HTML duas vezes. */

  var MARKUP = [
    '<dialog class="sheet composer" id="composerDialog" aria-labelledby="composerTitle">',
    '  <form method="dialog" class="sheet__head">',
    '    <h2 id="composerTitle">Publicar no Tudo Sobre Nada</h2>',
    '    <button class="icon-btn" value="cancel" aria-label="Fechar"><svg class="icon"><use href="#i-close"/></svg></button>',
    '  </form>',
    '',
    '  <form class="composer__form" id="composerForm" novalidate>',
    '    <label class="field">',
    '      <span class="field__label">Título</span>',
    '      <input id="fTitle" name="title" type="text" maxlength="140" placeholder="Ex.: Como filmei uma interview sem NVR e sem perder a luz" required>',
    '      <span class="field__hint" data-hint="title">0/140</span>',
    '    </label>',
    '',
    '    <div class="field">',
    '      <span class="field__label">Mídia de capa (feed)</span>',
    '      <label class="dropzone" id="dropzone">',
    '        <input type="file" id="fMedia" accept="image/*,video/*" multiple hidden>',
    '        <svg class="icon"><use href="#i-upload"/></svg>',
    '        <span class="dropzone__title">Arraste arquivos ou clique para escolher</span>',
    '        <span class="dropzone__hint">Imagem ou vídeo de capa. até 25 MB por arquivo.</span>',
    '      </label>',
    '      <ul class="media-list" id="mediaList"></ul>',
    '    </div>',
    '',
    '    <label class="field">',
    '      <span class="field__label">Resumo (excerto)</span>',
    '      <textarea id="fBody" name="body" rows="3" placeholder="Primeira frase que aparece no feed e na lista de posts."></textarea>',
    '    </label>',
    '',
    '    <div class="field-row">',
    '      <label class="field">',
    '        <span class="field__label">Board</span>',
    '        <select id="fBoard" name="board"></select>',
    '      </label>',
    '      <label class="field">',
    '        <span class="field__label">Tags</span>',
    '        <input id="fTags" name="tags" type="text" placeholder="iluminação, color-grading">',
    '        <span class="field__hint">separe por vírgula</span>',
    '      </label>',
    '    </div>',
    '',
    '    <div class="slides" id="slides">',
    '      <div class="slides__toolbar">',
    '        <button type="button" class="btn btn--primary btn--small" id="addSlide">',
    '          <svg class="icon"><use href="#i-plus"/></svg>',
    '          <span>Adicionar slide</span>',
    '        </button>',
    '        <span class="slides__count" id="slidesCount">1 slide</span>',
    '      </div>',
    '      <div class="slides__list" id="slidesList"></div>',
    '    </div>',
    '',
    '    <div class="field" id="linkField">',
    '      <span class="field__label">Links de apoio (opcional)</span>',
    '      <div class="links-editor">',
    '        <div class="links-editor__row">',
    '          <input type="url" id="fLink" name="link" placeholder="https://youtube.com/watch?v=..." data-link-input>',
    '          <button type="button" class="act act--danger" data-action="remove-link" aria-label="Remover link">',
    '            <svg class="icon"><use href="#i-trash"/></svg>',
    '          </button>',
    '        </div>',
    '      </div>',
    '      <button type="button" class="btn btn--ghost links-editor__add" data-action="add-link">',
    '        <svg class="icon"><use href="#i-plus"/></svg> Adicionar outro link',
    '      </button>',
    '      <span class="field__hint">O nome do material é identificado automaticamente (YouTube, GitHub, Figma...).</span>',
    '    </div>',
    '',
    '    <p class="form-error" id="formError" role="alert" hidden></p>',
    '',
    '    <div class="composer__foot">',
    '      <button type="button" class="btn btn--ghost" data-close-composer>Cancelar</button>',
    '      <button type="submit" class="btn btn--primary" id="publishBtn">Publicar</button>',
    '    </div>',
    '  </form>',
    '</dialog>'
  ].join('\n');

  /* Cria o dialogo (uma vez) e guarda os elementos usados no dia a dia. */
  function ensure() {
    if (state.wired) return el;

    var dialog = document.getElementById(DIALOG_ID);
    if (!dialog) {
      var holder = document.createElement('div');
      holder.innerHTML = MARKUP;
      dialog = holder.firstElementChild;
      document.body.appendChild(dialog);
    }

    el.composer = dialog;
    el.composerForm = document.getElementById('composerForm');
    el.mediaList = document.getElementById('mediaList');
    el.dropzone = document.getElementById('dropzone');
    el.fileInput = document.getElementById('fMedia');
    el.formError = document.getElementById('formError');
    el.fTitle = document.getElementById('fTitle');
    el.fBody = document.getElementById('fBody');
    el.fBoard = document.getElementById('fBoard');
    el.fTags = document.getElementById('fTags');
    el.composerTitle = document.getElementById('composerTitle');
    el.publishBtn = document.getElementById('publishBtn');

    el.fBoard.innerHTML = Beam.boards.map(function (b) {
      return '<option value="' + b.id + '">' + U.escape(b.name) + '</option>';
    }).join('');

    state.wired = true;
    wire();
    return el;
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

  /* ---------------- midia de capa ---------------- */

  /* Confere se o endereco do arquivo ainda entrega o conteudo. */
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

  /* Gera um frame do video para usar como thumbnail.
     O primeiro frame de quase todo video e preto, entao o modulo de
     posters procura um frame logo no comeco que tenha imagem de verdade. */
  function makeVideoPoster(file) {
    if (!Beam.poster) return Promise.resolve(null);
    return Beam.poster.frame(file).then(function (blob) {
      return blob || null;
    }).catch(function () {
      return null;
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
        /* A capa antiga nao existe mais: o arquivo novo ocupa o lugar
           (e assim que o post se conserta). */
        if (state.pendingMedia[0] && state.pendingMedia[0].dead) {
          var velho = state.pendingMedia.shift();
          if (velho && velho.id) S.removeMedia(velho.id);
        }
        state.pendingMedia.push(descriptor);
        renderMediaList();
        if (descriptor.type === 'video') {
          /* A miniatura leva alguns segundos: o video e aberto e o
             compositor procura um frame no comeco que nao seja preto. */
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
              /* A url da miniatura viaja com o post: e ela que os outros
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
    el.mediaList.innerHTML = state.pendingMedia.map(function (m, i) {
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

  /* ---------------- slides ---------------- */

  function renderSlidesList() {
    var list = document.getElementById('slidesList');
    var count = document.getElementById('slidesCount');
    if (!list) return;
    var last = state.slides.length - 1;
    list.innerHTML = state.slides.map(function (s, i) {
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
    if (count) count.textContent = state.slides.length + (state.slides.length === 1 ? ' slide' : ' slides');
  }

  /* Le os textos digitados antes de reordenar, para o texto viajar com o slide. */
  function syncSlidesFromDom() {
    var textareas = document.querySelectorAll('#slidesList textarea[name^="slideBody-"]');
    for (var i = 0; i < textareas.length; i++) {
      var id = textareas[i].name.replace('slideBody-', '');
      var slide = state.slides.find(function (s) { return s.id === id; });
      if (slide) slide.body = textareas[i].value;
    }
  }

  /* Move um slide (com imagem e texto) para outra posicao. */
  function moveSlide(id, targetIndex) {
    syncSlidesFromDom();
    var from = state.slides.findIndex(function (s) { return s.id === id; });
    if (from === -1) return;
    var to = Math.max(0, Math.min(state.slides.length - 1, targetIndex));
    if (to === from) return;
    var slide = state.slides.splice(from, 1)[0];
    state.slides.splice(to, 0, slide);
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
      var slide = state.slides.find(function (s) { return s.id === slideId; });
      if (slide) slide.media = descriptor;
      renderSlidesList();
    }).catch(function (err) {
      toast(err.message || 'Não foi possível ler a imagem.', true);
    });
  }

  /* ---------------- abrir e publicar ---------------- */

  function resetComposer() {
    el.composerForm.reset();
    el.formError.hidden = true;
    el.formError.textContent = '';
    state.pendingMedia = [];
    state.slides = [{ id: U.uid('slide'), body: '', media: null }];
    updateTitleHint();
    renderSlidesList();
    renderLinks([]);
  }

  function showDialog() {
    el.composer.showModal();
    setTimeout(function () { el.fTitle.focus(); }, 60);
  }

  /* Publicar um post novo. */
  function open() {
    ensure();
    /* Sem perfil nao da para publicar: o caminho e criar o perfil. */
    if (isGuest()) {
      Beam.profile.openProfilesDialog('create');
      toast('Crie um perfil para publicar.', true);
      return;
    }
    state.editingPostId = null;
    if (el.composerTitle) el.composerTitle.textContent = 'Publicar no Tudo Sobre Nada';
    if (el.publishBtn) el.publishBtn.textContent = 'Publicar';
    resetComposer();
    showDialog();
  }

  /* Editar um post que ja existe (na propria pagina, sem sair dela). */
  function edit(id) {
    ensure();
    var post = findPost(id);
    if (!post) return;
    if (isGuest()) {
      Beam.profile.openProfilesDialog('create');
      toast('Crie um perfil para editar o post.', true);
      return;
    }

    state.editingPostId = id;
    if (el.composerTitle) el.composerTitle.textContent = 'Editar post';
    if (el.publishBtn) el.publishBtn.textContent = 'Salvar';

    el.fTitle.value = post.title;
    el.fTitle.dispatchEvent(new Event('input', { bubbles: true }));
    el.fBody.value = post.body;
    el.fBoard.value = post.board;
    el.fTags.value = (post.tags || []).join(', ');

    /* Links de apoio - aceita formato novo (array) e legado (string). */
    var existingLinks = [];
    if (Array.isArray(post.links)) {
      existingLinks = post.links.map(function (l) {
        return { url: l.url || '', label: l.label || U.linkName(l.url || '') };
      });
    } else if (post.link) {
      existingLinks = [{ url: post.link, label: U.linkName(post.link) }];
    }
    renderLinks(existingLinks);

    /* Slides - carregar pre-visualizacao das imagens. */
    var slidePromises = (post.slides || []).map(function (s) {
      return new Promise(function (resolve) {
        var slide = { id: s.id || U.uid('slide'), body: s.body || '', media: s.media || null };
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
      state.slides = slidesList.length ? slidesList : [{ id: U.uid('slide'), body: '', media: null }];
      renderSlidesList();
    });

    /* Midia de capa - carregar pre-visualizacao do IndexedDB. */
    var pendingMediaPromises = (post.media || []).map(function (m) {
      return S.mediaURL(m.id).then(function (url) {
        var entry = { id: m.id, type: m.type, name: m.name, size: m.size, preview: url };
        /* Guarda o endereco do arquivo no Storage: ao republicar, o post
           continua apontando para o mesmo lugar. */
        if (m.url) entry.url = m.url;
        if (m.path) entry.path = m.path;
        if (m.posterUrl) entry.posterUrl = m.posterUrl;
        if (m.posterPath) entry.posterPath = m.posterPath;
        if (m.posterId) entry.posterId = m.posterId;

        /* O arquivo pode ter sumido do Storage. A copia local e a prova
           de que ele ainda existe; sem ela, o endereco e testado. */
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
      state.pendingMedia = mediaList;
      renderMediaList();
    });

    showDialog();
  }

  function publish() {
    var title = el.fTitle.value.trim();
    var body = el.fBody.value.trim();
    var board = el.fBoard.value;

    /* Sem perfil nao ha publicacao: e preciso criar o perfil primeiro. */
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

    var original = state.editingPostId ? findPost(state.editingPostId) : null;

    var post = {
      id: original ? original.id : U.uid('post'),
      board: board,
      author: original ? original.author : currentProfile().id,
      title: title,
      body: body,
      tags: tags,
      /* Post novo comeca sem votos: o "+1" automatico inflava a pontuacao.
         A pontuacao vem dos votos (tabela votes). O campo antigo do post
         guardava o "+1" automatico: ele nao entra mais na conta. */
      votes: 0,
      createdAt: original ? original.createdAt || Date.now() : Date.now(),
      /* A url do arquivo precisa ir junto: sem ela, quem abre o post de
         outro navegador ve a imagem quebrada. */
      media: state.pendingMedia.map(function (m) {
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
      slides: state.slides.filter(function (s) {
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
      comments: original ? (original.comments || []) : []
    };
    var links = collectLinks();
    if (links.length) post.links = links;

    if (original) {
      /* Atualizar post existente. */
      S.state.posts = S.state.posts.map(function (p) {
        return p.id === post.id ? post : p;
      });
      toast('Post atualizado.');
    } else {
      S.state.posts.unshift(post);
      toast('Publicado.');
    }
    S.save();
    /* Envia para o banco compartilhado: e o que faz todo mundo ver o post. */
    S.syncPost(post);
    el.composer.close();
    state.editingPostId = null;

    /* A pagina que abriu o compositor redesenha o que precisa. */
    global.dispatchEvent(new CustomEvent('beam:post-saved', { detail: { post: post } }));
  }

  /* ---------------- eventos ---------------- */

  function wire() {
    document.querySelectorAll('[data-close-composer]').forEach(function (btn) {
      btn.addEventListener('click', function () { el.composer.close(); });
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

    /* botoes dentro do dialogo */
    el.composer.addEventListener('click', function (event) {
      var target = event.target.closest('[data-action]');
      if (!target) return;
      var action = target.getAttribute('data-action');

      if (action === 'remove-media') {
        var index = Number(target.getAttribute('data-index'));
        var removed = state.pendingMedia.splice(index, 1)[0];
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
        state.slides.push({ id: U.uid('slide'), body: '', media: null });
        renderSlidesList();
      }
      else if (action === 'remove-slide') {
        var slideId = target.getAttribute('data-slide-id');
        var slideIndex = state.slides.findIndex(function (s) { return s.id === slideId; });
        if (slideIndex === -1) return;
        var removedSlide = state.slides.splice(slideIndex, 1)[0];
        if (removedSlide && removedSlide.media) S.removeMedia(removedSlide.media.id);
        renderSlidesList();
      }
      else if (action === 'move-slide-up') {
        var upId = target.getAttribute('data-slide-id');
        var upIndex = state.slides.findIndex(function (s) { return s.id === upId; });
        if (upIndex > 0) moveSlide(upId, upIndex - 1);
      }
      else if (action === 'move-slide-down') {
        var downId = target.getAttribute('data-slide-id');
        var downIndex = state.slides.findIndex(function (s) { return s.id === downId; });
        if (downIndex !== -1 && downIndex < state.slides.length - 1) moveSlide(downId, downIndex + 1);
      }
    });

    document.getElementById('addSlide').addEventListener('click', function () {
      state.slides.push({ id: U.uid('slide'), body: '', media: null });
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
      var slide = state.slides.find(function (s) { return s.id === slideId; });
      if (slide) slide.body = textarea.value;
    });

    /* arrastar slides para reordenar */
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
      Array.prototype.forEach.call(document.querySelectorAll('.slide-card'), function (node) {
        node.classList.remove('is-dragging');
        node.classList.remove('is-over');
      });
      dragSlideId = null;
    });

    document.getElementById('slidesList').addEventListener('dragover', function (event) {
      if (!dragSlideId) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      var card = slideCardFrom(event.target);
      Array.prototype.forEach.call(document.querySelectorAll('.slide-card.is-over'), function (node) {
        node.classList.remove('is-over');
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

      var from = state.slides.findIndex(function (s) { return s.id === fromId; });
      var to = state.slides.findIndex(function (s) { return s.id === toId; });
      if (from === -1 || to === -1) return;
      moveSlide(fromId, to);
      toast('Slide movido para a posição ' + (to + 1) + '.');
    });
  }

  global.Beam.composer = {
    /* Abre o compositor para um post novo. */
    open: open,
    /* Abre o compositor para editar um post existente. */
    edit: edit,
    /* O dialogo esta aberto? (atalho de teclado usa isso) */
    isOpen: function () {
      if (!state.wired) return false;
      return !!el.composer && el.composer.open;
    },
    /* Garante que o dialogo existe na pagina (chame uma vez no boot). */
    init: ensure
  };
})(window);
