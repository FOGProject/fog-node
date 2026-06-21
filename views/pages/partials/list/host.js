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
  // Apply a bulk change to the selected rows, or -- when nothing is selected --
  // to every host matching the current search (confirmed by count). With
  // infinite scroll, selection only covers loaded rows, so "all matching" is how
  // you act on the whole filtered set. `desc` is shown in the confirm prompt.
  function applyBulk(dt, body, desc) {
    let ids = selectedIds(dt);
    if (ids.length) {
      bulk(dt, $.extend({id: ids}, body));
      return;
    }
    let n = dt.page.info().recordsDisplay,
      search = dt.search() || '',
      scope = search ? `all ${n} host(s) matching "${search}"` : `ALL ${n} host(s)`;
    if (!window.confirm(`No rows selected — ${desc} for ${scope}?`)) { return; }
    bulk(dt, $.extend({all: true, search: search}, body));
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
          let tag = window.prompt('Tag to ADD:');
          if (!tag) { return; }
          applyBulk(dt, {addTags: [tag]}, `add tag "${tag}"`);
        }
      },
      {
        text: '<i class="fa fa-tag"></i> Remove Tag',
        action: function(e, dt) {
          let tag = window.prompt('Tag to REMOVE:');
          if (!tag) { return; }
          applyBulk(dt, {removeTags: [tag]}, `remove tag "${tag}"`);
        }
      },
      {
        text: '<i class="fa fa-desktop"></i> Set Image',
        action: function(e, dt) {
          let name = window.prompt('Image NAME to assign (blank to clear):');
          if (name === null) { return; }
          applyBulk(dt, {image: name}, name ? `set image "${name}"` : 'clear image');
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
