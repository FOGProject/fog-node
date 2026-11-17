/**
 * The Audit Log page (issue #200).
 *
 * It proves, in a browser, that GET /audit lists the trail; that a click on a
 * row opens the "Audit entry" modal; that a server value shows as text, not as
 * markup, in the grid and in the modal; that the paged length menu has no
 * "All"; and that the infinite table, with FOG_VIEW_DEFAULT_SCREEN at -1, asks
 * for a length of 1 to 499 rows (Scroller sets the length from the viewport,
 * so it is not 50, and it is never the 500 of the paged mode). A row whose
 * `text` holds markup shows as text in the modal Detail block.
 * tools/smoke/ui.js runs this file (see the comment at its top). It sets two
 * Setting records and puts them back.
 */
const http = require('http');

const expect = (what, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what} is ${a}, expected ${e}`);
};

// The length menu of the 1.6 paged table, without "All" (the server reads at most 500 rows).
const LENGTH_MENU = ['10', '25', '50', '100', '250', '500'];
// A user name that is markup: the failed sign-in stores it as the row's Who.
const MARKUP = '<b>audit-smoke-x</b>';

// $.ajax from the page, so fog.csrf.js adds the CSRF header.
const ajax = (page, opts) => page.evaluate((o) => new Promise((resolve, reject) => {
  jQuery.ajax(Object.assign({contentType: 'application/json'}, o, {data: o.data && JSON.stringify(o.data)}))
    .done(resolve).fail((xhr) => reject(new Error(`${o.type} ${o.url} answered ${xhr.status}`)));
}), opts);

// Opens /audit and waits for DataTables and for its first row.
async function openAudit(page, checkPage) {
  await checkPage(page, {path: '/audit', table: true});
  await page.locator('#listtable tbody tr:not(.dt-empty) td').first().waitFor({timeout: 10000});
}

// Sets a Setting record, and returns what puts it back: the old value, or a delete.
async function setSetting(page, name, value) {
  const all = await ajax(page, {url: '/api/v1/setting', type: 'GET'});
  const old = (Array.isArray(all) ? all : []).find((s) => s.name === name);
  if (old) {
    await ajax(page, {url: `/api/v1/setting/${old.id}`, type: 'PUT', data: {value}});
    return () => ajax(page, {url: `/api/v1/setting/${old.id}`, type: 'PUT', data: {value: old.value}});
  }
  const made = await ajax(page, {url: '/api/v1/setting', type: 'POST', data: {name, value}});
  return () => ajax(page, {url: '/api/v1/setting', type: 'DELETE', data: {id: [made.id]}});
}

async function rowAndModal({page, browser, checkPage, base}) {
  await openAudit(page, checkPage);
  await page.locator('#listtable tbody tr:not(.dt-empty)').first().locator('td').first().click();
  const modal = page.locator('.modal.show');
  await modal.locator('.modal-title').waitFor({timeout: 10000});
  expect('the modal title', (await modal.locator('.modal-title').innerText()).trim(), 'Audit entry');
  expect('the modal labels', await modal.locator('dt').allInnerTexts(), [
    'When', 'Who', 'From', 'Authenticated by', 'Action', 'Outcome', 'Subject', 'Permission', 'Affected', 'Operation'
  ]);
  expect('the modal buttons', await modal.locator('.modal-footer button').allInnerTexts(), ['Close']);
  await modal.locator('.modal-footer button').click();
  await page.locator('.modal.show').waitFor({state: 'detached', timeout: 10000});

  // A user name with markup is text in the grid and in the modal. A signed-out
  // context sends the sign-in, because the signed-in page answers it with 200,
  // and the 401 on ctx.page would fail the check.
  const anonymous = await browser.newContext();
  try {
    const res = await anonymous.request.post(`${base}/api/v1/auth/login`, {data: {username: MARKUP, password: 'wrong'}});
    expect('the status of the failed sign-in', res.status(), 401);
  } finally {
    await anonymous.close();
  }
  await page.goto(`${base}/audit?search=${encodeURIComponent('audit-smoke-x')}`, {waitUntil: 'networkidle'});
  const cell = page.locator('#listtable tbody tr:not(.dt-empty) td', {hasText: MARKUP}).first();
  await cell.waitFor({timeout: 10000});
  expect('the number of <b> in the grid', await page.locator('#listtable tbody b').count(), 0);
  await cell.click();
  const entry = page.locator('.modal.show');
  await entry.locator('.modal-title').waitFor({timeout: 10000});
  expect('the Who value', (await entry.locator('dd').nth(1).innerText()).trim(), MARKUP);
  expect('the number of <b> in the modal', await entry.locator('b').count(), 0);
  await entry.locator('.modal-footer button').click();
  await page.locator('.modal.show').waitFor({state: 'detached', timeout: 10000});
}

// A row whose `text` holds markup. No form writes `text` from the browser, but
// the seam stores `<method> <path>` as the text of a denied request. A raw
// request sends the path with its `<` and `>` unencoded (a browser would encode
// them). The signed-in admin asks for a model that no one can read: a 403 and a
// row whose text is `GET /api/v1/<b>audit-smoke-t</b>`.
async function markupText({page, base}) {
  const url = new URL(base);
  const cookies = (await page.context().cookies(base)).map((c) => `${c.name}=${c.value}`).join('; ');
  const status = await new Promise((resolve, reject) => {
    const req = http.request({
      host: url.hostname, port: url.port, method: 'GET', path: '/api/v1/<b>audit-smoke-t</b>',
      headers: {Cookie: cookies, Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest'}
    }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject);
    req.end();
  });
  expect('the status of the raw request', status, 403);
  await page.goto(`${base}/audit?search=audit-smoke-t`, {waitUntil: 'networkidle'});
  const row = page.locator('#listtable tbody tr:not(.dt-empty)').first();
  await row.waitFor({timeout: 10000});
  expect('the number of <b> in the grid', await page.locator('#listtable tbody b').count(), 0);
  await row.locator('td').first().click();
  const entry = page.locator('.modal.show');
  await entry.locator('.modal-title').waitFor({timeout: 10000});
  expect('the Detail text', (await entry.locator('pre').innerText()).trim(), 'GET /api/v1/<b>audit-smoke-t</b>');
  expect('the number of <b> in the Detail block', await entry.locator('pre b').count(), 0);
  await entry.locator('.modal-footer button').click();
  await page.locator('.modal.show').waitFor({state: 'detached', timeout: 10000});
}

async function pagedMode({page, checkPage}) {
  await openAudit(page, checkPage);
  const restore = await setSetting(page, 'FOG_TABLE_SCROLL_MODE', 'paged');
  try {
    await openAudit(page, checkPage);
    expect('the paged length menu', await page.locator('div.dt-length select option').allInnerTexts(), LENGTH_MENU);
  } finally {
    await restore();
  }
}

async function infiniteMode({page, checkPage}) {
  await openAudit(page, checkPage);
  const restoreMode = await setSetting(page, 'FOG_TABLE_SCROLL_MODE', 'infinite');
  let restoreLength;
  try {
    restoreLength = await setSetting(page, 'FOG_VIEW_DEFAULT_SCREEN', -1);
    const asked = page.waitForRequest((r) => new URL(r.url()).pathname === '/api/v1/audit/datatable' && r.method() === 'POST', {timeout: 10000});
    await checkPage(page, {path: '/audit', table: true});
    const request = await asked;
    // Scroller sets the page length to the viewport rows times its
    // displayBuffer of 9 (dataTables.scroller.js:97), so the number depends on
    // the window. The check asserts what matters: the table asks for a chunk,
    // never for the 500 of the paged-mode default.
    const length = Number(new URLSearchParams(request.postData()).get('length'));
    if (!(length >= 1 && length < 500)) throw new Error(`the length of the datatable request is ${length}, expected 1 to 499`);
  } finally {
    if (restoreLength) await restoreLength();
    await restoreMode();
  }
}

module.exports = {
  name: 'audit-log: the Audit Log page',
  run: async (ctx) => {
    await rowAndModal(ctx);
    await markupText(ctx);
    await pagedMode(ctx);
    await infiniteMode(ctx);
  }
};
