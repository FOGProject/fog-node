// The sidebar universal search: the FOG 1.6 select2 box
// (1.6 management/js/fog/fog.common.js setupUniversalSearch, 5713-5797).
// As the user types, it lists the /api/v1/search results grouped by type.
// Each group ends with a "See all results" entry that opens the type's list
// page filtered by the term. Picking an entry opens its URL.
(function($) {
  // The number of results per type, as in 1.6 (resultLimit).
  const RESULT_LIMIT = 5;

  $(() => {
    let $sel = $('#universal-search-select');
    if (!$sel.length || !$.fn.select2) {
      return;
    }

    // Open the picked entry instead of selecting it, as 1.6 does.
    $sel.on('select2:selecting', (e) => {
      e.preventDefault();
      $sel.prop('disabled', true);
      window.location.href = e.params.args.data.url;
    });

    // The default theme, and no dropdownParent: the dropdown appends to
    // <body>, as in 1.6, where the ported body-scope select2 rules style it.
    // `multiple` with one selection lets the user type inside the box.
    // maximumSelectionLength is the select2 4.x name of 1.6's
    // maximumSelectionSize.
    $sel.select2({
      width: '100%',
      dropdownAutoWidth: true,
      minimumInputLength: 1,
      multiple: true,
      maximumSelectionLength: 1,
      ajax: {
        url: '/api/v1/search',
        dataType: 'json',
        delay: 250,
        cache: false,
        data: (params) => ({q: params.term, limit: RESULT_LIMIT}),
        // The API returns [{model, label, singular, plural, items: [{id, name}]}].
        // One option group per type, labeled with the 1.6 singular name.
        processResults: (groups, params) => {
          let term = (params.term || '').trim();
          let id = 0;
          return {
            results: (groups || []).map((g) => ({
              text: g.singular,
              children: g.items.map((it) => ({
                id: id++,
                text: it.name,
                url: `/${g.plural}/edit/${encodeURIComponent(it.id)}`
              })).concat({
                id: id++,
                text: '--> See all results',
                url: `/${g.plural}?search=${encodeURIComponent(term)}`
              })
            }))
          };
        }
      }
    });
  });
})(jQuery);
