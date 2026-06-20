// Live global-search dropdown for the sidebar search box.
(function($) {
  let $input = $('#globalSearchInput');
  if (!$input.length) {
    return;
  }
  let $results = $('#globalSearchResults'),
    timer = null;

  function esc(s) {
    return $('<div>').text(s == null ? '' : s).html();
  }

  function render(groups) {
    if (!groups || !groups.length) {
      $results.html('<div class="px-2 py-1 text-muted small">No results</div>').show();
      return;
    }
    let html = '';
    groups.forEach(function(g) {
      html += `<div class="px-2 py-1 small fw-bold text-muted bg-light">${esc(g.label)}</div>`;
      g.items.forEach(function(it) {
        html += `<a class="d-block px-2 py-1 text-decoration-none text-dark border-bottom text-truncate" href="/${g.plural}/edit/${it.id}">${esc(it.name)}</a>`;
      });
    });
    $results.html(html).show();
  }

  $input.on('input', function() {
    let q = $.trim($input.val());
    if (timer) {
      clearTimeout(timer);
    }
    if (q.length < 2) {
      $results.hide().empty();
      return;
    }
    timer = setTimeout(function() {
      $.ajax({ url: '/api/v1/search', data: { q: q }, dataType: 'json' })
        .done(render)
        .fail(function() { $results.hide(); });
    }, 250);
  });

  $input.on('focus', function() {
    if ($results.children().length) {
      $results.show();
    }
  });

  $(document).on('click', function(e) {
    if (!$(e.target).closest('#globalSearchWrap').length) {
      $results.hide();
    }
  });
})(jQuery);
