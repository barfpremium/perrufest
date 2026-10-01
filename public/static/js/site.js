/* Perrufest · comportamiento común (sin dependencias) */
(function () {
  'use strict';

  // ---------- Avisos breves ----------
  function toast(msg) {
    var t = document.createElement('div');
    t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:calc(84px + env(safe-area-inset-bottom));transform:translateX(-50%);background:#1E2730;color:#fff;padding:12px 18px;border-radius:999px;font-weight:600;z-index:200;box-shadow:0 8px 24px rgba(0,0,0,.3)';
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2600);
  }
  window.pfToast = toast;

  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(function () { toast('Enlace copiado'); });
    var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('Enlace copiado'); } catch (e) { prompt('Copia el enlace:', text); }
    ta.remove();
    return Promise.resolve();
  }
  window.pfCopy = copy;

  function share(title, url) {
    if (navigator.share) return navigator.share({ title: title, url: url }).catch(function () {});
    return copy(url);
  }
  window.pfShare = share;

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-share]');
    if (b) { share(b.getAttribute('data-title') || document.title, location.href.split('#')[0]); return; }
    var c = e.target.closest('[data-copy]');
    if (c) copy(c.getAttribute('data-copy'));
  });

  // ---------- Formulario de contacto ----------
  var form = document.getElementById('contact-form');
  if (!form) return;
  var alertBox = form.querySelector('.form-alert');
  var okBox = document.getElementById('form-ok');

  var checks = {
    name: function (v) { return v.trim() ? '' : 'Escribe tu nombre.'; },
    email: function (v) { v = v.trim(); return !v ? 'Escribe tu correo electrónico.' : /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? '' : 'Revisa el correo electrónico: parece incompleto.'; },
    phone: function (v) { v = v.trim(); return !v || /^[+\d\s().-]{6,25}$/.test(v) ? '' : 'Revisa el teléfono (solo números, espacios y +).'; },
    kind: function () { return form.querySelector('input[name=kind]:checked') ? '' : 'Elige el tipo de participación.'; },
    message: function (v) { return v.trim().length >= 10 ? '' : 'Cuéntanos un poco más (al menos 10 caracteres).'; },
    privacy: function () { return form.elements.privacy.checked ? '' : 'Necesitamos que aceptes la política de privacidad para poder responderte.'; },
  };

  function setError(name, msg) {
    var p = document.getElementById('e-' + name);
    if (p) { p.textContent = msg || ''; p.hidden = !msg; }
    var el = form.elements[name];
    var inputs = el && el.length && !el.tagName ? Array.prototype.slice.call(el) : el ? [el] : [];
    inputs.forEach(function (i) {
      if (msg) { i.setAttribute('aria-invalid', 'true'); i.setAttribute('aria-describedby', 'e-' + name); }
      else i.removeAttribute('aria-invalid');
    });
  }
  function validateAll() {
    var first = null;
    Object.keys(checks).forEach(function (k) {
      var el = form.elements[k];
      var msg = checks[k](el && el.value != null ? el.value : '');
      setError(k, msg);
      if (msg && !first) first = k;
    });
    return first;
  }
  function focusField(k) {
    var el = form.elements[k];
    if (el && el.length && !el.tagName) el = el[0];
    if (el) el.focus();
  }

  form.addEventListener('change', function (e) { var n = e.target.name; if (checks[n]) setError(n, checks[n](e.target.value || '')); });
  form.addEventListener('focusout', function (e) { var n = e.target.name; if (checks[n] && e.target.value && n !== 'kind') setError(n, checks[n](e.target.value)); });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    alertBox.hidden = true;
    var bad = validateAll();
    if (bad) { focusField(bad); return; }
    var btn = form.querySelector('button[type=submit]');
    btn.setAttribute('aria-busy', 'true'); btn.disabled = true;
    var label = btn.textContent; btn.textContent = 'Enviando…';
    var body = {};
    new FormData(form).forEach(function (v, k) { body[k] = v; });
    fetch(form.action, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
      .then(function (res) {
        if (res && res.ok) {
          form.hidden = true; okBox.hidden = false; okBox.focus();
          okBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
        var errs = (res && res.errors) || {};
        var firstField = null;
        Object.keys(checks).forEach(function (k) { setError(k, errs[k] || ''); if (errs[k] && !firstField) firstField = k; });
        if (errs._form || !firstField) { alertBox.textContent = errs._form || 'No hemos podido enviar tu mensaje. Inténtalo de nuevo.'; alertBox.hidden = false; alertBox.scrollIntoView({ block: 'center' }); }
        if (firstField) focusField(firstField);
      })
      .catch(function () {
        alertBox.textContent = 'No hay conexión o el servidor no responde. Tu mensaje no se ha enviado: revisa la conexión e inténtalo de nuevo.';
        alertBox.hidden = false;
      })
      .finally(function () { btn.removeAttribute('aria-busy'); btn.disabled = false; btn.textContent = label; });
  });
})();
