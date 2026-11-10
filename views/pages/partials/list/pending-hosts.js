(function($) {
  // The Pending Hosts list (GET /hosts/pending; 1.6 fog.host.pending.js): the
  // hosts with pending: true. "Approve selected" sets pending: false on each
  // selected host. "Delete selected" (list.ejs data-delete-url) goes to
  // DELETE /api/v1/host/pending. There is no "approve all", as in 1.6.
  // A server value shows as text, never as markup (window.fogTextCell).

  let table = $('#listtable').registerTable(undefined, {
    // The server lists the hosts by name only (host/pending-datatable).
    ordering: false,
    extraButtons: [
      {
        name: 'approve',
        text: '<i class="fa fa-check"></i> Approve selected',
        enabled: false,
        action: function(e, dt) {
          let ids = dt.rows({selected: true}).data().toArray().map((r) => r.id).filter(Boolean);
          if (!ids.length) { return; }
          $.ajax({
            url: '/api/v1/host/pending/approve',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ids: ids}),
            success: function() {
              dt.rows({selected: true}).deselect();
              dt.ajax.reload();
              window.fogToast('success', 'Approved selected hosts!', 'Host Approval Success');
            },
            error: function(xhr) {
              window.fogToast('error', 'Could not approve: ' + window.fogErrorOf(xhr) + '.', 'Host Approval Fail');
            }
          });
        }
      }
    ],
    columns: [
      {data: 'name', render: window.fogTextCell},
      {data: 'mac', render: window.fogTextCell},
      {data: 'description', render: window.fogTextCell}
    ],
    rowId: 'id',
    serverSide: true,
    ajax: {
      type: 'post',
      url: '/api/v1/host/pending/datatable'
    }
  });

  // Approve needs a selection, as the "Delete selected" button does.
  function refresh() {
    table.button('approve:name').enable(table.rows({selected: true}).count() > 0);
  }
  table.on('select.dt deselect.dt draw.dt', refresh);
  refresh();
})(jQuery);
