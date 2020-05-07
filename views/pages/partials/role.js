(function($) {
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
      url: '/api/v1/role/datatable'
    }
  });
})(jQuery);
