(function($) {
  let path = $(location).attr('pathname').replace(/s$/,'');

  function bulk(dt, body) {
    $.ajax({
      url: '/api/v1/host/bulk',
      type: 'POST',
      contentType: 'application/json',
      data: JSON.stringify(body),
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
    let n = dt.page.info().recordsDisplay,
      search = dt.search() || '';
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

  // Bulk "Manage tags": add (chip input) and remove (checklist) in one request.
  function openTagModal(dt) {
    let target = resolveTarget(dt);

    function show(knownTags) {
      let removeHtml = knownTags.length
        ? '<div class="fog-tag-remove-list">' + knownTags.map(function(t) {
          let v = escHtml(t);
          return '<div class="form-check form-check-inline">' +
            '<input class="form-check-input" type="checkbox" value="' + v + '">' +
            '<label class="form-check-label">' + v + '</label></div>';
        }).join('') + '</div>'
        : '<p class="text-muted mb-0">No existing tags to remove.</p>';

      let body = document.createElement('div');
      body.innerHTML =
        '<div class="mb-3"><label class="form-label fw-semibold">Add tags</label>' +
          '<div data-taginput data-name="addTags" data-tags=""></div></div>' +
        '<div><label class="form-label fw-semibold">Remove tags</label>' + removeHtml + '</div>';

      window.fogModal({
        title: 'Manage Tags — ' + target.desc,
        body: body,
        confirmText: 'Apply',
        onShown: function(wrap) { if (window.fogTagInput) { window.fogTagInput.init(wrap); } },
        onConfirm: function(wrap) {
          let addTags = window.fogTagInput
              ? window.fogTagInput.values(wrap.querySelector('[data-taginput]')) : [],
            removeTags = $(wrap).find('.fog-tag-remove-list input:checked')
              .map(function() { return this.value; }).get();
          if (!addTags.length && !removeTags.length) {
            window.fogToast('error', 'Add or select at least one tag.');
            return false;
          }
          bulk(dt, $.extend({}, target.body, {addTags: addTags, removeTags: removeTags}));
        }
      });
    }

    // Removable-tag source: the union across selected rows, or -- acting on all
    // matching -- every tag in the system.
    if (!target.all) {
      let seen = {}, list = [];
      dt.rows({selected: true}).data().toArray().forEach(function(r) {
        (Array.isArray(r.tags) ? r.tags : []).forEach(function(t) {
          let k = String(t).toLowerCase();
          if (!seen[k]) { seen[k] = true; list.push(t); }
        });
      });
      list.sort(function(a, b) { return a.toLowerCase().localeCompare(b.toLowerCase()); });
      show(list);
    } else {
      $.getJSON('/api/v1/host/tags')
        .done(function(res) { show((res && res.tags) || []); })
        .fail(function() { show([]); });
    }
  }

  // Bulk "Set image": pick from a dropdown (or clear) instead of typing a name.
  function openImageModal(dt) {
    let target = resolveTarget(dt);
    $.getJSON('/api/v1/image').done(function(images) {
      let opts = '<option value="">(clear image)</option>' +
        (images || []).map(function(im) {
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
    }).fail(function() { window.fogToast('error', 'Could not load images.'); });
  }

  $('#listtable').registerTable(undefined, {
    createMode: 'page',
    order: [
      [0, 'asc']
    ],
    // Bulk "push to a set of hosts" actions (the 1.x group replacement).
    extraButtons: [
      {
        text: '<i class="fa fa-tags"></i> Manage Tags',
        action: function(e, dt) { openTagModal(dt); }
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
        data: 'tags',
        orderable: false,
        render: function(data) {
          let tags = Array.isArray(data) ? data : (data ? [data] : []);
          if (!tags.length) { return ''; }
          return '<span class="fog-tag-list">' + tags.map(function(t) {
            return '<span class="badge bg-primary">' + escHtml(t) + '</span>';
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
