(function($) {
  // The Audit Log list (GET /audit; 1.6 fog.audit.list.js): the audit trail,
  // read only, newest first. A click on a row opens the "Audit entry" modal.
  // A server value shows as text, never as markup (window.fogTextCell, and
  // textContent in the modal).

  // The outcome badge color (1.6 fog.audit.list.js:97-128).
  const BADGES = {allowed: 'success', denied: 'danger', failed: 'warning', partial: 'warning'};

  // The Subject cell: the label, else type#id, else the type.
  function subjectOf(row) {
    if (row.subjectLabel) { return row.subjectLabel; }
    if (row.subjectType && row.subjectId) { return row.subjectType + '#' + row.subjectId; }
    return row.subjectType || '';
  }

  // The Permission cell: an empty permission means no authorization ran.
  function permissionCell(data, type) {
    if (type !== 'display') { return data; }
    return data ? window.fogTextCell(data, type) : '<span class="text-muted fst-italic">none</span>';
  }

  function outcomeCell(data, type) {
    if (type !== 'display') { return data; }
    return '<span class="badge text-bg-' + (BADGES[data] || 'secondary') + '">' + window.fogTextCell(data, type) + '</span>';
  }

  // The "Audit entry" modal: label and value pairs, then the Detail block.
  function showEntry(row) {
    const pairs = [
      ['When', window.fogWhen(row.createdAt)],
      ['Who', row.createdBy],
      ['From', row.ip],
      ['Authenticated by', row.authSource],
      ['Action', row.type],
      ['Outcome', row.outcome],
      ['Subject', subjectOf(row)],
      ['Permission', row.permission || 'none - this path has no authorization gate'],
      ['Affected', row.affectedCount],
      ['Operation', row.correlationId]
    ];
    const body = document.createElement('div');
    const list = document.createElement('dl');
    list.className = 'row mb-0';
    pairs.forEach(([label, value]) => {
      const dt = document.createElement('dt');
      dt.className = 'col-sm-4';
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.className = 'col-sm-8';
      dd.textContent = value === null || value === undefined ? '' : String(value);
      list.appendChild(dt);
      list.appendChild(dd);
    });
    body.appendChild(list);
    if (row.text) {
      const title = document.createElement('h6');
      title.className = 'mt-3';
      title.textContent = 'Detail';
      const pre = document.createElement('pre');
      pre.textContent = row.text;
      body.appendChild(title);
      body.appendChild(pre);
    }
    // Only a Close button: the audit trail has nothing to confirm.
    const ctrl = window.fogModal({title: 'Audit entry', body: body, size: 'modal-lg', cancelText: 'Close'});
    if (ctrl) { ctrl.el.querySelector('[data-fog-confirm]').remove(); }
  }

  let opts = {
    // The server orders by createdAt, then id (audit/datatable).
    ordering: false,
    // No "All": the server reads at most 500 rows (audit/datatable MAX_ROWS).
    lengthMenu: [[10, 25, 50, 100, 250, 500], [10, 25, 50, 100, 250, 500]],
    columns: [
      {data: 'createdAt', render: window.fogWhenCell},
      {data: 'createdBy', render: window.fogTextCell},
      {data: 'type', render: window.fogTextCell},
      {data: 'permission', render: permissionCell},
      {data: 'outcome', render: outcomeCell},
      {data: null, render: (data, type, row) => window.fogTextCell(subjectOf(row), type)},
      {data: 'ip', render: window.fogTextCell}
    ],
    rowId: 'id',
    serverSide: true,
    ajax: {
      type: 'post',
      url: '/api/v1/audit/datatable'
    }
  };
  // The server default "All" (-1) means 500 here, in paged mode only. In
  // infinite mode registerTable turns -1 into 50, and a page option would win
  // over it, so 500 would load 500 rows for each scroll.
  if (($('#scrollMode').val() || 'infinite').toLowerCase() === 'paged' && parseInt($('#pageLength').val(), 10) === -1) {
    opts.pageLength = 500;
  }

  let table = $('#listtable').registerTable(undefined, opts);

  $('#listtable tbody').on('click', 'tr', function() {
    const row = table.row(this).data();
    if (row) { showEntry(row); }
  });
})(jQuery);
