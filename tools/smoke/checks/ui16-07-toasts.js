/**
 * ui16-07: the FOG 1.6 toasts and modal style (issue #151).
 *
 * It proves that fogToast (assets/fog/fog.common.js) renders the 1.6
 * Bootstrap toast for each type, collapses a repeat into one, shows text as
 * text, closes, and hides after 8 s; that a server message (the session
 * flash, api/helpers/flash.js) shows once on the next page; that the create
 * modal toasts once; that PNotify is gone; and that fogConfirm and fogModal
 * carry the 1.6 modal type, with Cancel first and unfilled.
 * tools/smoke/ui.js runs this file (see the comment at its top).
 */

const expect = (what, actual, expected) => {
  if (actual !== expected) throw new Error(`${what} is ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
};

// type -> the 1.6 header class, icon, role and default title (1.6
// fog.common.js TOAST_TYPES).
const TYPES = {
  success: {header: 'text-bg-success', icon: 'fa-circle-check', role: 'status', title: 'Success'},
  error: {header: 'text-bg-danger', icon: 'fa-triangle-exclamation', role: 'alert', title: 'Error'},
  warning: {header: 'text-bg-warning', icon: 'fa-triangle-exclamation', role: 'alert', title: 'Warning'},
  info: {header: 'text-bg-info', icon: 'fa-circle-info', role: 'status', title: 'Info'},
  notice: {header: 'text-bg-secondary', icon: 'fa-circle-exclamation', role: 'status', title: 'Notice'}
};

const TOAST = '#fog-toast-container .toast.fog-toast';

// Every toast in the container: its header class, icon, role, title and body.
const readToasts = (page) => page.evaluate((sel) => Array.from(document.querySelectorAll(sel)).map((t) => {
  const header = t.querySelector('.toast-header');
  return {
    header: header ? header.className : '',
    icon: (t.querySelector('.toast-header i') || {}).className || '',
    role: t.getAttribute('role'),
    title: (t.querySelector('.toast-header strong') || {}).textContent,
    close: !!t.querySelector('.toast-header .btn-close[data-bs-dismiss="toast"]'),
    body: (t.querySelector('.toast-body') || {}).textContent,
    bodyElements: t.querySelector('.toast-body') ? t.querySelector('.toast-body').children.length : -1
  };
}), TOAST);

const toast = (page, ...args) => page.evaluate((a) => { window.fogToast(...a); }, args);

async function types({page, checkPage}) {
  await checkPage(page, {path: '/hosts', table: true});
  for (const type of Object.keys(TYPES)) {
    await toast(page, type, `ui16-07 ${type}`);
    const t = (await readToasts(page)).find((x) => x.body === `ui16-07 ${type}`);
    if (!t) throw new Error(`fogToast('${type}') rendered no toast in #fog-toast-container`);
    const want = TYPES[type];
    if (!t.header.split(' ').includes(want.header)) throw new Error(`the ${type} header class is "${t.header}", expected ${want.header}`);
    if (!t.icon.split(' ').includes(want.icon)) throw new Error(`the ${type} icon is "${t.icon}", expected ${want.icon}`);
    expect(`the ${type} role`, t.role, want.role);
    expect(`the ${type} title`, t.title, want.title);
    expect(`the ${type} close button`, t.close, true);
  }
}

// A repeat collapses into one toast with a count; HTML stays text; a title
// shows; the close button removes the toast at once.
async function collapseAndClose({page, checkPage}) {
  await checkPage(page, {path: '/hosts', table: true});
  await toast(page, 'success', '<b>x</b>');
  await toast(page, 'success', '<b>x</b>');
  const same = (await readToasts(page)).filter((t) => t.body === '<b>x</b>');
  expect('the toasts for two identical calls', same.length, 1);
  expect('the collapsed title', same[0].title, 'Success (×2)');
  expect('the elements in the HTML toast body', same[0].bodyElements, 0);

  await toast(page, 'error', 'y', 'Login Failed');
  const titled = page.locator(TOAST, {has: page.locator('.toast-body', {hasText: /^y$/})});
  expect('the title of a titled toast', (await titled.locator('.toast-header strong').innerText()).trim(), 'Login Failed');
  await titled.locator('.btn-close').click();
  await titled.waitFor({state: 'detached', timeout: 2000});
}

// The host General save: one "Host updated!" toast from the flash, no
// `saved` in the URL, and nothing after a reload.
async function flashAfterSave({page, checkPage, created}) {
  if (!created.host) throw new Error('the host round trip created no host');
  await checkPage(page, {path: `/hosts?search=${created.host}`, table: true});
  await page.waitForFunction(() => jQuery('#listtable').DataTable().ajax.json() !== undefined, null, {timeout: 10000});
  const id = await page.evaluate((n) => {
    const row = jQuery('#listtable').DataTable().rows().data().toArray().find((r) => r.name === n);
    return row && row.id;
  }, created.host);
  if (!id) throw new Error(`no /hosts row has the name ${created.host}`);
  await checkPage(page, {path: `/hosts/edit/${id}`});
  await Promise.all([page.waitForNavigation({waitUntil: 'networkidle'}), page.click('#tab-general button[type="submit"]')]);
  const url = new URL(page.url());
  if (url.searchParams.has('saved')) throw new Error(`the URL after the save carries saved: ${url.href}`);
  const after = await readToasts(page);
  expect('the toasts after the host save', JSON.stringify(after.map((t) => [t.title, t.body])), '[["Host Update Success","Host updated!"]]');
  await page.reload({waitUntil: 'networkidle'});
  expect('the toasts after a reload', (await readToasts(page)).length, 0);
}

