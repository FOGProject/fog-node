/**
 * ui16-11b: group grants for printers and snapins, as FOG 1.6 (issue #170).
 *
 * It proves the group edit page's four tabs in the 1.6 order, the Printer
 * Associations tab with its 1.6 help text, a printer granted and picked as
 * the Group Default Printer, a snapin granted on the Snapin Associations
 * tab, that both stay after a reload, and the Grants badges on /groups,
 * snapins first. tools/smoke/ui.js runs this file (see the comment at its
 * top). It creates and deletes its own group, printer and snapin.
 */

const expect = (what, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what} is ${a}, expected ${e}`);
};

const TOAST = '#fog-toast-container .toast-body';
const PRINTER_HELP = 'A printer granted here reaches every host in this group, including hosts added later. ' +
  'Removing a host from the group takes the printer away again. A printer the host was given directly is ' +
  'unaffected either way.';

// $.ajax from the page, so fog.csrf.js adds the CSRF header.
const ajax = (page, opts) => page.evaluate((o) => new Promise((resolve, reject) => {
  jQuery.ajax(Object.assign({contentType: 'application/json'}, o, {data: o.data && JSON.stringify(o.data)}))
    .done(resolve).fail((xhr) => reject(new Error(`${o.type} ${o.url} answered ${xhr.status}`)));
}), opts);

// The tab's Update: a full-page form POST, then the edit page with the toast.
async function update({page}, pane) {
  await Promise.all([page.waitForNavigation({waitUntil: 'networkidle'}), pane.locator('button[type="submit"]').click()]);
  await page.locator(TOAST, {hasText: 'Group updated!'}).waitFor({state: 'visible', timeout: 5000});
}

// The four tabs in the 1.6 order, then the printer and its default.
async function printerTab(ctx, ids, printerName) {
  const {page, checkPage} = ctx;
  await checkPage(page, {path: `/groups/edit/${ids.group}`});
  expect('the tabs', (await page.locator('ul.nav-tabs[role="tablist"] a.nav-link').allInnerTexts()).map((t) => t.trim()),
    ['General', 'Host Associations', 'Printer Associations', 'Snapin Associations']);
  await page.getByRole('tab', {name: 'Printer Associations'}).click();
  const pane = page.locator('#tab-printer-associations');
  const help = (await pane.locator('small.form-text').allInnerTexts()).map((t) => t.trim());
  if (!help.includes(PRINTER_HELP)) throw new Error(`the Printer Associations tab has no 1.6 help text: ${JSON.stringify(help)}`);
  await pane.locator(`input[name="groupPrinters[]"][value="${ids.printer}"]`).check();
  // The default printer select is a select2 control (fog.select2.js).
  await pane.locator('.select2-selection--single').click();
  await page.locator('.select2-container--open .select2-search__field').fill(printerName);
  await page.locator('.select2-results__option', {hasText: printerName}).first().waitFor({state: 'visible', timeout: 5000});
  await page.locator('.select2-container--open .select2-search__field').press('Enter');
  expect('the picked default printer', await page.evaluate(() => jQuery('#groupdefaultprinter').val()), ids.printer);
  await update(ctx, pane);
}

async function snapinTab(ctx, ids) {
  const {page} = ctx;
  await page.getByRole('tab', {name: 'Snapin Associations'}).click();
  const pane = page.locator('#tab-snapin-associations');
  await pane.locator(`input[name="groupSnapins[]"][value="${ids.snapin}"]`).check();
  await update(ctx, pane);
}

// After a reload: both granted, and the default printer still selected.
async function reloaded({page, checkPage}, ids) {
  await checkPage(page, {path: `/groups/edit/${ids.group}`});
  expect('the printer box after a reload',
    await page.locator(`#tab-printer-associations input[name="groupPrinters[]"][value="${ids.printer}"]`).isChecked(), true);
  expect('the default printer after a reload', await page.evaluate(() => jQuery('#groupdefaultprinter').val()), ids.printer);
  expect('the snapin box after a reload',
    await page.locator(`#tab-snapin-associations input[name="groupSnapins[]"][value="${ids.snapin}"]`).isChecked(), true);
}

// /groups: the Grants cell shows the badges, snapins before printers.
async function listBadges({page, checkPage}, name) {
  await checkPage(page, {path: `/groups?search=${name}`, table: true});
  await page.waitForFunction((n) => {
    const json = jQuery('#listtable').DataTable().ajax.json();
    return json && json.data.some((r) => r.name === n);
  }, name, {timeout: 10000});
  const badges = await page.evaluate((n) => {
    const tr = [...document.querySelectorAll('#listtable tbody tr')].find((row) => row.cells[0].innerText.trim() === n);
    return tr ? [...tr.cells[2].querySelectorAll('.badge')].map((b) => b.innerText.trim()) : null;
  }, name);
  expect('the Grants badges of the group', badges, ['1 snapin', '1 printer']);
}

// Deletes the group, printer and snapin of this run, found by name: a step
// can fail after its record exists. Each delete runs even when another
// fails. It returns what it could not delete.
async function cleanup({page, checkPage}, names) {
  const left = [];
  try {
    // $.ajax needs a loaded page, and the page may be anywhere.
    await checkPage(page, {path: '/'});
  } catch (e) {
    return [`no page to clean up from: ${e.message}`];
  }
  for (const model of ['group', 'printer', 'snapin']) {
    try {
      const ids = (await ajax(page, {url: `/api/v1/${model}`, type: 'GET'})).filter((r) => r.name === names[model]).map((r) => r.id);
      if (ids.length) await ajax(page, {url: `/api/v1/${model}`, type: 'DELETE', data: {id: ids}});
    } catch (e) {
      left.push(`${model}: ${e.message}`);
    }
  }
  return left;
}

module.exports = {
  name: 'ui16-11b: FOG 1.6 group grants',
  run: async (ctx) => {
    const {page, checkPage} = ctx;
    const stamp = Date.now();
    const names = {group: `ui16-11b-${stamp}`, printer: `ui16-11b-${stamp}-p`, snapin: `ui16-11b-${stamp}-s`};
    let failure;
    try {
      await checkPage(page, {path: '/'});
      const ids = {};
      for (const model of ['group', 'printer', 'snapin']) {
        ids[model] = (await ajax(page, {url: `/api/v1/${model}`, type: 'POST', data: {name: names[model]}})).id;
      }
      await printerTab(ctx, ids, names.printer);
      await snapinTab(ctx, ids);
      await reloaded(ctx, ids);
      await listBadges(ctx, names.group);
    } catch (e) {
      failure = e;
    }
    const left = await cleanup(ctx, names);
    if (failure) throw failure;
    if (left.length) throw new Error(`the cleanup failed: ${left.join('; ')}`);
  }
};
