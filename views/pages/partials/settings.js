(function($) {
  // The FOG Settings page (GET /about/settings, views/pages/settings.ejs;
  // 1.6 about/fog.about.settings.js). The category nav shows one panel. The
  // search box filters the rows of every panel. Below 768px each panel title
  // toggles its panel. A control saves on change, one setting per request, to
  // POST /api/v1/setting/save (api/controllers/setting/save.js). $.ajax, not
  // fetch: jQuery sends X-Requested-With, which apiCsrfGuard requires, and
  // fog.csrf.js adds X-CSRF-Token to it.
  let activeCat = null;

  // The 1.6 search words of a reload row (FOGConfigurationPage.php _renderSettings).
  const RELOAD_WORDS = 'refresh reload hard refresh';

  function isMobile() {
    return window.matchMedia && window.matchMedia('(max-width: 767px)').matches;
  }

  // Mark one nav item active, or none for null. The link gets the BS5 class
  // too, so the active category paints as a pill.
  function markNav($item) {
    $('#settings-nav li').removeClass('active').find('a').removeClass('active');
    if ($item) { $item.addClass('active').find('a').addClass('active'); }
  }

  // Select a category: the one visible panel on a wide screen, the open
  // panel on a narrow one. The CSS hides the others off .active unless the
  // layout is .searching. An unknown category falls back to the first.
  function showCategory(cat) {
    let $item = $('#settings-nav li').filter(function() { return $(this).find('a').attr('data-cat') === cat; }).first();
    if (!$item.length) {
      $item = $('#settings-nav li').first();
      cat = $item.find('a').attr('data-cat');
    }
    markNav($item);
    activeCat = cat;
    $('.settings-layout').removeClass('searching');
    $('.settings-panel').each(function() {
      $(this).toggleClass('active', $(this).attr('data-cat') === cat);
    });
    $('.settings-noresults').addClass('d-none');
  }

  // A row matches when the term is part of its key, its description, or the
  // first 200 characters of its current value. A reload row also matches its
  // reload words. The value is read here, so a saved value matches at once.
  function matches($row, term) {
    let fields = [
      $row.attr('data-key') || '',
      $row.attr('data-description') || '',
      String(current($row.find('.settings-control :input')) || '').slice(0, 200)
    ];
    if ($row.is('[data-reload]')) { fields.push(RELOAD_WORDS); }
    return fields.some((field) => field.toLowerCase().indexOf(term) !== -1);
  }

  // Filter the rows of every category by the term. While a term is present,
  // every panel with a match shows and no category is highlighted. An empty
  // term restores the single-category view.
  function applySearch(term) {
    term = (term || '').trim().toLowerCase();
    if (term === '') {
      $('.settings-row, .settings-panel').removeClass('d-none');
      showCategory(activeCat);
      return;
    }
    $('.settings-layout').addClass('searching');
    markNav(null);
    let anyVisible = false;
    $('.settings-panel').each(function() {
      let $panel = $(this);
      let anyRow = false;
      $panel.find('.settings-row').each(function() {
        let match = matches($(this), term);
        $(this).toggleClass('d-none', !match);
        if (match) { anyRow = true; }
      });
      $panel.toggleClass('d-none', !anyRow);
      if (anyRow) { anyVisible = true; }
    });
    $('.settings-noresults').toggleClass('d-none', anyVisible);
  }

  // The current value of a control: a checkbox is true or false, any other
  // control gives its text. 'saved' holds the last stored one.
  function current($el) {
    return $el.is(':checkbox') ? $el.prop('checked') : $el.val();
  }
  function setCurrent($el, value) {
    if ($el.is(':checkbox')) { $el.prop('checked', value); } else { $el.val(value); }
  }

  // Save one control. A good save remembers the value, toasts the server's
  // reply and, for a reload row, the reload reminder. A failed save puts the
  // control back to its last stored value and toasts the error.
  function save(el) {
    let $el = $(el);
    let value = current($el);
    if ($el.is(':checkbox')) {
      // 1.6 JS:191-200 sends 1 or 0.
      value = value ? 1 : 0;
    } else if ($el.is('[type=number]')) {
      // Send nothing for an empty or non-numeric field. Number('') is 0, so
      // a cleared deploy-window field would otherwise switch off deploy
      // auto-approval in one edit. The server's normalize() decides the rest.
      let text = String(value).trim();
      if (text === '' || !Number.isFinite(Number(text))) {
        setCurrent($el, $el.data('saved'));
        window.fogToast('error', 'Enter a number.', 'Settings Update Fail');
        return;
      }
      value = Number(text);
    }
    $.ajax({
      url: '/api/v1/setting/save',
      type: 'POST',
      contentType: 'application/json',
      dataType: 'json',
      data: JSON.stringify({key: el.name, value}),
      success: function(body) {
        $el.data('saved', current($el));
        window.fogToast('success', body.msg, body.title);
        if ($el.closest('.settings-row').is('[data-reload]')) {
          window.fogToast('info', 'This setting takes effect after you reload the page.', 'Reload required');
        }
      },
      error: function(xhr) {
        setCurrent($el, $el.data('saved'));
        window.fogToast('error', window.fogErrorOf(xhr), (xhr.responseJSON && xhr.responseJSON.title) || 'Settings Update Fail');
      }
    });
  }

  $('#settings-content .settings-control :input').each(function() {
    $(this).data('saved', current($(this)));
  }).on('change', function() {
    save(this);
  });
  $('#settings-content [data-bs-toggle="tooltip"]').each(function() {
    bootstrap.Tooltip.getOrCreateInstance(this);
  });

  // A click on a category clears the search and shows that panel.
  $('#settings-nav').on('click', 'a', function(e) {
    e.preventDefault();
    $('#settings-search').val('');
    $('.settings-row, .settings-panel').removeClass('d-none');
    showCategory($(this).attr('data-cat'));
  });
  // Below 768px the panel title toggles its own panel. It does nothing on a
  // wide screen (the nav selects there) or while a search runs.
  $('#settings-content').on('click', '.settings-panel-title', function() {
    if (!isMobile() || $('#settings-search').val().trim() !== '') { return; }
    let cat = $(this).attr('data-cat');
    if (cat === activeCat) {
      activeCat = null;
      $('.settings-panel').removeClass('active');
      markNav(null);
      return;
    }
    showCategory(cat);
  });
  $('#settings-search').on('input', function() {
    applySearch($(this).val());
  });
  $('#settings-search-clear').on('click', (e) => {
    e.preventDefault();
    $('#settings-search').val('');
    applySearch('');
  });

  // The first category is active on load. ?search= pre-fills the box.
  showCategory(null);
  let urlSearch = new URLSearchParams(window.location.search).get('search');
  if (urlSearch) {
    $('#settings-search').val(urlSearch);
    applySearch(urlSearch);
  }
})(jQuery);
