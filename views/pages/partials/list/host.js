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
          if (Array.isArray(data)) {
            return data.length ? data[0] : '';
          }
          return data || '';
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
