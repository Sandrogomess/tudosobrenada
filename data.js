/* Beam — dados iniciais, boards e utilitários */

(function (global) {
  'use strict';

  /* Cada board tem um ícone próprio, ligado à função dele:
     geral = bússola, foto = câmera, vídeo = filmadora,
     tutoriais = caderno, áudio = microfone,
     ciências = béquer, games = controle. */
  var BOARDS = [
    { id: 'geral', name: 'Geral', color: '#FF5E5B', icon: 'geral', desc: 'Conversa solta sobre o que você está fazendo.' },
    { id: 'foto', name: 'Fotografia', color: '#FFB23F', icon: 'foto', desc: 'Fotos, luz, cor e o que deu errado na hora.' },
    { id: 'video', name: 'Vídeo', color: '#FF8A3D', icon: 'video', desc: 'Clipes, cortes, roteiros e sets.' },
    { id: 'tutoriais', name: 'Tutoriais', color: '#6FE3B0', icon: 'tutoriais', desc: 'Passo a passo testado, com ferramentas e nível.' },
    { id: 'audio', name: 'Áudio', color: '#C49BFF', icon: 'audio', desc: 'Gravação, mix, truques de captação.' },
    { id: 'ciencias', name: 'Ciências', color: '#7FC8FF', icon: 'ciencias', desc: 'Experimentos, física, química, biologia e o universo.' },
    { id: 'games', name: 'Games', color: '#FF9EC7', icon: 'games', desc: 'Jogos, reviews, setup, performance e spoilers.' }
  ];

  var USERS = [
    { id: 'marina.voss', name: 'marina.voss', username: 'marina.voss', hue: '#6FE3B0', avatar: 'camera' },
    { id: 'rui.almeida', name: 'rui.almeida', username: 'rui.almeida', hue: '#FFB23F', avatar: 'lens' },
    { id: 'taline', name: 'taline', username: 'taline', hue: '#7FC8FF', avatar: 'wave' },
    { id: 'oca.filmes', name: 'oca.filmes', username: 'oca.filmes', hue: '#FF9EC7', avatar: 'film' },
    { id: 'duda.m', name: 'duda.m', username: 'duda.m', hue: '#C49BFF', avatar: 'code' },
    { id: 'nando.silva', name: 'nando.silva', username: 'nando.silva', hue: '#FF8A3D', avatar: 'bolt' },
    { id: 'bia.labs', name: 'bia.labs', username: 'bia.labs', hue: '#FF5E5B', avatar: 'brush' },
    { id: 'voce', name: 'você', username: 'voce', hue: '#EDF3F1', avatar: 'rocket' }
  ];

  /* Ícones de avatar disponíveis (todos desenhados no sprite, sem rede). */
  var AVATARS = [
    { id: 'rocket', name: 'Foguete' },
    { id: 'camera', name: 'Câmera' },
    { id: 'note', name: 'Caderno' },
    { id: 'game', name: 'Controle' },
    { id: 'lens', name: 'Lente' },
    { id: 'wave', name: 'Áudio' },
    { id: 'brush', name: 'Pincel' },
    { id: 'code', name: 'Código' },
    { id: 'star', name: 'Estrela' },
    { id: 'cube', name: 'Cubo' },
    { id: 'bolt', name: 'Raio' },
    { id: 'ghost', name: 'Fantasma' },
    { id: 'film', name: 'Filme' },
    { id: 'mic', name: 'Microfone' }
  ];

  /* Cores sugeridas para o avatar de uma conta. */
  var AVATAR_HUES = [
    '#22c55e', '#6FE3B0', '#38BDF8', '#7FC8FF', '#C49BFF',
    '#FF9EC7', '#FF5E5B', '#FF8A3D', '#FFB23F', '#A3E635'
  ];

  /* Paletas: cada uma mistura tres cores. Trocar de paleta troca as
     cores do site inteiro com um clique. */
  var PALETTES = [
    { id: 'jade', name: 'Jade', accent: '#22c55e', accent2: '#6FE3B0', accent3: '#7FC8FF', glow1: 'rgba(255,178,63,0.13)', glow2: 'rgba(111,227,176,0.10)' },
    { id: 'sunset', name: 'Pôr do sol', accent: '#FF8A3D', accent2: '#FF5E5B', accent3: '#C49BFF', glow1: 'rgba(255,138,61,0.16)', glow2: 'rgba(196,155,255,0.12)' },
    { id: 'ocean', name: 'Oceano', accent: '#38BDF8', accent2: '#22D3EE', accent3: '#6FE3B0', glow1: 'rgba(56,189,248,0.16)', glow2: 'rgba(34,211,238,0.12)' },
    { id: 'neon', name: 'Neon', accent: '#A3E635', accent2: '#C084FC', accent3: '#F472B6', glow1: 'rgba(163,230,53,0.14)', glow2: 'rgba(192,132,252,0.14)' },
    { id: 'lavender', name: 'Lavanda', accent: '#C49BFF', accent2: '#FF9EC7', accent3: '#7FC8FF', glow1: 'rgba(196,155,255,0.16)', glow2: 'rgba(255,158,199,0.12)' },
    { id: 'amber', name: 'Âmbar', accent: '#FFB23F', accent2: '#FF8A3D', accent3: '#FDE68A', glow1: 'rgba(255,178,63,0.18)', glow2: 'rgba(255,138,61,0.12)' },
    { id: 'cyber', name: 'Cyber', accent: '#22D3EE', accent2: '#6366F1', accent3: '#A3E635', glow1: 'rgba(34,211,238,0.16)', glow2: 'rgba(99,102,241,0.14)' },
    { id: 'rose', name: 'Rosa', accent: '#FF9EC7', accent2: '#FF5E5B', accent3: '#FDBA74', glow1: 'rgba(255,158,199,0.16)', glow2: 'rgba(255,94,91,0.12)' }
  ];


  /* PRNG determinístico para gerar as artes de exemplo sem depender da rede. */
  function rng(seed) {
    var s = seed >>> 0 || 1;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  function poster(opts) {
    var w = opts.w || 1200, h = opts.h || 675;
    var r = rng(opts.seed || 7);
    var a = opts.a || '#0E2A2C', b = opts.b || '#1B4346', c = opts.c || '#FFB23F';
    var shapes = '';
    for (var i = 0; i < 7; i++) {
      var cx = Math.round(r() * w), cy = Math.round(r() * h);
      var rad = Math.round(40 + r() * (w / 4));
      var op = (0.06 + r() * 0.22).toFixed(2);
      shapes += '<circle cx="' + cx + '" cy="' + cy + '" r="' + rad + '" fill="' + (i % 2 ? c : '#EDF3F1') + '" opacity="' + op + '"/>';
    }
    for (var j = 0; j < 5; j++) {
      var x = Math.round(r() * w);
      var sw = 1 + Math.round(r() * 3);
      shapes += '<rect x="' + x + '" y="0" width="' + sw + '" height="' + h + '" fill="' + c + '" opacity="0.10"/>';
    }
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="' + a + '"/><stop offset="0.55" stop-color="' + b + '"/><stop offset="1" stop-color="' + a + '"/>' +
      '</linearGradient></defs>' +
      '<rect width="' + w + '" height="' + h + '" fill="url(#g)"/>' + shapes +
      '<rect x="0" y="' + (h - 6) + '" width="' + w + '" height="6" fill="' + c + '" opacity="0.75"/>' +
      '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  var HOUR = 3600 * 1000;
  var now = Date.now();

  function ago(hours) { return now - hours * HOUR; }

  var SEED_POSTS = [
    {
      id: 'p1',
      kind: 'tutorial',
      board: 'tutoriais',
      author: 'marina.voss',
      title: 'Iluminação de interview com dois refletores e zero difusor pricey',
      body: 'Duas janelas, um rebatedor de whiteboard e a câmera no colo. Sem comprar nada.\n\nO que funcionou: subir a câmera até a altura dos olhos e pôr a janela principal a 45° do eixo. O rebatedor do lado oposto devolve o suficiente para a sombra do nariz não virar buraco.\n\nO que não funcionou: o difusor de papel que eu usei na primeira tentativa. Roubou 1 stop e deixou tudo chapado — troquei por vidro fosco e resolveu.\n\nSettings: ISO 800, f/2.0, 1/50s, white balance 4300K. Corrigi na edição, no raw. O áudio é que continua sendo o gargalo.',
      tags: ['iluminação', 'entrevista', 'orçamento'],
      votes: 412,
      createdAt: ago(5),
      media: [{ id: 'm1', type: 'image', name: 'set-interview.svg', poster: poster({ seed: 21, a: '#123A3C', b: '#22595C', c: '#FFB23F' }) }],
      comments: [
        { id: 'c1', author: 'rui.almeida', body: 'O whiteboard como rebatedor me salvou em dois jobs pagos. Só usa um branco de verdade, os de propaganda dão um tom amarelado.', createdAt: ago(4), votes: 38 },
        { id: 'c2', author: 'taline', body: 'Você separou a exposure do áudio de propósito? No meu canal isso sempre vaza problema.', createdAt: ago(3), votes: 12 },
        { id: 'c3', author: 'marina.voss', body: 'Sempre. Two-fer: capto a voz no shotgun, deixo a lavada de sala e mixo na edição. Se a câmera de física capta áudio, só uso como emergency track.', createdAt: ago(2), votes: 21 }
      ]
    },
    {
      id: 'p2',
      kind: 'image',
      board: 'foto',
      author: 'taline',
      title: 'Porta de scooter às 6h12, antes do trânsito',
      body: 'Standing still, 1/15s, mão no guidão. A cidade ainda não tinha acordado.',
      tags: ['street', 'manhã', 'liso'],
      votes: 287,
      createdAt: ago(9),
      media: [{ id: 'm2', type: 'image', name: 'scooter-6h.svg', poster: poster({ seed: 33, a: '#102B31', b: '#2A4A52', c: '#7FC8FF' }) }],
      comments: [
        { id: 'c4', author: 'duda.m', body: 'A luz azul do letreiro é o que segura a foto. Nada mais nessa cena pede atenção.', createdAt: ago(8), votes: 17 }
      ]
    },
    {
      id: 'p3',
      kind: 'video',
      board: 'video',
      author: 'oca.filmes',
      title: 'Bastidores de uma take única de 4 minutos (sem corte)',
      body: 'Quatro minutos, uma passagem, duas;|&takes. O áudio gravou limpo mesmo com o caminhão passando na rua. O que salva é ter gravado room tone à parte.',
      tags: ['bastidores', 'takes', 'áudio'],
      votes: 198,
      createdAt: ago(14),
      media: [{ id: 'm3', type: 'video', name: 'take-unica.mp4', poster: poster({ seed: 48, a: '#2A1B24', b: '#5A2E3A', c: '#FF5E5B' }) }],
      links: [
        { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', label: 'YouTube' },
        { url: 'https://github.com/example/audio-room-tone', label: 'GitHub' }
      ],
      comments: [
        { id: 'c5', author: 'bia.labs', body: 'Room tone separado é o conselho mais útil que já li sobre áudio de rua.', createdAt: ago(12), votes: 25 },
        { id: 'c6', author: 'nando.silva', body: 'Quanto foi o setup de captação? Micro de lapela em que posição?', createdAt: ago(11), votes: 4 }
      ]
    },
    {
      id: 'p4',
      kind: 'tutorial',
      board: 'tutoriais',
      author: 'duda.m',
      title: 'Tipografia que responde ao áudio, em 40 linhas de JS',
      body: 'A ideia é ler a amplitude do som e modular o tracking e o peso. Usei AnalyserNode, normalizei o pico e interpolei em duas camadas: grossa para o peso visual e fina para o tracking.\n\nDica: não anime a posição de cada letra. O movimento por peso é o que continua legível.',
      tags: ['webaudio', 'tipografia', 'motion'],
      votes: 356,
      createdAt: ago(21),
      media: [{ id: 'm4', type: 'image', name: 'type-audio.png', poster: poster({ seed: 61, a: '#16213A', b: '#3B4E7A', c: '#C49BFF' }) }],
      comments: [
        { id: 'c7', author: 'nando.silva', body: 'Normalizar o pico antes do lerp salvou meu projeto, obrigada.', createdAt: ago(19), votes: 29 }
      ]
    },
    {
      id: 'p5',
      kind: 'image',
      board: 'geral',
      author: 'rui.almeida',
      title: 'Transformei um velcro de camera em alça de mão para o celular',
      body: 'Costura de 8 minutos, 15 segundos de tecido e uma fivela de chinelo. O celular não escorrega mais e o ângulo fica na altura do peito.',
      tags: ['gambiarra', 'celular', 'impressão3d'],
      votes: 154,
      createdAt: ago(28),
      media: [{ id: 'm5', type: 'image', name: 'alca-mao.png', poster: poster({ seed: 77, a: '#2B1E14', b: '#5C4028', c: '#FF9EC7' }) }],
      comments: []
    },
    {
      id: 'p6',
      kind: 'text',
      board: 'geral',
      author: 'bia.labs',
      title: 'Regra: postou, mostra o caminho, não só o resultado',
      body: 'Depois de um mês lendo este feed, minha conclusão é simples: os posts que ganham discussão não são os mais bonitos, são os que ensinam o caminho.\n\nMostre o teste ruim também. Mostre o valor que você errou. Isso economiza horas de quem vem depois.',
      tags: ['comunidade', 'processo'],
      votes: 521,
      createdAt: ago(34),
      comments: [
        { id: 'c8', author: 'marina.voss', body: 'Concordo. O "o que não funcionou" é a parte que eu levo para o meu trabalho.', createdAt: ago(32), votes: 44 },
        { id: 'c9', author: 'taline', body: 'Topíssimo. Salvei esse post.', createdAt: ago(30), votes: 12 }
      ]
    },
    {
      id: 'p7',
      kind: 'video',
      board: 'video',
      author: 'nando.silva',
      title: 'Loop de 3 segundos para fundo de tutorial',
      body: 'Feito em SVG puro, 60fps, 2 MB. A curva de entrada e a de saída usam a mesma ease para não dar tranco no loop.',
      tags: ['loop', 'svg', 'fundo'],
      votes: 96,
      createdAt: ago(41),
      media: [{ id: 'm6', type: 'video', name: 'loop-tutorial.mp4', poster: poster({ seed: 91, a: '#0F2A24', b: '#205145', c: '#6FE3B0' }) }],
      comments: []
    },
    {
      id: 'p8',
      kind: 'tutorial',
      board: 'audio',
      author: 'marina.voss',
      title: 'Tratar sala de casa como estúdio: o teste do forearm',
      body: 'Fica em pé e bate o antebraço no WALL. Se o resultado for abafado, sua sala tem flutter echo. Se for seco demais, grave um clapping hands e escute o cauda.\n\nA correção mais barata é sempre a posição: afaste o microfone da parede, nunca empurre o microfone para dentro dela.',
      tags: ['acústica', 'home studio', 'microfone'],
      votes: 243,
      createdAt: ago(50),
      media: [{ id: 'm7', type: 'image', name: 'teste-forearm.png', poster: poster({ seed: 104, a: '#221735', b: '#46386B', c: '#C49BFF' }) }],
      comments: [
        { id: 'c10', author: 'duda.m', body: 'O clapping hands é o melhor teste caseiro. Addicionei isso na minha checklist de captação.', createdAt: ago(47), votes: 19 }
      ]
    },
    {
      id: 'p9',
      kind: 'image',
      board: 'foto',
      author: 'duda.m',
      title: 'Chuva na vitrine, 1/60s, sem flash',
      body: 'Só a luz do poste e o brilho da farmácia. Converti para P&B depois, mas a versão colorida tinha um azul que eu queria guardar.',
      tags: ['chuva', 'noturno', 'preto-e-branco'],
      votes: 178,
      createdAt: ago(63),
      media: [{ id: 'm8', type: 'image', name: 'chuva-vitrine.png', poster: poster({ seed: 122, a: '#0C2028', b: '#1D4A57', c: '#7FC8FF' }) }],
      comments: []
    },
    {
      id: 'p10',
      kind: 'text',
      board: 'geral',
      author: 'bia.labs',
      title: 'Qual foi o post que mais mudou o jeito que você trabalha?',
      body: 'Quero entender o que a comunidade considera realmente útil. Pode ser uma técnica, um link, um erro que te custou um dia.',
      tags: ['comunidade', 'pergunta'],
      votes: 89,
      createdAt: ago(76),
      comments: [
        { id: 'c11', author: 'rui.almeida', body: 'O do forearm. Testei na minha sala e descobri que o problema era a mesa, não o microfone.', createdAt: ago(72), votes: 15 },
        { id: 'c12', author: 'oca.filmes', body: 'Aprendi a gravar room tone. Parece bobagem até você descobrir que o vídeo fica com eco na montaria.', createdAt: ago(70), votes: 11 }
      ]
    },
    {
      id: 'p11',
      kind: 'tutorial',
      board: 'tutoriais',
      author: 'nando.silva',
      title: 'Publicar um tutorial em 5 blocos: contexto, problema, tentativa, resultado, próximo passo',
      body: 'Esse esqueleto me faz parar de escrever no meio do vídeo sem saber onde o espectador vai cair. Se um bloco não serve, eu corto ele.\n\nNo final, eu sempre coloco o próximo passo concreto. É o que faz a pessoa voltar.',
      tags: ['escrita', 'roteiro', 'estrutura'],
      votes: 132,
      createdAt: ago(88),
      media: [],
      comments: []
    },
    {
      id: 'p12',
      kind: 'image',
      board: 'geral',
      author: 'taline',
      title: 'Bancada de montagem de sábado',
      body: 'Nada de alta-costura: fita, cola quente e um parafuso que ainda não achei onde foi parar.',
      tags: ['bancada', 'diy'],
      votes: 64,
      createdAt: ago(95),
      media: [{ id: 'm9', type: 'image', name: 'bancada.png', poster: poster({ seed: 139, a: '#2A1E1E', b: '#573535', c: '#FF5E5B' }) }],
      comments: []
    }
  ];

  var util = {
    escape: function (str) {
      var A = String.fromCharCode;
      var map = {};
      map[38] = A(38, 97, 109, 112, 59);
      map[60] = A(38, 108, 116, 59);
      map[62] = A(38, 103, 116, 59);
      map[34] = A(38, 113, 117, 111, 116, 59);
      map[39] = A(38, 35, 51, 57, 59);
      return String(str == null ? '' : str).replace(/[&<>"']/g, function (ch) { return map[ch.charCodeAt(0)]; });
    },
    uid: function (prefix) {
      return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    },
    /* Data completa: dia, mes e ano (dd/mm/aaaa). */
    dateBR: function (ts) {
      var d = new Date(ts);
      if (isNaN(d.getTime())) return '';
      var day = String(d.getDate()).padStart(2, '0');
      var month = String(d.getMonth() + 1).padStart(2, '0');
      return day + '/' + month + '/' + d.getFullYear();
    },
    /* Data por extenso, para o title do elemento <time>. */
    dateLongBR: function (ts) {
      var d = new Date(ts);
      if (isNaN(d.getTime())) return '';
      var months = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
        'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
      return d.getDate() + ' de ' + months[d.getMonth()] + ' de ' + d.getFullYear();
    },
    bytes: function (n) {
      if (!n) return '0 KB';
      if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
      return (n / (1024 * 1024)).toFixed(1) + ' MB';
    },
    initials: function (name) {
      return String(name || '?').slice(0, 2).replace(/[^a-zà-ÿ0-9]/gi, '').toLowerCase() || '??';
    },
    board: function (id) {
      for (var i = 0; i < BOARDS.length; i++) if (BOARDS[i].id === id) return BOARDS[i];
      return { id: id, name: id, color: '#9FB6B4', icon: 'geral' };
    },
    /* Id do ícone de um board (no sprite): o ícone segue a função do board. */
    boardIcon: function (board) {
      var b = board && board.id ? board : util.board(board);
      return '#i-board-' + (b.icon || 'geral');
    },
    /* Desenha o board: ícone + nome, já com a cor do board. */
    boardHTML: function (board, tag) {
      var b = board && board.id ? board : util.board(board);
      var tagName = tag || 'span';
      return '<' + tagName + ' class="board">' +
        util.boardIconHTML(b) +
        util.escape(b.name) + '</' + tagName + '>';
    },
    /* Só o ícone do board, na cor dele. */
    boardIconHTML: function (board) {
      var b = board && board.id ? board : util.board(board);
      return '<svg class="icon board__icon" style="color:' + b.color + '"><use href="' + util.boardIcon(b) + '"/></svg>';
    },
    user: function (id) {
      /* Primeiro os perfis criados pelo usuario, depois os membros fixos. */
      var profiles = (global.Beam && global.Beam.store && global.Beam.store.state && global.Beam.store.state.profiles) || [];
      for (var i = 0; i < profiles.length; i++) if (profiles[i] && profiles[i].id === id) return profiles[i];
      for (var j = 0; j < USERS.length; j++) {
        if (USERS[j].id === id) return USERS[j];
        if (String(id).toLowerCase() === String(USERS[j].username || '').toLowerCase()) return USERS[j];
      }
      return { id: id, name: id, username: id, hue: '#9FB6B4', avatar: 'star' };
    },
    /* Desenha o avatar: imagem enviada pelo usuario, se houver;
       senao o icone da lista, na cor escolhida. */
    avatarHTML: function (user, cls) {
      var u = user || {};
      var hue = u.hue || '#9FB6B4';
      var inner = util.isImageData(u.avatarImage)
        ? '<img src="' + util.escape(u.avatarImage) + '" alt="">'
        : '<svg class="icon"><use href="#i-av-' + util.avatarIcon(u) + '"/></svg>';
      return '<span class="avatarchip ' + (cls || '') + '" style="--av:' + hue + '" aria-hidden="true">' +
        inner + '</span>';
    },
    /* So aceita imagens embutidas (data URL) — nada de caminho de arquivo. */
    isImageData: function (value) {
      return typeof value === 'string' &&
        /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(value);
    },
    /* Id de um icone de avatar que existe no sprite. */
    avatarIcon: function (user) {
      var id = (user || {}).avatar;
      for (var i = 0; i < AVATARS.length; i++) if (AVATARS[i].id === id) return id;
      return 'star';
    },
    /* Texto do avatar: nome de quem postou. */
    avatarLabel: function (user) {
      var u = user || {};
      return u.username ? '@' + u.username : (u.name || 'anon');
    },
    palette: function (id) {
      for (var i = 0; i < PALETTES.length; i++) if (PALETTES[i].id === id) return PALETTES[i];
      return PALETTES[0];
    },
    /* Normaliza um nome de usuario: sem @, minusculo, sem espacos. */
    normalizeUsername: function (raw) {
      return String(raw || '')
        .trim()
        .replace(/^@+/, '')
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/[^a-z0-9._-]/g, '')
        .slice(0, 24);
    },
    seedPosts: function () {
      return JSON.parse(JSON.stringify(SEED_POSTS));
    },
    poster: poster,
    /* Conta os comentarios de um post, incluindo as respostas. */
    countComments: function (post) {
      var total = 0;
      (function walk(list) {
        (list || []).forEach(function (c) {
          total++;
          if (c.replies && c.replies.length) walk(c.replies);
        });
      })((post && post.comments) || []);
      return total;
    },
    /* Conta quantas respostas (em qualquer nivel) tem um comentario. */
    countReplies: function (comment) {
      var total = 0;
      (function walk(list) {
        (list || []).forEach(function (c) {
          total++;
          if (c.replies && c.replies.length) walk(c.replies);
        });
      })((comment && comment.replies) || []);
      return total;
    },
    /* Detecta o nome de um site a partir da URL, para rotular o material de apoio. */
    linkName: function (url) {
      var raw = String(url || '').trim();
      if (!raw) return '';
      var withProto = /^https?:\/\//i.test(raw) ? raw : 'https://' + raw;
      var host = '';
      try {
        host = new URL(withProto).hostname.toLowerCase().replace(/^www\./, '');
      } catch (err) {
        return 'Link';
      }
      if (!host) return 'Link';

      var known = [
        { match: /(^|\.)youtube\.com$|^youtu\.be$/, name: 'YouTube' },
        { match: /(^|\.)vimeo\.com$/, name: 'Vimeo' },
        { match: /(^|\.)twitch\.tv$/, name: 'Twitch' },
        { match: /(^|\.)tiktok\.com$/, name: 'TikTok' },
        { match: /(^|\.)instagram\.com$/, name: 'Instagram' },
        { match: /(^|\.)facebook\.com$|(^|\.)fb\.com$/, name: 'Facebook' },
        { match: /(^|\.)twitter\.com$|(^|\.)x\.com$/, name: 'X' },
        { match: /(^|\.)linkedin\.com$/, name: 'LinkedIn' },
        { match: /(^|\.)reddit\.com$/, name: 'Reddit' },
        { match: /(^|\.)github\.com$|(^|\.)githubusercontent\.com$/, name: 'GitHub' },
        { match: /(^|\.)gitlab\.com$/, name: 'GitLab' },
        { match: /(^|\.)figma\.com$/, name: 'Figma' },
        { match: /(^|\.)canva\.com$/, name: 'Canva' },
        { match: /(^|\.)notion\.so$|(^|\.)notion\.site$/, name: 'Notion' },
        { match: /(^|\.)drive\.google\.com$/, name: 'Google Drive' },
        { match: /(^|\.)docs\.google\.com$/, name: 'Google Docs' },
        { match: /(^|\.)dropbox\.com$/, name: 'Dropbox' },
        { match: /(^|\.)onedrive\.live\.com$/, name: 'OneDrive' },
        { match: /(^|\.)discord\.com$|(^|\.)discord\.gg$/, name: 'Discord' },
        { match: /(^|\.)spotify\.com$/, name: 'Spotify' },
        { match: /(^|\.)soundcloud\.com$/, name: 'SoundCloud' },
        { match: /(^|\.)bandcamp\.com$/, name: 'Bandcamp' },
        { match: /(^|\.)medium\.com$/, name: 'Medium' },
        { match: /(^|\.)substack\.com$/, name: 'Substack' },
        { match: /(^|\.)blender\.org$/, name: 'Blender' },
        { match: /(^|\.)adobe\.com$/, name: 'Adobe' },
        { match: /(^|\.)docusign\.com$/, name: 'DocuSign' },
        { match: /(^|\.)amazon\.(com|br)$/, name: 'Amazon' },
        { match: /(^|\.)ebay\.(com|br)$/, name: 'eBay' },
        { match: /(^|\.)etsy\.com$/, name: 'Etsy' },
        { match: /(^|\.)chatgpt\.com$|(^|\.)openai\.com$/, name: 'ChatGPT' },
        { match: /(^|\.)claude\.ai$|(^|\.)anthropic\.com$/, name: 'Claude' },
        { match: /(^|\.)wikipedia\.org$/, name: 'Wikipedia' },
        { match: /(^|\.)archive\.org$/, name: 'Internet Archive' }
      ];
      for (var i = 0; i < known.length; i++) {
        if (known[i].match.test(host)) return known[i].name;
      }

      /* Host generico: usa o dominio como nome. */
      var parts = host.split('.');
      var label = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
      if (label === 'co' || label === 'com' || label === 'net' || label === 'org') label = parts[0];
      return label.charAt(0).toUpperCase() + label.slice(1);
    },
    /* Vídeo sem arquivo disponível: troca pelo poster como imagem.
       Devolve true quando conseguiu, false quando não há poster. */
    videoFallback: function (node) {
      var poster = node.getAttribute('poster');
      var parent = node.parentNode;
      if (!poster || !parent) return false;
      var img = document.createElement('img');
      img.setAttribute('alt', '');
      img.setAttribute('src', poster);
      img.className = 'post__video-poster';
      parent.replaceChild(img, node);
      if (parent.classList) parent.classList.add('is-poster-only');
      return true;
    },
    /* Mídia que não existe mais (arquivo perdido): mostra um aviso no
       lugar do ícone quebrado do navegador. */
    mediaMissing: function (node) {
      if (!node || !node.parentNode) return;
      var parent = node.parentNode;
      if (parent.classList) parent.classList.add('is-missing');
      if (node.parentNode) node.parentNode.removeChild(node);
      var note = document.createElement('p');
      note.className = 'media-missing__note';
      note.textContent = 'Mídia indisponível';
      parent.appendChild(note);
    },
    /* zoom 2x seguindo o mouse nas paginas de post (capa e slides) */
    zoom: function (root) {
      var scope = root || document;
      var hosts = scope.querySelectorAll('.postpage__media, .postpage .slide__preview');
      for (var i = 0; i < hosts.length; i++) {
        var host = hosts[i];
        if (host.getAttribute('data-zoom-ready') === '1') continue;
        if (!host.querySelector('img')) continue;
        host.setAttribute('data-zoom-ready', '1');
        host.classList.add('zoom-host');
        host.addEventListener('mousemove', function (event) {
          var target = event.currentTarget.querySelector('img');
          if (!target) return;
          var rect = target.getBoundingClientRect();
          if (!rect.width || !rect.height) return;
          var fit = window.getComputedStyle(target).objectFit || 'fill';
          var ox = 0;
          var oy = 0;
          if (fit === 'contain' || fit === 'cover') {
            var nw = target.naturalWidth;
            var nh = target.naturalHeight;
            if (nw && nh) {
              var k = fit === 'contain'
                ? Math.min(rect.width / nw, rect.height / nh)
                : Math.max(rect.width / nw, rect.height / nh);
              var cw = nw * k;
              var ch = nh * k;
              ox = (rect.width - cw) / 2;
              oy = (rect.height - ch) / 2;
            }
          }
          var cx = event.clientX - rect.left;
          var cy = event.clientY - rect.top;
          cx = Math.max(ox, Math.min(ox + (rect.width - 2 * ox), cx));
          cy = Math.max(oy, Math.min(oy + (rect.height - 2 * oy), cy));
          target.style.transformOrigin = ((cx / rect.width) * 100) + '% ' + ((cy / rect.height) * 100) + '%';
          target.style.transform = 'scale(2)';
        });
        host.addEventListener('mouseleave', function (event) {
          var target = event.currentTarget.querySelector('img');
          if (!target) return;
          target.style.transformOrigin = 'center center';
          target.style.transform = 'scale(1)';
        });
      }
    }
  };

  global.Beam = global.Beam || {};
  global.Beam.boards = BOARDS;
  global.Beam.users = USERS;
  global.Beam.avatars = AVATARS;
  global.Beam.avatarHues = AVATAR_HUES;
  global.Beam.palettes = PALETTES;
  global.Beam.util = util;
})(window);
