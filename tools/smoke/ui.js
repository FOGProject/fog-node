/**
 * UI smoke test.
 *
 * It lifts fog-node with the development asset build (grunt on), logs in
 * through the login page, and drives a real browser (Playwright Chromium)
 * through the main pages. A page fails when it throws a JavaScript error, logs
 * a console error, gets an HTTP error for any request, or does not render.
 *
 * Why: `npm test` lifts Sails with grunt off and never loads a page in a
 * browser. Dependabot PR #110 broke every page ("Scroller requires DataTables
 * 3.1 or greater") and still passed all the unit tests. This script fails on
 * that class of break.
 *
 * Usage: npm run test:ui          (development build)
 *        npm run test:ui:prod     (production build, as `npm start` runs it)
 *   It needs MongoDB, Redis, and the config that `npm run setup:dev` writes.
 *   It needs the browser once: npx playwright install chromium
 *
 * It lifts on port 1339, so it runs beside a dev server (1337) and the mocha
 * suite (1338). It writes a screenshot of each failed check to ui-smoke-out/.
 *
 * Environment:
 *   FOG_UI_PASSWORD  the Administrator password (default: fogadmin1, the
 *                    `npm run setup:dev` default)
 */
const fs = require('fs');
const path = require('path');
const {chromium} = require('playwright');
const server = require('./lib/server');

const root = server.root;
const port = 1339;
const base = `http://127.0.0.1:${port}`;
const password = process.env.FOG_UI_PASSWORD || 'fogadmin1';
// --prod lifts with the production asset build: concatenated and minified
// bundles (issue #115 broke that build, and nothing noticed).
const prod = process.argv.includes('--prod');
const outDir = path.join(root, 'ui-smoke-out');

// Every page in config/routes.js that renders the layout, except the edit
// pages, which need a record id (checkRoundTrip opens them). The sidebar also
// links pages that have no route yet, for example /hosts/pending; they 404
// today, so they are not here. The list pages load their rows over AJAX into
// DataTables, so `table: true` also waits for DataTables to initialize.
const PAGES = [
  {path: '/'},
  {path: '/search?q=ui-smoke'},
  {path: '/account'},
  {path: '/hwinfo'},
  {path: '/hosts', table: true},
  {path: '/images', table: true},
  {path: '/storagegroups', table: true},
  {path: '/storagenodes', table: true},
  {path: '/pxemenus', table: true},
  {path: '/roles', table: true},
  {path: '/tasks', table: true},
  {path: '/users', table: true},
  {path: '/workflows', table: true},
  {path: '/hosts/create'},
  {path: '/images/create'},
  {path: '/storagegroups/create'},
  {path: '/storagenodes/create'},
  {path: '/pxemenus/create'},
  {path: '/users/create'}
];

const serverLog = [];

// Records every error that the page reports while `fn` runs.
async function collectErrors(page, fn) {
  const errors = [];
  const onConsole = (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); };
  const onPageError = (e) => errors.push(`exception: ${e.message}`);
  const onResponse = (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()}: ${r.url()}`); };
  const onFailed = (r) => errors.push(`request failed: ${r.url()} (${r.failure() && r.failure().errorText})`);
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('response', onResponse);
  page.on('requestfailed', onFailed);
  try {
    await fn();
  } catch (e) {
    errors.push(`check: ${e.message.split('\n')[0]}`);
  } finally {
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
    page.off('response', onResponse);
    page.off('requestfailed', onFailed);
  }
  return errors;
}

async function login(page) {
  await page.goto(`${base}/login`, {waitUntil: 'networkidle'});
  await page.fill('input[name="username"]', 'Administrator');
  await page.fill('input[name="password"]', password);
  await Promise.all([page.waitForNavigation({waitUntil: 'networkidle'}), page.click('button[type="submit"]')]);
  if (new URL(page.url()).pathname === '/login') throw new Error('login failed: the page stayed on /login');
}

async function checkPage(page, spec) {
  await page.goto(base + spec.path, {waitUntil: 'networkidle'});
  if (new URL(page.url()).pathname === '/login') throw new Error('redirected to /login');
  await page.locator('.app-sidebar').waitFor({state: 'visible', timeout: 5000});
  await page.locator('.app-main').waitFor({state: 'visible', timeout: 5000});
  if (spec.table) {
    await page.waitForFunction(() => window.jQuery && jQuery.fn.dataTable && jQuery.fn.dataTable.tables().length > 0,
      null, {timeout: 10000});
  }
}

// One full round trip through a form: create a record in the UI, find it in
// the list, then open its edit page. This proves the CSRF token, the save
// action, the list's AJAX load, and the edit form. `fill` types the fields of
// the create form; `onEdit` runs extra checks on the edit page.
async function checkRoundTrip(page, {list, form, name, fill, onEdit}) {
  await page.goto(`${base}${list}/create`, {waitUntil: 'networkidle'});
  await fill();
  await Promise.all([page.waitForNavigation({waitUntil: 'networkidle'}), page.click(`#${form} button.btn-success`)]);
  await page.goto(base + list, {waitUntil: 'networkidle'});
  await page.locator('table tbody', {hasText: name}).waitFor({timeout: 10000});
  // The list's Edit button opens <list>/edit/<row id> (assets/fog/fog.common.js).
  const id = await page.evaluate((n) => {
    const row = jQuery.fn.dataTable.tables({api: true}).rows().data().toArray().find((r) => r.name === n);
    return row && row.id;
  }, name);
  if (!id) throw new Error(`no DataTables row has the name ${name}`);
  await checkPage(page, {path: `${list}/edit/${id}`});
  if (!(await page.locator(`input[value="${name}"]`).count())) throw new Error('the edit form does not show the saved name');
  if (onEdit) await onEdit();
}

