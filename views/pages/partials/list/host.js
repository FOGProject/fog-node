(function($) {
  let path = $(location).attr('pathname').replace(/s$/,'');

  // `toasts` (optional): {failTitle}. The membership calls toast the server's
  // 1.6 text and title on success, and its message on failure.
  function bulk(dt, body, toasts) {
    $.ajax({
      url: '/api/v1/host/bulk',
      type: 'POST',
      contentType: 'application/json',
      data: JSON.stringify(body),
      success: function(res) {
        if (toasts && res && res.msg) { window.fogToast('success', res.msg, res.title); }
      },
      error: function(xhr) {
        if (!toasts) { return; }
        let json = xhr.responseJSON || {};
        window.fogToast('error', json.message || ('Could not update (HTTP ' + xhr.status + ').'), json.title || toasts.failTitle);
      },
      complete: function() { dt.ajax.reload(null, false); }
    });
  }

  // Resolve what a bulk action applies to: the selected rows, or -- when nothing
  // is selected -- every host matching the current search. With infinite scroll,
  // selection only covers loaded rows, so "all matching" is how you act on the
  // whole filtered set. The modal itself is the confirmation, so `desc` (shown in
  // the modal title) makes the scope explicit.
  function resolveTarget(dt) {
    let ids = dt.rows({selected: true}).data().toArray().map((r) => r.id).filter(Boolean);
    if (ids.length) {
      return { body: {id: ids}, all: false, desc: `${ids.length} selected host(s)` };
    }
    let n = dt.page.info().recordsDisplay;
    let search = dt.search() || '';
    return {
      body: {all: true, search: search},
      all: true,
      desc: search ? `all ${n} host(s) matching "${search}"` : `ALL ${n} host(s)`
    };
  }

  function escHtml(s) {
    return $('<span>').text(s == null ? '' : s).html();
  }

  // Escape for use inside a double-quoted HTML attribute (escHtml leaves quotes).
  function escAttr(s) {
    return escHtml(s).replace(/"/g, '&quot;');
  }

  // The 1.6 "Edit groups" button opens the "Group Membership" modal
  // (FOGPage.php ~1983-2060): a select2 of every Group, where a typed name
  // that is not a Group is created on Add. Add and Remove each send one
  // request for the target hosts.
  function openGroupModal(dt) {
    let target = resolveTarget(dt);

    function show(groups) {
      let body = document.createElement('div');
      // data-no-select2: fog.select2.js would enhance it without `tags`.
      body.innerHTML =
        '<select id="groupSelect" multiple="multiple" data-no-select2>' + groups.map((g) => {
          return '<option value="' + escAttr(g) + '">' + escHtml(g) + '</option>';
        }).join('') + '</select>' +
        '<p class="form-text mt-2 mb-0">A name that is not already a group is created when you add.' +
          ' Remove only works on groups that exist.</p>';

      // The 1.6 failure titles (HostManagement.php ~6874-6977).
      function send(wrap, key, failTitle) {
        let names = $(wrap).find('#groupSelect').val() || [];
        if (!names.length) {
          window.fogToast('error', 'No groups are being created or selected', failTitle);
          return false;
        }
        let change = {};
        change[key] = names;
        bulk(dt, $.extend({}, target.body, change), {failTitle: failTitle});
        return true;
      }

      window.fogModal({
        title: 'Group Membership — ' + target.desc,
        body: body,
        confirmText: 'Add',
        secondary: {
          text: 'Remove',
          className: 'btn btn-outline-danger float-end',
          onClick: function(wrap) { return send(wrap, 'removeGroups', 'Remove Hosts from Groups Fail'); }
        },
        onShown: function(wrap) {
          if ($.fn.select2) {
            $(wrap).find('#groupSelect').select2({tags: true, width: '100%', dropdownParent: $(wrap)});
          }
        },
        onConfirm: function(wrap) { return send(wrap, 'addGroups', 'Add Hosts to Group Fail'); }
      });
    }

    $.getJSON('/api/v1/host/groups')
      .done((res) => { show((res && res.groups) || []); })
      .fail(() => { show([]); });
  }

  // Bulk "Set image": pick from a dropdown (or clear) instead of typing a name.
  function openImageModal(dt) {
    let target = resolveTarget(dt);
    $.getJSON('/api/v1/image').done((images) => {
      let opts = '<option value="">(clear image)</option>' +
        (images || []).map((im) => {
          let v = escHtml(im.name);
          return '<option value="' + v + '">' + v + '</option>';
        }).join('');
      let body = '<label class="form-label">Image</label>' +
        '<select class="form-select" id="fog-bulk-image">' + opts + '</select>';
      window.fogModal({
        title: 'Set Image — ' + target.desc,
        body: body,
        confirmText: 'Apply',
        onConfirm: function(wrap) {
          let name = wrap.querySelector('#fog-bulk-image').value;
          bulk(dt, $.extend({}, target.body, {image: name}));
        }
      });
    }).fail(() => { window.fogToast('error', 'Could not load images.'); });
  }

  $('#listtable').registerTable(undefined, {
    // "Add" opens the create modal on every list, as in FOG 1.6.
    createMode: 'modal',
    order: [
      [0, 'asc']
    ],
    // Bulk actions on the selected hosts.
    extraButtons: [
      {
        text: '<i class="fas fa-sitemap"></i> Edit groups',
        action: function(e, dt) { openGroupModal(dt); }
      },
      {
        text: '<i class="fa fa-desktop"></i> Set Image',
        action: function(e, dt) { openImageModal(dt); }
      }
    ],
    columns: [
      {data: 'name'},
      {
        data: 'macs',
        orderable: false,
        render: function(data, type, row) {
          let mac = Array.isArray(data) ? (data.length ? data[0] : '') : (data || '');
          if (!mac) {
            return '';
          }
          let hex = String(mac).replace(/[^0-9a-fA-F]/g, '').toLowerCase();
          let disp = hex.length === 12 ? hex.match(/.{2}/g).join(':') : mac;
          // Vendor for the primary MAC (resolved server-side, see Host.customToJSON).
          let vendor = (row && Array.isArray(row.macVendors)) ? row.macVendors[0] : '';
          if (!vendor) { return escHtml(disp); }
          return escHtml(disp) +
            ' <i class="fa fa-info-circle text-muted ms-1" title="' + escAttr(vendor) +
            '" aria-label="Vendor: ' + escAttr(vendor) + '"></i>';
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
        data: 'groups',
        orderable: false,
        render: function(data) {
          let groups = Array.isArray(data) ? data : (data ? [data] : []);
          if (!groups.length) { return ''; }
          return '<span class="fog-tag-list">' + groups.map((g) => {
            return '<span class="badge bg-primary">' + escHtml(g) + '</span>';
          }).join('') + '</span>';
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
