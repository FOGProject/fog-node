(function($) {
  let path = $(location).attr('pathname').replace(/s$/,'');
  $('#listtable').registerTable(undefined, {
    order: [
      [0, 'asc']
    ],
    columns: [
      {data: 'name'},
      {data: 'description'},
      {data: 'isAdmin'}
    ],
    rowId: 'id',
    serverSide: true,
    ajax: {
      type: 'post',
      url: `/api/v1${path}/datatable`
    }
  });
})(jQuery);
