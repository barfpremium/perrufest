/* Perrufest · galería con carga progresiva y visor (sin dependencias) */
(function () {
  'use strict';
  var dataEl = document.getElementById('photos-data');
  var grid = document.getElementById('grid');
  if (!dataEl || !grid) return;

  var all = JSON.parse(dataEl.textContent);
  var list = all;            // fotos del filtro activo
  var rendered = grid.children.length;
  var BATCH = 36;
  var more = document.getElementById('more');
  var slug = grid.getAttribute('data-slug');
  var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  // ---------- Cuadrícula progresiva ----------
  function item(p, i) {
    var li = document.createElement('li');
    var a = document.createElement('a');
    a.href = p.m; a.setAttribute('data-i', i);
    var img = document.createElement('img');
    img.src = p.t; img.alt = 'Foto ' + (i + 1) + ' de ' + list.length;
    img.loading = 'lazy'; img.decoding = 'async';
    if (p.w) { img.width = p.w; img.height = p.h; }
    a.appendChild(img); li.appendChild(a);
    return li;
  }
  function renderMore() {
    if (rendered >= list.length) { more.textContent = list.length > BATCH ? 'Has llegado al final · ' + list.length + ' fotos' : ''; return; }
    var frag = document.createDocumentFragment();
    var end = Math.min(rendered + BATCH, list.length);
    for (var i = rendered; i < end; i++) frag.appendChild(item(list[i], i));
    grid.appendChild(frag);
    rendered = end;
    more.textContent = rendered < list.length ? 'Cargando más fotos…' : (list.length > BATCH ? 'Has llegado al final · ' + list.length + ' fotos' : '');
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) renderMore();
    }, { rootMargin: '1200px 0px' }).observe(more);
  } else {
    while (rendered < list.length) renderMore();
  }
  // si la pantalla es alta, rellena hasta cubrirla
  renderMore();

  // ---------- Filtros por grupo ----------
  document.querySelectorAll('.filter').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.filter').forEach(function (b) { b.setAttribute('aria-pressed', String(b === btn)); });
      var g = btn.getAttribute('data-group');
      list = g ? all.filter(function (p) { return p.g === g; }) : all;
      grid.innerHTML = ''; rendered = 0; renderMore();
    });
  });

  // ---------- Visor ----------
  var lb = document.getElementById('lb');
  var img = document.getElementById('lb-img');
  var stage = document.getElementById('lb-stage');
  var count = document.getElementById('lb-count');
  var dl = document.getElementById('lb-dl');
  var prevB = document.getElementById('lb-prev');
  var nextB = document.getElementById('lb-next');
  var closeB = document.getElementById('lb-close');
  var shareB = document.getElementById('lb-share');
  var report = document.getElementById('lb-report');
  var cur = -1; var pushed = false; var lastFocus = null;

  function photoLink(p) { return location.origin + '/galeria/' + slug + '#foto-' + p.id; }
  function preload(i) { if (list[i]) { var im = new Image(); im.src = list[i].m; } }

  function show(i) {
    if (i < 0 || i >= list.length) return;
    cur = i;
    var p = list[i];
    stage.classList.add('is-loading'); img.classList.add('loading');
    img.onload = function () { stage.classList.remove('is-loading'); img.classList.remove('loading'); };
    img.onerror = img.onload;
    img.src = p.m;
    img.alt = 'Foto ' + (i + 1) + ' de ' + list.length;
    count.textContent = (i + 1) + ' / ' + list.length;
    dl.href = '/foto/' + p.id + '/descargar';
    report.href = '/participa?retirada=' + encodeURIComponent(slug) + '&foto=' + p.id;
    prevB.disabled = i === 0; nextB.disabled = i === list.length - 1;
    history.replaceState(history.state, '', '#foto-' + p.id);
    preload(i + 1); preload(i - 1);
    while (i >= rendered && rendered < list.length) renderMore(); // mantiene la cuadrícula al día
  }
  function open(i, push) {
    lastFocus = document.activeElement;
    lb.hidden = false; document.body.classList.add('lb-open');
    if (push) { history.pushState({ lb: 1 }, '', '#foto-' + list[i].id); pushed = true; }
    show(i);
    closeB.focus();
  }
  function hide() {
    if (lb.hidden) return;
    lb.hidden = true; document.body.classList.remove('lb-open');
    img.removeAttribute('src');
    history.replaceState(null, '', location.pathname + location.search);
    var a = grid.querySelector('a[data-i="' + cur + '"]');
    var target = a || lastFocus;
    if (target && target.focus) target.focus({ preventScroll: false });
  }
  function close() {
    if (pushed) { pushed = false; history.back(); } // popstate cierra
    else hide();
  }
  window.addEventListener('popstate', function () { pushed = false; hide(); });

  grid.addEventListener('click', function (e) {
    var a = e.target.closest('a[data-i]');
    if (!a) return;
    e.preventDefault();
    open(Number(a.getAttribute('data-i')), true);
  });
  prevB.addEventListener('click', function () { show(cur - 1); });
  nextB.addEventListener('click', function () { show(cur + 1); });
  closeB.addEventListener('click', close);
  shareB.addEventListener('click', function () { window.pfShare('Foto de Perrufest', photoLink(list[cur])); });

  // En iPhone/iPad: compartir el archivo permite «Guardar imagen» en Fotos
  dl.addEventListener('click', function (e) {
    if (!isIOS || !navigator.canShare) return;
    e.preventDefault();
    var href = dl.href;
    window.pfToast('Preparando la foto…');
    fetch(href).then(function (r) { return r.blob(); }).then(function (blob) {
      var file = new File([blob], 'perrufest-' + slug + '-' + list[cur].id + '.jpg', { type: 'image/jpeg' });
      if (navigator.canShare({ files: [file] })) {
        return navigator.share({ files: [file] }).catch(function (err) {
          if (err && err.name === 'NotAllowedError') location.href = href;
        });
      }
      location.href = href;
    }).catch(function () { location.href = href; });
  });

  document.addEventListener('keydown', function (e) {
    if (lb.hidden) return;
    if (e.key === 'ArrowLeft') show(cur - 1);
    else if (e.key === 'ArrowRight') show(cur + 1);
    else if (e.key === 'Escape') close();
    else if (e.key === 'Tab') { // foco dentro del visor
      var f = Array.prototype.filter.call(lb.querySelectorAll('a[href], button:not([disabled])'), function (x) { return x.offsetParent; });
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });

  // Gestos: deslizar a los lados para cambiar, hacia abajo para cerrar
  var sx = 0, sy = 0, st = 0, tracking = false;
  stage.addEventListener('pointerdown', function (e) { tracking = true; sx = e.clientX; sy = e.clientY; st = Date.now(); });
  stage.addEventListener('pointermove', function (e) {
    if (!tracking) return;
    var dx = e.clientX - sx, dy = e.clientY - sy;
    img.style.transform = Math.abs(dx) > Math.abs(dy) ? 'translateX(' + dx + 'px)' : (dy > 0 ? 'translateY(' + dy + 'px)' : '');
  });
  function endGesture(e) {
    if (!tracking) return;
    tracking = false;
    var dx = e.clientX - sx, dy = e.clientY - sy, fast = Date.now() - st < 300;
    img.style.transform = '';
    if (Math.abs(dx) > Math.abs(dy) && (Math.abs(dx) > 60 || (fast && Math.abs(dx) > 25))) { dx < 0 ? show(cur + 1) : show(cur - 1); }
    else if (dy > 110) close();
    else if (Math.abs(dx) < 8 && Math.abs(dy) < 8 && e.pointerType === 'mouse' && e.target === stage) close();
  }
  stage.addEventListener('pointerup', endGesture);
  stage.addEventListener('pointercancel', function () { tracking = false; img.style.transform = ''; });

  // Abrir directamente una foto compartida (#foto-123)
  function fromHash() {
    var m = location.hash.match(/^#foto-(\d+)$/);
    if (!m || !lb.hidden) return;
    var idx = list.findIndex(function (p) { return String(p.id) === m[1]; });
    if (idx < 0) { list = all; idx = all.findIndex(function (p) { return String(p.id) === m[1]; }); }
    if (idx >= 0) open(idx, false);
  }
  window.addEventListener('hashchange', fromHash);
  fromHash();
})();
