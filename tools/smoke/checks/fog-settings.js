/**
 * fog-settings: the FOG 1.6 FOG Settings page (GET /about/settings, issue
 * #199).
 *
 * It proves, in the browser: the sidebar's FOG Configuration leaf is active;
 * the category nav; the live search (a key match, no match, the reload
 * words, the clear button, a category click that clears it) and the
 * ?search= prefill; a change of FOG_TABLE_SCROLL_MODE to "Paged" saves with
 * the success and "Reload required" toasts, and /hosts then shows the paged
 * bar; a refused save (400, answered by page.route()) puts the select back
 * and toasts the error; and at 600px a panel title collapses its panel.
 * tools/smoke/ui.js runs this file (see the comment at its top).
 *
 * It runs before ui16-06-tables.js (file-name order), which POSTs its own
 * FOG_TABLE_SCROLL_MODE record, and Setting.name is unique. So it records
 * that record first, and in a `finally` puts its value back, or deletes it
 * when there was none.
 */

const expect = (what, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what} is ${a}, expected ${e}`);
};

// Same-origin AJAX passes api/policies/apiCsrfGuard.js on /api/v1 mutations.
const AJAX = {'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json'};
const KEY = 'FOG_TABLE_SCROLL_MODE';
const SAVE = '/api/v1/setting/save';
const TOAST = '#fog-toast-container .toast.fog-toast';
const RELOAD_TEXT = 'This setting takes effect after you reload the page.';

// The FOG_TABLE_SCROLL_MODE record, or null. GET /api/v1/setting lists every
// record (general/list), so the name is matched here.
async function scrollRecord(page, base) {
  const res = await page.request.get(`${base}/api/v1/setting`, {headers: AJAX});
  if (res.status() !== 200) throw new Error(`GET /api/v1/setting answered ${res.status()}`);
  return (await res.json()).find((row) => row.name === KEY) || null;
}

// Puts the record back as `was` found it: the old value, or no record.
async function restore(page, base, was) {
  const now = await scrollRecord(page, base);
  let res;
  if (was && now) {
    res = await page.request.put(`${base}/api/v1/setting/${now.id}`, {headers: AJAX, data: {value: was.value}});
  } else if (was) {
    res = await page.request.post(`${base}/api/v1/setting`, {headers: AJAX, data: {name: KEY, value: was.value}});
  } else if (now) {
    res = await page.request.delete(`${base}/api/v1/setting`, {headers: AJAX, data: {id: [now.id]}});
  }
  if (res && res.status() >= 400) throw new Error(`restoring ${KEY} answered ${res.status()}`);
}

// The keys of the rows on screen.
const visibleRows = (page) => page.$$eval('.settings-row', (rows) => rows.filter((r) => r.offsetParent !== null).map((r) => r.getAttribute('data-key')));
const toastTitle = async (page, text) => {
  const toast = page.locator(TOAST, {hasText: text});
  await toast.waitFor({state: 'visible', timeout: 5000});
  return (await toast.locator('.toast-header strong').innerText()).trim();
};

async function navAndSearch({page, checkPage}) {
  await checkPage(page, {path: '/about/settings'});
  const active = await page.$$eval('.app-sidebar a.nav-link.active', (links) => links.map((a) => a.textContent.replace(/\s+/g, ' ').trim()));
  expect('the active sidebar links', active, ['FOG Configuration']);
  const nav = await page.$$eval('#settings-nav li', (items) => items.map((li) => [li.textContent.replace(/\s+/g, ' ').trim(), li.classList.contains('active')]));
  expect('the category nav', nav, [['FOG View Settings 2', true]]);
  expect('the rows on load', await visibleRows(page), ['FOG_TABLE_SCROLL_MODE', 'FOG_VIEW_DEFAULT_SCREEN']);

  await page.fill('#settings-search', 'scroll');
  expect('the rows for "scroll"', await visibleRows(page), ['FOG_TABLE_SCROLL_MODE']);
  expect('the active nav items while searching', await page.locator('#settings-nav li.active').count(), 0);
  await page.fill('#settings-search', 'zzz');
  expect('the rows for "zzz"', await visibleRows(page), []);
  expect('the no-match line', (await page.locator('.settings-noresults').innerText()).trim(), 'No settings match your search.');
  await page.fill('#settings-search', 'reload');
  expect('the rows for "reload"', await visibleRows(page), ['FOG_TABLE_SCROLL_MODE', 'FOG_VIEW_DEFAULT_SCREEN']);
  await page.click('#settings-search-clear');
  expect('the search box after Clear', await page.inputValue('#settings-search'), '');
  expect('the active nav items after Clear', await page.locator('#settings-nav li.active').count(), 1);

  // A click on a category clears the search and shows that panel.
  await page.fill('#settings-search', 'zzz');
  await page.click('#settings-nav a');
  expect('the search box after a category click', await page.inputValue('#settings-search'), '');
  expect('the rows after a category click', await visibleRows(page), ['FOG_TABLE_SCROLL_MODE', 'FOG_VIEW_DEFAULT_SCREEN']);
  expect('the no-match line after a category click', await page.locator('.settings-noresults').isVisible(), false);

  await checkPage(page, {path: '/about/settings?search=scroll'});
  expect('the search box from ?search=', await page.inputValue('#settings-search'), 'scroll');
  expect('the rows from ?search=scroll', await visibleRows(page), ['FOG_TABLE_SCROLL_MODE']);
}

// "Paged" saves, toasts twice, and /hosts then pages.
async function saveOnChange({page, checkPage}) {
  await checkPage(page, {path: '/about/settings'});
  const answer = page.waitForResponse((r) => new URL(r.url()).pathname === SAVE && r.request().method() === 'POST', {timeout: 10000});
  await page.selectOption(`#${KEY}`, 'paged');
  const res = await answer;
  expect('the save status', res.status(), 202);
  expect('the save body', res.request().postDataJSON(), {key: KEY, value: 'paged'});
  const headers = res.request().headers();
  expect('the X-Requested-With header of the save', headers['x-requested-with'], 'XMLHttpRequest');
  if (!headers['x-csrf-token']) throw new Error('the save sent no X-CSRF-Token header');
  expect('the success toast title', await toastTitle(page, 'Settings successfully stored!'), 'Settings Update Success');
  expect('the reload toast title', await toastTitle(page, RELOAD_TEXT), 'Reload required');

  await checkPage(page, {path: '/hosts', table: true});
  await page.locator('div.dt-length select').waitFor({state: 'visible', timeout: 10000});
}

