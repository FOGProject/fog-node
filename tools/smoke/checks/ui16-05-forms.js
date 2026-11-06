/**
 * ui16-05: the FOG 1.6 create and edit page layout (issue #149).
 *
 * It creates a storage group of its own through the create page (no Cancel
 * in the footer), proves the save toast and the absence of a page alert,
 * reads the sticky info card, then deletes the group from its edit page: a
 * cancelled Delete keeps it, a confirmed Delete lands on the list with one
 * "Successfully deleted" toast that a reload does not repeat. Last, the
 * create modal on /images, /snapins and /printers shows the 1.6 title, and
 * its Cancel creates nothing. tools/smoke/ui.js runs this file (see the
 * comment at its top). The records of ctx.created stay untouched.
 */

const expect = (what, actual, expected) => {
  if (actual !== expected) throw new Error(`${what} is ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
};

// Records every fogToast call of each page load in window.__fogToasts. The
// init script runs before the page's own scripts, so the toasts shown on
// load (the save result, the queue) are recorded too.
async function recordToasts(page) {
  await page.addInitScript(() => {
    window.__fogToasts = [];
    let real;
    Object.defineProperty(window, 'fogToast', {
      configurable: true,
      get: () => real && function(type, text, title) {
        window.__fogToasts.push({type, text, title});
        return real.apply(this, arguments);
      },
      set: (fn) => { real = fn; }
    });
  });
}
const toasts = (page) => page.evaluate(() => window.__fogToasts || []);

// The DataTables row names of the list on screen, after a fresh load.
const listNames = async (page, checkPage, list) => {
  await checkPage(page, {path: list, table: true});
  // checkPage waits for DataTables to start; the rows arrive with its first AJAX answer.
  await page.waitForFunction(() => jQuery.fn.dataTable.tables({api: true}).ajax.json() !== undefined, null, {timeout: 10000});
  return page.evaluate(() => jQuery.fn.dataTable.tables({api: true}).rows().data().toArray().map((r) => r.name));
};

const AJAX = {'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json'};
const countOf = async (page, base, model) => {
  const res = await page.request.get(`${base}/api/v1/${model}`, {headers: AJAX});
  if (!res.ok()) throw new Error(`GET /api/v1/${model} answered ${res.status()}`);
  return (await res.json()).length;
};

async function createAndDelete({page, checkPage}) {
  const name = `ui16-05-${Date.now()}`;

  // The create page: section cards, and Create with no Cancel.
  await checkPage(page, {path: '/storagegroups/create'});
  const footer = await page.locator('#storagegroup-create > .card-footer button').allInnerTexts();
  expect('the create page footer buttons', JSON.stringify(footer.map((t) => t.trim())), '["Create"]');
  if (!(await page.locator('#storagegroup-create .card.card-primary.card-outline h4.card-title', {hasText: 'Create New Storage Group'}).count())) {
    throw new Error('the create page has no "Create New Storage Group" section card');
  }
  await page.fill('#sgname', name);
  await Promise.all([page.waitForNavigation({waitUntil: 'networkidle'}), page.click('#storagegroup-create button[type="submit"]')]);

  // The save result is a toast, not a page alert, and the URL loses ?saved.
  const saved = await toasts(page);
  expect('the toasts after the save', JSON.stringify(saved.map((t) => [t.type, t.text])), '[["success","Storage Group updated!"]]');
  expect('the number of .alert after the save', await page.locator('.alert').count(), 0);
  const url = new URL(page.url());
  if (!/^\/storagegroups\/edit\/[^/]+$/.test(url.pathname)) throw new Error(`the save landed on ${url.pathname}`);
  expect('the query after the save', url.search, '');

  // The info card: the entity type, then the name.
  const fact = await page.evaluate(() => {
    const col = document.querySelector('#edit-info-card .col');
    return col && {label: col.children[0].innerText.trim(), value: col.children[1].innerText.trim()};
  });
  if (!fact) throw new Error('the edit page has no #edit-info-card fact');
  expect('the first info card label', fact.label, 'STORAGE GROUP');
  expect('the first info card value', fact.value, name);
  const editPath = url.pathname;

  // Delete, then Cancel: the record stays.
  await page.click('#tab-general [data-fog-delete]');
  const dialog = page.locator('.modal.show', {hasText: `Delete: ${name}`});
  await dialog.waitFor({state: 'visible', timeout: 5000});
  if (!(await dialog.locator('.modal-body', {hasText: 'Confirm you would like to delete this storagegroup'}).count())) {
    throw new Error('the Delete dialog does not show the 1.6 text');
  }
  await dialog.locator('[data-bs-dismiss="modal"].btn-secondary').click();
  await dialog.waitFor({state: 'detached', timeout: 5000});
  if (!(await listNames(page, checkPage, '/storagegroups')).includes(name)) throw new Error('a cancelled Delete removed the record');

  // Delete, then confirm: the list, one toast, an empty queue.
  await checkPage(page, {path: editPath});
  await page.click('#tab-general [data-fog-delete]');
  await page.locator('.modal.show [data-fog-confirm]').waitFor({state: 'visible', timeout: 5000});
  await Promise.all([page.waitForNavigation({waitUntil: 'networkidle'}), page.click('.modal.show [data-fog-confirm]')]);
  const listUrl = new URL(page.url());
  expect('the page after Delete', listUrl.pathname, '/storagegroups');
  if (listUrl.searchParams.has('deleted')) throw new Error('the list URL carries a deleted parameter');
  const deleted = await toasts(page);
  expect('the toasts after Delete', JSON.stringify(deleted.map((t) => [t.type, t.text])), '[["success","Successfully deleted"]]');
  await page.locator('.pnotify-text', {hasText: 'Successfully deleted'}).first().waitFor({state: 'visible', timeout: 5000});
  expect('sessionStorage.fogToastQueue', await page.evaluate(() => sessionStorage.getItem('fogToastQueue')), null);
  if ((await listNames(page, checkPage, '/storagegroups')).includes(name)) throw new Error('the deleted record is still listed');

  // A reload shows no toast.
  await page.reload({waitUntil: 'networkidle'});
  expect('the toasts after a reload', (await toasts(page)).length, 0);
}

// Add on a list opens the create form in the modal, with the 1.6 title, and
// its Cancel closes the modal with no record created.
async function createModal({page, base, checkPage}, list, model, title) {
  const before = await countOf(page, base, model);
  await checkPage(page, {path: list, table: true});
  await page.locator('.dt-buttons button', {hasText: 'Create New'}).click();
  const modal = page.locator('#entityModal.show');
  await modal.locator('form').waitFor({state: 'visible', timeout: 10000});
  expect(`${list}: the create modal title`, (await modal.locator('.modal-title').innerText()).trim(), title);
  await modal.locator('[data-fog-cancel]').click();
  await page.locator('#entityModal').waitFor({state: 'hidden', timeout: 5000});
  expect(`${list}: the number of records after Cancel`, await countOf(page, base, model), before);
}

module.exports = {
  name: 'ui16-05: FOG 1.6 create and edit page layout',
  run: async (ctx) => {
    await recordToasts(ctx.page);
    await createAndDelete(ctx);
    await createModal(ctx, '/images', 'image', 'Create New Image');
    await createModal(ctx, '/snapins', 'snapin', 'Create New Snapin');
    await createModal(ctx, '/printers', 'printer', 'Create New Printer');
  }
};
