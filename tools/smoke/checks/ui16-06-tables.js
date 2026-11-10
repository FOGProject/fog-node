/**
 * ui16-06: the FOG 1.6 list tables (issue #150).
 *
 * It proves the 1.6 toolbar on every list, the Tasks list without
 * selection, the dark .btn-default, the row link to the edit page, the
 * FOG_TABLE_SCROLL_MODE paged mode, the "Add" create modal, ?search=, the
 * adaptive scroll height, "Delete selected", the column-search row, and the
 * saved per-user layout (a hidden column and a column width) in a reload and
 * in a second browser context. tools/smoke/ui.js runs this file (see the
 * comment at its top). It creates and deletes its own snapin and host; the
 * records of ctx.created stay untouched.
 */

const expect = (what, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what} is ${a}, expected ${e}`);
};

const AJAX = {'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json'};

// The shared toolbar (assets/fog/fog.common.js, 1.6 fog.common.js:4476-4512).
const SELECT = ['Select All', 'Deselect All'];
const SHARED = ['Column search', 'Column Visibility', 'Refresh'];
const TOOLBARS = {
  '/hosts': [...SELECT, ...SHARED, 'Edit groups', 'Set Image'],
  '/hosts/pending': [...SELECT, ...SHARED, 'Approve selected'],
  '/hosts/pendingAgents': [...SELECT, ...SHARED, 'Approve selected', 'Deny selected'],
  '/hosts/agentTokens': [...SELECT, ...SHARED, 'Create token', 'Revoke selected'],
  '/images': [...SELECT, ...SHARED, 'Scan store'],
  '/tasks': SHARED
};
// The 1.6 title of a list that does not start with "All " (HostManagement::agentTokens).
const TITLES = {'/hosts/agentTokens': 'Agent Enrollment Tokens'};

// The 1.6 paged length menu (1.6 fog.common.js lengthMenu).
const LENGTH_MENU = ['10', '25', '50', '100', '250', '500', 'All'];

// Opens a list and waits for its first answer and its saved layout.
async function openList(page, checkPage, path) {
  await checkPage(page, {path, table: true});
  await page.waitForFunction(() => {
    const dt = jQuery('#listtable').DataTable();
    return dt.ajax.json() !== undefined && !!dt.table().container();
  }, null, {timeout: 10000});
  // registerTable's deferred passes (resize strips, the scroll height) run
  // on a zero timeout after the first draw.
  await page.waitForTimeout(300);
  // One table: the resize handlers once built a stray second DataTable on
  // the scroll-head clone.
  expect(`${path}: the number of DataTables`, await page.evaluate(() => jQuery.fn.dataTable.tables().length), 1);
}

// The toolbar: each top-level entry's [label, has btn and btn-default].
const toolbar = (page) => page.evaluate(() => [...document.querySelectorAll('.dt-buttons > *')].map((el) => {
  const b = el.matches('button') ? el : el.querySelector('button');
  return [b.innerText.trim(), b.classList.contains('btn') && b.classList.contains('btn-default')];
}));

const rowNames = (page) => page.evaluate(() => jQuery('#listtable').DataTable().rows().data().toArray().map((r) => r.name));

// $.ajax from the page, so fog.csrf.js adds the CSRF header.
const ajax = (page, opts) => page.evaluate((o) => new Promise((resolve, reject) => {
  jQuery.ajax(Object.assign({contentType: 'application/json'}, o, {data: o.data && JSON.stringify(o.data)}))
    .done(resolve).fail((xhr) => reject(new Error(`${o.type} ${o.url} answered ${xhr.status}`)));
}), opts);

// Waits for the next POST /account/preferences that writes `match`.
const prefWrite = (page, match) => page.waitForResponse((r) => new URL(r.url()).pathname === '/account/preferences' &&
  r.request().method() === 'POST' && match((r.request().postDataJSON() || {}).key || ''), {timeout: 10000});

async function toolbars({page, checkPage, PAGES}) {
  const lists = PAGES.filter((p) => p.table).map((p) => p.path).concat(['/snapins', '/printers']);
  for (const path of lists) {
    await openList(page, checkPage, path);
    const got = await toolbar(page);
    const want = TOOLBARS[path] || [...SELECT, ...SHARED];
    expect(`${path}: the toolbar`, got, want.map((t) => [t, true]));
    const title = (await page.locator('.card-header > h4.card-title').first().innerText()).trim();
    if (TITLES[path]) expect(`${path}: the title`, title, TITLES[path]);
    else expect(`${path}: the title`, title.startsWith('All '), true);
  }
  // Tasks is not selectable (1.6 TaskManagement.php:59).
  await openList(page, checkPage, '/tasks');
  expect('/tasks: #deleteSelected count', await page.locator('#deleteSelected').count(), 0);
}

async function darkButton({page, checkPage}) {
  await openList(page, checkPage, '/hosts');
  const before = await page.evaluate(() => document.documentElement.getAttribute('data-bs-theme'));
  // .btn has a 0.12s background transition (zz-fog-ui.css), so each read
  // waits for it to end.
  const background = async (theme) => {
    await page.evaluate((t) => document.documentElement.setAttribute('data-bs-theme', t), theme);
    await page.waitForTimeout(300);
    return page.evaluate(() => getComputedStyle(document.querySelector('.dt-buttons button')).backgroundColor);
  };
  try {
    expect('the light toolbar button background', await background('light'), 'rgba(0, 0, 0, 0)');
    const dark = await background('dark');
    // The value of --fog-surface-2, the dark .btn-default background (zz-fog-ui.css:1390).
    const want = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.backgroundColor = 'var(--fog-surface-2)';
      document.body.appendChild(probe);
      const value = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return value;
    });
    expect('the dark toolbar button background', dark, want);
  } finally {
    await page.evaluate((b) => {
      if (b === null) document.documentElement.removeAttribute('data-bs-theme');
      else document.documentElement.setAttribute('data-bs-theme', b);
    }, before);
  }
}

async function rowLinks({page, checkPage}) {
  // A snapin of its own, because CI seeds none.
  const name = `ui16-06-${Date.now()}`;
  await checkPage(page, {path: '/snapins/create'});
  await page.fill('#spname', name);
  await Promise.all([page.waitForNavigation({waitUntil: 'networkidle'}), page.click('#snapin-create button[type="submit"]')]);
  const id = new URL(page.url()).pathname.split('/').pop();
  try {
    await openList(page, checkPage, `/snapins?search=${name}`);
    const link = await page.evaluate(() => {
      const a = document.querySelector('div.dt-scroll-body tbody tr td a, #listtable tbody tr td a');
      return a && [a.getAttribute('href'), a.innerText.trim()];
    });
    expect('the /snapins first column link', link, [`/snapins/edit/${id}`, name]);
  } finally {
    await ajax(page, {url: '/api/v1/snapin', type: 'DELETE', data: {id: [id]}});
  }
  // Roles have no edit route: plain text.
  await openList(page, checkPage, '/roles');
  const cell = await page.evaluate(() => {
    const td = document.querySelector('#listtable tbody tr td');
    return td && {links: td.querySelectorAll('a').length, text: td.innerText.trim()};
  });
  if (!cell || !cell.text) throw new Error('/roles shows no row');
  expect('the number of links in the /roles first column', cell.links, 0);
}

async function pagedMode({page, checkPage}) {
  await openList(page, checkPage, '/hosts');
  const setting = await ajax(page, {url: '/api/v1/setting', type: 'POST', data: {name: 'FOG_TABLE_SCROLL_MODE', value: 'paged'}});
  try {
    await openList(page, checkPage, '/hosts');
    expect('the paged length menu', await page.locator('div.dt-length select option').allInnerTexts(), LENGTH_MENU);
    expect('the number of scroll bodies in paged mode', await page.locator('div.dt-scroll-body').count(), 0);
  } finally {
    await ajax(page, {url: '/api/v1/setting', type: 'DELETE', data: {id: [setting.id]}});
  }
  await openList(page, checkPage, '/hosts');
  expect('the number of scroll bodies with no setting', await page.locator('div.dt-scroll-body').count(), 1);
  expect('the number of length menus with no setting', await page.locator('div.dt-length').count(), 0);
}

async function addHost({page, checkPage}, name) {
  await openList(page, checkPage, '/hosts');
  await page.click('.btn-actionbox #createnew');
  const modal = page.locator('#entityModal.show');
  await modal.locator('form').waitFor({state: 'visible', timeout: 10000});
  const stamp = Date.now();
  await modal.locator('#hostname').fill(name);
  await modal.locator('input[name="macs[]"]').first()
    .fill(`02:06:${(stamp % 0xffffffff).toString(16).padStart(8, '0').match(/../g).join(':')}`);
  await modal.locator('button[type="submit"]').click();
  await page.locator('#entityModal').waitFor({state: 'hidden', timeout: 10000});
  // The ?search= on the URL is the starting search: one row.
  await openList(page, checkPage, `/hosts?search=${name}`);
  expect(`the rows of /hosts?search=${name}`, await rowNames(page), [name]);
  expect('the search box', await page.locator('div.dt-search input').inputValue(), name);
}

async function scrollHeight({page, checkPage}) {
  await openList(page, checkPage, '/hosts');
  const read = () => page.evaluate(() => parseFloat(document.querySelector('div.dt-scroll-body').style.maxHeight));
  const before = await read();
  if (!(before >= 150)) throw new Error(`the scroll body max-height is ${before}px`);
  const size = page.viewportSize();
  await page.setViewportSize({width: size.width, height: size.height - 200});
  try {
    await page.waitForFunction((b) => parseFloat(document.querySelector('div.dt-scroll-body').style.maxHeight) < b,
      before, {timeout: 5000}).catch(() => {});
    const after = await read();
    if (!(after < before)) throw new Error(`the scroll body max-height stayed ${after}px after a 200px shorter window`);
    if (after < 150) throw new Error(`the scroll body max-height is ${after}px, below the 150px floor`);
  } finally {
    await page.setViewportSize(size);
  }
}

// Deletes the saved /hosts layout and search-row state (server and local
// copy), so a run starts from the default layout whatever an earlier run left.
async function resetHostsLayout(page, checkPage) {
  await openList(page, checkPage, '/hosts');
  await page.evaluate(async () => {
    const prefs = await window.fogPrefFetch();
    for (const k of Object.keys(prefs).filter((k2) => k2.startsWith('dt./hosts.'))) await window.fogPrefStore(k, '');
    Object.keys(localStorage).filter((k) => k.startsWith('dt.')).forEach((k) => localStorage.removeItem(k));
  });
}

async function columnSearch({page, checkPage}, name) {
  await resetHostsLayout(page, checkPage);
  await openList(page, checkPage, '/hosts');
  expect('"Delete selected" disabled with no selection', await page.locator('#deleteSelected').isDisabled(), true);
  const colsearch = page.locator('.dt-buttons button', {hasText: 'Column search'});
  // The button is enabled by the first answer that carries _searchtypes.
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll('.dt-buttons button')].find((x) => x.innerText.includes('Column search'));
    return b && !b.classList.contains('disabled');
  }, null, {timeout: 5000});
  const saved = prefWrite(page, (k) => k === 'dt./hosts.listtable.searchrow');
  await colsearch.click();
  await saved;
  const input = page.locator('div.dt-scroll-head tr.fog-colsearch-row div.fog-colsearch[data-column="0"] input');
  await input.waitFor({state: 'visible', timeout: 5000});
  await input.fill(name);
  await page.waitForFunction((n) => {
    const names = jQuery('#listtable').DataTable().rows().data().toArray().map((r) => r.name);
    return names.length === 1 && names[0] === n;
  }, name, {timeout: 10000});
  // A reload opens the row again, empty, with no column search running.
  await openList(page, checkPage, '/hosts');
  await page.waitForFunction(() => document.querySelector('.dt-container.fog-colsearch-on'), null, {timeout: 5000});
  const state = await page.evaluate(() => {
    const dt = jQuery('#listtable').DataTable();
    return {
      values: [...document.querySelectorAll('input.fog-colsearch-input')].map((i) => i.value).filter(Boolean),
      searches: dt.columns().indexes().toArray().map((i) => dt.column(i).search()).filter(Boolean)
    };
  });
  expect('the column-search inputs after a reload', state.values, []);
  expect('the column searches after a reload', state.searches, []);
  // Close it again; that deletes the key.
  const closed = prefWrite(page, (k) => k === 'dt./hosts.listtable.searchrow');
  await colsearch.click();
  await closed;
}

// The first header cell's width in the visible (scroll-head) header.
const firstWidth = (page) => page.evaluate(() => document.querySelector('div.dt-scroll-head thead tr:first-child th').getBoundingClientRect().width);
const macVisible = (page) => page.evaluate(() => jQuery('#listtable').DataTable().column(1).visible());

async function savedLayout({page, browser, checkPage, login, base}) {
  await resetHostsLayout(page, checkPage);
  await openList(page, checkPage, '/hosts');
  // Hide the Primary MAC column through the colvis list.
  await page.locator('.dt-buttons button', {hasText: 'Column Visibility'}).click();
  const item = page.locator('.dt-button-collection :is(a, button)', {hasText: 'Primary MAC'});
  await item.waitFor({state: 'visible', timeout: 5000});
  if (await page.locator('.dt-button-collection :is(a, button)', {hasText: 'Description'}).count()) {
    throw new Error('the colvis list offers the Description column');
  }
  await item.click();
  // Escape closes the list, with no Bootstrap error (fog.table.js).
  await page.keyboard.press('Escape');
  await page.locator('.dt-button-collection').waitFor({state: 'detached', timeout: 5000});
  expect('Primary MAC visible after colvis', await macVisible(page), false);
  // Hiding a column widens the others: measure after the hide.
  await page.waitForTimeout(300);
  const defaultWidth = await firstWidth(page);
  // Drag the first resize strip 40px to the right.
  const strip = page.locator('div.dt-scroll-head .fog-col-resizer').first();
  const box = await strip.boundingBox();
  if (!box) throw new Error('the /hosts header has no .fog-col-resizer');
  const saved = prefWrite(page, (k) => k === 'dt./hosts.listtable');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2);
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2);
  await page.mouse.up();
  await saved;

  await openList(page, checkPage, '/hosts');
  expect('Primary MAC visible after a reload', await macVisible(page), false);
  const width = await firstWidth(page);
  if (Math.abs(width - defaultWidth) < 20) throw new Error(`the first column is ${width}px after a reload, the default is ${defaultWidth}px`);

  const res = await page.request.get(`${base}/account/preferences`, {headers: AJAX});
  const prefs = await res.json();
  const layout = prefs['dt./hosts.listtable'];
  if (!layout || !layout.fogColWidths) throw new Error('GET /account/preferences holds no dt./hosts.listtable with fogColWidths');
  if ('search' in layout || 'select' in layout || (layout.columns || []).some((c) => 'search' in c)) {
    throw new Error('the saved layout holds a search or a selection');
  }

  // The same user in a second browser context gets the layout from the server.
  const context = await browser.newContext();
  try {
    const other = await context.newPage();
    await login(other);
    await openList(other, checkPage, '/hosts');
    expect('Primary MAC visible in a second context', await macVisible(other), false);
  } finally {
    await context.close();
  }

  // The local copy is keyed by the user id.
  const keys = await page.evaluate(() => {
    const user = document.body.getAttribute('data-user-id');
    return {user, keys: Object.keys(localStorage).filter((k) => k.startsWith('dt.'))};
  });
  if (!keys.user || !keys.keys.length) throw new Error('localStorage holds no dt. key');
  const stray = keys.keys.filter((k) => !k.startsWith(`dt.${keys.user}.`));
  expect('the localStorage dt. keys without the user id', stray, []);

  // Reset the layout.
  await resetHostsLayout(page, checkPage);
}

// After a reorder and a reload, the sort stays on its named column, and the
// description stays the only hidden column. Moving Host (index 0) to the end
// shifts Description (index 6) to position 5: an index-based hide would then
// hide Host instead.
async function reorderedLayout({page, checkPage}) {
  await resetHostsLayout(page, checkPage);
  await openList(page, checkPage, '/hosts');
  // The sort writes first; wait for the write that holds the reorder.
  const saved = page.waitForResponse((r) => {
    if (new URL(r.url()).pathname !== '/account/preferences' || r.request().method() !== 'POST') return false;
    const body = r.request().postDataJSON() || {};
    return body.key === 'dt./hosts.listtable' && body.value && Array.isArray(body.value.colReorder) && body.value.colReorder[6] === 0;
  }, {timeout: 10000});
  await page.evaluate(() => {
    const dt = jQuery('#listtable').DataTable();
    dt.order([[3, 'desc']]).draw(false);
    dt.colReorder.move(0, 6);
    dt.state.save();
  });
  await saved;
  await openList(page, checkPage, '/hosts');
  const got = await page.evaluate(() => {
    const dt = jQuery('#listtable').DataTable();
    return {
      order: dt.order().map((o) => [dt.column(o[0]).dataSrc(), o[1]]),
      hidden: dt.columns().indexes().toArray().filter((i) => !dt.column(i).visible()).map((i) => dt.column(i).dataSrc()),
      header: [...document.querySelectorAll('div.dt-scroll-head thead tr:first-child th')].map((t) => t.innerText.trim())
    };
  });
  expect('the sort after a reorder and a reload', got.order, [['deployed', 'desc']]);
  expect('the hidden columns after a reorder and a reload', got.hidden, ['description']);
  expect('the last header after a reorder and a reload', got.header[got.header.length - 1], 'Host');
  await resetHostsLayout(page, checkPage);
}

async function deleteSelected({page, checkPage}, name) {
  await openList(page, checkPage, `/hosts?search=${name}`);
  expect('the rows before Delete selected', await rowNames(page), [name]);
  // A cell without the edit link, so the click selects the row.
  await page.locator('#listtable tbody tr').first().locator('td').nth(2).click();
  await page.waitForFunction(() => !document.querySelector('#deleteSelected').disabled, null, {timeout: 5000});
  await page.click('#deleteSelected');
  const dialog = page.locator('.modal.show', {hasText: 'Confirm delete'});
  await dialog.waitFor({state: 'visible', timeout: 5000});
  expect('the delete dialog title', (await dialog.locator('.modal-title').innerText()).trim(), 'Confirm delete');
  expect('the delete dialog confirm', (await dialog.locator('[data-fog-confirm]').innerText()).trim(), 'Delete 1 Host');
  await dialog.locator('[data-fog-confirm]').click();
  await page.waitForFunction(() => jQuery('#listtable').DataTable().rows().count() === 0, null, {timeout: 10000});
  await page.locator('#fog-toast-container .toast-body', {hasText: 'Successfully deleted'}).first().waitFor({state: 'visible', timeout: 5000});
  // One toast, shown in place: the next page load shows none (issue #151).
  expect('the toasts after Delete selected', await page.locator('#fog-toast-container .toast').count(), 1);
  await openList(page, checkPage, `/hosts?search=${name}`);
  expect('the rows after Delete selected', await rowNames(page), []);
  expect('the toasts on the next page load', await page.locator('#fog-toast-container .toast').count(), 0);
}

module.exports = {
  name: 'ui16-06: FOG 1.6 list tables',
  run: async (ctx) => {
    const host = `ui16-06-${Date.now()}`;
    await toolbars(ctx);
    await darkButton(ctx);
    await rowLinks(ctx);
    await pagedMode(ctx);
    await addHost(ctx, host);
    await scrollHeight(ctx);
    await columnSearch(ctx, host);
    await savedLayout(ctx);
    await reorderedLayout(ctx);
    await deleteSelected(ctx, host);
  }
};
