(function($) {
  let path = $(location).attr('pathname').replace(/s$/,'');
  $('#listtable').registerTable(undefined, {
    createMode: 'modal',
    order: [
      [0, 'asc']
    ],
    columns: [
      {data: 'name'},
      {data: 'ip'},
      {data: 'printerModel'}
    ],
    rowId: 'id',
    serverSide: true,
    ajax: {
      type: 'post',
      url: `/api/v1${path}/datatable`
    }
  });
})(jQuery);
