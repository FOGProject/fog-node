(function($) {
  let path = $(location).attr('pathname').replace(/s$/,'');
  $('#listtable').registerTable(undefined, {
    order: [
      [0, 'asc']
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
