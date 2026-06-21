/**
 * fog.assoc.js
 *
 * Behaviour for the multi-association picker (the "checktable" form item built
 * by api/helpers/form-generator.js): select-all, a live "N of M selected"
 * count, a per-picker text filter, and the selected-row highlight class.
 *
 * Uses event delegation on document, so it covers both the full-page edit form
 * and the lazy-loaded create/edit modal (which injects its form after open).
 * Markup contract:
 *   [data-assoc-picker]      wrapper
 *     [data-assoc-all]       the select-all checkbox
 *     [data-assoc-count]     count display
 *     [data-assoc-search]    the filter input
 *     tr.assoc-row           one per option; .selected = chosen
 *       td.assoc-check input the row checkbox
 *       td.assoc-name        the label text the filter matches
 */
(function () {
  function rows(picker) {
    return Array.prototype.slice.call(picker.querySelectorAll('.assoc-row'));
  }
  function visibleRows(picker) {
    return rows(picker).filter(function (r) { return !r.classList.contains('assoc-hidden'); });
  }
  function rowBox(r) {
    return r.querySelector('td.assoc-check input[type="checkbox"]');
  }

  // Recompute row highlight, the count, and the select-all (checked /
  // indeterminate) state for a single picker.
  function refresh(picker) {
    var all = rows(picker), selected = 0;
    all.forEach(function (r) {
      var cb = rowBox(r), on = !!(cb && cb.checked);
      r.classList.toggle('selected', on);
      if (on) { selected++; }
    });

    var count = picker.querySelector('[data-assoc-count]');
    if (count) {
      count.innerHTML = '<strong>' + selected + '</strong> of ' + all.length + ' selected';
    }

    var master = picker.querySelector('[data-assoc-all]');
    if (master) {
      // Base the master state on the rows the user can currently see.
      var vis = visibleRows(picker);
      var visOn = vis.filter(function (r) { var c = rowBox(r); return c && c.checked; }).length;
      master.checked = vis.length > 0 && visOn === vis.length;
      master.indeterminate = visOn > 0 && visOn < vis.length;
    }
  }

  function refreshAll(ctx) {
    var root = (ctx && ctx.querySelectorAll) ? ctx : document;
    Array.prototype.forEach.call(root.querySelectorAll('[data-assoc-picker]'), refresh);
  }

  // Checkbox changes: select-all toggles the visible rows; any change refreshes.
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (!t || t.type !== 'checkbox') { return; }
    var picker = t.closest && t.closest('[data-assoc-picker]');
    if (!picker) { return; }
    if (t.hasAttribute('data-assoc-all')) {
      var on = t.checked;
      visibleRows(picker).forEach(function (r) { var c = rowBox(r); if (c) { c.checked = on; } });
    }
    refresh(picker);
  });

  // Filter: hide non-matching rows by their label text.
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (!t || !t.hasAttribute || !t.hasAttribute('data-assoc-search')) { return; }
    var picker = t.closest && t.closest('[data-assoc-picker]');
    if (!picker) { return; }
    var q = t.value.trim().toLowerCase();
    rows(picker).forEach(function (r) {
      var name = (r.querySelector('.assoc-name') || {}).textContent || '';
      r.classList.toggle('assoc-hidden', !!q && name.toLowerCase().indexOf(q) === -1);
    });
    refresh(picker);
  });

  function ready() { refreshAll(document); }
  if (document.readyState !== 'loading') { ready(); }
  else { document.addEventListener('DOMContentLoaded', ready); }

  // The create/edit modal injects a server-rendered form once shown.
  document.addEventListener('shown.bs.modal', function (e) { refreshAll(e.target); });

  // Let code that injects its own pickers re-sync them.
  window.fogInitAssoc = refreshAll;
})();