const checkStorageGroup = (page) => {
  const name = `ui-smoke-${Date.now()}`;
  return checkRoundTrip(page, {
    list: '/storagegroups', form: 'storagegroup-create', name,
    fill: () => page.fill('#sgname', name)
  });
};

// The host edit page is the only one with the MAC list and tag input widgets
// (api/controllers/pages/edit.js), so it also drives both.
const checkHost = (page) => {
  const stamp = Date.now();
  const name = `uismoke${stamp}`;
  const mac = `02:00:${(stamp % 0xffffffff).toString(16).padStart(8, '0').match(/../g).join(':')}`;
  return checkRoundTrip(page, {
    list: '/hosts', form: 'host-create', name,
    fill: async () => {
      await page.fill('#hostname', name);
      // The MAC field is on its own tab, hidden until a user opens it.
      await page.getByRole('tab', {name: 'MAC Addresses'}).click();
      await page.fill('input[name="macs[]"]', mac);
    },
    onEdit: async () => {
      await page.getByRole('tab', {name: 'MAC Addresses'}).click();
      const macRows = page.locator('input[name="macs[]"]');
      const before = await macRows.count();
      await page.click('.maclist-add');
      if (await macRows.count() !== before + 1) throw new Error('the MAC list "add" button did not add a row');
      // The browser must reject a bad MAC (the `pattern` attribute).
      await macRows.last().fill('not-a-mac');
      if (await macRows.last().evaluate((el) => el.checkValidity())) throw new Error('the MAC field accepted "not-a-mac"');
      await macRows.last().fill('');
      await page.getByRole('tab', {name: 'General'}).click();
      await page.fill('.fog-taginput-entry', 'ui-smoke');
      await page.press('.fog-taginput-entry', 'Enter');
      await page.locator('.fog-tag', {hasText: 'ui-smoke'}).waitFor({timeout: 5000});
    }
  });
};

async function main() {
  // Production refuses to lift without socket origins. `npm run setup`
  // writes them, but `npm run setup:dev` does not, so the test sets the one
  // origin that its browser uses.
  const child = server.start({
    port, prod, log: serverLog,
    env: {'sails_sockets__onlyAllowOrigins': JSON.stringify([base])}
  });
  let browser;
  let failed = 0;
  const shot = async (page, label) => {
    fs.mkdirSync(outDir, {recursive: true});
    const file = path.join(outDir, `${label.replace(/[^a-z0-9]+/gi, '_')}.png`);
    try {
      await page.screenshot({path: file, fullPage: true});
      console.log(`    screenshot: ${file}`);
    } catch (e) {
      console.log(`    no screenshot: ${e.message.split('\n')[0]}`);
    }
  };
  const report = async (page, label, errors) => {
    if (!errors.length) return console.log(`ok    ${label}`);
    failed++;
    console.log(`FAIL  ${label}`);
    errors.slice(0, 10).forEach((e) => console.log(`    ${e.slice(0, 300)}`));
    await shot(page, label);
  };
  try {
    await server.waitForReady(child, base);
    browser = await chromium.launch();
    const page = await browser.newPage();
    const loginErrors = await collectErrors(page, () => login(page));
    await report(page, 'login', loginErrors);
    // A script error on the login page still lets the pages be checked. Only a
    // login that did not happen stops the run.
    if (new URL(page.url()).pathname === '/login') throw new Error('cannot check the pages without a login');
    for (const spec of PAGES) {
      await report(page, spec.path, await collectErrors(page, () => checkPage(page, spec)));
    }
    await report(page, 'create and edit a storage group', await collectErrors(page, () => checkStorageGroup(page)));
    await report(page, 'create and edit a host', await collectErrors(page, () => checkHost(page)));
  } catch (e) {
    failed++;
    console.log(`FAIL  ${e.message}`);
  } finally {
    if (browser) await browser.close();
    server.stop(child);
  }
  if (failed) {
    console.log(`\n${failed} check(s) failed. Last fog-node output:\n${serverLog.slice(-40).join('\n')}`);
    process.exit(1);
  }
  console.log('\nAll UI checks passed.');
}

main();
