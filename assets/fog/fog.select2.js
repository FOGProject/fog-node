/**
 * fog.select2.js
 *
 * Turn every <select> into a searchable, consistently-styled select2 control,
 * so dropdowns look and behave the same throughout the UI. Idempotent, and
 * re-runs for dynamically-added content: the shared create/edit modal and
 * DataTables' "Show N entries" length menu.
 *
 * Opt a single select out with `data-no-select2`.
 */
(function($) {
  function initSelect2(context, dropdownParent) {
    if (!$.fn.select2) { return; } // lib not loaded -> leave native selects
    $(context || document).find('select').each(function() {
      var $sel = $(this);
      if ($sel.hasClass('select2-hidden-accessible')) { return; } // already enhanced
      if ($sel.is('[data-no-select2]')) { return; }               // explicit opt-out

      var opts = { width: '100%' };
      // DataTables' length menu is tiny (10/25/50/100); size it to its content
      // instead of stretching it across the toolbar.
      if ($sel.closest('.dt-length, .dataTables_length').length) {
        opts.width = 'auto';
      }
      // Inside a Bootstrap modal, render the dropdown within the modal so it
      // keeps search-box focus and stacks above the backdrop.
      if (dropdownParent && dropdownParent.length) {
        opts.dropdownParent = dropdownParent;
      }
      $sel.select2(opts);
    });
  }

  // Initial page load (covers full-page forms and any selects already present).
  $(function() { initSelect2(document); });

  // The shared entity create/edit modal lazy-loads a server-rendered form;
  // enhance its selects once the modal has finished opening.
  $(document).on('shown.bs.modal', function(e) {
    initSelect2(e.target, $(e.target));
  });

  // DataTables builds its length <select> after the table initializes.
  $(document).on('init.dt', function(e, settings) {
    initSelect2(settings.nTableWrapper || document);
  });

  // Let code that injects its own selects re-run the same enhancement.
  window.fogInitSelect2 = initSelect2;
})(jQuery);
