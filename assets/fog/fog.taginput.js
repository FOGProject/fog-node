// Tag (token/chip) input widget for the host create/edit forms and the bulk
// "Manage tags" modal. A `[data-taginput]` container (rendered server-side by
// form-generator, or injected by the modal) carries `data-name` + `data-tags`;
// this builds removable chips plus a text entry and keeps a hidden
// `<input name="<data-name>">` in sync (comma-joined). The existing form POST
// and the Host model's tag normalisation then handle it unchanged -- mirrors how
// fog.maclist.js drives the MAC widget.
(function($) {
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function chipHtml(tag) {
    return `<span class="badge bg-primary fog-tag" data-tag="${esc(tag)}">${esc(tag)}` +
      `<button type="button" class="fog-tag-x" tabindex="-1" aria-label="Remove tag">&times;</button></span>`;
  }
  // Current chip values, in display order.
  function values($root) {
    return $root.find('.fog-tag').map(function() {
      return $(this).attr('data-tag');
    }).get();
  }
  // Keep the hidden field (submitted as the model's tag value) in sync.
  function sync($root) {
    $root.find('.fog-taginput-value').val(values($root).join(', '));
  }
  // Add a chip unless a case-insensitive duplicate already exists.
  function addTag($root, text) {
    let tag = $.trim(text || '');
    if (!tag) { return; }
    let lower = tag.toLowerCase();
    if (!values($root).some((t) => t.toLowerCase() === lower)) {
      $root.find('.fog-taginput-entry').before(chipHtml(tag));
    }
    sync($root);
  }
  // Turn a bare `[data-taginput]` container into the chips + entry + hidden field.
  function build($root) {
    if ($root.data('taginputReady')) { return; }
    let name = $root.attr('data-name') || 'tags',
      tags = ($root.attr('data-tags') || '').split(/[\n,]+/).map((t) => $.trim(t)).filter(Boolean);
    $root.addClass('form-control fog-taginput').html(
      tags.map(chipHtml).join('') +
      '<input type="text" class="fog-taginput-entry" autocomplete="off" placeholder="add tag…">' +
      `<input type="hidden" class="fog-taginput-value" name="${esc(name)}">`
    );
    $root.data('taginputReady', true);
    sync($root);
  }

  // Remove a chip via its ×.
  $(document).on('click', '.fog-tag-x', function() {
    let $root = $(this).closest('[data-taginput]');
    $(this).closest('.fog-tag').remove();
    sync($root);
  });
  // Enter or comma commits the entry; Backspace on an empty entry pops the last chip.
  $(document).on('keydown', '.fog-taginput-entry', function(e) {
    let $entry = $(this), $root = $entry.closest('[data-taginput]');
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag($root, $entry.val());
      $entry.val('');
    } else if (e.key === 'Backspace' && !$entry.val()) {
      $root.find('.fog-tag').last().remove();
      sync($root);
    }
  });
  // Commit a half-typed tag when focus leaves the widget.
  $(document).on('blur', '.fog-taginput-entry', function() {
    addTag($(this).closest('[data-taginput]'), $(this).val());
    $(this).val('');
  });
  // Clicking the empty area of the widget focuses the entry.
  $(document).on('click', '.fog-taginput', function(e) {
    if (e.target === this) { $(this).find('.fog-taginput-entry').trigger('focus'); }
  });

  // Build every widget under `root` (default: the whole document on load).
  function init(root) {
    $(root || document).find('[data-taginput]').each(function() { build($(this)); });
  }
  $(function() { init(document); });

  window.fogTagInput = {
    init: init,
    build: function(el) { build($(el)); },
    values: function(el) { return values($(el)); }
  };
})(jQuery);
