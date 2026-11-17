(function($) {
  // The Agent Activity list (GET /agent-activity; 1.6 fog.agentactivity.list.js):
  // the fog-agent enrollment events of each host, grouped by host, the host with
  // the newest event first. The summary endpoint gives one row per host (its
  // newest event); the expand toggle in a group header loads that host's events.
  // A server value shows as text, never as markup (window.fogTextCell, and
  // textContent in the group header).

  // The outcome badge color: the Audit Log page's (views/pages/partials/list/audit.js).
  const BADGES = {allowed: 'success', denied: 'danger', failed: 'warning', partial: 'warning'};
  const COLUMN_ORDER = 5;

  const pad = (n, width) => String(n).padStart(width, '0');

  // The summary row of each host, by host id: {pos, row}. `row` is the row that
  // shows while the host is collapsed. Rebuilt by each load of the summary.
  let summaries = {};
  // {total, limit} of each expanded host, by host id (the host endpoint answer).
  // Emptied by each load of the summary.
  let expanded = {};

  // The Order value: the host's position in the summary, then the row's position
  // in the host, so a group stays together and its newest event stays first.
  function orderOf(pos, index) {
    return pad(pos, 5) + '-' + pad(index, 3);
  }

  // A table row of one event of a host.
  function rowOf(host, pos, index, event) {
    return $.extend({}, event, {
      hostId: host.hostId,
      hostName: host.hostName,
      count: host.count,
      order: orderOf(pos, index)
    });
  }

  function outcomeCell(data, type) {
    if (type !== 'display') { return data; }
    return '<span class="badge text-bg-' + (BADGES[data] || 'secondary') + '">' + window.fogTextCell(data, type) + '</span>';
  }

  // The group header: the host name, the event count, and the expand toggle.
  function startRender(rows, hostId) {
    const first = rows.data()[0] || {};
    const loaded = expanded[hostId];
    let label = first.hostName + ' - ' + first.count + (first.count === 1 ? ' event' : ' events');
    if (loaded !== undefined && loaded.total > loaded.limit) { label += ' (showing the newest ' + loaded.limit + ')'; }
    const toggle = $('<button type="button" class="btn btn-sm btn-default ms-2 fog-aa-toggle"></button>')
      .attr('data-host-id', hostId)
      .text(loaded === undefined ? 'Expand' : 'Collapse');
    return $('<span></span>').append(document.createTextNode(label), toggle);
  }

  let opts = {
    // Scroller does not work with RowGroup, so the table has no scroller and no
    // paging (1.6 fog.agentactivity.list.js:263-264). The summary holds at most
    // MAX_HOSTS hosts (agent-activity/summary.js), one row each.
    serverSide: false,
    scroller: false,
    deferRender: false,
    scrollY: '',
    paging: false,
    // The order is fixed: the hidden Order column (see orderOf), not a click.
    order: [[COLUMN_ORDER, 'asc']],
    columns: [
      {data: 'createdAt', render: window.fogWhenCell, orderable: false},
      {data: 'type', render: window.fogTextCell, orderable: false},
      {data: 'text', render: window.fogTextCell, orderable: false},
      {data: 'outcome', render: outcomeCell, orderable: false},
      {data: 'hostId', visible: false, className: 'noVis', orderable: false},
      {data: 'order', visible: false, className: 'noVis', orderable: false}
    ],
    rowId: 'id',
    // Keyed by hostId, so two hosts with the same name never merge.
    rowGroup: {dataSrc: 'hostId', startRender: startRender},
    // A function, so the shared Refresh button (dt.ajax.reload()) reloads the
    // summary, and every expanded group closes. A bare array would show an
    // empty table: the callback takes {data: rows}.
    ajax: function(unusedData, callback) {
      $.ajax({type: 'post', url: '/api/v1/agent-activity/summary', contentType: 'application/json', data: '{}'})
        .done((json) => {
          summaries = {};
          expanded = {};
          const rows = (json.hosts || []).map((host, pos) => {
            const row = rowOf(host, pos, 0, host.latest);
            summaries[host.hostId] = {pos: pos, row: row};
            return row;
          });
          callback({data: rows});
        })
        .fail((xhr) => {
          window.fogToast('error', 'Could not load the agent activity (HTTP ' + xhr.status + ').');
          callback({data: []});
        });
    }
  };

  let table = $('#listtable').registerTable(undefined, opts);

  const rowsOf = (hostId) => table.rows((idx, data) => data.hostId === hostId);

  // Expand loads every event of the host; Collapse puts the one summary row back.
  $('#listtable tbody').on('click', '.fog-aa-toggle', function() {
    const hostId = $(this).attr('data-host-id');
    const summary = summaries[hostId];
    if (!summary) { return; }
    if (expanded[hostId] !== undefined) {
      rowsOf(hostId).remove();
      table.rows.add([summary.row]);
      delete expanded[hostId];
      table.draw(false);
      return;
    }
    $.ajax({type: 'post', url: '/api/v1/agent-activity/host', contentType: 'application/json', data: JSON.stringify({hostId: hostId})})
      .done((json) => {
        const host = summary.row;
        rowsOf(hostId).remove();
        table.rows.add(json.rows.map((event, index) => rowOf(host, summary.pos, index, event)));
        expanded[hostId] = {total: json.total, limit: json.limit};
        table.draw(false);
      })
      .fail((xhr) => {
        window.fogToast('error', 'Could not load the events of the host (HTTP ' + xhr.status + ').');
      });
  });
})(jQuery);
