(function($) {
  // The Activity list (GET /activity; 1.6 fog.activity.list.js): what has been
  // done on the server, in plain words, newest first. A click on a row opens
  // the "Activity entry" modal and makes no request. A server value shows as
  // text, never as markup (window.fogTextCell, and textContent in the modal).

  // The "Activity entry" modal (1.6 fog.activity.list.js:83-123): label and
  // value pairs. "Logged" shows the stored text only when it differs from the
  // summary.
  function showEntry(row) {
    const pairs = [
      ['Who', row.createdBy],
      ['When', window.fogWhen(row.createdAt)],
      ['From', row.ip],
      ['What', row.summary]
    ];
    if (row.text && row.text !== row.summary) { pairs.push(['Logged', row.text]); }
    const body = document.createElement('div');
    const list = document.createElement('dl');
    list.className = 'row mb-0';
    pairs.forEach(([label, value]) => {
      const dt = document.createElement('dt');
      dt.className = 'col-sm-3';
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.className = 'col-sm-9';
      dd.textContent = value === null || value === undefined ? '' : String(value);
      list.appendChild(dt);
      list.appendChild(dd);
    });
    body.appendChild(list);
    // Only a Close button: the feed has nothing to confirm.
    const ctrl = window.fogModal({title: 'Activity entry', body: body, size: 'modal-lg', cancelText: 'Close'});
    if (ctrl) { ctrl.el.querySelector('[data-fog-confirm]').remove(); }
  }

  let opts = {
    // The server orders by createdAt, then id (activity/datatable).
    ordering: false,
    // No "All": the server reads at most 500 rows (activity/datatable MAX_ROWS).
    lengthMenu: [[10, 25, 50, 100, 250, 500], [10, 25, 50, 100, 250, 500]],
    columns: [
      {data: 'createdBy', render: window.fogTextCell},
      {data: 'createdAt', render: window.fogWhenCell},
      {data: 'summary', render: window.fogTextCell},
      {data: 'ip', render: window.fogTextCell}
    ],
    rowId: 'id',
    serverSide: true,
    ajax: {
      type: 'post',
      url: '/api/v1/activity/datatable'
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
