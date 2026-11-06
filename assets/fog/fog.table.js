/**
 * fog.table.js
 *
 * The list-table machinery that $.fn.registerTable (fog.common.js) wires to
 * every grid. Ported from FOG 1.6 fog.common.js (98ac5bb732eb):
 *
 *   $.fn.makeColumnsResizable(api)  column resize by drag, fit by double-click
 *                                   (1.6 2054-2640)
 *   fogTable.colWidths              the hand-set width shares, per table id;
 *                                   the saved layout carries them (fogColWidths)
 *   fogTable.sizeScroller(api)      the adaptive scroll-body height (1.6
 *                                   3525-3910)
 *   fogTable.bindAutosize()         re-sizes every table on a window resize, a
 *                                   content resize and shown.bs.tab (1.6 4113)
 *
 * and the hover title on a clipped cell (1.6 2624). The CSS it relies on is
 * in assets/styles/zz-fog-ui.css: .fog-table-fixed, .fog-col-resizer,
 * body.fog-col-resizing and .fog-table-clip.
 *
 * DataTables 3 notes. Widths live on <colgroup> > <col>, not on the <th>.
 * In scroll mode there are two tables, the visible header clone in
 * div.dt-scroll-head and the real table in div.dt-scroll-body, and each has
 * its own colgroup. So a drag writes the <col> in both.
 */
