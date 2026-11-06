/**
 * fog.theme.js
 *
 * The System/Light/Dark picker in the Preferences dialog
 * (views/layouts/partials/prefs-modal.ejs). A port of FOG 1.6 theme.js.
 *
 * data-bs-theme on <html> is the single source of truth: Bootstrap 5,
 * AdminLTE 4 and zz-fog-ui.css all key off it. It is already correct before
 * this file runs. views/layouts/layout.ejs stamps a stored light/dark choice
 * on <html> server-side, and its pre-paint script resolves
 * prefers-color-scheme when there is none. So this file never decides the
 * first paint. It ticks the stored choice, applies a new choice at once, and
 * in System mode follows the OS when it changes while the page is open.
 *
 * Three states, and '' is not 'light': '' is System. The stored choice is
 * stored per user on the server (display.theme), so it follows the user to
 * any browser. The login page has no #themePref and no picker; it follows
 * the system.
 */
(function () {
  var PREF = 'display.theme';

  function systemPrefersDark() {
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  // The theme shown for a stored choice of '' | 'light' | 'dark'.
  function effective(pref) {
    if (pref === 'dark' || pref === 'light') { return pref; }
    return systemPrefersDark() ? 'dark' : 'light';
  }

  function apply(pref) {
    var theme = effective(pref);
    document.documentElement.setAttribute('data-bs-theme', theme);
    // Lets a widget that caches resolved colors (a chart) recolor itself.
    document.dispatchEvent(new CustomEvent('fog:themechange', { detail: { dark: theme === 'dark' } }));

    // #themePref holds the STORED choice, which is not always the value on
    // <html>: the tick must tell "System, which is dark now" from "Dark".
    var carrier = document.getElementById('themePref');
    if (!carrier) { return; }
    carrier.setAttribute('data-theme-pref', pref);
    document.querySelectorAll('[data-theme-choice]').forEach((item) => {
      var tick = item.querySelector('.theme-choice-tick');
      if (tick) { tick.classList.toggle('invisible', item.getAttribute('data-theme-choice') !== pref); }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    var carrier = document.getElementById('themePref');
    // The login page: no session, so no preference to read or write.
    if (!carrier) { return; }

    apply(carrier.getAttribute('data-theme-pref') || '');

    document.querySelectorAll('[data-theme-choice]').forEach((item) => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        var chosen = item.getAttribute('data-theme-choice') || '';
        // Applied before the request, not after it: the theme is a client-side
        // attribute flip, and waiting on the network only adds lag. '' deletes
        // the stored row, which is what "follow the system" means.
        apply(chosen);
        window.fogPrefStore(PREF, chosen).catch((err) => {
          window.fogToast('error', 'The theme was not saved: ' + err.message);
        });
      });
    });

    // In System mode, follow the OS while the page is open. Without this, a
    // desktop that turns dark at dusk keeps a light FOG until the next page.
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      var onChange = function () {
        if ((carrier.getAttribute('data-theme-pref') || '') === '') { apply(''); }
      };
      if (mq.addEventListener) {
        mq.addEventListener('change', onChange);
      } else if (mq.addListener) {
        // Safari < 14.
        mq.addListener(onChange);
      }
    }
  });
})();
