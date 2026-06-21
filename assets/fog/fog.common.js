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
        action: function(e, dt, node, config) {
          dt.clear().draw();
          dt.ajax.reload();
        }
      },
      {
        text: '<i class="fa fa-edit"></i> Edit',
        action: function(e, dt, node, config) {
          let rows = dt.rows({selected: true}).data().toArray();
          if (rows.length !== 1) {
            window.alert('Select exactly one row to edit.');
            return;
          }
          let base = window.location.pathname.replace(/\/$/, '');
          window.location = `${base}/edit/${rows[0].id}`;
        }
      },
      {
        text: '<i class="fa fa-trash"></i> Delete',
        className: 'btn-danger',
        action: function(e, dt, node, config) {
          let ids = dt.rows({selected: true}).data().toArray().map((r) => r.id).filter(Boolean);
          if (!ids.length) {
            window.alert('Select one or more rows to delete.');
            return;
          }
          if (!window.confirm(`Delete ${ids.length} selected item(s)? This cannot be undone.`)) {
            return;
          }
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
    let createMode = opts.createMode, createLabel = opts.createLabel;
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
    table.on('select deselect', function(e, dt, type, indexes) {
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
    } catch (e) { /* toast is best-effort; the reloaded row is the real feedback */ }
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
    let body = modalEl.querySelector('.modal-body'),
      titleEl = modalEl.querySelector('.modal-title'),
      modal = bootstrap.Modal.getOrCreateInstance(modalEl);

    body.innerHTML = '<div class="text-center p-4"><i class="fa fa-spinner fa-spin"></i> Loading…</div>';
    modal.show();

    // Bootstrap ignores a .hide() issued during the show transition, so a fast
    // create round-trip can leave the modal open. Track the shown state and
    // defer the close until the modal has actually finished opening.
    let shown = false;
    modalEl.addEventListener('shown.bs.modal', function() { shown = true; }, { once: true });
    function safeHide() {
      if (shown) { modal.hide(); }
      else { modalEl.addEventListener('shown.bs.modal', function() { modal.hide(); }, { once: true }); }
    }

    fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'same-origin' })
      .then(function(r) { return r.text(); })
      .then(function(html) {
        let doc = new DOMParser().parseFromString(html, 'text/html'),
          // Scope to the page content so we never grab a navbar/search <form>.
          form = doc.querySelector('.app-content form') || doc.querySelector('form'),
          hdr = doc.querySelector('.app-content-header h3, .card-title');
        if (titleEl) { titleEl.textContent = hdr ? hdr.textContent.trim() : 'Create'; }
        if (!form) { showError(body, 'Could not load the form.'); return; }
        body.innerHTML = '';
        body.appendChild(form);

        // The generated Cancel button is a submit; in the modal it just closes.
        let cancel = form.querySelector('.btn-warning');
        if (cancel) {
          cancel.setAttribute('type', 'button');
          cancel.addEventListener('click', function() { modal.hide(); });
        }

        form.addEventListener('submit', function(ev) {
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
          }).then(function(r) {
            return r.json().catch(function() { return {}; }).then(function(j) {
              return { ok: r.ok, body: j };
            });
          }).then(function(res) {
            if (res.ok && res.body && res.body.ok) {
              safeHide();
              if (dt) { dt.ajax.reload(null, false); }
              notify('success', 'Created successfully.');
            } else {
              showError(body, (res.body && res.body.message) || 'Could not save. Please check your input.');
            }
          }).catch(function() { showError(body, 'Network error — please try again.'); });
        });
      })
      .catch(function() { showError(body, 'Could not load the form.'); });
  };
})();