(function($) {
  // A column never goes below this width (1.6 uses the same floor).
  const MIN_COL = 40;

  // Hand-set widths, per table id: {columnName: share of the table}. Shares,
  // not pixels, so a layout keeps its proportions at any window width. The
  // name (the column's `data`), not its index, so a reorder or a new column
  // does not move a width to another column. A column with no name uses its
  // original index. stateLoadCallback fills this before the first sizing pass.
  const colWidths = {};

  // The pieces of a table that resizing writes to.
  function tableParts(node, api) {
    let body = $(node);
    let wrap = body.closest('.dt-container');
    let head = wrap.find('div.dt-scroll-head table').first();
    let visibleHead = head.length ? head : body;
    let allTh = visibleHead.find('thead tr:first > th');
    let domIndex = [];
    // Responsive hides a column with display:none on its cells, and the
    // colgroup holds only the showing columns. So map each colgroup position
    // to its header cell, rather than assume the two line up 1:1.
    allTh.each(function(k) {
      if ($(this).css('display') !== 'none') { domIndex.push(k); }
    });
    return {
      api: api,
      visibleHead: visibleHead,
      body: body,
      tables: head.length ? head.add(body) : body,
      headers: allTh.filter(function() { return $(this).css('display') !== 'none'; }),
      domIndex: domIndex
    };
  }

  const tableKey = (parts) => parts.body.attr('id') || '';

  // The column's name at colgroup position i: its `data` key, or its original
  // index when it has none. data-dt-column is the original index, which
  // ColReorder does not change.
  function colKey(parts, i) {
    let idx = parts.headers.eq(i).attr('data-dt-column');
    if (idx === undefined) { return undefined; }
    let src = parts.api ? parts.api.column(Number(idx)).dataSrc() : null;
    return (typeof src === 'string' && src) ? src : String(idx);
  }

  // The widths now on the colgroup. After a drag, the truth is here: the
  // header cells are not re-measured yet.
  function currentWidths(parts) {
    return parts.visibleHead.find('colgroup > col').map(function() {
      return parseFloat(this.style.width) || 0;
    }).get();
  }

  // Records the layout that a user gesture produced, as shares.
  function remember(parts, widths) {
    let key = tableKey(parts);
    if (!key || !widths || !widths.length || widths.some((w) => w <= 0)) { return; }
    let total = widths.reduce((a, b) => a + b, 0);
    let store = colWidths[key] = colWidths[key] || {};
    widths.forEach((w, i) => {
      let ck = colKey(parts, i);
      if (ck !== undefined) { store[ck] = w / total; }
    });
  }

  // A width row rebuilt from the stored shares, or null when nothing is
  // stored for a showing column. A showing column with no stored share keeps
  // its measured share, so a column that Responsive brings back slots in.
  function restored(parts, widths) {
    let store = colWidths[tableKey(parts)];
    if (!store || !widths || !widths.length || widths.some((w) => w <= 0)) { return null; }
    let total = widths.reduce((a, b) => a + b, 0);
    let known = 0;
    let shares = widths.map((w, i) => {
      let ck = colKey(parts, i);
      let share = ck !== undefined ? Number(store[ck]) : NaN;
      if (share > 0 && isFinite(share)) { known++; return share; }
      return w / total;
    });
    let sumShare = shares.reduce((a, b) => a + b, 0);
    if (!known || sumShare <= 0) { return null; }
    let drift = total;
    let widest = 0;
    let out = shares.map((s) => {
      let w = Math.max(MIN_COL, Math.round(total * s / sumShare));
      drift -= w;
      return w;
    });
    out.forEach((w, i) => { if (w > out[widest]) { widest = i; } });
    // The rounding goes to the widest column, where it cannot cross the floor.
    out[widest] += drift;
    return out;
  }

  // Writes one column and its right neighbor, on every colgroup.
  function setPair(parts, i, a, b) {
    parts.tables.each(function() {
      let cols = $(this).find('colgroup > col');
      if (cols.length < i + 2) { return; }
      cols[i].style.width = a + 'px';
      cols[i + 1].style.width = b + 'px';
    });
  }

  // Writes a whole width row, on every colgroup.
  function setCols(parts, widths) {
    parts.tables.each(function() {
      let cols = $(this).find('colgroup > col');
      if (cols.length !== widths.length) { return; }
      cols.each(function(i) { this.style.width = widths[i] + 'px'; });
    });
  }

  // The widest content of column i, for double-click-to-fit. Measured in an
  // off-screen ruler, because a clipped cell reports its clipped width. Only
  // the rendered rows count: with Scroller that is the loaded chunk.
  function naturalWidth(parts, i) {
    let domI = parts.domIndex[i];
    let cells = parts.body.find('tbody tr').map(function() { return this.cells[domI]; }).get().filter(Boolean);
    let title = parts.headers.eq(i).find('.dt-column-title');
    let probe = cells.length ? $(cells[0]) : title;
    if (!probe.length) { return 0; }
    let ruler = $('#fog-col-ruler');
    if (!ruler.length) { ruler = $('<div id="fog-col-ruler"></div>').appendTo('body'); }
    let cs = window.getComputedStyle(probe[0]);
    let max = 0;
    ruler.css({
      position: 'absolute', top: '-9999px', left: '-9999px', visibility: 'hidden', whiteSpace: 'nowrap',
      fontFamily: cs.fontFamily, fontSize: cs.fontSize, paddingLeft: cs.paddingLeft, paddingRight: cs.paddingRight
    });
    function measure(html, bold) {
      ruler.css('font-weight', bold ? 'bold' : cs.fontWeight).html(html);
      max = Math.max(max, Math.ceil(ruler[0].getBoundingClientRect().width));
    }
    // The heading counts: a fit that cuts off the title is not a fit.
    if (title.length) { measure(title.html(), true); }
    cells.forEach((c) => { measure(c.innerHTML, false); });
    ruler.empty();
    // Room for the sort arrow and the border.
    return max + 24;
  }

  // Column i takes `want`, paid for by the other columns in proportion to
  // the space they do not need for their own content. The table width stays.
  function fitColumn(parts, i, want, widths) {
    let delta = want - widths[i];
    let weights = widths.map((w, j) => {
      if (j === i) { return 0; }
      if (delta > 0) {
        let floor = Math.min(w, Math.max(MIN_COL, naturalWidth(parts, j)));
        return Math.max(0, w - floor);
      }
      return w;
    });
    let sumWeight = weights.reduce((a, b) => a + b, 0);
    if (!sumWeight) { return null; }
    delta = delta > 0 ? Math.min(delta, sumWeight) : Math.max(delta, MIN_COL - widths[i]);
    let out = widths.map((w, j) => (j === i ? w : Math.round(w - delta * weights[j] / sumWeight)));
    let total = widths.reduce((a, b) => a + b, 0);
    out[i] = total - out.reduce((a, b, k) => (k === i ? a : a + b), 0);
    setCols(parts, out);
    return out;
  }

  // Gives each colgroup explicit px widths, measured from the header cells,
  // where a <col> has none yet. A table in a hidden tab measures zero, so it
  // is left for the sizing pass that runs when the tab shows.
  function seed(parts) {
    let widths = parts.headers.map(function() { return $(this).outerWidth(); }).get();
    if (widths.some((w) => !w)) { return widths; }
    parts.tables.each(function() {
      let cols = $(this).find('colgroup > col');
      if (cols.length !== widths.length) { return; }
      cols.each(function(i) { if (!this.style.width) { this.style.width = widths[i] + 'px'; } });
    });
    return widths;
  }

  // Saves the layout through the table's state (stateSaveCallback in
  // fog.common.js). Only a gesture saves: a sizing pass runs on every load
  // and resize, and would turn an untouched layout into a stream of writes.
  function save(api) {
    if (api) { api.state.save(); }
  }

  // Puts a .fog-col-resizer strip on the right edge of each showing header
  // cell but the last. A drag moves width from the column to its right
  // neighbor; a double-click fits the column to its content.
  $.fn.makeColumnsResizable = function(api) {
    return this.each(function() {
      let parts = tableParts(this, api);
      let headers = parts.headers;
      let colCount = parts.visibleHead.find('colgroup > col').length;

      // Rebuild every strip. A scroll-mode header is a clone, which copies a
      // strip's markup but not its handlers.
      parts.tables.find('thead .fog-col-resizer').remove();

      // The showing header cells and the <col>s must line up 1:1, or a drag
      // would move a different column than the one grabbed. If they do not,
      // hand the table back to the browser's own sizing.
      if (!colCount || colCount !== headers.length) {
        parts.tables.removeClass('fog-table-fixed').find('colgroup > col').css('width', '');
        return;
      }

      // Seed BEFORE the fixed layout: a fixed layout over empty <col>s makes
      // every column an equal share, and the measure would record that.
      let seeded = seed(parts);
      let back = restored(parts, seeded);
      parts.tables.addClass('fog-table-fixed');
      if (back) { setCols(parts, back); }

      headers.each(function(i) {
        if (i >= headers.length - 1) { return; }
        let handle = $('<span class="fog-col-resizer"></span>').appendTo(this);
        handle.on('mousedown', (ev) => {
          // The header sorts on click and selects text on drag: stop both.
          ev.preventDefault();
          ev.stopPropagation();
          let widths = seed(parts);
          let startX = ev.pageX;
          let startW = widths[i];
          let startNext = widths[i + 1];
          let move = (e) => {
            let dx = e.pageX - startX;
            if (startW + dx < MIN_COL || startNext - dx < MIN_COL) { return; }
            setPair(parts, i, startW + dx, startNext - dx);
          };
          let up = () => {
            $(document).off('mousemove.fogcol mouseup.fogcol');
            $('body').removeClass('fog-col-resizing');
            remember(parts, currentWidths(parts));
            save(api);
          };
          $('body').addClass('fog-col-resizing');
          $(document).on('mousemove.fogcol', move).on('mouseup.fogcol', up);
        });
        handle.on('dblclick', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          let widths = seed(parts);
          let want = naturalWidth(parts, i);
          if (want) {
            remember(parts, fitColumn(parts, i, want, widths));
            save(api);
          }
        });
        // A plain click would still bubble to the sort handler.
        handle.on('click', (ev) => { ev.stopPropagation(); });
      });
    });
  };

  // A clipped cell ends in an ellipsis. On hover it gets its full text as a
  // title. Measured per hovered cell, not stamped on every cell of a draw.
  $(document).on('mouseenter', '.fog-table-clip tbody td', function() {
    if (this.title || this.scrollWidth <= this.clientWidth) { return; }
    let txt = $(this).text().trim();
    if (txt) { this.title = txt; }
  });

  // The Column Visibility list is a Bootstrap .dropdown-menu with no
  // Bootstrap toggle (buttons.bootstrap5.js). Bootstrap's document keydown
  // handler for a .dropdown-menu throws on Escape and the arrow keys there
  // ("reading 'parentNode'"), and the list stays open. Buttons closes the
  // list on the Escape keyup, so these keydowns stop before Bootstrap sees
  // them. Bootstrap binds its delegated handlers on document in the CAPTURE
  // phase, so only a capture listener on window runs earlier.
  window.addEventListener('keydown', (ev) => {
    if (['Escape', 'ArrowUp', 'ArrowDown'].includes(ev.key) && ev.target.closest &&
        ev.target.closest('.dt-button-collection')) {
      ev.stopPropagation();
    }
  }, true);

  // Draws once more when the taller viewport wants more rows than are loaded
  // (1.6 fogFetchIfShort). Before the first answer the count is unknown, so
  // it waits for that draw and asks again, once.
  function fetchIfShort(dt, waited) {
    let settings = dt.settings()[0];
    let xhr = settings ? settings.jqXHR : null;
    if (!waited && xhr && xhr.readyState !== 4) {
      dt.one('draw.dt', () => { fetchIfShort(dt, true); });
      return;
    }
    let info = dt.page.info();
    if (info && dt.rows().count() >= info.recordsDisplay) { return; }
    dt.draw(false);
  }

  // True when the header and body columns of a scroll table line up, so an
  // adjust would change nothing.
  function columnsAligned(dt) {
    let container = dt.table().container();
    let scrollBody = $('div.dt-scroll-body', container)[0];
    let head = $('div.dt-scroll-head table', container)[0];
    let body = $('div.dt-scroll-body table', container)[0];
    if (!scrollBody || !head || !body) { return false; }
    if (Math.abs(body.getBoundingClientRect().width - scrollBody.clientWidth) > 1) { return false; }
    if (body.querySelector('tbody td.dt-empty')) { return true; }
    let headCells = head.querySelectorAll('thead tr:first-child > th');
    let bodyCells = body.querySelectorAll('tbody tr:first-child > td, tbody tr:first-child > th');
    if (!bodyCells.length) { return true; }
    if (headCells.length !== bodyCells.length) { return false; }
    for (let i = 0; i < headCells.length; i++) {
      if (Math.abs(headCells[i].getBoundingClientRect().width - bodyCells[i].getBoundingClientRect().width) > 1) {
        return false;
      }
    }
    return true;
  }

  // Clears the colgroup widths, so the next columns.adjust() re-measures. The
  // hand-set shares survive: the column-sizing pass re-applies them.
  function releaseColWidths(node) {
    tableParts(node).tables.removeClass('fog-table-fixed').find('colgroup > col').css('width', '');
  }

  // The adaptive height (1.6 fogSizeScroller): the scroll body's max-height
  // is the space from the top of the rows to the window bottom, less what the
  // card shows under the rows (the info line, the action box) and a 20 px
  // gap. The floor is 150 px.
  function sizeScroller(dt, release) {
    let init = (dt && typeof dt.init === 'function') ? dt.init() : null;
    if (!init || !init.scroller) { return; }
    let container = dt.table().container();
    if (!container) { return; }
    let body = $('div.dt-scroll-body', container);
    if (!body.length || !body.is(':visible')) { return; }
    // To the bottom of the CARD, so the action box under the table stays on
    // screen. A distance between two edges of one box, so it is right even
    // while the card overflows.
    let outer = $(container).closest('.card')[0] || container;
    let bodyRect = body[0].getBoundingClientRect();
    let belowBody = outer.getBoundingClientRect().bottom - bodyRect.bottom;
    let avail = Math.max(150, Math.floor(window.innerHeight - bodyRect.top - belowBody - 20));
    body.css('max-height', avail + 'px');
    // One more pass after the first draw: until the row count is known the
    // body overflows, and DataTables reserves a scrollbar width on the header.
    let settings = dt.settings()[0];
    if (settings && !settings._fogPostShowAdjusted) {
      settings._fogPostShowAdjusted = true;
      dt.one('draw.dt.fogScroller', () => { setTimeout(() => { sizeScroller(dt); }, 0); });
    }
    // Re-measure the viewport without a redraw. Draw only when the taller
    // body needs more rows than the last request asked for.
    if (dt.scroller && typeof dt.scroller.measure === 'function') {
      let before = dt.page.len();
      dt.scroller.measure(false);
      if (dt.page.len() > before) { fetchIfShort(dt); }
    }
    if (columnsAligned(dt)) { return; }
    if (release) { releaseColWidths(dt.table().node()); }
    dt.columns.adjust();
  }

  // Holds a scroll table's body at the header's width while its container
  // resizes, so the columns do not walk out of line until the adjust lands.
  function holdBodyWidth(dt) {
    let container = dt.table().container();
    let head = $('div.dt-scroll-head table', container);
    let body = $('div.dt-scroll-body table', container);
    if (!head.length || !body.length) { return; }
    body.css('width', head[0].getBoundingClientRect().width + 'px');
  }

  // The real table nodes. Not $('table.dataTable') with isDataTable(): that
  // is true for the scroll-head clone too, and .DataTable() on the clone
  // builds a second, stray DataTable there.
  const allTables = () => $($.fn.dataTable.tables());

  function adjustAll() {
    allTables().each(function() {
      let dt = $(this).DataTable();
      $('div.dt-scroll-body table', dt.table().container()).css('width', '');
      let init = dt.init();
      if (!init) { return; }
      if (init.scroller) {
        sizeScroller(dt, true);
        return;
      }
      // A paged table in a hidden tab measures zero: leave it.
      if (!$(this).is(':visible')) { return; }
      releaseColWidths(this);
      dt.columns.adjust();
    });
  }

  // Binds the page-wide handlers once: a window resize, a resize of the
  // content area (the sidebar toggle has no window resize), and a tab shown.
  function bindAutosize() {
    if ($.fn.dataTable.__fogAutosizeBound) { return; }
    $.fn.dataTable.__fogAutosizeBound = true;
    let debounce;
    let lastWidth = null;
    function adjustSoon() {
      let main = document.querySelector('.app-main');
      let width = main ? Math.round(main.getBoundingClientRect().width) : null;
      // Only a WIDTH change misaligns header and body; the first render of
      // the rows changes only the height.
      if (width !== null && width !== lastWidth) {
        lastWidth = width;
        allTables().each(function() { holdBodyWidth($(this).DataTable()); });
      }
      clearTimeout(debounce);
      debounce = setTimeout(adjustAll, 150);
    }
    $(window).on('resize.fogScroller', adjustSoon);
    let main = document.querySelector('.app-main');
    if (main && typeof ResizeObserver === 'function') {
      new ResizeObserver(adjustSoon).observe(main);
    }
    // Inside shown.bs.tab the layout is not final yet: wait one tick.
    $(document).on('shown.bs.tab.fogScroller', () => { setTimeout(adjustAll, 0); });
  }

  window.fogTable = {
    colWidths: colWidths,
    sizeScroller: sizeScroller,
    bindAutosize: bindAutosize
  };
})(jQuery);