// A refused save puts the select back; at 600px a panel title collapses its
// panel. A context of its own: the refused save is a 400 and a console
// error, and either fails a check on ctx.page.
async function refusedAndNarrow({browser, base, login}) {
  const context = await browser.newContext();
  const errors = [];
  try {
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await login(page);
    await page.goto(`${base}/about/settings`, {waitUntil: 'networkidle'});
    await page.route(`**${SAVE}`, (route) => route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({error: 'fog-settings smoke refusal', title: 'Settings Update Fail'})
    }));
    expect('the stored value before the refused save', await page.inputValue(`#${KEY}`), 'paged');
    await page.selectOption(`#${KEY}`, 'infinite');
    expect('the error toast title', await toastTitle(page, 'fog-settings smoke refusal'), 'Settings Update Fail');
    expect('the select after the refused save', await page.inputValue(`#${KEY}`), 'paged');
    await page.unroute(`**${SAVE}`);

    await page.setViewportSize({width: 600, height: 900});
    const body = page.locator('.settings-panel').first().locator('.settings-panel-body');
    const title = page.locator('.settings-panel-title').first();
    expect('the first panel body at 600px', await body.isVisible(), true);
    await title.click();
    expect('the first panel body after a title click', await body.isVisible(), false);
    await title.click();
    expect('the first panel body after a second title click', await body.isVisible(), true);
    if (errors.length) throw new Error(`the page threw: ${errors[0]}`);
  } finally {
    await context.close();
  }
}

module.exports = {
  name: 'fog-settings: FOG 1.6 FOG Settings page',
  run: async (ctx) => {
    const was = await scrollRecord(ctx.page, ctx.base);
    try {
      await navAndSearch(ctx);
      await saveOnChange(ctx);
      await refusedAndNarrow(ctx);
    } finally {
      await restore(ctx.page, ctx.base, was);
    }
  }
};
