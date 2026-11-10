const sizes = ['iB', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
$.registerTable = function(e, onSelect, opts) {
  $(e).registerTable(onSelect, opts);
};
// FOG 1.6 bundles the DataTables Bootstrap 3 integration
// (management/js/datatables.min.js), so its toolbar buttons render as
// `btn btn-default`: unfilled under Bootstrap 5. The dark-mode rule for
// .btn-default is in assets/styles/zz-fog-ui.css. buttons.bootstrap5.js has
// already set its own 'btn btn-secondary' by the time this file loads.
if ($.fn.dataTable && $.fn.dataTable.Buttons) {
  $.fn.dataTable.Buttons.defaults.dom.button.className = 'btn btn-default';
}

// The saved list layout and the column-search row, ported from FOG 1.6
// fog.common.js (98ac5bb732eb). Everything here is used by registerTable.
const fogList = (function() {
  // A layout older than a year is dropped (1.6 4391).
  const STATE_DURATION = 60 * 60 * 24 * 365;
  // Debounce of a column-search box: each keystroke is a server round trip.
  const COLUMN_SEARCH_DELAY = 400;

  // The server key of a table's layout: dt.<path>.<tableId>, for example
  // dt./hosts.listtable. The path tells the lists apart, because every list
  // table has the id listtable.
  function stateKey(api) {
    let id = api.table().node().id;
    if (!id) { return ''; }
    return 'dt.' + window.location.pathname.replace(/\/$/, '') + '.' + id;
  }

  // The localStorage key: dt.<userId>.<path>.<tableId>. 1.6 uses one key for
  // every user, so a second user on a shared browser loaded the first user's
  // layout. The user id comes from <body data-user-id> (layout.ejs). No user
  // id, no local copy.
  function localKey(key) {
    let user = document.body.getAttribute('data-user-id');
    return (key && user) ? 'dt.' + user + key.slice(2) : '';
  }

  // The sort as column names, not indexes (1.6 fogOrderKeys). A reorder
  // changes the indexes; a name stays on its column.
  function orderKeys(api, order) {
    let keys = [];
    (order || []).forEach((o) => {
      let idx = Array.isArray(o) ? o[0] : (o && o.idx);
      let dir = Array.isArray(o) ? o[1] : (o && o.dir);
      if (idx === undefined || idx >= api.columns().count()) { return; }
      let src = api.column(idx).dataSrc();
      if (typeof src === 'string' && src) { keys.push([src, dir]); }
    });
    return keys;
  }

  // Puts a loaded sort back on its named column (1.6 fogApplyOrder). A
  // no-op unless the names point at other indexes than the restored sort.
  function applyOrder(api) {
    let loaded = api.state.loaded();
    if (!loaded || !Array.isArray(loaded.fogOrder) || !loaded.fogOrder.length) { return; }
    let lookup = {};
    api.columns().every((i) => { lookup[api.column(i).dataSrc()] = i; });
    let wanted = loaded.fogOrder
      .filter((o) => Array.isArray(o) && Object.prototype.hasOwnProperty.call(lookup, o[0]))
      .map((o) => [lookup[o[0]], o[1] === 'desc' ? 'desc' : 'asc']);
    let current = api.order().map((o) => [o[0], o[1]]);
    if (!wanted.length || JSON.stringify(wanted) === JSON.stringify(current)) { return; }
    api.order(wanted).draw(false);
  }

  // A copy of a state without what must never be saved or restored (1.6
  // fogStripVolatileState): the search text, the column searches, any
  // SearchBuilder state, and the row selection, which the Select extension
  // writes into every save. `start` (the scroll position) goes too: it
  // changes on every scroll, and a saved layout is not a place in the list.
  // `time` stays: DataTables ignores a state without it.
  function stripVolatile(state) {
    let copy = $.extend(true, {}, state);
    delete copy.search;
    delete copy.searchBuilder;
    delete copy.select;
    delete copy.start;
    (Array.isArray(copy.columns) ? copy.columns : []).forEach((c) => {
      if (c && typeof c === 'object') { delete c.search; }
    });
    return copy;
  }

  // True when a parsed value has the shape of a saved state. A corrupt value
  // means the default layout; it must never reach DataTables and break the
  // table.
  function isState(s) {
    let isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
    if (!isObj(s) || typeof s.time !== 'number') { return false; }
    if (s.columns !== undefined && !(Array.isArray(s.columns) && s.columns.every(isObj))) { return false; }
    if (s.order !== undefined && !Array.isArray(s.order)) { return false; }
    if (s.length !== undefined && typeof s.length !== 'number') { return false; }
    if (s.colReorder !== undefined && !Array.isArray(s.colReorder)) { return false; }
    if (s.fogColWidths !== undefined && !isObj(s.fogColWidths)) { return false; }
    return true;
  }

  // A `description` column is the row's tooltip, not a column (1.6
  // fogDescriptionColumns): hidden, kept out of the colvis list (noVis), but
  // still in the request, so the global search still matches it. Returns
  // the indexes, for the state fix-up below.
  function descriptionColumns(columns) {
    let found = [];
    (columns || []).forEach((col, i) => {
      if (!col || col.data !== 'description') { return; }
      col.visible = false;
      col.className = (col.className ? col.className + ' ' : '') + 'noVis';
      found.push(i);
    });
    return found;
  }

  // A saved state cannot show a description column again. A state lists its
  // columns in their reordered positions, and state.colReorder maps each
  // position to the original index (ColReorder sorts them back only later,
  // in its stateLoadInit). So an original index is found through that map,
  // or a reorder would hide another column.
  function hideDescriptionState(indexes, state) {
    if (state && Array.isArray(state.columns)) {
      let order = Array.isArray(state.colReorder) ? state.colReorder : null;
      indexes.forEach((i) => {
        let pos = order ? order.indexOf(i) : i;
        if (state.columns[pos]) { state.columns[pos].visible = false; }
      });
    }
    return state;
  }

  // The stateSave callbacks (1.6 4391-4448). A save goes to localStorage, so
  // the reload you are about to do has it even with the server write still in
  // flight, and to the server through fogPrefStore (fog.prefs.js), so the
  // layout follows the user to any browser. On load the server value wins.
  function stateCallbacks(descIndexes) {
    // The last value sent per key, without `time`: DataTables saves on every
    // draw, and an unchanged layout needs no server write.
    let lastSent = {};
    return {
      stateSave: true,
      stateDuration: STATE_DURATION,
      stateSaveCallback: function(settings, data) {
        let api = new $.fn.dataTable.Api(settings);
        let key = stateKey(api);
        if (!key) { return; }
        data.fogOrder = orderKeys(api, data.order);
        // Absent until somebody resizes a column.
        let widths = window.fogTable && window.fogTable.colWidths[api.table().node().id];
        if (widths) { data.fogColWidths = widths; }
        let value = stripVolatile(data);
        let local = localKey(key);
        if (local) {
          try { window.localStorage.setItem(local, JSON.stringify(value)); } catch (unusedErr) { /* no store */ }
        }
        let compare = JSON.stringify($.extend({}, value, {time: 0}));
        if (lastSent[key] === compare || !window.fogPrefStore) { return; }
        lastSent[key] = compare;
        // A failed write is not worth a toast: the local copy still holds it.
        window.fogPrefStore(key, value).catch(() => { delete lastSent[key]; });
      },
      stateLoadCallback: function(settings, callback) {
        let api = new $.fn.dataTable.Api(settings);
        let key = stateKey(api);
        if (!key) { callback(null); return undefined; }
        let local = null;
        try { local = window.localStorage.getItem(localKey(key) || '-'); } catch (unusedErr) { /* no store */ }
        let fetchPrefs = window.fogPrefFetch ? window.fogPrefFetch() : Promise.reject(new Error('no store'));
        fetchPrefs.then((prefs) => prefs && prefs[key], () => undefined).then((server) => {
          let raw = (server !== undefined && server !== null && server !== '') ? server : local;
          let state = null;
          try {
            state = typeof raw === 'string' ? JSON.parse(raw) : raw;
            // Stripped on the way in as well: an older value can carry a search.
            state = isState(state) ? stripVolatile(state) : null;
          } catch (unusedErr) {
            state = null;
          }
          if (state) {
            // Before the table draws, so the first sizing pass uses them.
            if (state.fogColWidths && window.fogTable) {
              window.fogTable.colWidths[api.table().node().id] = state.fogColWidths;
            }
            hideDescriptionState(descIndexes, state);
          }
          callback(state);
        });
        // Undefined makes DataTables wait for the callback; any other value,
        // null included, is taken as the state itself (1.6 4428-4434).
        return undefined;
      }
    };
  }

  // The column-search row (1.6 fogColumnSearchRow): one input per column that
  // the server can search, in a second header row. The server says which in
  // the `_searchtypes` of its answer (api/helpers/datatables/get-data.js).
  // Rebuilt when the columns it describes change: a header cell maps to a
  // column through ':visIdx', which follows hidden and reordered columns.
  function columnSearchRow(api, types) {
    let header = $(api.table().header());
    let title = header.find('tr').not('.fog-colsearch-row').first();
    let existing = header.find('tr.fog-colsearch-row');
    let visible = [];
    for (let pos = 0; pos < title.children().length; pos++) {
      visible.push(api.column(pos + ':visIdx').index());
    }
    let signature = visible.join(',');
    // In scroll mode DataTables clones the header into the scroll body. Only
    // the header the API points at is ours: drop any other copy.
    $(api.table().container()).find('tr.fog-colsearch-row').not(existing).remove();
    if (existing.length && existing.attr('data-columns') === signature) { return; }
    existing.remove();
    let row = $('<tr class="fog-colsearch-row"/>').attr('data-columns', signature);
    title.children().each(function(pos) {
      let cell = $('<th class="fog-colsearch-cell"/>');
      let index = visible[pos];
      let key = index === undefined ? null : api.column(index).dataSrc();
      if (key !== null && types[key]) {
        cell.append($('<div class="fog-colsearch"/>').attr('data-column', index)
          .append($('<input type="text" class="form-control form-control-sm fog-colsearch-input"/>')
            .attr('aria-label', 'Search ' + $(this).text().trim())));
      }
      row.append(cell);
    });
    header.append(row);
  }

  // Puts the running column searches back into the rebuilt inputs, but never
  // over the input being typed in.
  function columnSearchRestore(api) {
    $(api.table().container()).find('div.fog-colsearch').each(function() {
      let group = $(this);
      let search = api.column(parseInt(group.attr('data-column'), 10)).search();
      if (search === '' || group.find(':focus').length) { return; }
      group.find('input.fog-colsearch-input').val(search);
    });
  }

  // Pushes one input into its column's search.
  function columnSearchApply(api, group) {
    let index = parseInt(group.attr('data-column'), 10);
    let value = group.find('input.fog-colsearch-input').val();
    if (api.column(index).search() !== value) { api.column(index).search(value).draw(); }
  }

  // A closed row clears its inputs and resets the column searches: a filter
  // you cannot see reads as missing data.
  function columnSearchSync(api) {
    let container = $(api.table().container());
    if (container.hasClass('fog-colsearch-on')) { return; }
    container.find('input.fog-colsearch-input').val('');
    let cleared = false;
    api.columns().every((i) => {
      if (api.column(i).search() !== '') {
        api.column(i).search('');
        cleared = true;
      }
    });
    if (cleared) { api.draw(); }
  }

  // Whether the row is open is saved per user, under the layout key plus
  // `.searchrow`: '1' open, '' closed (which deletes the key). Never the
  // typed terms (1.6 fogAffordanceStore).
  function searchRowKey(api) {
    let key = stateKey(api);
    return key ? key + '.searchrow' : '';
  }

  // The toolbar button (1.6 columnSearchButton). It starts disabled; the
  // first answer that carries _searchtypes enables it.
  const columnSearchButton = {
    name: 'colsearch',
    enabled: false,
    text: '<i class="fas fa-magnifying-glass-chart"></i> Column search',
    action: function(e, dt) {
      let on = $(dt.table().container()).toggleClass('fog-colsearch-on').hasClass('fog-colsearch-on');
      columnSearchSync(dt);
      let key = searchRowKey(dt);
      if (key && window.fogPrefStore) { window.fogPrefStore(key, on ? '1' : '').catch(() => {}); }
    }
  };

  // Binds the inputs, delegated off the container so they survive the row
  // rebuilds. The container exists only after the first answer of a
  // server-side table, so this also runs on init.
  function bindColumnSearch(api) {
    let container = api.table().container();
    if (!container) { return; }
    let timer = null;
    $(container).off('.fogcolsearch')
      .on('input.fogcolsearch', 'input.fog-colsearch-input', function() {
        let group = $(this).closest('div.fog-colsearch');
        clearTimeout(timer);
        timer = setTimeout(() => { columnSearchApply(api, group); }, COLUMN_SEARCH_DELAY);
      })
      .on('keydown.fogcolsearch', 'input.fog-colsearch-input', function(e) {
        if (e.key !== 'Enter') { return; }
        e.preventDefault();
        clearTimeout(timer);
        columnSearchApply(api, $(this).closest('div.fog-colsearch'));
      });
  }

  // Runs on every answer: stores the server's _searchtypes, builds the row,
  // enables the button, and the first time reopens a row saved as open.
  function onXhr(settings, json) {
    if (!json || !json._searchtypes) { return; }
    let api = new $.fn.dataTable.Api(settings);
    settings._fogSearchTypes = json._searchtypes;
    columnSearchRow(api, json._searchtypes);
    columnSearchRestore(api);
    api.buttons('colsearch:name').enable();
    if (settings._fogSearchRowRestored || !window.fogPrefFetch) { return; }
    settings._fogSearchRowRestored = true;
    let key = searchRowKey(api);
    window.fogPrefFetch().then((prefs) => {
      if (key && prefs && prefs[key] === '1') { $(api.table().container()).addClass('fog-colsearch-on'); }
    }, () => {});
  }

  // Rebuilds the row when the columns change: a column shown or hidden, a
  // reorder, a width pass (DataTables re-renders the header), and the draw
  // after a restored layout.
  function onColumnsChanged(api) {
    let types = api.settings()[0]._fogSearchTypes;
    if (!types) { return; }
    columnSearchRow(api, types);
    columnSearchRestore(api);
  }

  return {
    stateCallbacks: stateCallbacks,
    descriptionColumns: descriptionColumns,
    applyOrder: applyOrder,
    columnSearchButton: columnSearchButton,
    bindColumnSearch: bindColumnSearch,
    onXhr: onXhr,
    onColumnsChanged: onColumnsChanged
  };
})();

// Escapes text for HTML content and attributes.
function fogEscape(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;'}[c]));
}

// A ms timestamp as the browser's local date and time ('' for none).
function fogWhen(ms) {
  return ms ? new Date(ms).toLocaleString() : '';
}
window.fogWhen = fogWhen;

// DataTables column renders: a server value shows as text, never as markup; a
// ms timestamp shows as a local date and time. Sort and filter use the raw value.
window.fogTextCell = (data, type) => (type === 'display' ? fogEscape(data) : data);
window.fogWhenCell = (data, type) => (type === 'display' ? fogWhen(data) : data);

// The error of a failed $.ajax call: the body's `error` key, else the HTTP status.
function fogErrorOf(xhr) {
  return (xhr.responseJSON && xhr.responseJSON.error) || ('HTTP ' + xhr.status);
}
window.fogErrorOf = fogErrorOf;

// Confirm, then one $.ajax per selected row in turn, then collect the failures,
// deselect, reload and toast. A list page uses it for an action on each row.
//   dt             the DataTables API of the list
//   opts.confirm   fogConfirm options, or a function of the row count
//   opts.request   function(id) -> $.ajax options (url, type)
//   opts.verb      'decided' or 'revoked': the failure toast reads
//                  "N <verb>, M not: <id>: <error>; ..."
//   opts.success   {text, title}; opts.failTitle  the failure toast title
window.fogRunEach = function(dt, opts) {
  let ids = dt.rows({selected: true}).data().toArray().map((r) => r.id).filter(Boolean);
  if (!ids.length) { return; }
  let ask = typeof opts.confirm === 'function' ? opts.confirm(ids.length) : opts.confirm;
  window.fogConfirm(ask).then(async (ok) => {
    if (!ok) { return; }
    let failed = [];
    for (let id of ids) {
      await new Promise((resolve) => {
        $.ajax(opts.request(id)).done(() => resolve()).fail((xhr) => {
          failed.push(id + ': ' + fogErrorOf(xhr));
          resolve();
        });
      });
    }
    dt.rows({selected: true}).deselect();
    dt.ajax.reload();
    if (failed.length) {
      window.fogToast('error', (ids.length - failed.length) + ' ' + opts.verb + ', ' + failed.length + ' not: ' + failed.join('; '), opts.failTitle);
      return;
    }
    window.fogToast('success', opts.success.text, opts.success.title);
  });
};

// Every list table, built like a FOG 1.6 grid (1.6 fog.common.js
// $.fn.registerTable, 4280-4720): the 1.6 toolbar, the column-search row,
// column show/hide, reorder and resize, the saved per-user layout, and the
// action box under the table (views/pages/list.ejs).
//
// Options beyond DataTables' own, all removed before DataTables sees them:
//   createMode    'modal' or 'page': "Add" in the action box opens
//                 <path>/create in the create modal, or as a page
//   createLabel   the text of "Add"
//   extraButtons  page buttons, appended after the shared toolbar
//   columnResize  false: no column resize
// `select: false` drops Select All and Deselect All (1.6 4573-4576).
$.fn.registerTable = function(onSelect, opts) {
  opts = opts || {};
  let node = $(this);

  // The paging mode and the start length come from the server
  // (api/helpers/table-settings.js), as hidden inputs (views/pages/list.ejs).
  let pageLength = parseInt($('#pageLength').val(), 10);
  if (isNaN(pageLength) || pageLength === 0 || pageLength < -1) { pageLength = 25; }
  let infiniteScroll = ($('#scrollMode').val() || 'infinite').toLowerCase() !== 'paged';

  // A ?search= on the page URL is the starting global search (1.6
  // host/fog.host.list.js:622-623). A saved layout never holds a search, so
  // the restore cannot undo it.
  let urlSearch = new URLSearchParams(window.location.search).get('search');

  let defaults = {
    paging: true,
    lengthChange: true,
    searching: true,
    ordering: true,
    info: true,
    colReorder: true,
    autoWidth: false,
    responsive: true,
    lengthMenu: [
      [10, 25, 50, 100, 250, 500, -1],
      [10, 25, 50, 100, 250, 500, 'All']
    ],
    pageLength: pageLength,
    pagingType: 'simple_numbers',
    buttons: [
      {extend: 'selectAll', text: '<i class="far fa-square-check"></i> Select All'},
      {extend: 'selectNone', text: '<i class="far fa-square"></i> Deselect All'},
      fogList.columnSearchButton,
      {extend: 'colvis', columns: ':not(.noVis)', text: '<i class="fas fa-table-columns"></i> Column Visibility'},
      {
        text: '<i class="fas fa-arrows-rotate"></i> Refresh',
        action: function(e, dt) {
          dt.clear().draw();
          dt.ajax.reload();
        }
      }
    ],
    // Render a missing/association field as empty instead of throwing the
    // DataTables "Requested unknown parameter" warning.
    columnDefs: [
      { targets: '_all', defaultContent: '' }
    ],
    select: {style: 'multi+shift'},
    search: {
      regex: true,
      caseInsen: true,
      smart: true
    },
    // The description is the row's tooltip (fogList.descriptionColumns).
    rowCallback: function(tr, data) {
      if (data && typeof data.description === 'string' && data.description) { tr.title = data.description; }
    },
    // The length menu, buttons and search share one toolbar row (1.6 4547).
    dom: "<'fog-dt-toolbar d-flex flex-wrap align-items-center gap-2'lB<'fog-dt-search ms-auto'f>><'row'<'col-sm-12'tr>><'row'<'col-sm-5'i><'col-sm-7'p>>",
    retrieve: true,
    processing: true
  };

  if (infiniteScroll) {
    // Scroller rows load in chunks as you scroll. It needs a finite chunk,
    // so "All" (-1) becomes 50 here (1.6 4536-4547).
    if (pageLength < 1) { defaults.pageLength = 50; }
    defaults.scroller = true;
    defaults.deferRender = true;
    defaults.scrollY = '55vh';
    defaults.scrollCollapse = true;
    defaults.lengthChange = false;
    defaults.dom = "<'fog-dt-toolbar d-flex flex-wrap align-items-center gap-2'B<'fog-dt-search ms-auto'f>><'row'<'col-sm-12'tr>><'row'<'col-sm-12'i>>";
    // Long cells clip to an ellipsis; the hover shows the full text (fog.table.js).
    node.addClass('fog-table-clip');
  }

  // Page buttons go after the shared set; a page `buttons` would replace it.
  if (Array.isArray(opts.extraButtons)) {
    defaults.buttons = defaults.buttons.concat(opts.extraButtons);
  }
  delete opts.extraButtons;
  // A list the server marks not selectable (views/pages/list.ejs
  // data-selectable, 1.6 FOGPage::$selectable) gets no selection.
  if (node.attr('data-selectable') === 'false') { opts.select = false; }
  if (opts.select === false) {
    defaults.buttons = defaults.buttons.filter((b) => b.extend !== 'selectAll' && b.extend !== 'selectNone');
  }
  let columnResize = opts.columnResize !== false;
  delete opts.columnResize;
  let createMode = opts.createMode;
  let createLabel = opts.createLabel;
  delete opts.createMode;
  delete opts.createLabel;

  opts = $.extend(defaults, opts);
  if (urlSearch) { opts.search = $.extend({}, opts.search, {search: urlSearch}); }
  let descIndexes = fogList.descriptionColumns(opts.columns);
  $.extend(opts, fogList.stateCallbacks(descIndexes));

  // The first column links to the edit page when the model has one
  // (data-edit-base, rendered by the list handler, as in 1.6).
  let editBase = node.attr('data-edit-base');
  if (editBase && Array.isArray(opts.columns) && opts.columns[0]) {
    let first = opts.columns[0];
    let inner = first.render;
    first.render = function(data, type, row, meta) {
      let out = typeof inner === 'function' ? inner(data, type, row, meta) : data;
      if (type !== 'display' || !row || !row.id) { return out; }
      let label = typeof inner === 'function' ? out : fogEscape(out);
      return '<a href="' + fogEscape(editBase + '/edit/' + encodeURIComponent(row.id)) + '">' + label + '</a>';
    };
  }

  // Bound before the table is built: a server-side table can answer its first
  // request inside the DataTable() call.
  node.off('xhr.dt.fogcolsearch').on('xhr.dt.fogcolsearch', (e, settings, json) => {
    fogList.onXhr(settings, json);
  });

  let table = node.DataTable(opts);

  fogList.bindColumnSearch(table);
  node.off('init.dt.fogcolsearch').on('init.dt.fogcolsearch', () => { fogList.bindColumnSearch(table); });
  table.on('init.dt', () => { fogList.applyOrder(table); });
  table.on('column-visibility.dt column-sizing.dt column-reorder.dt init.dt draw.dt', () => {
    fogList.onColumnsChanged(table);
  });

  if (columnResize && $.fn.makeColumnsResizable) {
    // DataTables rebuilds the header (and the scroll-head clone) on every
    // width pass, which drops the strips.
    table.on('column-sizing.dt', () => { node.makeColumnsResizable(table); });
    setTimeout(() => { node.makeColumnsResizable(table); }, 0);
  }

  if (window.fogTable) {
    window.fogTable.bindAutosize();
    if (infiniteScroll) { setTimeout(() => { window.fogTable.sizeScroller(table); }, 0); }
  }

  fogActionBox(node, table, {createMode: createMode, createLabel: createLabel});

  if (onSelect !== undefined && typeof onSelect === 'function') {
    table.on('select deselect', (e, dt) => {
      onSelect(dt.rows({selected: true}));
    });
  }

  return table;
};

// The action box under a list table (views/pages/list.ejs; 1.6
// FOGPage.php:1942-2129): "Delete selected" on the left, "Add" on the right.
function fogActionBox(node, table, opts) {
  let box = node.closest('.card-body').find('.btn-actionbox').first();
  if (!box.length) { return; }

  if (opts.createMode === 'modal' || opts.createMode === 'page') {
    let add = $('<button type="button" id="createnew" class="btn btn-primary float-end"></button>')
      .text(opts.createLabel || 'Add');
    add.on('click', () => {
      let url = window.location.pathname.replace(/\/$/, '') + '/create';
      if (opts.createMode === 'page') { window.location = url; return; }
      window.fogCreateModal(url, table);
    });
    box.find('.btn-group.float-end').append(add);
  }

  let del = box.find('#deleteSelected');
  if (!del.length) { return; }
  let selectedIds = () => table.rows({selected: true}).data().toArray().map((r) => r.id).filter(Boolean);
  let refresh = () => { del.prop('disabled', !selectedIds().length); };
  table.on('select.dt deselect.dt draw.dt', refresh);
  refresh();
  del.on('click', () => {
    let ids = selectedIds();
    if (!ids.length) { return; }
    let n = ids.length;
    let singular = node.attr('data-singular') || 'item';
    let plural = node.attr('data-plural') || 'items';
    // The 1.6 delete modal text (FOGPage.php:2066-2127).
    window.fogConfirm({
      danger: true,
      title: 'Confirm delete',
      body: 'This cannot be undone.',
      confirmText: 'Delete ' + n + ' ' + (n === 1 ? singular : plural)
    }).then((ok) => {
      if (!ok) { return; }
      $.ajax({
        // A page can send the delete elsewhere (list.ejs deleteUrl), for example the pending hosts.
        url: node.attr('data-delete-url') || '/api/v1/' + encodeURIComponent(node.attr('data-model')),
        type: 'DELETE',
        contentType: 'application/json',
        data: JSON.stringify({id: ids}),
        success: function() {
          table.rows({selected: true}).deselect();
          table.ajax.reload();
          window.fogToast('success', 'Successfully deleted', 'Delete Success');
        },
        error: function(xhr) {
          let msg = (xhr.responseJSON && xhr.responseJSON.message) || ('Could not delete (HTTP ' + xhr.status + ').');
          window.fogToast('error', msg);
        }
      });
    });
  });
}
$.readableBytes = function(bytes) {
  var i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2) * 1} ${sizes[i]}`;
};

// Shared "create new <thing>" modal. Lazy-loads the exact same server-rendered
// /{plural}/create form used for full-page create, AJAX-submits it (JSON), then
// closes and reloads the table. Used by the list action box's "Add" button
// when createMode === 'modal'. Degrades to a full-page navigation if the modal
// or Bootstrap isn't present.
(function() {
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
              // The 1.6 text and title from general/save ("Group added!",
              // "Group Create Success"); the old text when they are absent.
              window.fogToast('success', res.body.msg || 'Created successfully.', res.body.title);
            } else {
              let msg = (res.body && res.body.message) || 'Could not save. Please check your input.';
              showError(body, msg);
              // The 1.6 failure toast ("Group Create Fail") when general/save
              // names it; the message also stays beside the form.
              if (res.body && res.body.title) { window.fogToast('error', msg, res.body.title); }
            }
          }).catch(() => { showError(body, 'Network error — please try again.'); });
        });
      })
      .catch(() => { showError(body, 'Could not load the form.'); });
  };
})();

// Shared UI helpers used to replace native dialogs (alert/confirm/prompt) with
// Bootstrap toasts + modals across the lists. Each degrades gracefully when
// Bootstrap is missing.
(function() {
  // The toasts, ported from FOG 1.6 $.notify (fog.common.js 98ac5bb732eb,
  // 2806-2933). A toast lives 8 s, as in 1.6.
  const TOAST_DELAY = 8000;
  // type -> [Bootstrap variant, icon, header theme, default title]. The header
  // is pinned to the theme of its own fixed background, so its text reads in
  // both FOG themes (1.6 TOAST_TYPES).
  const TOAST_TYPES = {
    success: ['success', 'fas fa-circle-check', 'dark', 'Success'],
    error: ['danger', 'fas fa-triangle-exclamation', 'dark', 'Error'],
    warning: ['warning', 'fas fa-triangle-exclamation', 'light', 'Warning'],
    info: ['info', 'fas fa-circle-info', 'light', 'Info'],
    notice: ['secondary', 'fas fa-circle-exclamation', 'dark', 'Notice']
  };
  // The toasts still showing, by type, title and text, for the collapse.
  const activeToasts = {};

  // The container, made on first use at the top right. Bootstrap's toast
  // z-index (1090) is above a modal (1055).
  function toastContainer() {
    let el = document.getElementById('fog-toast-container');
    if (!el) {
      el = document.createElement('div');
      el.id = 'fog-toast-container';
      el.className = 'toast-container position-fixed top-0 end-0 p-3';
      document.body.appendChild(el);
    }
    return el;
  }

  // fogToast(type, text[, title]). The title defaults to the type word. An
  // unknown type is success, as in 1.6. Falls back to alert() with no
  // Bootstrap.
  function toast(type, text, title) {
    if (!window.bootstrap || !window.bootstrap.Toast) {
      window.alert(text);
      return null;
    }
    type = Object.prototype.hasOwnProperty.call(TOAST_TYPES, type) ? type : 'success';
    let spec = TOAST_TYPES[type];
    title = title || spec[3];
    text = text == null ? '' : String(text);

    // An identical toast that still shows collapses into one, with a count on
    // the title, and its hide timer restarts. isConnected: a toast removed by
    // anything but its own hidden handler must not swallow the next one.
    let key = type + '\u0000' + title + '\u0000' + text;
    let existing = activeToasts[key];
    if (existing && existing.el.isConnected && existing.toast.isShown()) {
      existing.count += 1;
      existing.titleEl.textContent = title + ' (×' + existing.count + ')';
      // show() clears the pending hide before it schedules a new one.
      existing.toast.show();
      return existing.toast;
    }

    // An error or a warning interrupts a screen reader; the rest wait.
    let urgent = type === 'error' || type === 'warning';
    let el = document.createElement('div');
    el.className = 'toast fog-toast';
    el.setAttribute('role', urgent ? 'alert' : 'status');
    el.setAttribute('aria-live', urgent ? 'assertive' : 'polite');
    el.setAttribute('aria-atomic', 'true');

    let header = document.createElement('div');
    header.className = 'toast-header text-bg-' + spec[0];
    header.setAttribute('data-bs-theme', spec[2]);
    let icon = document.createElement('i');
    icon.className = spec[1] + ' me-2';
    icon.setAttribute('aria-hidden', 'true');
    let titleEl = document.createElement('strong');
    titleEl.className = 'me-auto';
    titleEl.textContent = title;
    let closer = document.createElement('button');
    closer.type = 'button';
    closer.className = 'btn-close';
    closer.setAttribute('data-bs-dismiss', 'toast');
    closer.setAttribute('aria-label', 'Close');
    // [data-bs-theme=dark] .btn-close turns the cross white under the dark
    // FOG theme, and a nearer light scope does not undo it (1.6 2900-2908).
    if (spec[2] === 'light') { closer.style.filter = 'none'; }
    header.appendChild(icon);
    header.appendChild(titleEl);
    header.appendChild(closer);

    // Text only, never HTML. pre-line shows the line breaks of a
    // multi-line message.
    let body = document.createElement('div');
    body.className = 'toast-body';
    body.textContent = text;
    body.style.whiteSpace = 'pre-line';

    el.appendChild(header);
    el.appendChild(body);
    toastContainer().appendChild(el);

    let t = new bootstrap.Toast(el, {delay: TOAST_DELAY});
    el.addEventListener('hidden.bs.toast', () => {
      delete activeToasts[key];
      t.dispose();
      el.remove();
    });
    activeToasts[key] = {toast: t, el: el, titleEl: titleEl, count: 1};
    t.show();
    return t;
  }

  // The modal types of 1.6 makeModal (FOGPage.php:1863). The footer fill of
  // each comes from assets/styles/zz-fog-ui.css (.modal-success,
  // .modal-warning, .modal-danger; the rest take the base fill).
  const MODAL_TYPES = ['default', 'primary', 'info', 'warning', 'success', 'danger'];

  // Build + show a Bootstrap modal. Returns {el, modal, body} or null (no
  // Bootstrap). `onConfirm(el, modal)` may return false (keep open) or a promise.
  // `type` is one of MODAL_TYPES; `danger: true` means type 'danger'. As in
  // 1.6, Cancel is first and opts out of the fill (.btn.float-start), and the
  // primary action is last. `secondary: {text, className, onClick(el, modal)}`
  // adds one more button between them, such as Remove in the host list's
  // "Group Membership" modal; its onClick works as onConfirm does.
  function modal(opts) {
    opts = opts || {};
    if (!window.bootstrap) { return null; }
    let type = opts.danger ? 'danger' : (MODAL_TYPES.indexOf(opts.type) === -1 ? 'default' : opts.type);
    let wrap = document.createElement('div');
    wrap.className = 'modal modal-' + type + ' fade';
    wrap.tabIndex = -1;
    wrap.innerHTML =
      '<div class="modal-dialog modal-dialog-centered' + (opts.size ? ' ' + opts.size : '') + '">' +
        '<div class="modal-content">' +
          '<div class="modal-header"><h5 class="modal-title"></h5>' +
            '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>' +
          '<div class="modal-body"></div>' +
          '<div class="modal-footer">' +
            '<button type="button" class="btn btn-outline-secondary float-start" data-bs-dismiss="modal">' +
              (opts.cancelText || 'Cancel') + '</button>' +
            '<button type="button" class="btn ' + (type === 'danger' ? 'btn-danger' : 'btn-primary') +
              ' float-end" data-fog-confirm>' + (opts.confirmText || 'OK') + '</button>' +
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
    // A button's handler may return false (keep the modal open) or a promise.
    function onPress(button, handler) {
      button.addEventListener('click', () => {
        let r = handler ? handler(wrap, m) : true;
        Promise.resolve(r).then((keep) => { if (keep !== false) { m.hide(); } });
      });
    }
    let confirmButton = wrap.querySelector('[data-fog-confirm]');
    onPress(confirmButton, opts.onConfirm);
    if (opts.secondary) {
      let second = document.createElement('button');
      second.type = 'button';
      second.className = opts.secondary.className || 'btn btn-secondary';
      second.setAttribute('data-fog-secondary', '');
      second.textContent = opts.secondary.text || '';
      confirmButton.parentNode.insertBefore(second, confirmButton);
      onPress(second, opts.secondary.onClick);
    }
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
        type: opts.type,
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

  window.fogToast = toast;
  window.fogToastLater = toastLater;
  window.fogModal = modal;
  window.fogConfirm = confirm;

  // A server message (api/helpers/flash.js) is a toast that views/layouts/
  // layout.ejs renders inline, so it needs nothing here.
  document.addEventListener('DOMContentLoaded', drainToasts);

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
