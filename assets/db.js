/* ---------------------------------------------------------------------------
   Cliente do Supabase — REST puro (fetch), sem SDK e sem build.

   O site continua sendo HTML/CSS/JS puro: nada aqui precisa de npm. A
   comunicação usa a API REST do PostgREST e a API de Storage do Supabase.

   Todo o módulo funciona sem o banco: se a configuração estiver vazia,
   `enabled()` devolve false e o site segue 100% local.
--------------------------------------------------------------------------- */
(function (global) {
  'use strict';

  var cfg = global.BEAM_CONFIG || {};

  function base() {
    var url = String(cfg.supabaseUrl || '').trim().replace(/\/+$/, '');
    /* Aceita também a "API URL" do painel (que vem com /rest/v1 no fim). */
    url = url.replace(/\/rest\/v1$/i, '');
    return url;
  }

  function anonKey() {
    return String(cfg.supabaseAnonKey || '').trim();
  }

  function bucket() {
    return String(cfg.bucket || 'post-media').trim();
  }

  /* Configuração de verdade = URL que parece URL + chave não vazia. */
  function enabled() {
    var url = base();
    var key = anonKey();
    if (!url || !key) return false;
    if (url.indexOf('SEU-PROJETO') !== -1) return false;
    if (key.indexOf('SUA_CHAVE') !== -1) return false;
    return /^https?:\/\//.test(url);
  }

  /* Monta a URL de uma chamada REST. */
  function restUrl(path, query) {
    var url = base() + '/rest/v1/' + path;
    if (query) {
      var parts = [];
      Object.keys(query).forEach(function (k) {
        var v = query[k];
        if (v === undefined || v === null) return;
        parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
      });
      if (parts.length) url += '?' + parts.join('&');
    }
    return url;
  }

  function request(method, path, body, query, extraHeaders) {
    if (!enabled()) return Promise.reject(new Error('Supabase não configurado.'));
    var headers = {
      'apikey': anonKey(),
      'Authorization': 'Bearer ' + anonKey(),
      'Content-Type': 'application/json'
    };
    if (extraHeaders) {
      Object.keys(extraHeaders).forEach(function (h) { headers[h] = extraHeaders[h]; });
    }
    return fetch(restUrl(path, query), {
      method: method,
      headers: headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store'
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (txt) {
          var msg = (txt || res.statusText || '').slice(0, 300);
          throw new Error('Supabase ' + res.status + ': ' + msg);
        });
      }
      if (res.status === 204) return null;
      var ct = res.headers.get('content-type') || '';
      if (ct.indexOf('json') !== -1) return res.json();
      return res.text();
    });
  }

  /* ---------------- leitura ---------------- */

  /* Traz tudo que é compartilhado. */
  function pull() {
    return Promise.all([
      request('GET', 'profiles', undefined, { select: '*', order: 'created_at.asc' }),
      request('GET', 'posts', undefined, { select: '*', order: 'created_at.desc' }),
      request('GET', 'comments', undefined, { select: '*', order: 'created_at.asc' }),
      request('GET', 'votes', undefined, { select: '*' }),
      request('GET', 'comment_votes', undefined, { select: '*' })
    ]).then(function (r) {
      return {
        profiles: r[0] || [],
        posts: r[1] || [],
        comments: r[2] || [],
        votes: r[3] || [],
        commentVotes: r[4] || []
      };
    });
  }

  /* ---------------- escrita ---------------- */

  function upsertProfile(profile) {
    var row = {
      id: profile.id,
      name: profile.name,
      username: profile.username,
      avatar: profile.avatar || 'rocket',
      hue: profile.hue || null,
      avatar_image: profile.avatarImage || null,
      created_at: profile.createdAt || Date.now()
    };
    return request('POST', 'profiles', row, { on_conflict: 'id' }, {
      'Prefer': 'resolution=merge-duplicates,return=minimal'
    });
  }

  function deleteProfile(id) {
    return request('DELETE', 'profiles', undefined, { id: 'eq.' + id });
  }

  function upsertPost(post) {
    var row = {
      id: post.id,
      kind: post.kind || 'texto',
      board: post.board,
      author: post.author,
      title: post.title,
      body: post.body || '',
      tags: post.tags || [],
      created_at: post.createdAt || Date.now(),
      media: post.media || [],
      slides: post.slides || [],
      links: post.links || []
    };
    return request('POST', 'posts', row, { on_conflict: 'id' }, {
      'Prefer': 'resolution=merge-duplicates,return=minimal'
    });
  }

  function deletePost(id) {
    return request('DELETE', 'posts', undefined, { id: 'eq.' + id });
  }

  function upsertComment(postId, comment, parentId) {
    var row = {
      id: comment.id,
      post_id: postId,
      parent_id: parentId || null,
      author: comment.author || null,
      body: comment.body || '',
      created_at: comment.createdAt || Date.now()
    };
    return request('POST', 'comments', row, { on_conflict: 'id' }, {
      'Prefer': 'resolution=merge-duplicates,return=minimal'
    });
  }

  function deleteComment(commentId) {
    return request('DELETE', 'comments', undefined, { id: 'eq.' + commentId });
  }

  /* Voto de uma pessoa em um post. value = 1, -1 ou 0 (tirar o voto). */
  function setVote(voter, postId, value) {
    if (!voter || !postId) return Promise.resolve(null);
    if (!value) {
      return request('DELETE', 'votes', undefined, { voter: 'eq.' + voter, post_id: 'eq.' + postId });
    }
    return request('POST', 'votes', { voter: voter, post_id: postId, value: value },
      { on_conflict: 'voter,post_id' }, { 'Prefer': 'resolution=merge-duplicates,return=minimal' });
  }

  function setCommentVote(voter, commentId, value) {
    if (!voter || !commentId) return Promise.resolve(null);
    if (!value) {
      return request('DELETE', 'comment_votes', undefined, { voter: 'eq.' + voter, comment_id: 'eq.' + commentId });
    }
    return request('POST', 'comment_votes', { voter: voter, comment_id: commentId, value: value },
      { on_conflict: 'voter,comment_id' }, { 'Prefer': 'resolution=merge-duplicates,return=minimal' });
  }

  /* ---------------- arquivos (Storage) ---------------- */

  /* A url pertence ao projeto que está configurado agora? Uma url de outro
     projeto (ou de um banco de teste antigo) aponta para arquivo morto:
     o navegador mostra a imagem quebrada e o vídeo não toca. */
  function ownsURL(url) {
    if (!url) return false;
    var b = base();
    if (!b) return false;
    return String(url).indexOf(b + '/') === 0;
  }

  /* Descobre o tipo do arquivo (MIME) pelo nome, pelo tipo declarado e pelo
     próprio arquivo. O descriptor do site usa "image"/"video"; o nome tem a
     extensão; o Blob do IndexedDB costuma guardar o MIME original. */
  function mimeType(name, type, file) {
    var declared = String(type || '');
    if (declared.indexOf('/') !== -1) return declared;
    var fromFile = String((file && file.type) || '');
    if (fromFile.indexOf('/') !== -1) return fromFile;
    var match = String(name || '').match(/\.([a-z0-9]{1,5})$/i);
    var ext = match ? match[1].toLowerCase() : '';
    if (declared === 'video' || /^(mp4|webm|ogv|ogg|mov|m4v)$/.test(ext)) {
      if (ext === 'webm') return 'video/webm';
      if (ext === 'ogv' || ext === 'ogg') return 'video/ogg';
      return 'video/mp4';
    }
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'png') return 'image/png';
    if (ext === 'webp') return 'image/webp';
    if (ext === 'gif') return 'image/gif';
    if (ext === 'svg') return 'image/svg+xml';
    if (declared === 'image') return 'image/jpeg';
    return 'application/octet-stream';
  }

  /* O caminho precisa ter a extensão do arquivo: sem ela o servidor
     entrega o conteúdo como "application/octet-stream" e o navegador
     recusa a tocar o vídeo. */
  function mediaPath(id, file, name, type) {
    var fileName = name || (file && file.name) || '';
    var ext = (fileName.match(/\.([a-z0-9]{1,5})$/i) || [])[1];
    if (!ext) {
      var mime = mimeType(fileName, type, file);
      if (mime.indexOf('video/') === 0) {
        ext = mime === 'video/webm' ? 'webm' : (mime === 'video/ogg' ? 'ogv' : 'mp4');
      } else if (mime.indexOf('image/') === 0) {
        ext = mime.split('/')[1].replace('jpeg', 'jpg').replace('svg+xml', 'svg');
      } else {
        ext = 'bin';
      }
    }
    return 'media/' + id + '.' + ext.toLowerCase();
  }

  /* Envia um arquivo e devolve a URL publica e o caminho no Storage.
     `name` e `type` são opcionais: servem para reconstruir a extensão e o
     Content-Type quando o arquivo vem do IndexedDB (um Blob sem nome). */
  function uploadMedia(file, id, name, type) {
    if (!enabled()) return Promise.reject(new Error('Supabase não configurado.'));
    var mime = mimeType(name, type, file);
    var path = mediaPath(id, file, name, type);
    var url = base() + '/storage/v1/object/' + encodeURIComponent(bucket()) + '/' + path;
    return fetch(url, {
      method: 'POST',
      headers: {
        'apikey': anonKey(),
        'Authorization': 'Bearer ' + anonKey(),
        'Content-Type': mime,
        'x-upsert': 'true'
      },
      body: file
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (txt) {
          throw new Error('Upload falhou (' + res.status + '): ' + (txt || '').slice(0, 200));
        });
      }
      return { url: publicURL(path), path: path };
    });
  }

  function publicURL(path) {
    return base() + '/storage/v1/object/public/' + encodeURIComponent(bucket()) + '/' + path;
  }

  function removeMediaFile(path) {
    if (!enabled()) return Promise.resolve(null);
    return fetch(base() + '/storage/v1/object/' + encodeURIComponent(bucket()) + '/' + path, {
      method: 'DELETE',
      headers: { 'apikey': anonKey(), 'Authorization': 'Bearer ' + anonKey() }
    }).then(function () { return true; }).catch(function () { return false; });
  }

  global.Beam = global.Beam || {};
  global.Beam.db = {
    enabled: enabled,
    base: base,
    pull: pull,
    upsertProfile: upsertProfile,
    deleteProfile: deleteProfile,
    upsertPost: upsertPost,
    deletePost: deletePost,
    upsertComment: upsertComment,
    deleteComment: deleteComment,
    setVote: setVote,
    setCommentVote: setCommentVote,
    uploadMedia: uploadMedia,
    removeMediaFile: removeMediaFile,
    publicURL: publicURL,
    mediaPath: mediaPath,
    ownsURL: ownsURL
  };
})(window);
