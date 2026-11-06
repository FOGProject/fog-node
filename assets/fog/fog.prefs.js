/**
 * fog.prefs.js
 *
 * The signed-in user's preferences, stored on the server
 * (GET/POST /account/preferences), so they follow the user to any browser.
 * A port of FOG 1.6 fogPrefStore/fogPrefFetch (fog.common.js).
 *
 *   fogPrefStore(key, value)  sets one key, or deletes it when value is '' or
 *                             null. Resolves to the new {key: value} map.
 *   fogPrefFetch()            resolves to the {key: value} map.
 *
 * Both reject with an Error that carries the server's `error` message. The
 * POST needs the CSRF token, which fog.csrf.js adds to every fetch.
 */
(function () {
  var ENDPOINT = '/account/preferences';

  // AT MOST ONE WRITE PER KEY IN FLIGHT, and the newest value wins. One user
  // gesture can save the same key several times (a table writes its layout on
  // every resize pass). Sent at once, the server answers them in any order,
  // and the row keeps the value that ANSWERS last rather than the one SENT
  // last. So while a key's write is in flight, a later value is held, and only
  // the newest held value is sent when that write completes. Per key: two
  // different keys never wait on each other.
  var inFlight = {};
  // key -> {value, waiters}: the newest held value, and the callers waiting on it.
  var pending = {};

  function request(method, body) {
    var init = {
      method: method,
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' }
    };
    if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    return fetch(ENDPOINT, init).then((res) => {
      return res.json().catch(() => { return {}; }).then((data) => {
        if (!res.ok) { throw new Error((data && data.error) || ('HTTP ' + res.status)); }
        return data;
      });
    });
  }

  function store(key, value) {
    return new Promise((resolve, reject) => {
      if (inFlight[key]) {
        // A superseded caller learns the outcome of the write that lands,
        // which carries the value that stuck.
        var held = pending[key];
        pending[key] = {
          value: value,
          waiters: (held ? held.waiters : []).concat([{ resolve: resolve, reject: reject }])
        };
        return;
      }
      inFlight[key] = true;
      // Release the key on success AND failure, or one error would hold every
      // later write of this key for the life of the page.
      var release = function () {
        delete inFlight[key];
        var next = pending[key];
        if (!next) { return; }
        delete pending[key];
        store(key, next.value).then((prefs) => {
          next.waiters.forEach((w) => { w.resolve(prefs); });
        }, (err) => {
          next.waiters.forEach((w) => { w.reject(err); });
        });
      };
      request('POST', { key: key, value: value }).then((prefs) => {
        resolve(prefs);
        release();
      }, (err) => {
        reject(err);
        release();
      });
    });
  }

  window.fogPrefStore = store;
  window.fogPrefFetch = function () { return request('GET'); };
})();
