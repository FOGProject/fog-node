// The group edit page's Host Associations tab (api/controllers/pages/edit.js
// groupHostPane; 1.6 renderAssocTab, FOGPageRender.php ~90-165): every host,
// with a checked, disabled box where the host is in this group. "Add
// selected" and "Remove selected" change the membership of the selected hosts
// only, then reload the table, as 1.6 does. The Members fact on the info card
// updates at the next page load, as in 1.6.
(function($) {
  let node = $('#group-host-table');
  if (!node.length) { return; }
  let groupName = node.attr('data-group-name');
  let key = String(groupName).toLowerCase();

  let table = node.DataTable({
    serverSide: true,
    processing: true,
    autoWidth: false,
    order: [[0, 'asc']],
    select: {style: 'multi+shift'},
    rowId: 'id',
    columns: [
      {data: 'name'},
      {
        data: 'groups',
        orderable: false,
        searchable: false,
        render: function(data, type) {
          let member = Array.isArray(data) && data.some((g) => String(g).toLowerCase() === key);
          if (type !== 'display') { return member ? '1' : '0'; }
          return '<input type="checkbox" class="form-check-input" disabled' + (member ? ' checked' : '') + '/>';
        }
      }
    ],
    ajax: {
      type: 'post',
      url: '/api/v1/host/datatable'
    }
  });

  // The pane is hidden when the table builds, so size it when it shows.
  $('a[data-bs-toggle="tab"][href="#tab-host-associations"]').on('shown.bs.tab', () => {
    table.columns.adjust();
  });

  // One host/bulk call for the selected hosts, then the 1.6 group update
  // toast, and the table again.
  function send(change) {
    let ids = table.rows({selected: true}).data().toArray().map((r) => r.id).filter(Boolean);
    if (!ids.length) {
      window.fogToast('error', 'No hosts are selected', 'Group Update Fail');
      return;
    }
    $.ajax({
      url: '/api/v1/host/bulk',
      type: 'POST',
      contentType: 'application/json',
      data: JSON.stringify($.extend({id: ids}, change)),
      success: function() {
        window.fogToast('success', 'Group updated!', 'Group Update Success');
      },
      error: function(xhr) {
        let msg = (xhr.responseJSON && xhr.responseJSON.message) || ('Could not update (HTTP ' + xhr.status + ').');
        window.fogToast('error', msg, 'Group Update Fail');
      },
      complete: function() {
        table.rows({selected: true}).deselect();
        table.ajax.reload(null, false);
      }
    });
  }

  $('#group-host-send').on('click', () => { send({addGroups: [groupName]}); });

  // The 1.6 dissociate dialog (FOGPage.php ~3400).
  $('#group-host-remove').on('click', () => {
    window.fogConfirm({
      danger: true,
      title: 'Remove host Associations',
      body: 'Please confirm you would like to dissociate the selected host',
      confirmText: 'Remove'
    }).then((ok) => {
      if (ok) { send({removeGroups: [groupName]}); }
    });
  });
})(jQuery);
