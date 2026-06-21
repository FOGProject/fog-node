(function($) {
  let path = $(location).attr('pathname').replace(/s$/,'');
  $('#listtable').registerTable(undefined, {
    createMode: 'modal',
    order: [
      [0, 'asc']
    ],
    // Discover images already on disk (a folder with partition .img files) and
    // create records for any not yet defined -- so synced/copied images appear
    // without building each definition by hand.
    extraButtons: [
      {
        text: '<i class="fa fa-folder-open"></i> Scan store',
        action: function(e, dt) {
          $.ajax({
            url: '/api/v1/image/scan',
            type: 'POST',
            complete: function(xhr) {
              let r = (xhr && xhr.responseJSON) || {},
                n = (r.created || []).length;
              if (r.error) {
                window.fogToast('error', r.error);
              } else {
                window.fogToast(n ? 'success' : 'info', n ? `Discovered ${n} new image(s).` : 'No new images found.');
              }
              dt.ajax.reload();
            }
          });
        }
      }
    ],
    columns: [
      {data: 'name'},
      {data: 'protected'},
      {data: 'enabled'},
      {data: 'lastCaptureDate'}
    ],
    rowId: 'id',
    serverSide: true,
    ajax: {
      type: 'post',
      url: `/api/v1${path}/datatable`
    }
  });
})(jQuery);
