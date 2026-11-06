(function($) {
  let path = $(location).attr('pathname').replace(/s$/,'');
  $('#listtable').registerTable(undefined, {
    createMode: 'modal',
    order: [
      [0, 'asc']
    ],
    // Members and Grants are computed per row, not stored fields
    // (api/helpers/datatables/get-data.js), so they neither sort nor search,
    // as 1.6 makes Grants unsortable (fog.group.list.js ~20-30).
    columns: [
      {data: 'name'},
      {data: 'members', orderable: false, searchable: false},
      {
        data: 'grants',
        orderable: false,
        searchable: false,
        // 1.6 fog.group.list.js ~32-60: a badge per grant on screen, the
        // plain comma-joined text for sort, search and export.
        render: function(data, type, row) {
          if (type !== 'display') { return row.grants; }
          return (Array.isArray(row.grants_list) ? row.grants_list : []).map((g) => {
            return '<span class="badge text-bg-secondary me-1">' + $('<span>').text(g).html() + '</span>';
          }).join('');
        }
      }
    ],
    rowId: 'id',
    serverSide: true,
    ajax: {
      type: 'post',
      url: `/api/v1${path}/datatable`
    }
  });
})(jQuery);
