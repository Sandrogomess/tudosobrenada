/* Beam — miniaturas de vídeo (poster).
   O primeiro frame de quase todo vídeo é preto: começa com fade, não tem
   keyframe no segundo 0, ou abre com um flash de câmera. Por isso a gente
   procura um frame logo no começo que realmente tenha imagem.
   O módulo é compartilhado entre o feed e a página do post. */

(function (global) {
  'use strict';

  /* Brilho médio (0-255) abaixo do qual o frame é considerado preto. */
  var DARK = 20;
  /* Largura da miniatura gerada. */
  var WIDTH = 640;
  /* Qualidade do JPEG. */
  var QUALITY = 0.75;
  /* Tempo máximo para gerar a miniatura. */
  var DEADLINE = 15000;

  /* Momentos (em segundos) onde procuramos um frame utilizável,
   do começo para dentro. */
  var CANDIDATES = [0.08, 0.25, 0.6, 1.2, 2.2, 3.5, 5.5, 8];

  /* Posts que já estão sendo reparados (evita trabalho duplicado). */
  var busy = {};
  /* Posts já conferidos: o poster não é preto. Evita decodificar a
     imagem de novo a cada rolagem da página. */
  var checked = {};

  /* ---------- brilho ---------- */

  /* Brilho médio de um canvas já desenhado (0 = preto, 255 = branco). */
  function canvasBrightness(canvas) {
    try {
      var ctx = canvas.getContext('2d');
      if (!ctx) return 255;
      var data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      var sum = 0;
      var count = 0;
      /* Amostra 1 pixel a cada 16: suficiente para saber se é preto. */
      for (var i = 0; i < data.length; i += 64) {
        sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        count++;
      }
      return count ? sum / count : 0;
    } catch (err) {
      /* Canvas "sujo" (mídia de outra origem): assume que o frame serve. */
      return 255;
    }
  }

  /* Brilho médio de uma imagem (blob, url ou data url). */
  function luminance(source) {
    return new Promise(function (resolve) {
      if (!source) return resolve(null);
      var url = source;
      var revoke = false;
      if (typeof Blob !== 'undefined' && source instanceof Blob) {
        try {
          url = URL.createObjectURL(source);
          revoke = true;
        } catch (err) {
          return resolve(null);
        }
      }
      var img = new Image();
      var done = false;
      function finish(value) {
        if (done) return;
        done = true;
        if (revoke) URL.revokeObjectURL(url);
        resolve(value);
      }
      img.onload = function () {
        var w = img.naturalWidth || img.width;
        var h = img.naturalHeight || img.height;
        if (!w || !h) return finish(null);
        var canvas = document.createElement('canvas');
        var scale = Math.min(1, 160 / w);
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        try {
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          finish(canvasBrightness(canvas));
        } catch (err) {
          finish(null);
        }
      };
      img.onerror = function () { finish(null); };
      img.src = url;
    });
  }

  /* ---------- frame do vídeo ---------- */

  /* Desenha o frame atual do vídeo num canvas e devolve blob + brilho. */
  function grab(video) {
    return new Promise(function (resolve) {
      var w = video.videoWidth;
      var h = video.videoHeight;
      if (!w || !h) return resolve(null);
      var canvas;
      try {
        canvas = document.createElement('canvas');
        var scale = Math.min(1, WIDTH / w);
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        var ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      } catch (err) {
        return resolve(null);
      }
      var lum = canvasBrightness(canvas);
      canvas.toBlob(function (blob) {
        resolve(blob ? { blob: blob, luminance: lum } : null);
      }, 'image/jpeg', QUALITY);
    });
  }

  /* Leva o vídeo até um tempo e devolve o frame dali. */
  function seek(video, time) {
    return new Promise(function (resolve) {
      var settled = false;
      var seekTimer = null;

      function settle(value) {
        if (settled) return;
        settled = true;
        clearTimeout(seekTimer);
        video.removeEventListener('seeked', onSeeked);
        resolve(value);
      }

      function onSeeked() {
        /* Quando o seek termina o frame novo já está pronto: desenhar
           aqui devolve a imagem certa. O setTimeout(0) só dá uma folga
           para o decodificador terminar. */
        setTimeout(function () { grab(video).then(settle); }, 0);
      }

      video.addEventListener('seeked', onSeeked);
      seekTimer = setTimeout(function () { settle(null); }, 2000);

      try {
        if (Math.abs((video.currentTime || 0) - time) < 0.03) {
          /* Já estamos nesse tempo: não dispara seek, só desenha. */
          setTimeout(function () { grab(video).then(settle); }, 60);
          return;
        }
        video.currentTime = time;
      } catch (err) {
        settle(null);
      }
    });
  }

  /* Momentos para testar: perto do começo e, em vídeos longos,
     um pouco mais para dentro. */
  function candidateTimes(duration) {
    var list = CANDIDATES.slice();
    var known = typeof duration === 'number' && isFinite(duration) && duration > 0;
    if (known) {
      list.push(duration * 0.12);
      list.push(duration * 0.3);
      list.push(duration * 0.5);
    }
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var t = Math.max(0, list[i]);
      if (known && t > duration - 0.05) t = Math.max(0, duration - 0.05);
      var dup = false;
      for (var j = 0; j < out.length; j++) {
        if (Math.abs(out[j] - t) < 0.05) { dup = true; break; }
      }
      if (!dup) out.push(t);
    }
    return out;
  }

  /* Gera a miniatura de um vídeo (File ou Blob).
     Devolve um JPEG (blob) ou null se não der para gerar. */
  function frame(source) {
    return new Promise(function (resolve) {
      var url;
      try {
        url = URL.createObjectURL(source);
      } catch (err) {
        return resolve(null);
      }
      var video = document.createElement('video');
      var done = false;
      var started = false;
      var best = null;   /* frame mais claro que encontramos */

      function finish(result) {
        if (done) return;
        done = true;
        clearTimeout(deadline);
        try {
          video.removeAttribute('src');
          video.load();
        } catch (err) { }
        URL.revokeObjectURL(url);
        resolve(result || null);
      }

      var deadline = setTimeout(function () {
        finish(best ? best.blob : null);
      }, DEADLINE);

      video.preload = 'auto';
      video.muted = true;
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');

      video.addEventListener('error', function () { finish(null); });

      video.addEventListener('loadeddata', function () {
        if (started) return;
        started = true;
        var times = candidateTimes(video.duration);
        var index = 0;

        function next() {
          if (done) return;
          if (index >= times.length) {
            /* Nenhum frame com brilho: fica o mais claro que apareceu. */
            finish(best ? best.blob : null);
            return;
          }
          var time = times[index++];
          seek(video, time).then(function (result) {
            if (done) return;
            if (result) {
              if (!best || result.luminance > best.luminance) best = result;
              /* Frame com imagem: pronto, não precisa procurar mais. */
              if (result.luminance >= DARK) {
                finish(result.blob);
                return;
              }
            }
            next();
          });
        }

        /* Primeiro frame (t=0) fica como reserva. */
        grab(video).then(function (first) {
          if (done) return;
          if (first) best = first;
          next();
        });
      });

      video.src = url;
      try { video.load(); } catch (err) { }
    });
  }

  /* ---------- reparo das miniaturas já existentes ---------- */

  /* Procura a mídia de vídeo de um post. */
  function videoMedia(post) {
    var list = (post && post.media) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].type === 'video') return list[i];
    }
    return null;
  }

  /* Refaz a miniatura de um post cujo vídeo ficou com a thumb preta.
     Devolve a url da miniatura nova (ou null se não tinha o que fazer). */
  function repair(post) {
    var store = global.Beam.store;
    if (!store || !post || !post.id) return Promise.resolve(null);
    if (busy[post.id]) return Promise.resolve(null);

    var video = videoMedia(post);
    /* Sem arquivo (posts de exemplo) ou já resolvido: nada a fazer. */
    if (!video || !video.id || !video.posterId || video.posterFixed) {
      return Promise.resolve(null);
    }
    /* Já conferido nesta página: não decodifica a imagem de novo. */
    if (checked[post.id]) return Promise.resolve(null);

    busy[post.id] = true;

    return store.mediaURL(video.posterId)
      .then(function (url) {
        return url ? luminance(url) : null;
      })
      .then(function (lum) {
        /* A miniatura atual já tem brilho: está boa. */
        if (lum !== null && lum >= DARK) {
          checked[post.id] = 'ok';
          return null;
        }
        return store.mediaURL(video.id);
      })
      .then(function (url) {
        if (!url) return null;
        return fetch(url).then(function (r) { return r.blob(); });
      })
      .then(function (blob) {
        if (!blob) return null;
        return frame(blob);
      })
      .then(function (posterBlob) {
        if (!posterBlob) return null;
        var file = new File([posterBlob], 'poster.jpg', { type: 'image/jpeg' });
        return store.addMedia(file).then(function (descriptor) {
          var oldId = video.posterId;
          video.posterId = descriptor.id;
          video.posterFixed = 1;
          /* A url da nova miniatura precisa ir junto: é o que os outros
             visitantes conseguem abrir. */
          if (descriptor.url) video.posterUrl = descriptor.url;
          if (descriptor.path) video.posterPath = descriptor.path;
          checked[post.id] = 'fixed';
          store.updatePost(post.id, { media: post.media });
          /* O post atualizado precisa ir para o banco compartilhado. */
          if (store.syncPost) store.syncPost(post);
          if (oldId && oldId !== descriptor.id) store.removeMedia(oldId);
          return store.mediaURL(descriptor.id);
        });
      })
      .catch(function () { return null; })
      .then(function (result) {
        delete busy[post.id];
        return result || null;
      });
  }

  global.Beam = global.Beam || {};
  global.Beam.poster = {
    frame: frame,
    luminance: luminance,
    repair: repair,
    videoMedia: videoMedia,
    DARK: DARK
  };
})(window);
