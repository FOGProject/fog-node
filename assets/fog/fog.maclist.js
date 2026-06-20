// MAC-address list widget for host create/edit forms.
// Rows of MAC inputs (name="macs[]") with a radio to pick the primary; on submit
// the primary row is moved to the front (index 0 = primary) and empty rows are
// dropped.
(function($) {
  function rowHtml() {
    return `
      <div class="input-group mb-1 maclist-row">
        <div class="input-group-text">
          <input type="radio" name="__primac" title="Primary MAC"/>
        </div>
        <input type="text" class="form-control" name="macs[]" placeholder="AA:BB:CC:DD:EE:FF" pattern="[0-9A-Fa-f]{2}([:.-]?[0-9A-Fa-f]{2}){5}" title="A MAC address, e.g. AA:BB:CC:DD:EE:FF"/>
        <button type="button" class="btn btn-outline-danger maclist-remove" tabindex="-1">&times;</button>
      </div>`;
  }

  $(document).on('click', '.maclist-add', function() {
    $(this).before(rowHtml());
  });

  $(document).on('click', '.maclist-remove', function() {
    let $list = $(this).closest('[data-maclist]'),
      $row = $(this).closest('.maclist-row'),
      wasPrimary = $row.find('input[name="__primac"]').is(':checked');
    $row.remove();
    // Keep a primary selected.
    if (wasPrimary && !$list.find('input[name="__primac"]:checked').length) {
      $list.find('input[name="__primac"]').first().prop('checked', true);
    }
  });

  $(document).on('submit', 'form', function() {
    let $list = $(this).find('[data-maclist]');
    if (!$list.length) { return; }
    // Drop empty MAC rows.
    $list.find('.maclist-row').each(function() {
      if (!$.trim($(this).find('input[name="macs[]"]').val())) {
        $(this).remove();
      }
    });
    // Move the primary (checked radio) row to the top so it submits first.
    let $primary = $list.find('input[name="__primac"]:checked').closest('.maclist-row');
    if ($primary.length) {
      $list.prepend($primary);
    }
  });
})(jQuery);
