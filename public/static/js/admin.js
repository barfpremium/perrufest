/* Perrufest · panel de gestión (sin dependencias) */
(function () {
  'use strict';
  var pending = 0; // subidas en curso

  // ---------- Confirmaciones ----------
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (f.hasAttribute('data-confirm') && !confirm(f.getAttribute('data-confirm'))) { e.preventDefault(); return; }
    if (pending > 0) { e.preventDefault(); alert('Espera a que termine de subirse el archivo antes de guardar.'); }
  });
  window.addEventListener('beforeunload', function (e) { if (pending > 0) { e.preventDefault(); e.returnValue = ''; } });

  // ---------- Imágenes en el navegador ----------
  function decode(file) {
    var viaImg = function () {
      return new Promise(function (resolve, reject) {
        var url = URL.createObjectURL(file); var im = new Image();
        im.onload = function () { resolve({ src: im, w: im.naturalWidth, h: im.naturalHeight, close: function () { URL.revokeObjectURL(url); } }); };
        im.onerror = function () { URL.revokeObjectURL(url); reject(new Error(/hei[cf]/i.test(file.type + file.name) ? 'Formato HEIC: este navegador no puede leerlo. Prueba desde Safari o conviértela a JPG.' : 'No se puede leer la imagen')); };
        im.src = url;
      });
    };
    if (window.createImageBitmap) {
      return createImageBitmap(file, { imageOrientation: 'from-image' }).then(function (b) {
        return { src: b, w: b.width, h: b.height, close: function () { b.close && b.close(); } };
      }, viaImg);
    }
    return viaImg();
  }
  function encode(img, scale, type, quality) {
    var w = Math.max(1, Math.round(img.w * scale)), h = Math.max(1, Math.round(img.h * scale));
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var ctx = c.getContext('2d');
    if (type === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img.src, 0, 0, w, h);
    return new Promise(function (resolve, reject) {
      c.toBlob(function (b) { c.width = c.height = 0; b ? resolve(b) : reject(new Error('No se pudo procesar la imagen')); }, type, quality);
    });
  }
  var fit = function (img, maxLong) { return Math.min(1, maxLong / Math.max(img.w, img.h)); };

  function post(url, body, onProgress, fileType) {
    return new Promise(function (resolve, reject) {
      var x = new XMLHttpRequest();
      x.open('POST', url);
      x.setRequestHeader('Content-Type', 'application/octet-stream');
      if (fileType) x.setRequestHeader('X-File-Type', fileType);
      if (onProgress) x.upload.onprogress = function (e) { if (e.lengthComputable) onProgress(e.loaded / e.total); };
      x.onload = function () {
        var res; try { res = JSON.parse(x.responseText); } catch (e) { res = { ok: false, error: 'Respuesta inesperada del servidor (' + x.status + ')' }; }
        if (x.status === 401) res.error = 'La sesión ha caducado: recarga la página y vuelve a entrar.';
        res.ok ? resolve(res) : reject(new Error(res.error || 'Error al subir'));
      };
      x.onerror = function () { reject(new Error('Sin conexión con el servidor')); };
      x.send(body);
    });
  }
  function postJson(url, obj) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) })
      .then(function (r) { return r.json(); })
      .then(function (r) { if (!r.ok) throw new Error(r.error || 'Error'); return r; });
  }

  // ---------- Campos de archivo individuales (logo, cartel, vídeo…) ----------
  document.querySelectorAll('[data-upload]').forEach(function (box) {
    var kind = box.getAttribute('data-upload');
    var max = Number(box.getAttribute('data-max')) || 2400;
    var hidden = box.querySelector('input[type=hidden]');
    var file = box.querySelector('input[type=file]');
    var preview = box.querySelector('.a-upl-preview');
    var clear = box.querySelector('[data-clear]');
    var status = box.querySelector('.a-upl-status');

    clear.addEventListener('click', function () {
      hidden.value = ''; preview.innerHTML = '<span class="a-empty">Sin ' + (kind === 'video' ? 'vídeo' : 'imagen') + '</span>'; clear.hidden = true;
      status.textContent = 'Se quitará al guardar.';
    });
    file.addEventListener('change', function () {
      var f = file.files[0]; if (!f) return;
      pending++; status.textContent = 'Preparando…';
      var job;
      if (kind === 'video') {
        if (f.size > 95 * 1024 * 1024) { pending--; status.textContent = '✗ El vídeo supera 95 MB. Súbelo a YouTube y pega el enlace.'; file.value = ''; return; }
        job = post('/admin/api/subir?tipo=video', f, function (p) { status.textContent = 'Subiendo… ' + Math.round(p * 100) + '%'; }, f.type || 'video/mp4');
      } else {
        var png = f.type === 'image/png';
        job = decode(f).then(function (img) {
          return encode(img, fit(img, max), png ? 'image/png' : 'image/jpeg', 0.9).then(function (b) { img.close(); return b; });
        }).then(function (blob) {
          return post('/admin/api/subir?tipo=imagen', blob, function (p) { status.textContent = 'Subiendo… ' + Math.round(p * 100) + '%'; });
        });
      }
      job.then(function (res) {
        hidden.value = res.path; clear.hidden = false;
        preview.innerHTML = kind === 'video' ? '<video controls preload="metadata"></video>' : '<img alt="">';
        preview.firstChild.src = res.url;
        status.textContent = '✓ Listo. Recuerda pulsar «Guardar».';
      }).catch(function (err) { status.textContent = '✗ ' + err.message; })
        .finally(function () { pending--; file.value = ''; });
    });
  });

  // Organizadores: no se asocian a ediciones (salen siempre)
  var kindSel = document.getElementById('f-kind');
  var edChecks = document.getElementById('ed-checks');
  if (kindSel && edChecks) kindSel.addEventListener('change', function () { edChecks.hidden = kindSel.value === 'organizador'; });

  // ---------- Subida de fotos por lotes ----------
  var uploader = document.getElementById('uploader');
  if (uploader) {
    var eventId = uploader.getAttribute('data-event');
    var input = document.getElementById('files');
    var drop = document.getElementById('drop');
    var prog = document.getElementById('up-progress');
    var bar = document.getElementById('up-bar');
    var text = document.getElementById('up-text');
    var errs = document.getElementById('up-errors');
    var grpInput = document.getElementById('up-grp');

    var processOne = function (f, grp, sort) {
      return decode(f).then(function (img) {
        var tScale = Math.min(1, 400 / Math.min(img.w, img.h), 900 / Math.max(img.w, img.h));
        return Promise.all([
          encode(img, tScale, 'image/jpeg', 0.78),
          encode(img, fit(img, 1600), 'image/jpeg', 0.82),
          encode(img, fit(img, 3200), 'image/jpeg', 0.9),
        ]).then(function (b) {
          var w = img.w, h = img.h; img.close();
          var mScale = fit({ w: w, h: h }, 1600);
          var qs = '?w=' + Math.round(w * mScale) + '&h=' + Math.round(h * mScale) + '&grp=' + encodeURIComponent(grp) + '&sort=' + sort + '&lt=' + b[0].size + '&lm=' + b[1].size + '&lo=' + b[2].size;
          return post('/admin/api/eventos/' + eventId + '/fotos' + qs, new Blob(b));
        });
      });
    };

    var run = function (files) {
      files = Array.prototype.filter.call(files, function (f) { return /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name); });
      if (!files.length) return;
      files.sort(function (a, b) { return a.name.localeCompare(b.name, 'es', { numeric: true }); });
      var grp = grpInput.value.trim();
      var base = Number(uploader.getAttribute('data-maxsort')) || 0;
      var done = 0, failed = 0, next = 0;
      prog.hidden = false; errs.innerHTML = ''; pending++;
      var update = function () {
        bar.style.width = Math.round(((done + failed) / files.length) * 100) + '%';
        text.textContent = 'Subidas ' + done + ' de ' + files.length + (failed ? ' · ' + failed + ' con error' : '') + (done + failed < files.length ? '… no cierres esta página.' : '');
      };
      update();
      var worker = function () {
        if (next >= files.length) return Promise.resolve();
        var idx = next++; var f = files[idx];
        var attempt = function (n) {
          return processOne(f, grp, base + idx + 1).catch(function (err) {
            if (n < 2 && !/HEIC|leer/.test(err.message)) return new Promise(function (r) { setTimeout(r, 1500); }).then(function () { return attempt(n + 1); });
            throw err;
          });
        };
        return attempt(1).then(function () { done++; }, function (err) {
          failed++; var li = document.createElement('li'); li.textContent = f.name + ': ' + err.message; errs.appendChild(li);
        }).then(function () { update(); return worker(); });
      };
      Promise.all([worker(), worker()]).then(function () {
        pending--;
        uploader.setAttribute('data-maxsort', base + files.length);
        text.textContent = '✓ ' + done + ' fotos subidas' + (failed ? ' · ' + failed + ' con error (revisa la lista)' : '') + '.';
        if (!failed) setTimeout(function () { location.reload(); }, 800);
        else { var a = document.createElement('button'); a.className = 'a-btn a-btn-sm'; a.textContent = 'Ver fotos subidas'; a.onclick = function () { location.reload(); }; text.appendChild(document.createTextNode(' ')); text.appendChild(a); }
      });
    };

    input.addEventListener('change', function () { run(input.files); input.value = ''; });
    ['dragenter', 'dragover'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('is-over'); }); });
    ['dragleave', 'drop'].forEach(function (t) { drop.addEventListener(t, function () { drop.classList.remove('is-over'); }); });
    drop.addEventListener('drop', function (e) { e.preventDefault(); run(e.dataTransfer.files); });
  }

  // ---------- Gestión de fotos: selección, acciones y orden ----------
  var list = document.getElementById('photos');
  if (list) {
    var ev = list.getAttribute('data-event');
    var selAll = document.getElementById('sel-all');
    var selCount = document.getElementById('sel-count');
    var selected = function () { return Array.prototype.map.call(list.querySelectorAll('input:checked'), function (i) { return Number(i.value); }); };
    var refresh = function () { var n = selected().length; selCount.textContent = n + (n === 1 ? ' seleccionada' : ' seleccionadas'); };
    list.addEventListener('change', refresh);
    selAll.addEventListener('change', function () { list.querySelectorAll('input').forEach(function (i) { i.checked = selAll.checked; }); refresh(); });

    document.getElementById('toolbar').addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]'); if (!b) return;
      var ids = selected(); var act = b.getAttribute('data-act');
      if (!ids.length) { alert('Primero marca una o varias fotos.'); return; }
      if (act === 'portada' && ids.length > 1) { alert('Marca solo una foto para usarla como portada.'); return; }
      if (act === 'borrar' && !confirm('¿Borrar ' + ids.length + (ids.length === 1 ? ' foto' : ' fotos') + '? No se puede deshacer.')) return;
      var payload = { event: ev, action: act, ids: ids };
      if (act === 'grupo') payload.grp = document.getElementById('tb-grp').value;
      b.disabled = true;
      postJson('/admin/api/fotos', payload).then(function () { location.reload(); }).catch(function (err) { alert(err.message); b.disabled = false; });
    });

    // Arrastrar para ordenar (ordenador)
    var dragged = null;
    list.addEventListener('dragstart', function (e) { dragged = e.target.closest('li'); if (!dragged) return; dragged.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    list.addEventListener('dragover', function (e) {
      e.preventDefault();
      var li = e.target.closest('li'); if (!li || li === dragged) return;
      list.querySelectorAll('.drop-before').forEach(function (x) { x.classList.remove('drop-before'); });
      li.classList.add('drop-before');
    });
    list.addEventListener('drop', function (e) {
      e.preventDefault();
      var li = e.target.closest('li');
      list.querySelectorAll('.drop-before').forEach(function (x) { x.classList.remove('drop-before'); });
      if (!li || !dragged || li === dragged) return;
      list.insertBefore(dragged, li);
      var ids = Array.prototype.map.call(list.children, function (x) { return Number(x.getAttribute('data-id')); });
      postJson('/admin/api/fotos', { event: ev, action: 'orden', ids: ids }).catch(function (err) { alert('No se pudo guardar el orden: ' + err.message); });
    });
    list.addEventListener('dragend', function () { if (dragged) dragged.classList.remove('dragging'); dragged = null; });
  }
})();
