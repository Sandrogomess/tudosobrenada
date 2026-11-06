/* Beam — perfis, cores e masthead (compartilhado entre o feed e a página do post) */

(function (global) {
  'use strict';

  var U = Beam.util;
  var S = Beam.store;

  /* Estado do formulário de perfil (criando ou editando). */
  var formState = { mode: 'new', id: null, avatar: 'rocket', hue: '#6FE3B0', image: null };
  var toastTimer = null;

  function toast(message, isError) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('is-error', !!isError);
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 3600);
  }

  /* ---------------- perfil em uso ---------------- */

  function currentProfile() { return S.currentProfile(); }

  /* Sem perfil a pessoa é visitante: só pode ler. */
  function isGuest() { return !currentProfile(); }

  function isMyPost(post) {
    var profile = currentProfile();
    return !!post && !!profile && post.author === profile.id;
  }

  /* Troca a identidade na interface (masthead e rail). */
  function renderProfileUI() {
    var profile = currentProfile();
    var guest = !profile;

    var btn = document.getElementById('profileBtn');
    if (btn) {
      if (guest) {
        /* Sem perfil o avatar vira um botão de "Entrar": mostra o ícone
           neutro e abre o menu com os perfis salvos. */
        btn.innerHTML = '<span class="avatarchip avatarchip--guest" aria-hidden="true"><svg class="icon"><use href="#i-user"/></svg></span>';
        btn.title = 'Entrar com um perfil salvo';
        btn.setAttribute('aria-label', 'Entrar com um perfil salvo');
      } else {
        btn.innerHTML = U.avatarHTML(profile);
        btn.title = profile.name + ' (@' + profile.username + ')';
        btn.setAttribute('aria-label', 'Menu do perfil — você está como ' + profile.name);
      }
    }

    /* Sem perfil as opções de "meus posts" e "favoritos" ficam escondidas. */
    var block = document.getElementById('profileBlock');
    if (block) block.hidden = guest;

    var railAvatar = document.getElementById('railAccountAvatar');
    if (railAvatar && profile) railAvatar.innerHTML = U.avatarHTML(profile);
    var railName = document.getElementById('railAccountName');
    if (railName && profile) railName.textContent = profile.name;
    var railUser = document.getElementById('railAccountUser');
    if (railUser && profile) railUser.textContent = '@' + profile.username;

    /* Mudar as cores do site éprivilegio de quem tem perfil. */
    var paletteBtn = document.getElementById('paletteBtn');
    if (paletteBtn) paletteBtn.hidden = guest;

    /* Sem perfil, o botão de publicar vira "Criar Perfil". */
    var label = document.getElementById('openComposerLabel');
    if (label) label.textContent = guest ? 'Criar Perfil' : 'Publicar';
    var use = document.querySelector('#openComposer use');
    if (use) use.setAttribute('href', guest ? '#i-user' : '#i-plus');
    var linkLabel = document.getElementById('publishLinkLabel');
    if (linkLabel) linkLabel.textContent = guest ? 'Criar Perfil' : 'Publicar';

    /* O botão de sair do perfil só existe quando há perfil ativo. */
    var leave = document.getElementById('profileLeave');
    if (leave) leave.hidden = guest;

    renderUserMenu();
  }

  /* ---------------- menu do avatar ---------------- */

  /* O menu ao lado do avatar muda conforme o estado: visitante só pode
     entrar; quem tem perfil configura, sai ou exclui a identidade. */
  function renderUserMenu() {
    var menu = document.getElementById('profileMenu');
    if (!menu) return;
    var profile = currentProfile();

    if (!profile) {
      var saved = S.profiles().length;
      menu.innerHTML =
        '<div class="usermenu__head">' +
          '<span class="avatarchip avatarchip--guest" aria-hidden="true">' + icon('i-user') + '</span>' +
          '<span class="usermenu__who"><b>Visitante</b><small>sem perfil ativo</small></span>' +
        '</div>' +
        '<button type="button" class="usermenu__item" data-menu-action="enter">' +
          icon('i-exit') + '<span>Entrar</span>' +
          '<small>' + (saved ? saved + (saved === 1 ? ' salvo' : ' salvos') : '—') + '</small>' +
        '</button>';
      return;
    }

    menu.innerHTML =
      '<div class="usermenu__head">' + U.avatarHTML(profile) +
        '<span class="usermenu__who"><b>' + U.escape(profile.name) + '</b><small>@' + U.escape(profile.username) + '</small></span>' +
      '</div>' +
      '<button type="button" class="usermenu__item" data-menu-action="configure">' +
        icon('i-settings') + '<span>Configurar</span></button>' +
      '<button type="button" class="usermenu__item" data-menu-action="leave">' +
        icon('i-exit') + '<span>Sair</span></button>';
  }

  function closeUserMenu() {
    var menu = document.getElementById('profileMenu');
    var btn = document.getElementById('profileBtn');
    if (menu) menu.hidden = true;
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function toggleUserMenu() {
    var menu = document.getElementById('profileMenu');
    var btn = document.getElementById('profileBtn');
    if (!menu || !btn) return;
    renderUserMenu();
    var open = menu.hidden;
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  /* Avisa as outras partes da pagina que o perfil mudou. */
  function changed() {
    renderProfileUI();
    try {
      global.dispatchEvent(new CustomEvent('beam:profile-changed'));
    } catch (err) {
      /* Navegadores muito antigos: a interface e atualizada na mesma hora. */
    }
  }

  /* O banco compartilhado trouxe perfis novos: a lista do "Entrar" muda. */
  global.addEventListener('beam:remote-changed', function () {
    renderProfileUI();
    var dialog = document.getElementById('profilesDialog');
    if (dialog && dialog.open) renderProfilesList(dialog.getAttribute('data-mode') || 'manage');
  });

  /* ---------------- cores do site ---------------- */

  /* Aplica a paleta salva (na carga da pagina), sem gravar nada. */
  function applySavedPalette() {
    var palette = U.palette(S.state.settings.palette || 'jade');
    document.documentElement.setAttribute('data-palette', palette.id);
    renderPaletteGrid();
  }

  /* Mudar a paleta é uma ação do usuário: só quem tem perfil pode. */
  function applyPalette(id) {
    if (isGuest()) {
      toast('Crie um perfil para mudar as cores do site.', true);
      return;
    }
    var palette = U.palette(id);
    document.documentElement.setAttribute('data-palette', palette.id);
    if (S.state.settings.palette !== palette.id) {
      S.state.settings.palette = palette.id;
      S.save();
    }
    renderPaletteGrid();
  }

  function renderPaletteGrid() {
    var grid = document.getElementById('paletteGrid');
    if (!grid) return;
    var current = S.state.settings.palette || 'jade';
    grid.innerHTML = Beam.palettes.map(function (p) {
      var on = p.id === current;
      return '<button class="palette-card' + (on ? ' is-on' : '') + '" data-palette-id="' + p.id + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
        '<span class="palette-card__swatches">' +
          '<i style="--s:' + p.accent + '"></i>' +
          '<i style="--s:' + p.accent2 + '"></i>' +
          '<i style="--s:' + p.accent3 + '"></i>' +
        '</span>' +
        '<span class="palette-card__name">' + U.escape(p.name) + (on ? '<small>ativa</small>' : '') + '</span>' +
      '</button>';
    }).join('');
  }

  function openPaletteDialog() {
    renderPaletteGrid();
    var dialog = document.getElementById('paletteDialog');
    if (dialog && !dialog.open) dialog.showModal();
  }

  /* ---------------- lista de perfis ---------------- */

  /* mode 'enter': só para escolher um perfil salvo.
     mode 'manage': lista + edição do perfil atual. */
  function renderProfilesList(mode) {
    var list = document.getElementById('profilesList');
    if (!list) return;
    var current = currentProfile();
    var profiles = S.profiles();
    var onlyEnter = mode === 'enter';

    list.innerHTML = profiles.filter(function (p) { return p && p.id; }).map(function (p) {
      var isCurrent = !!current && p.id === current.id;
      var posts = S.state.posts.filter(function (post) { return post.author === p.id; }).length;
      var action = isCurrent
        ? '<span class="account-row__badge">ativo</span>'
        : '<button class="account-row__switch" data-action="switch-profile" data-id="' + U.escape(p.id) + '">' +
          (onlyEnter ? 'Entrar' : 'Usar') + '</button>';
      var acts = onlyEnter
        ? ''
        : '<span class="account-row__acts">' +
            '<button class="icon-btn icon-btn--sm" data-action="edit-profile" data-id="' + U.escape(p.id) + '" aria-label="Editar perfil" title="Editar perfil">' + icon('i-text') + '</button>' +
            '<button class="icon-btn icon-btn--sm" data-action="delete-profile" data-id="' + U.escape(p.id) + '" aria-label="Excluir perfil" title="Excluir perfil">' + icon('i-trash') + '</button>' +
          '</span>';
      return '<div class="account-row' + (isCurrent ? ' is-current' : '') + '" data-profile="' + U.escape(p.id) + '">' +
        U.avatarHTML(p) +
        '<span class="account-row__info">' +
          '<span class="account-row__name">' + U.escape(p.name) + '</span>' +
          '<span class="account-row__user">@' + U.escape(p.username) + ' · ' + posts + (posts === 1 ? ' post' : ' posts') + '</span>' +
        '</span>' +
        action + acts +
      '</div>';
    }).join('');
  }

  /* ---------------- ícones e cores do avatar ---------------- */

  function renderAvatarPicker() {
    var picker = document.getElementById('avatarPicker');
    if (!picker) return;
    picker.innerHTML = Beam.avatars.map(function (a) {
      var on = a.id === formState.avatar;
      return '<button type="button" class="avatar-picker__btn' + (on ? ' is-on' : '') + '" data-avatar-id="' + a.id + '" title="' + U.escape(a.name) + '" aria-label="' + U.escape(a.name) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
        '<svg class="icon"><use href="#i-av-' + a.id + '"/></svg></button>';
    }).join('');
  }

  function renderHuePicker() {
    var picker = document.getElementById('huePicker');
    if (!picker) return;
    picker.innerHTML = Beam.avatarHues.map(function (hue) {
      var on = hue === formState.hue;
      return '<button type="button" class="hue-picker__btn' + (on ? ' is-on' : '') + '" data-hue="' + hue + '" style="--hue:' + hue + '" aria-label="Cor ' + hue + '" aria-pressed="' + (on ? 'true' : 'false') + '"></button>';
    }).join('');
  }

  /* Prévia do avatar: a imagem enviada tem prioridade sobre o ícone. */
  function renderImagePreview() {
    var box = document.getElementById('profileImagePreview');
    if (!box) return;
    var fake = { avatar: formState.avatar, hue: formState.hue, avatarImage: formState.image };
    box.innerHTML = U.avatarHTML(fake, 'avatarchip--lg');
    var remove = document.getElementById('profileImageRemove');
    if (remove) remove.hidden = !formState.image;
  }

  /* Reduz a imagem enviada para 128x128 e devolve um data URL. */
  function readImageFile(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type)) {
        reject(new Error('Escolha um arquivo de imagem.'));
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        reject(new Error('Imagem grande demais (máximo 8 MB).'));
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          try {
            var size = 128;
            var canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            var ctx = canvas.getContext('2d');
            /* Recorta no centro para ficar quadrado. */
            var side = Math.min(img.width, img.height);
            var sx = (img.width - side) / 2;
            var sy = (img.height - side) / 2;
            ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
            resolve(canvas.toDataURL('image/png'));
          } catch (err) {
            reject(new Error('Não foi possível preparar a imagem.'));
          }
        };
        img.onerror = function () { reject(new Error('Não foi possível ler a imagem.')); };
        img.src = reader.result;
      };
      reader.onerror = function () { reject(new Error('Não foi possível ler o arquivo.')); };
      reader.readAsDataURL(file);
    });
  }

  /* ---------------- formulário ---------------- */

  function resetProfileForm() {
    formState = { mode: 'new', id: null, avatar: 'rocket', hue: Beam.avatarHues[0], image: null };
    var nameInput = document.getElementById('profileName');
    var userInput = document.getElementById('profileUsername');
    var title = document.getElementById('profileFormTitle');
    var submit = document.getElementById('profileSubmit');
    var cancel = document.getElementById('profileCancel');
    var del = document.getElementById('profileDelete');
    var leave = document.getElementById('profileLeave');
    var error = document.getElementById('profileError');
    var file = document.getElementById('profileImage');
    if (nameInput) nameInput.value = '';
    if (userInput) userInput.value = '';
    if (title) title.textContent = 'Novo perfil';
    if (submit) submit.textContent = 'Criar perfil';
    if (cancel) cancel.hidden = true;
    if (del) del.hidden = true;
    if (leave) leave.hidden = true;
    if (error) { error.hidden = true; error.textContent = ''; }
    if (file) file.value = '';
    renderAvatarPicker();
    renderHuePicker();
    renderImagePreview();
  }

  function editProfileForm(id) {
    var profile = null;
    S.profiles().forEach(function (p) { if (p.id === id) profile = p; });
    if (!profile) return;
    formState = {
      mode: 'edit',
      id: id,
      avatar: profile.avatar,
      hue: profile.hue,
      image: profile.avatarImage || null
    };
    var nameInput = document.getElementById('profileName');
    var userInput = document.getElementById('profileUsername');
    if (nameInput) nameInput.value = profile.name;
    if (userInput) userInput.value = profile.username;
    var title = document.getElementById('profileFormTitle');
    var submit = document.getElementById('profileSubmit');
    var cancel = document.getElementById('profileCancel');
    var error = document.getElementById('profileError');
    if (title) title.textContent = 'Editar perfil';
    if (submit) submit.textContent = 'Salvar';
    if (cancel) cancel.hidden = false;
    if (error) { error.hidden = true; error.textContent = ''; }
    renderAvatarPicker();
    renderHuePicker();
    renderImagePreview();
    if (nameInput) nameInput.focus();
  }

  function showProfileError(message) {
    var error = document.getElementById('profileError');
    if (!error) return;
    error.textContent = message;
    error.hidden = false;
  }

  function submitProfileForm() {
    var nameEl = document.getElementById('profileName');
    var userEl = document.getElementById('profileUsername');
    var name = (nameEl ? nameEl.value : '').trim();
    var username = (userEl ? userEl.value : '').trim();
    var payload = {
      name: name,
      username: username,
      avatar: formState.avatar,
      hue: formState.hue,
      avatarImage: formState.image || null
    };

    var mode = formState.mode;
    var result;
    if (mode === 'edit') {
      result = S.updateProfile(formState.id, payload);
    } else {
      if (!username && name) payload.username = name;
      result = S.addProfile(payload);
    }
    if (result.error) {
      showProfileError(result.error);
      return;
    }
    resetProfileForm();
    renderProfilesList();
    changed();
    toast(mode === 'edit' ? 'Perfil atualizado.' : 'Perfil criado.');
    /* Depois de criar, o diálogo de criação não tem mais utilidade. */
    if (mode === 'new') {
      var dialog = document.getElementById('profilesDialog');
      if (dialog && dialog.open) dialog.close();
    }
  }

  function switchProfile(id) {
    S.switchProfile(id);
    renderProfilesList();
    changed();
    var profile = currentProfile();
    toast(profile ? 'Agora você é ' + profile.name + '.' : 'Você está como visitante.');
  }

  function deleteProfile(id) {
    var profile = null;
    S.profiles().forEach(function (p) { if (p.id === id) profile = p; });
    if (!profile) return;
    var posts = S.state.posts.filter(function (post) { return post.author === id; }).length;
    var warning = posts
      ? 'Excluir o perfil "' + profile.name + '" também apaga ' + posts + (posts === 1 ? ' post' : ' posts') + ' dele. Continuar?'
      : 'Excluir o perfil "' + profile.name + '"?';
    if (!confirm(warning)) return;
    var result = S.removeProfile(id);
    if (result.error) { toast(result.error, true); return; }
    resetProfileForm();
    renderProfilesList();
    changed();
    /* Sem nenhum perfil sobrando, a pessoa volta a ser visitante. */
    toast(S.profiles().length ? 'Perfil excluído.' : 'Perfil excluído. Você está como visitante.');
  }

  /* Os três usos do diálogo de perfis:
     'create' — só o formulário de criação (botão "Criar Perfil");
     'enter'  — só a lista de perfis salvos (menu "Entrar");
     'manage' — edição do perfil atual (menu "Configurar"). */
  var DIALOG_MODES = {
    create: {
      title: 'Criar perfil',
      hint: 'Escolha um nome e um ícone de avatar. Tudo fica salvo só neste navegador.',
      list: false,
      form: true
    },
    enter: {
      title: 'Entrar',
      hint: 'Escolha um perfil salvo para publicar e comentar com essa identidade.',
      list: true,
      form: false
    },
    manage: {
      title: 'Meu perfil',
      hint: 'Edite seus dados ou troque de identidade. Tudo fica salvo só neste navegador.',
      list: true,
      form: true
    }
  };

  function openProfilesDialog(mode) {
    mode = DIALOG_MODES[mode] ? mode : (isGuest() ? 'create' : 'manage');
    var conf = DIALOG_MODES[mode];
    closeUserMenu();

    resetProfileForm();
    renderProfilesList(mode === 'enter' ? 'enter' : 'manage');
    renderAvatarPicker();
    renderHuePicker();

    var list = document.getElementById('profilesList');
    var empty = document.getElementById('profilesEmpty');
    var form = document.getElementById('profileForm');
    var title = document.getElementById('profilesTitle');
    var hint = document.getElementById('profilesHint');
    var del = document.getElementById('profileDelete');
    var leave = document.getElementById('profileLeave');

    if (list) list.hidden = !conf.list;
    if (form) form.hidden = !conf.form;
    if (title) title.textContent = conf.title;
    if (hint) hint.textContent = conf.hint;
    if (empty) empty.hidden = !(mode === 'enter' && !S.profiles().length);
    if (del) del.hidden = !(mode === 'manage' && !!currentProfile());
    if (leave) leave.hidden = !(mode === 'manage' && !!currentProfile());

    /* Modo "manage" abre já com os dados do perfil atual no formulário. */
    if (mode === 'manage') {
      var current = currentProfile();
      if (current) editProfileForm(current.id);
    }

    var dialog = document.getElementById('profilesDialog');
    if (dialog) {
      /* Guarda o modo: a lista precisa ser redesenhada no mesmo formato
         quando chegam perfis novos do banco compartilhado. */
      dialog.setAttribute('data-mode', mode);
      if (!dialog.open) dialog.showModal();
    }

    /* Sem perfil, a intenção é criar um: o formulário já fica em foco. */
    if (mode === 'create') {
      var name = document.getElementById('profileName');
      if (name) setTimeout(function () { name.focus(); }, 80);
    }
  }

  /* Volta para o modo visitante (sem perfil). */
  function leaveProfile() {
    S.switchProfile(null);
    resetProfileForm();
    renderProfilesList();
    changed();
    closeUserMenu();
    toast('Você está como visitante. Crie um perfil para publicar.');
  }

  function icon(id, cls) {
    return '<svg class="icon ' + (cls || '') + '"><use href="#' + id + '"/></svg>';
  }

  /* ---------------- eventos ---------------- */

  function bind() {
    var paletteBtn = document.getElementById('paletteBtn');
    if (paletteBtn) paletteBtn.addEventListener('click', openPaletteDialog);

    var grid = document.getElementById('paletteGrid');
    if (grid) {
      grid.addEventListener('click', function (event) {
        var card = event.target.closest('[data-palette-id]');
        if (!card) return;
        var id = card.getAttribute('data-palette-id');
        applyPalette(id);
        toast('Cores: ' + U.palette(id).name + '.');
      });
    }

    var profileBtn = document.getElementById('profileBtn');
    if (profileBtn) profileBtn.addEventListener('click', function (event) {
      event.stopPropagation();
      toggleUserMenu();
    });
    var railAccount = document.getElementById('railAccount');
    if (railAccount) railAccount.addEventListener('click', function () {
      openProfilesDialog('manage');
    });

    /* Menu do avatar: entrar, configurar, sair ou excluir. */
    var menu = document.getElementById('profileMenu');
    if (menu) {
      menu.addEventListener('click', function (event) {
        var item = event.target.closest('[data-menu-action]');
        if (!item) return;
        var action = item.getAttribute('data-menu-action');
        if (action === 'enter') openProfilesDialog('enter');
        else if (action === 'configure') openProfilesDialog('manage');
        else if (action === 'leave') leaveProfile();
        else if (action === 'delete') {
          var current = currentProfile();
          if (current) deleteProfile(current.id);
        }
        closeUserMenu();
      });
    }

    /* Clicar fora do menu fecha o dropdown. */
    document.addEventListener('click', function (event) {
      var wrap = document.getElementById('userMenu');
      if (wrap && !wrap.contains(event.target)) closeUserMenu();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeUserMenu();
    });

    /* Link "Publicar" da página do post: sem perfil, abre a criação de perfil. */
    var publishLink = document.getElementById('publishLink');
    if (publishLink) {
      publishLink.addEventListener('click', function (event) {
        if (!isGuest()) return;
        event.preventDefault();
        openProfilesDialog('create');
      });
    }

    var list = document.getElementById('profilesList');
    if (list) {
      list.addEventListener('click', function (event) {
        var btn = event.target.closest('[data-action]');
        if (!btn) return;
        var id = btn.getAttribute('data-id');
        var action = btn.getAttribute('data-action');
        if (action === 'switch-profile') {
          switchProfile(id);
          /* Entrar fecha o diálogo: o site já está com a nova identidade. */
          var dialog = document.getElementById('profilesDialog');
          if (dialog && dialog.open) dialog.close();
        }
        else if (action === 'edit-profile') editProfileForm(id);
        else if (action === 'delete-profile') deleteProfile(id);
      });
    }

    /* Sem perfis salvos, o botão do estado vazio abre a criação. */
    var emptyBox = document.getElementById('profilesEmpty');
    if (emptyBox) {
      emptyBox.addEventListener('click', function (event) {
        var btn = event.target.closest('[data-action="create-profile"]');
        if (!btn) return;
        openProfilesDialog('create');
      });
    }

    var form = document.getElementById('profileForm');
    if (form) {
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        submitProfileForm();
      });
    }

    var cancel = document.getElementById('profileCancel');
    if (cancel) cancel.addEventListener('click', resetProfileForm);

    var leave = document.getElementById('profileLeave');
    if (leave) leave.addEventListener('click', leaveProfile);

    /* Excluir o perfil atual (dentro do diálogo "Configurar"). */
    var del = document.getElementById('profileDelete');
    if (del) {
      del.addEventListener('click', function () {
        var current = currentProfile();
        if (current) deleteProfile(current.id);
      });
    }

    var picker = document.getElementById('avatarPicker');
    if (picker) {
      picker.addEventListener('click', function (event) {
        var btn = event.target.closest('[data-avatar-id]');
        if (!btn) return;
        formState.avatar = btn.getAttribute('data-avatar-id');
        renderAvatarPicker();
        renderImagePreview();
      });
    }

    var hues = document.getElementById('huePicker');
    if (hues) {
      hues.addEventListener('click', function (event) {
        var btn = event.target.closest('[data-hue]');
        if (!btn) return;
        formState.hue = btn.getAttribute('data-hue');
        renderHuePicker();
        renderImagePreview();
      });
    }

    /* Imagem enviada pelo usuario como icone de avatar. */
    var file = document.getElementById('profileImage');
    if (file) {
      file.addEventListener('change', function () {
        var picked = file.files && file.files[0];
        if (!picked) return;
        readImageFile(picked).then(function (dataUrl) {
          formState.image = dataUrl;
          renderImagePreview();
          toast('Imagem pronta. Salve o perfil para usar.');
        }).catch(function (err) {
          showProfileError(err.message || 'Não foi possível usar essa imagem.');
        });
      });
    }

    var removeImage = document.getElementById('profileImageRemove');
    if (removeImage) {
      removeImage.addEventListener('click', function () {
        formState.image = null;
        if (file) file.value = '';
        renderImagePreview();
      });
    }
  }

  /* ---------------- busca de perfis ---------------- */

  /* Perfis que combinam com o texto digitado (nome ou usuario).
     inclui os membros fixos do site e os perfis criados pelo usuario. */
  function matchingAuthors(query) {
    var q = String(query || '').trim().toLowerCase();
    var list = S.authors().filter(function (a) {
      if (!q) return true;
      var name = String(a.name || '').toLowerCase();
      var user = String(a.username || '').toLowerCase();
      return name.indexOf(q) !== -1 || user.indexOf(q) !== -1;
    });
    /* Quem tem mais posts aparece primeiro. */
    list.sort(function (a, b) {
      var pa = S.postsByAuthor(a.id);
      var pb = S.postsByAuthor(b.id);
      if (pb !== pa) return pb - pa;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
    return list;
  }

  /* HTML do painel de perfis que desce do campo de busca.
     canFavorite: visitante nao favorita perfil (so quem tem perfil). */
  function authorsPanelHTML(list, query, canFavorite) {
    if (!list.length) {
      return '<p class="search__empty">Nenhum perfil encontrado para “' + U.escape(query) + '”.</p>';
    }
    var rows = list.slice(0, 6).map(function (a) {
      var count = S.postsByAuthor(a.id);
      var fav = S.isFavoriteProfile(a.id);
      var heart = canFavorite
        ? '<button type="button" class="favbtn favbtn--corner' + (fav ? ' is-on' : '') + '" data-action="favorite-profile" data-id="' + U.escape(a.id) + '" title="' + (fav ? 'Remover dos favoritos' : 'Adicionar aos favoritos') + '" aria-label="' + (fav ? 'Remover dos favoritos' : 'Adicionar aos favoritos') + '">' + icon('i-heart') + '</button>'
        : '';
      return '<div class="searchrow">' +
        '<button type="button" class="searchrow__open" data-action="open-profile" data-id="' + U.escape(a.id) + '">' +
          U.avatarHTML(a, 'avatarchip--sm') +
          '<span class="searchrow__info">' +
            '<b>' + U.escape(a.name) + '</b>' +
            '<small>@' + U.escape(a.username || a.name) + '</small>' +
          '</span>' +
          '<span class="searchrow__count">' + count + (count === 1 ? ' post' : ' posts') + '</span>' +
        '</button>' +
        heart +
        '</div>';
    }).join('');
    var extra = list.length - 6;
    return '<p class="search__title">Perfis</p>' + rows +
      (extra > 0 ? '<p class="search__more">+ ' + extra + (extra === 1 ? ' outro perfil' : ' outros perfis') + '</p>' : '');
  }

  /* ---------------- masthead que some ao rolar ---------------- */

  /* Rolar para baixo esconde a barra do topo; rolar para cima traz ela de
     volta. No inicio da pagina ela sempre aparece. */
  function initMasthead() {
    var masthead = document.querySelector('.masthead');
    if (!masthead) return;
    var lastY = window.scrollY || 0;
    var ticking = false;

    function update() {
      ticking = false;
      var y = window.scrollY || document.documentElement.scrollTop || 0;
      if (y < 70) {
        masthead.classList.remove('is-hidden');
      } else if (y > lastY + 4) {
        masthead.classList.add('is-hidden');
      } else if (y < lastY - 4) {
        masthead.classList.remove('is-hidden');
      }
      lastY = y;
    }

    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }, { passive: true });
  }

  /* ---------------- transições entre páginas ---------------- */

  /* O navegador faz a transicao sozinho quando suporta View Transitions
     entre paginas (Chrome 126+). A flag 'beam.vt' guarda essa resposta:
     quem chegou aqui com '1' pode confiar no navegador. */
  function browserHandlesTransition() {
    try { return sessionStorage.getItem('beam.vt') === '1'; } catch (err) { return false; }
  }

  /* Direcao da transicao: indo para o post a pagina "vem para frente";
     voltando para o feed ela "sobe". */
  function directionFor(url) {
    return /post\.html(\?|$)/.test(url) ? 'dir-forward' : 'dir-back';
  }

  /* Deixa a pagina atual sumir e vai para a outra. */
  function navigateTo(url) {
    var html = document.documentElement;
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduced && !browserHandlesTransition()) {
      var dir = directionFor(url);
      html.classList.add(dir);
      try { sessionStorage.setItem('beam.dir', dir); } catch (err) { }
      html.classList.add('page-leave');
      setTimeout(function () { location.href = url; }, 180);
      return;
    }
    location.href = url;
  }

  function initPageTransitions() {
    var html = document.documentElement;
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* Depois da entrada, a classe sai: assim o fade de saida funciona. */
    setTimeout(function () { html.classList.remove('page-in'); }, 420);

    /* Volta pelo botao do navegador (bfcache): repete a entrada. */
    window.addEventListener('pageshow', function (event) {
      if (!event.persisted || reduced) return;
      /* Voltando, a pagina entra "de baixo". */
      html.classList.remove('dir-forward');
      html.classList.add('dir-back');
      try { sessionStorage.setItem('beam.dir', 'dir-back'); } catch (err) { }
      html.classList.remove('page-in');
      void html.offsetWidth;
      html.classList.add('page-in');
      setTimeout(function () { html.classList.remove('page-in'); }, 420);
    });

    if (reduced) return;
    /* Com View Transitions o proprio navegador cuida da troca. */
    if (browserHandlesTransition()) return;

    /* Links internos: desvanece a pagina antes de trocar de tela. */
    document.addEventListener('click', function (event) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      var link = event.target.closest ? event.target.closest('a[href]') : null;
      if (!link) return;
      if (link.target === '_blank' || link.hasAttribute('download')) return;
      var href = link.getAttribute('href');
      if (!href || href.charAt(0) === '#') return;
      var url;
      try { url = new URL(link.href, location.href); } catch (err) { return; }
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search && url.hash === location.hash) return;
      event.preventDefault();
      navigateTo(url.href);
    });
  }

  /* ---------------- luz de sincronização ----------------
     Mostra se o conteúdo é compartilhado com todo mundo ou se está
     só neste navegador. Clicar tenta sincronizar de novo. */

  var SYNC_TEXT = {
    off: 'Modo local: cada visitante vê só o que publicou no próprio navegador. ' +
         'Para compartilhar, configure o Supabase em assets/config.js.',
    loading: 'Conectando ao banco compartilhado…',
    ok: 'Conectado: todo mundo vê os mesmos posts e comentários.',
    error: 'Sem conexão com o banco compartilhado. O conteúdo está só neste navegador.'
  };

  function renderSyncDot() {
    var dot = document.getElementById('syncDot');
    if (!dot) return;
    var status = (S.syncStatus && S.syncStatus()) || 'off';
    var text = SYNC_TEXT[status] || SYNC_TEXT.off;
    dot.setAttribute('data-status', status);
    dot.setAttribute('title', text);
    dot.setAttribute('aria-label', text);
  }

  function initSyncDot() {
    var dot = document.getElementById('syncDot');
    if (dot) {
      dot.addEventListener('click', function () {
        if (S.syncStatus && S.syncStatus() === 'loading') return;
        S.sync();
      });
    }
    global.addEventListener('beam:sync-status', renderSyncDot);
    global.addEventListener('beam:remote-changed', renderSyncDot);
    renderSyncDot();
  }

  function init() {
    bind();
    applySavedPalette();
    renderProfileUI();
    initMasthead();
    initPageTransitions();
    initSyncDot();
  }

  global.Beam = global.Beam || {};
  global.Beam.profile = {
    init: init,
    currentProfile: currentProfile,
    isGuest: isGuest,
    isMyPost: isMyPost,
    renderProfileUI: renderProfileUI,
    renderProfilesList: renderProfilesList,
    openProfilesDialog: openProfilesDialog,
    openPaletteDialog: openPaletteDialog,
    applyPalette: applyPalette,
    renderPaletteGrid: renderPaletteGrid,
    matchingAuthors: matchingAuthors,
    authorsPanelHTML: authorsPanelHTML,
    navigateTo: navigateTo,
    toast: toast
  };
})(window);
