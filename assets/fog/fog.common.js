const sizes = ['iB', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
$.registerTable = function(e, onSelect, opts) {
  $(e).registerTable(onSelect, opts);
};
$.fn.registerTable = function(onSelect, opts) {
  opts = opts || {};
  opts = _.defaults(opts, {
    paging: true,
    searching: true,
    ordering: true,
    stateSave: false,
    autoWidth: true,
    // Infinite scroll (DataTables Scroller) instead of classic pagination.
    // serverSide is set per-list; Scroller drives the start/length the server
    // already implements in api/helpers/datatables/get-data.js.
    scroller: true,
    scrollY: '52vh',
    scrollCollapse: true,
    deferRender: true,
    responsive: false,
    buttons: [
      {
        extend: 'selectAll',
        text: '<i class="fa fa-check-square-o"></i> Select All'
      },
      {
        extend: 'selectNone',
        text: '<i class="fa fa-square-o"></i> Select None'
      },
      {
        text: '<i class="fa fa-refresh"></i> Refresh',
        action: function(e, dt) {
          dt.clear().draw();
          dt.ajax.reload();
        }
      },
      {
        text: '<i class="fa fa-edit"></i> Edit',
        action: function(e, dt) {
          let rows = dt.rows({selected: true}).data().toArray();
          if (rows.length !== 1) {
            window.fogToast('error', 'Select exactly one row to edit.');
            return;
          }
          let base = window.location.pathname.replace(/\/$/, '');
          window.location = `${base}/edit/${rows[0].id}`;
        }
      },
      {
        text: '<i class="fa fa-trash"></i> Delete',
        className: 'btn-danger',
        action: function(e, dt) {
          let ids = dt.rows({selected: true}).data().toArray().map((r) => r.id).filter(Boolean);
          if (!ids.length) {
            window.fogToast('error', 'Select one or more rows to delete.');
            return;
          }
          window.fogConfirm({
            title: `Delete ${ids.length} selected item(s)?`,
            body: 'This cannot be undone.',
            confirmText: 'Delete',
            danger: true
          }).then((ok) => {
            if (!ok) { return; }
            let base = dt.ajax.url().replace(/\/datatable.*$/, '');
            $.ajax({
              url: base,
              type: 'DELETE',
              contentType: 'application/json',
              data: JSON.stringify({id: ids}),
              complete: function() {
                dt.ajax.reload();
              }
            });
          });
        }
      }
    ],
    // Render a missing/association field as empty instead of throwing the
    // DataTables "Requested unknown parameter" warning.
    columnDefs: [
      { targets: '_all', defaultContent: '' }
    ],
    select: {
      style: 'multi+shift'
    },
    search: {
      regex: true,
      caseInsen: true,
      smart: true
    },
    // Scroller replaces the length menu (l) and pagination (p); keep search (f),
    // buttons (B), table+processing (tr) and info (i).
    dom: "<'row'<'col-sm-12'f>>B<'row'<'col-sm-12'tr>><'row'<'col-sm-12'i>>",
    retrieve: true,
    processing: true
  });

  // Opt-in "Create new" button (createMode: 'modal' | 'page'). Lists without a
  // create route simply omit it. 'page' navigates to /{plural}/create; 'modal'
  // lazy-loads that same server-rendered form into the shared #entityModal.
  if (opts.createMode === 'modal' || opts.createMode === 'page') {
    let createMode = opts.createMode;
    let createLabel = opts.createLabel;
    opts.buttons = [{
      text: '<i class="fa fa-plus"></i> ' + (createLabel || 'Create New'),
      className: 'btn-success',
      action: function(e, dt) {
        let url = window.location.pathname.replace(/\/$/, '') + '/create';
        if (createMode === 'page') { window.location = url; return; }
        window.fogCreateModal(url, dt);
      }
    }].concat(opts.buttons);
  }
  delete opts.createMode;
  delete opts.createLabel;

  // Per-list extra toolbar buttons (e.g. host bulk actions) appended to the
  // shared Select/Edit/Delete set.
  if (Array.isArray(opts.extraButtons)) {
    opts.buttons = opts.buttons.concat(opts.extraButtons);
    delete opts.extraButtons;
  }

  let table = $(this).DataTable(opts);

  if (onSelect !== undefined && typeof onSelect === 'function') {
    table.on('select deselect', (e, dt) => {
      onSelect(dt.rows({selected: true}));
    });
  }

  return table;
};
$.readableBytes = function(bytes) {
  var i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2) * 1} ${sizes[i]}`;
};

// Shared "create new <thing>" modal. Lazy-loads the exact same server-rendered
// /{plural}/create form used for full-page create, AJAX-submits it (JSON), then
// closes and reloads the table. Used by the registerTable "Create New" button
// when createMode === 'modal'. Degrades to a full-page navigation if the modal
// or Bootstrap isn't present.
(function() {
  function notify(type, text) {
    try {
      if (window.PNotify && typeof PNotify.alert === 'function') {
        PNotify.alert({ type: type, text: text, delay: 2500 });
      }
    } catch (unusedErr) { /* toast is best-effort; the reloaded row is the real feedback */ }
  }
  function clearError(container) {
    let e = container.querySelector('.fog-form-error');
    if (e) { e.parentNode.removeChild(e); }
  }
  function showError(container, msg) {
    clearError(container);
    let d = document.createElement('div');
    d.className = 'alert alert-danger m-3 fog-form-error';
    d.textContent = msg;
    container.insertBefore(d, container.firstChild);
  }

  window.fogCreateModal = function(url, dt) {
    let modalEl = document.getElementById('entityModal');
    if (!modalEl || !window.bootstrap) { window.location = url; return; }
    let body = modalEl.querySelector('.modal-body');
    let titleEl = modalEl.querySelector('.modal-title');
    let modal = bootstrap.Modal.getOrCreateInstance(modalEl);

    body.innerHTML = '<div class="text-center p-4"><i class="fa fa-spinner fa-spin"></i> Loading…</div>';
    modal.show();

    // Bootstrap ignores a .hide() issued during the show transition, so a fast
    // create round-trip can leave the modal open. Track the shown state and
    // defer the close until the modal has actually finished opening.
    let shown = false;
    modalEl.addEventListener('shown.bs.modal', () => { shown = true; }, { once: true });
    function safeHide() {
      if (shown) { modal.hide(); }
      else { modalEl.addEventListener('shown.bs.modal', () => { modal.hide(); }, { once: true }); }
    }

    // ?modal=1 makes the create page render the form alone, in a
    // [data-fog-create-modal] root that carries the 1.6 modal title.
    fetch(url + '?modal=1', { headers: { 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'same-origin' })
      .then((r) => { return r.text(); })
      .then((html) => {
        let doc = new DOMParser().parseFromString(html, 'text/html');
        let root = doc.querySelector('[data-fog-create-modal]');
        let form = root && root.querySelector('form');
        if (titleEl) { titleEl.textContent = (root && root.getAttribute('data-title')) || 'Create'; }
        if (!form) { showError(body, 'Could not load the form.'); return; }
        body.innerHTML = '';
        body.appendChild(form);

        // Cancel is type="button" with data-bs-dismiss, so it never submits;
        // the explicit hide also covers a fast click during the show transition.
        let cancel = form.querySelector('[data-fog-cancel]');
        if (cancel) {
          cancel.addEventListener('click', safeHide);
        }

        form.addEventListener('submit', (ev) => {
          ev.preventDefault();
          clearError(body);
          let payload = new URLSearchParams(new FormData(form)).toString();
          fetch(form.getAttribute('action'), {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
              'Accept': 'application/json',
              'X-Requested-With': 'XMLHttpRequest',
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: payload
          }).then((r) => {
            return r.json().catch(() => { return {}; }).then((j) => {
              return { ok: r.ok, body: j };
            });
          }).then((res) => {
            if (res.ok && res.body && res.body.ok) {
              safeHide();
              if (dt) { dt.ajax.reload(null, false); }
              notify('success', 'Created successfully.');
            } else {
              showError(body, (res.body && res.body.message) || 'Could not save. Please check your input.');
            }
          }).catch(() => { showError(body, 'Network error — please try again.'); });
        });
      })
      .catch(() => { showError(body, 'Could not load the form.'); });
  };
})();

// Shared UI helpers used to replace native dialogs (alert/confirm/prompt) with
// AdminLTE/Bootstrap toasts + modals across the lists. Each degrades gracefully
// when its dependency (PNotify / Bootstrap) is missing.
(function() {
  // Toast notification; falls back to alert() if PNotify isn't loaded.
  function toast(type, text) {
    try {
      if (window.PNotify && typeof PNotify.alert === 'function') {
        PNotify.alert({ type: type === 'error' ? 'error' : type, text: text, delay: 3000 });
        return;
      }
    } catch (unusedErr) { /* fall through to native */ }
    window.alert(text);
  }

  // Build + show a Bootstrap modal. Returns {el, modal, body} or null (no
  // Bootstrap). `onConfirm(el, modal)` may return false (keep open) or a promise.
  function modal(opts) {
    opts = opts || {};
    if (!window.bootstrap) { return null; }
    let wrap = document.createElement('div');
    wrap.className = 'modal fade';
    wrap.tabIndex = -1;
    wrap.innerHTML =
      '<div class="modal-dialog modal-dialog-centered' + (opts.size ? ' ' + opts.size : '') + '">' +
        '<div class="modal-content">' +
          '<div class="modal-header"><h5 class="modal-title"></h5>' +
            '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>' +
          '<div class="modal-body"></div>' +
          '<div class="modal-footer">' +
            '<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">' +
              (opts.cancelText || 'Cancel') + '</button>' +
            '<button type="button" class="btn ' + (opts.danger ? 'btn-danger' : 'btn-primary') +
              '" data-fog-confirm>' + (opts.confirmText || 'OK') + '</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    wrap.querySelector('.modal-title').textContent = opts.title || '';
    let bodyEl = wrap.querySelector('.modal-body');
    if (typeof opts.body === 'string') { bodyEl.innerHTML = opts.body; }
    else if (opts.body instanceof Node) { bodyEl.appendChild(opts.body); }
    document.body.appendChild(wrap);
    let m = bootstrap.Modal.getOrCreateInstance(wrap);
    wrap.addEventListener('hidden.bs.modal', () => { m.dispose(); wrap.remove(); });
    wrap.querySelector('[data-fog-confirm]').addEventListener('click', () => {
      let r = opts.onConfirm ? opts.onConfirm(wrap, m) : true;
      Promise.resolve(r).then((keep) => { if (keep !== false) { m.hide(); } });
    });
    if (opts.onShown) {
      wrap.addEventListener('shown.bs.modal', () => { opts.onShown(wrap); }, { once: true });
    }
    m.show();
    return { el: wrap, modal: m, body: bodyEl };
  }

  // Confirm dialog -> Promise<boolean>. Falls back to window.confirm().
  function confirm(opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      if (!window.bootstrap) {
        resolve(window.confirm(opts.body || opts.title || 'Are you sure?'));
        return;
      }
      let answered = false;
      let ctrl = modal({
        title: opts.title || 'Please confirm',
        body: '<p class="mb-0">' + (opts.body || '') + '</p>',
        confirmText: opts.confirmText || 'Confirm',
        cancelText: opts.cancelText || 'Cancel',
        danger: opts.danger,
        onConfirm: function() { answered = true; resolve(true); }
      });
      ctrl.el.addEventListener('hidden.bs.modal', () => { if (!answered) { resolve(false); } });
    });
  }

  // Toast queue: a toast that must show on the NEXT page, after a client-side
  // redirect (the edit page's Delete). It lives in sessionStorage; a blocked
  // store drops the toast and nothing else.
  const QUEUE_KEY = 'fogToastQueue';
  function toastLater(type, text, title) {
    try {
      let queue = JSON.parse(window.sessionStorage.getItem(QUEUE_KEY) || '[]');
      if (!Array.isArray(queue)) { queue = []; }
      queue.push({type: type, text: text, title: title});
      window.sessionStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch (unusedErr) { /* no store: the toast is dropped */ }
  }
  // Show the queued toasts once. The key goes before the first toast, so a
  // reload shows nothing.
  function drainToasts() {
    let queue = [];
    try {
      let raw = window.sessionStorage.getItem(QUEUE_KEY);
      window.sessionStorage.removeItem(QUEUE_KEY);
      queue = JSON.parse(raw || '[]');
    } catch (unusedErr) { /* no store, or a bad value: nothing to show */ }
    if (!Array.isArray(queue)) { return; }
    queue.forEach((t) => { if (t && t.text) { window.fogToast(t.type, t.text, t.title); } });
  }

  // The save result the server rendered for ?saved / ?failed
  // (views/pages/create.ejs). After the toast, the query parameters go, so
  // a reload does not show it again.
  function showSaveResult() {
    let el = document.getElementById('fogSaveResult');
    if (!el) { return; }
    window.fogToast(el.getAttribute('data-type'), el.getAttribute('data-text'), el.getAttribute('data-title'));
    try {
      let url = new URL(window.location.href);
      ['saved', 'failed', 'msg'].forEach((k) => { url.searchParams.delete(k); });
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    } catch (unusedErr) { /* an old browser keeps the query; the toast still showed */ }
  }

  window.fogToast = toast;
  window.fogToastLater = toastLater;
  window.fogModal = modal;
  window.fogConfirm = confirm;

  document.addEventListener('DOMContentLoaded', () => {
    drainToasts();
    showSaveResult();
  });

  // The edit page's Delete (api/helpers/form-generator.js): the 1.6 delete
  // dialog text (FOGPage.php:3371-3388), then the same DELETE call the list
  // page sends. Success goes back to the list, with the toast queued for it.
  document.addEventListener('click', (ev) => {
    let btn = ev.target.closest && ev.target.closest('[data-fog-delete]');
    if (!btn) { return; }
    ev.preventDefault();
    let model = btn.getAttribute('data-model');
    confirm({
      danger: true,
      title: 'Delete: ' + btn.getAttribute('data-name'),
      body: 'Confirm you would like to delete this ' + model,
      confirmText: 'Delete'
    }).then((ok) => {
      if (!ok) { return; }
      $.ajax({
        url: '/api/v1/' + encodeURIComponent(model),
        type: 'DELETE',
        contentType: 'application/json',
        data: JSON.stringify({id: [btn.getAttribute('data-id')]}),
        success: function() {
          toastLater('success', 'Successfully deleted', 'Delete Success');
          window.location = btn.getAttribute('data-list');
        },
        error: function(xhr) {
          let msg = (xhr.responseJSON && xhr.responseJSON.message) || ('Could not delete (HTTP ' + xhr.status + ').');
          window.fogToast('error', msg);
        }
      });
    });
  });

  // The 1.6 password reveal (fog.common.js:5799). The generator renders the
  // eye only while the FOG_ENABLE_SHOW_PASSWORDS setting is on.
  document.addEventListener('click', (ev) => {
    let eye = ev.target.closest && ev.target.closest('.fogpasswordeye');
    if (!eye) { return; }
    let input = eye.closest('.input-group') && eye.closest('.input-group').querySelector('input');
    if (!input) { return; }
    let show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    eye.classList.toggle('fa-eye-slash', !show);
    eye.classList.toggle('fa-eye', show);
  });
})();
