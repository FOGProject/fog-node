(function($) {
  let path = $(location).attr('pathname').replace(/s$/,'');
  console.log(path);
  $('#listtable').registerTable(undefined, {
    order: [
      [0, 'asc']
    ],
    columns: [
      {data: 'name'},
      {data: 'primac'},
      {data: 'pingstatus'},
      {data: 'deployed'},
      {data: 'image'},
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
