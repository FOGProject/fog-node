/**
 * fog.csrf.js
 *
 * App-wide CSRF wiring for the browser. Sails' CSRF protection is enabled
 * (config/security.js); this attaches the token to everything that mutates:
 *   - jQuery AJAX (DataTables loads + row deletes) via $.ajaxSetup
 *   - window.fetch (the create/edit modal, credential + account panels)
 *   - full-page form submits (login, edit) via an injected hidden _csrf field
 *
 * The token comes (in order) from the `<meta name="csrf-token">` rendered into
 * every page's <head> (synchronous, so it's set before any on-load AJAX),
 * then `SAILS_LOCALS._csrf`, then an async `GET /csrfToken`. `/api/v1/*` is
 * exempt server side, so token-authenticated API clients are unaffected.
 */
(function () {
  var token = null;

  // Inject _csrf into a mutating form just before it submits (capture phase, so
  // it runs before the create/edit modal reads the form's FormData).
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (!f || !f.tagName || f.tagName.toLowerCase() !== 'form') { return; }
    if (f.method && f.method.toLowerCase() === 'get') { return; }
    if (!token) { return; }
    if (!f.querySelector('input[name="_csrf"]')) {
      var i = document.createElement('input');
      i.type = 'hidden'; i.name = '_csrf'; i.value = token;
      f.appendChild(i);
    }
  }, true);

  function apply(t) {
    if (!t) { return; }
    token = t;
    if (window.jQuery) {
      window.jQuery.ajaxSetup({ headers: { 'X-CSRF-Token': t } });
    }
    if (window.fetch && !window.__fogCsrfWrapped) {
      window.__fogCsrfWrapped = true;
      var orig = window.fetch;
      window.fetch = function (input, init) {
        init = init || {};
        var method = (init.method || (input && input.method) || 'GET').toUpperCase();
        if (method !== 'GET' && method !== 'HEAD') {
          if (init.headers instanceof Headers) {
            if (!init.headers.has('X-CSRF-Token')) { init.headers.set('X-CSRF-Token', token); }
          } else {
            init.headers = init.headers || {};
            if (init.headers['X-CSRF-Token'] === undefined && init.headers['x-csrf-token'] === undefined) {
              init.headers['X-CSRF-Token'] = token;
            }
          }
        }
        return orig.call(this, input, init);
      };
    }
  }

  // Prefer the synchronous token: a <meta name="csrf-token"> rendered into every
  // page's <head>, so $.ajaxSetup + the fetch wrapper are wired before the page
  // fires any AJAX. Fall back to SAILS_LOCALS, then to an async GET /csrfToken.
  function metaToken() {
    var m = document.querySelector('meta[name="csrf-token"]');
    var v = m && m.getAttribute('content');
    return v ? v : null;
  }

  var local = metaToken() || (window.SAILS_LOCALS && window.SAILS_LOCALS._csrf) || null;
  if (local) {
    apply(local);
  } else if (window.fetch) {
    window.fetch('/csrfToken', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (j) { apply(j && j._csrf); })
      .catch(function () {});
  }
})();
