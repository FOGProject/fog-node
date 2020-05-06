(function($) {
  $('#listtable').DataTable({
    paging: true,
    pageLength: 10,
    processing: true,
    serverSide: true,
    order: [
      [0, 'asc']
    ],
    columns: [
      {data: 'displayName'},
      {data: 'username'},
      {data: 'email'}
    ],
    rowId: 'id',
    ajax: {
      type: 'post',
      url: '/api/v1/user/datatable'
    }
  });
})(jQuery);