// The create modal shows one toast from its own JSON reply, and sets no
// flash. The group it creates is deleted again.
async function createModalToast({page, checkPage}) {
  const name = `ui16-07-${Date.now()}`;
  await checkPage(page, {path: '/storagegroups', table: true});
  await page.locator('.btn-actionbox #createnew').click();
  const modal = page.locator('#entityModal.show');
  await modal.locator('form').waitFor({state: 'visible', timeout: 10000});
  await modal.locator('#sgname').fill(name);
  await modal.locator('button[type="submit"]').click();
  // The 1.6 create text and title (general/save.js), as on every page.
  await page.locator(TOAST, {hasText: 'Storage Group added!'}).waitFor({state: 'visible', timeout: 5000});
  const made = await readToasts(page);
  expect('the toasts after a create-modal save', made.length, 1);
  expect('the create-modal toast title', made[0].title, 'Storage Group Create Success');
  await page.reload({waitUntil: 'networkidle'});
  await page.waitForFunction(() => jQuery('#listtable').DataTable().ajax.json() !== undefined, null, {timeout: 10000});
  expect('the toasts after a reload', (await readToasts(page)).length, 0);
  // $.ajax from the page, so fog.csrf.js adds the CSRF header.
  await page.evaluate((n) => new Promise((resolve, reject) => {
    const row = jQuery('#listtable').DataTable().rows().data().toArray().find((r) => r.name === n);
    if (!row) { reject(new Error(`no /storagegroups row has the name ${n}`)); return; }
    jQuery.ajax({url: '/api/v1/storagegroup', type: 'DELETE', contentType: 'application/json', data: JSON.stringify({id: [row.id]})})
      .done(resolve).fail((xhr) => reject(new Error(`DELETE answered ${xhr.status}`)));
  }), name);
}

// A toast hides after 8 s. A page of its own, so the fake clock does not
// stay on for the later checks.
async function autoHide({browser, base, login}) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.clock.install();
    await login(page);
    await page.goto(`${base}/hosts`, {waitUntil: 'networkidle'});
    await toast(page, 'info', 'ui16-07 hide');
    expect('the toasts before the delay', (await readToasts(page)).length, 1);
    // 8000 ms, then the Bootstrap hide transition.
    await page.clock.runFor(9000);
    expect('the toasts 9 s later', (await readToasts(page)).length, 0);
    if (errors.length) throw new Error(`the page threw: ${errors[0]}`);
  } finally {
    await context.close();
  }
}

// fogConfirm({danger: true}): Cancel first and not red; fogModal({type:
// 'warning'}): the warning fill on its primary button.
async function modals({page, checkPage}) {
  await checkPage(page, {path: '/hosts', table: true});
  expect('typeof window.PNotify', await page.evaluate(() => typeof window.PNotify), 'undefined');

  await page.evaluate(() => { window.__ui1607 = window.fogConfirm({danger: true, title: 'ui16-07 confirm', body: 'b'}); });
  const confirm = page.locator('.modal.show', {hasText: 'ui16-07 confirm'});
  await confirm.waitFor({state: 'visible', timeout: 5000});
  const c = await confirm.evaluate((el) => {
    const buttons = el.querySelectorAll('.modal-footer .btn');
    return {
      danger: el.classList.contains('modal-danger'),
      first: buttons[0].textContent.trim(),
      cancelBg: getComputedStyle(buttons[0]).backgroundColor,
      confirmBg: getComputedStyle(buttons[buttons.length - 1]).backgroundColor
    };
  });
  expect('fogConfirm({danger}) has modal-danger', c.danger, true);
  expect('the first footer button', c.first, 'Cancel');
  if (c.cancelBg === c.confirmBg) throw new Error(`Cancel has the danger fill ${c.cancelBg}`);
  await confirm.locator('.modal-footer [data-bs-dismiss="modal"]').click();
  await confirm.waitFor({state: 'detached', timeout: 5000});
  expect('the fogConfirm result after Cancel', await page.evaluate(() => window.__ui1607), false);

  await page.evaluate(() => { window.fogModal({type: 'warning', title: 'ui16-07 warning', body: 'b', confirmText: 'Go'}); });
  const warn = page.locator('.modal.show', {hasText: 'ui16-07 warning'});
  await warn.waitFor({state: 'visible', timeout: 5000});
  const w = await warn.evaluate((el) => {
    // The warning color, read the way the stylesheet reads it.
    const probe = document.createElement('div');
    probe.style.backgroundColor = 'var(--fog-warning)';
    el.appendChild(probe);
    const fill = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return {
      warning: el.classList.contains('modal-warning'),
      fill,
      primaryBg: getComputedStyle(el.querySelector('[data-fog-confirm]')).backgroundColor
    };
  });
  expect('fogModal({type: warning}) has modal-warning', w.warning, true);
  expect('the warning primary button background', w.primaryBg, w.fill);
  await warn.locator('.modal-footer [data-bs-dismiss="modal"]').click();
  await warn.waitFor({state: 'detached', timeout: 5000});
}

module.exports = {
  name: 'ui16-07: FOG 1.6 toasts and modal style',
  run: async (ctx) => {
    await types(ctx);
    await collapseAndClose(ctx);
    await flashAfterSave(ctx);
    await createModalToast(ctx);
    await autoHide(ctx);
    await modals(ctx);
  }
};
