/* Teste do zoom digital (hover) e do visualizador de imagem nativa.
 *
 * Roda dentro da pagina (carregado via fetch e executado com eval pelo
 * runner). Retorna um objeto JSON com o resultado de cada verificacao:
 *   { ok: bool, testes: [ { nome, ok, detalhe } ] }
 *
 * Uso: abrir post.html?id=<id de um post com imagem> e rodar o runner.
 */
(function () {
  var out = { ok: true, testes: [] };
  function check(nome, cond, detalhe) {
    out.testes.push({ nome: nome, ok: !!cond, detalhe: detalhe === undefined ? null : detalhe });
    if (!cond) out.ok = false;
  }
  function near(a, b, tol) { return Math.abs(a - b) <= tol; }

  /* ---------- 1. zoom 2x digital ao passar o mouse ---------- */
  var host = document.querySelector('.postpage__media');
  var img = host && host.querySelector('img');

  if (!img) {
    check('imagem encontrada na pagina do post', false, 'sem .postpage__media img');
  } else {
    var box = host.getBoundingClientRect();
    var ibox = img.getBoundingClientRect();
    var k0 = ibox.width / img.naturalWidth;

    check('imagem tem resolucao nativa', img.naturalWidth > 100, img.naturalWidth + 'x' + img.naturalHeight);
    check('host tem altura antes do zoom', box.height > 50, 'altura=' + box.height.toFixed(1));

    function mouse(type, x, y, extra) {
      var ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
      if (extra) for (var k in extra) ev[k] = extra[k];
      host.dispatchEvent(ev);
    }

    // mouse entra -> mede
    mouse('mouseenter', box.left + 20, box.top + 20);
    var hostH0 = host.getBoundingClientRect().height;

    // 1o mousemove: canto superior esquerdo
    mouse('mousemove', box.left + 30, box.top + 25);
    var zoom1 = img.getBoundingClientRect();
    var hostH1 = host.getBoundingClientRect().height;

    check('zoom aplica 2x (largura = 2x a escala base)',
      near(zoom1.width, img.naturalWidth * k0 * 2, 6),
      'esperado~' + (img.naturalWidth * k0 * 2).toFixed(0) + 'px, obtido=' + zoom1.width.toFixed(0) + 'px');
    check('host NAO colapsa durante o zoom',
      near(hostH1, hostH0, 3),
      'antes=' + hostH0.toFixed(1) + ' depois=' + hostH1.toFixed(1));

    // 2o mousemove: canto inferior direito (nao pode acumular para 4x)
    mouse('mousemove', box.right - 30, box.bottom - 25);
    var zoom2 = img.getBoundingClientRect();
    check('zoom NAO acumula no 2o mousemove',
      near(zoom2.width, img.naturalWidth * k0 * 2, 6),
      'obtido=' + zoom2.width.toFixed(0) + 'px (4x seria ' + (img.naturalWidth * k0 * 4).toFixed(0) + 'px)');

    // a imagem continua cobrindo a area visivel (sem buraco)
    var vb = host.getBoundingClientRect();
    var zb = img.getBoundingClientRect();
    var cobre = zb.left <= vb.left + 1 && zb.top <= vb.top + 1 &&
                zb.right >= vb.right - 1 && zb.bottom >= vb.bottom - 1;
    check('imagem ampliada cobre a caixa visivel', cobre,
      'img=' + [zb.left.toFixed(0), zb.top.toFixed(0), zb.right.toFixed(0), zb.bottom.toFixed(0)].join(',') +
      ' host=' + [vb.left.toFixed(0), vb.top.toFixed(0), vb.right.toFixed(0), vb.bottom.toFixed(0)].join(','));

    // sai -> volta ao normal
    mouse('mouseleave', 0, 0);
    var depois = img.getBoundingClientRect();
    check('mouseleave restaura o tamanho original',
      near(depois.width, ibox.width, 3), 'antes=' + ibox.width.toFixed(0) + ' depois=' + depois.width.toFixed(0));
    check('mouseleave restaura a altura do host',
      near(host.getBoundingClientRect().height, hostH0, 3),
      'altura=' + host.getBoundingClientRect().height.toFixed(1));
    check('zoom nao deixa estilo inline para tras',
      !img.style.width && !img.style.transform && !host.style.height,
      'img.style.width="' + img.style.width + '" transform="' + img.style.transform + '" host.style.height="' + host.style.height + '"');
  }

  /* ---------- 2. visualizador: roda do mouse entre ajustar / 1:1 / 2x ---------- */
  function abrirLightbox() {
    if (!host || !img) return null;
    img.click();
    return document.getElementById('lightbox');
  }

  var lb = abrirLightbox();
  check('visualizador abre ao clicar na imagem', !!lb && lb.classList.contains('is-open'),
    lb ? 'classe=' + lb.className : 'sem #lightbox');

  if (lb) {
    var stage = lb.querySelector('[data-lightbox-stage]');
    var limg = lb.querySelector('.lightbox__img');

    function roda(deltaY, ctrl, x, y) {
      var ev = new WheelEvent('wheel', {
        bubbles: true, cancelable: true, deltaY: deltaY, deltaMode: 0, ctrlKey: !!ctrl,
        clientX: x || 0, clientY: y || 0
      });
      stage.dispatchEvent(ev);
      return ev.defaultPrevented;
    }

    /* O ponto da imagem original que esta sob um ponto da tela. */
    function pontoNatural(px, py) {
      var r = limg.getBoundingClientRect();
      var s = limg.naturalWidth ? r.width / limg.naturalWidth : 1;
      return { x: (px - r.left) / s, y: (py - r.top) / s, escala: s };
    }

    check('abre no modo ajustar', lb.getAttribute('data-zoom') === 'fit', 'modo=' + lb.getAttribute('data-zoom'));

    /* --- zoom ancorado no ponteiro --- */
    var sbox = stage.getBoundingClientRect();
    var alvoX = Math.round(sbox.left + sbox.width * 0.72);
    var alvoY = Math.round(sbox.top + sbox.height * 0.35);

    var antesPonto = pontoNatural(alvoX, alvoY);
    var prev1 = roda(-120, false, alvoX, alvoY);
    check('roda do mouse (sem Ctrl) sai do modo ajustar', lb.getAttribute('data-zoom') === '1',
      'modo=' + lb.getAttribute('data-zoom') + ' defaultPrevented=' + prev1);

    var depoisPonto = pontoNatural(alvoX, alvoY);
    check('zoom 1:1 mantem o ponto do ponteiro no mesmo lugar',
      Math.abs(depoisPonto.x - antesPonto.x) < 3 && Math.abs(depoisPonto.y - antesPonto.y) < 3,
      'antes=' + antesPonto.x.toFixed(1) + ',' + antesPonto.y.toFixed(1) +
      ' depois=' + depoisPonto.x.toFixed(1) + ',' + depoisPonto.y.toFixed(1));

    var antes2 = pontoNatural(alvoX, alvoY);
    roda(-120, false, alvoX, alvoY);
    check('roda do mouse chega ao modo 2x', lb.getAttribute('data-zoom') === '2', 'modo=' + lb.getAttribute('data-zoom'));
    var depois2 = pontoNatural(alvoX, alvoY);
    check('zoom 2x mantem o ponto do ponteiro no mesmo lugar',
      Math.abs(depois2.x - antes2.x) < 3 && Math.abs(depois2.y - antes2.y) < 3,
      'antes=' + antes2.x.toFixed(1) + ',' + antes2.y.toFixed(1) +
      ' depois=' + depois2.x.toFixed(1) + ',' + depois2.y.toFixed(1));

    /* A imagem nao pode ter voltado para o canto superior esquerdo. */
    var transform = limg.style.transform || '';
    var mt = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(transform);
    check('zoom nao reseta a imagem para o canto',
      mt && (Math.abs(parseFloat(mt[1])) > 1 || Math.abs(parseFloat(mt[2])) > 1),
      'transform=' + transform);

    /* roda para cima no limite: continua em 2x */
    roda(-120, false, alvoX, alvoY);
    check('roda para cima no limite mantem 2x', lb.getAttribute('data-zoom') === '2', 'modo=' + lb.getAttribute('data-zoom'));

    /* roda para baixo: volta para 1:1 e depois ajustar */
    roda(120, false, alvoX, alvoY);
    check('roda para baixo volta para 1:1', lb.getAttribute('data-zoom') === '1', 'modo=' + lb.getAttribute('data-zoom'));
    roda(120, false, alvoX, alvoY);
    check('roda para baixo volta para ajustar', lb.getAttribute('data-zoom') === 'fit', 'modo=' + lb.getAttribute('data-zoom'));

    /* tamanho real da imagem em cada modo */
    roda(-120, false, alvoX, alvoY); /* 1:1 */
    var w11 = limg.getBoundingClientRect().width;
    check('modo 1:1 mostra o pixel nativo',
      near(w11, limg.naturalWidth, 3), 'largura=' + w11.toFixed(0) + ' nativa=' + limg.naturalWidth);
    roda(-120, false, alvoX, alvoY); /* 2x */
    var w22 = limg.getBoundingClientRect().width;
    check('modo 2x mostra o dobro do pixel nativo',
      near(w22, limg.naturalWidth * 2, 3), 'largura=' + w22.toFixed(0) + ' nativo=' + limg.naturalWidth);
    check('modo 2x usa a resolucao nativa (nao upscale do desenho)',
      limg.style.width === (limg.naturalWidth * 2) + 'px', 'style.width=' + limg.style.width);

    /* ---------- 3. arrastar a imagem com o botao do mouse ---------- */
    var ib = limg.getBoundingClientRect();
    var antesT = limg.style.transform || '';
    var startX = ib.left + 120;
    var startY = ib.top + 120;

    limg.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true, cancelable: true, clientX: startX, clientY: startY, button: 0
    }));
    check('cursor de arrasto aparece durante o arrasto',
      stage.classList.contains('is-dragging'), 'classe=' + stage.className);
    window.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true, cancelable: true, clientX: startX - 180, clientY: startY - 90, button: 0
    }));
    window.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true, cancelable: true, clientX: startX - 180, clientY: startY - 90, button: 0
    }));

    var depoisT = limg.style.transform || '';
    var ma = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(antesT);
    var md = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(depoisT);
    var moveuX = ma && md ? (parseFloat(md[1]) - parseFloat(ma[1])) : 0;
    var moveuY = ma && md ? (parseFloat(md[2]) - parseFloat(ma[2])) : 0;
    check('arrastar move a imagem para a esquerda', moveuX < -50,
      'transform ' + antesT + ' -> ' + depoisT);
    check('arrastar move a imagem para cima', moveuY < -20,
      'transform ' + antesT + ' -> ' + depoisT);
    check('cursor de arrasto some no fim do arrasto',
      !stage.classList.contains('is-dragging'), 'classe=' + stage.className);

    /* ---------- 4. arrastar ate a borda nao pode vibrar ---------- */
    function panAtual() {
      var m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(limg.style.transform || '');
      return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : { x: 0, y: 0 };
    }
    function mouseMoveAbs(x, y) {
      window.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0
      }));
    }
    function mouseDownAbs(x, y) {
      limg.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0
      }));
    }
    function mouseUpAbs(x, y) {
      window.dispatchEvent(new MouseEvent('mouseup', {
        bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0
      }));
    }

    /* Puxa a imagem bem alem da borda da tela. */
    var sbox2 = stage.getBoundingClientRect();
    var ib2 = limg.getBoundingClientRect();
    var dx0 = ib2.left + 100;
    var dy0 = ib2.top + 100;
    mouseDownAbs(dx0, dy0);

    var amostras = [];
    for (var i = 0; i < 6; i++) {
      mouseMoveAbs(dx0 + 4000, dy0);
      amostras.push(panAtual().x);
    }
    var p1 = panAtual().x;
    /* Mais um evento na MESMA posicao: o resultado nao pode mudar. */
    mouseMoveAbs(dx0 + 4000, dy0);
    var p2 = panAtual().x;

    check('arrastar ate a borda nao vibra (mesmo ponto = mesma posicao)',
      Math.abs(p2 - p1) < 0.5, 'antes=' + p1.toFixed(2) + ' depois=' + p2.toFixed(2));
    check('arrastar ate a borda converge (sem oscilar)',
      amostras.every(function (v, k) { return k === 0 || Math.abs(v - amostras[k - 1]) < 0.5; }),
      'amostras=' + amostras.map(function (v) { return v.toFixed(1); }).join(' -> '));

    /* A borda da imagem para na borda da tela (sem sair da vista). */
    var sr = stage.getBoundingClientRect();
    var ir = limg.getBoundingClientRect();
    check('a imagem para na borda da tela sem ultrapassar',
      ir.left <= sr.left + 1.5 && ir.right >= sr.right - 1.5,
      'img=' + ir.left.toFixed(0) + '..' + ir.right.toFixed(0) +
      ' tela=' + sr.left.toFixed(0) + '..' + sr.right.toFixed(0));

    mouseUpAbs(dx0 + 4000, dy0);

    /* ---------- 5. arrasto suave: a imagem segue o ponteiro ---------- */
    /* Recomeca do centro (o botao sem ancora volta a imagem pro meio). */
    lb.querySelector('[data-lightbox-zoom="1"]').click();
    /* No meio da imagem (sem bater na borda), cada passo do mouse tem
       que mover a imagem exatamente a mesma distancia. */
    var ib3 = limg.getBoundingClientRect();
    var sx = ib3.left + ib3.width / 2;
    var sy = ib3.top + ib3.height / 2;
    mouseDownAbs(sx, sy);
    var panInicio = panAtual();
    var passos = [3, 7, 2, 11, 5, 9, 4];
    var totalX = 0, totalY = 0;
    var okPasso = true;
    passos.forEach(function (d) {
      totalX += d; totalY += d;
      mouseMoveAbs(sx + totalX, sy + totalY);
      var p = panAtual();
      if (Math.abs((p.x - panInicio.x) - totalX) > 1.5) okPasso = false;
      if (Math.abs((p.y - panInicio.y) - totalY) > 1.5) okPasso = false;
    });
    check('arrasto suave: a imagem acompanha o ponteiro sem tremor', okPasso,
      'delta do mouse=' + totalX + ',' + totalY +
      ' delta da imagem=' + (panAtual().x - panInicio.x).toFixed(1) + ',' + (panAtual().y - panInicio.y).toFixed(1));
    mouseUpAbs(sx + totalX, sy + totalY);

    /* No modo ajustar a imagem esta inteira na tela: nao ha o que arrastar. */
    var fitAntes = lb.getAttribute('data-zoom');
    lb.querySelector('[data-lightbox-zoom="fit"]').click();
    var fitPan = panAtual();
    var ib4 = limg.getBoundingClientRect();
    mouseDownAbs(ib4.left + ib4.width / 2, ib4.top + ib4.height / 2);
    mouseMoveAbs(ib4.left + ib4.width / 2 + 300, ib4.top + ib4.height / 2 + 300);
    mouseUpAbs(ib4.left + ib4.width / 2 + 300, ib4.top + ib4.height / 2 + 300);
    check('no modo ajustar a imagem nao sai do lugar', Math.abs(panAtual().x - fitPan.x) < 1,
      'pan=' + fitPan.x.toFixed(1) + ' -> ' + panAtual().x.toFixed(1));

    /* fecha */
    lb.querySelector('[data-lightbox-close]').click();
    check('visualizador fecha', !lb.classList.contains('is-open'), 'classe=' + lb.className);
  }

  window.__ZOOMTEST = out;
})();
