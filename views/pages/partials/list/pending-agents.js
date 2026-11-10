(function($) {
  // The Pending Agents list (GET /hosts/pendingAgents; 1.6
  // fog.host.pendingAgents.js): the fog-agent enrollments that wait for an
  // admin. One GET fills the table. "Approve selected" and "Deny selected"
  // call POST /api/v1/agent/enrollment/<id>/approve|deny once per row.
  // A server value shows as text, never as markup (window.fogTextCell).

  function identityOf(row) {
    let identity = (row && row.identity) || {};
    return {serial: identity.system_serial || '', uuid: identity.system_uuid || ''};
  }

  // Asks, then decides each selected row in turn, then reloads (fogRunEach).
  function run(dt, action) {
    let approve = action === 'approve';
    window.fogRunEach(dt, {
      // The 1.6 modal texts (HostManagement.php:650-750).
      confirm: approve ? {
        type: 'success',
        title: 'Approve Pending Agents',
        body: 'Each selected agent is issued a certificate and collects it on its next check-in.',
        confirmText: 'Approve'
      } : {
        danger: true,
        title: 'Deny Pending Agents',
        body: 'A denied agent keeps asking and keeps being refused until it is enrolled with a new key.',
        confirmText: 'Deny'
      },
      request: (id) => ({url: '/api/v1/agent/enrollment/' + encodeURIComponent(id) + '/' + action, type: 'POST'}),
      verb: 'decided',
      success: approve ?
        {text: 'Approved selected agents!', title: 'Agent Approval Success'} :
        {text: 'Denied selected agents!', title: 'Agent Denial Success'},
      failTitle: approve ? 'Agent Approval Fail' : 'Agent Denial Fail'
    });
  }

  let table = $('#listtable').registerTable(undefined, {
    // Newest request first.
    order: [
      [6, 'desc']
    ],
    extraButtons: [
      {
        name: 'approve',
        text: '<i class="fa fa-check"></i> Approve selected',
        enabled: false,
        action: function(e, dt) { run(dt, 'approve'); }
      },
      {
        name: 'deny',
        text: '<i class="fa fa-ban"></i> Deny selected',
        enabled: false,
        action: function(e, dt) { run(dt, 'deny'); }
      }
    ],
    columns: [
      {
        data: 'hostname',
        render: function(data, type, row) {
          if (type !== 'display') { return data; }
          if (!row.hostID) { return window.fogEscape(data); }
          return '<a href="/hosts/edit/' + encodeURIComponent(row.hostID) + '">' + window.fogEscape(data) + '</a>';
        }
      },
      {data: 'reason', render: window.fogTextCell},
      {
        data: 'os',
        render: function(data, type, row) {
          let text = (row.os || '') + '/' + (row.arch || '');
          return type === 'display' ? window.fogEscape(text) : text;
        }
      },
      {data: 'agentVersion', render: window.fogTextCell},
      {data: 'remoteIp', render: window.fogTextCell},
      {
        data: 'identity',
        render: function(data, type, row) {
          let id = identityOf(row);
          if (type !== 'display') { return id.serial + ' ' + id.uuid; }
          return window.fogEscape(id.serial) + (id.uuid ? '<br><small>' + window.fogEscape(id.uuid) + '</small>' : '');
        }
      },
      {data: 'createdAt', render: window.fogWhenCell}
    ],
    rowId: 'id',
    serverSide: false,
    ajax: {
      type: 'get',
      url: '/api/v1/agent/enrollments',
      dataSrc: 'data'
    }
  });

  // Both buttons need a selection.
  function refresh() {
    let any = table.rows({selected: true}).count() > 0;
    table.button('approve:name').enable(any);
    table.button('deny:name').enable(any);
  }
  table.on('select.dt deselect.dt draw.dt', refresh);
  refresh();
})(jQuery);
