(function($) {
  let path = $(location).attr('pathname').replace(/s$/,'');
  function selectedIds(dt) {
    return dt.rows({selected: true}).data().toArray().map((r) => r.id).filter(Boolean);
  }
  function bulk(dt, body) {
    $.ajax({
      url: '/api/v1/host/bulk',
      type: 'POST',
      contentType: 'application/json',
      data: JSON.stringify(body),
      complete: function() { dt.ajax.reload(); }
    });
  }
  $('#listtable').registerTable(undefined, {
    createMode: 'page',
    order: [
      [0, 'asc']
    ],
    // Bulk "push to a set of hosts" actions (the 1.x group replacement).
    extraButtons: [
      {
        text: '<i class="fa fa-tag"></i> Add Tag',
        action: function(e, dt) {
          let ids = selectedIds(dt);
          if (!ids.length) { window.alert('Select one or more hosts.'); return; }
          let tag = window.prompt(`Tag to ADD to ${ids.length} host(s):`);
          if (!tag) { return; }
          bulk(dt, {id: ids, addTags: [tag]});
        }
      },
      {
        text: '<i class="fa fa-tag"></i> Remove Tag',
        action: function(e, dt) {
          let ids = selectedIds(dt);
          if (!ids.length) { window.alert('Select one or more hosts.'); return; }
          let tag = window.prompt(`Tag to REMOVE from ${ids.length} host(s):`);
          if (!tag) { return; }
          bulk(dt, {id: ids, removeTags: [tag]});
        }
      },
      {
        text: '<i class="fa fa-desktop"></i> Set Image',
        action: function(e, dt) {
          let ids = selectedIds(dt);
          if (!ids.length) { window.alert('Select one or more hosts.'); return; }
          let name = window.prompt(`Image NAME to assign to ${ids.length} host(s) (blank to clear):`);
          if (name === null) { return; }
          bulk(dt, {id: ids, image: name});
        }
      }
    ],
    columns: [
      {data: 'name'},
      {
        data: 'macs',
        orderable: false,
        render: function(data) {
          let mac = Array.isArray(data) ? (data.length ? data[0] : '') : (data || '');
          if (!mac) {
            return '';
          }
          let hex = String(mac).replace(/[^0-9a-fA-F]/g, '').toLowerCase();
          return hex.length === 12 ? hex.match(/.{2}/g).join(':') : mac;
        }
      },
      {data: 'pingstatus'},
      {data: 'deployed'},
      {
        data: 'image',
        orderable: false,
        render: function(data) {
          return (data && data.name) ? data.name : '';
        }
      },
      {
        data: 'tags',
        orderable: false,
        render: function(data) {
          return Array.isArray(data) ? data.join(', ') : (data || '');
        }
      },
      {data: 'description'}
    ],
    rowId: 'id',
    serverSide: true,
    ajax: {
      type: 'post',
      url: `/api/v1${path}/datatable`
    }
  });
})(jQuery);
