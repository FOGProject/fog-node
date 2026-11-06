/**
 * ui16-02: the System/Light/Dark theme and the Preferences dialog
 * (issue #146).
 *
 * It picks Dark in #prefsModal, reloads, and proves that the choice was
 * stored: <html> is dark, only the Dark row is ticked, and #themePref holds
 * 'dark'. It then picks System under a dark OS color scheme, where <html> is
 * dark but #themePref must hold '' (System, not Dark). Last, a signed-out
 * /login under a dark color scheme must paint dark: the layout's pre-paint
 * script. tools/smoke/ui.js runs this file (see the comment at its top).
 */

const expect = (what, actual, expected) => {
  if (actual !== expected) throw new Error(`${what} is ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
};

// Opened from script, not by a click on #prefsMenuItem: ui16-03 moves that
// link into the account dropdown.
async function openPrefs(page) {
  await page.evaluate(() => bootstrap.Modal.getOrCreateInstance(document.getElementById('prefsModal')).show());
  await page.locator('#prefsModal.show').waitFor({state: 'visible', timeout: 5000});
}

// Clicks a theme row and waits for the stored write to answer.
async function pick(page, choice) {
  const saved = page.waitForResponse((r) => new URL(r.url()).pathname === '/account/preferences' &&
    r.request().method() === 'POST', {timeout: 5000});
  await page.locator(`#prefsModal [data-theme-choice="${choice}"]`).click();
  const res = await saved;
  if (!res.ok()) throw new Error(`POST /account/preferences answered ${res.status()}`);
}

const state = (page) => page.evaluate(() => ({
  theme: document.documentElement.dataset.bsTheme,
  pref: document.getElementById('themePref').getAttribute('data-theme-pref'),
  ticked: [...document.querySelectorAll('#prefsModal [data-theme-choice]')]
    .filter((row) => !row.querySelector('.theme-choice-tick').classList.contains('invisible'))
    .map((row) => row.getAttribute('data-theme-choice'))
}));

async function checkPicker({page, checkPage}) {
  await checkPage(page, {path: '/'});
  await openPrefs(page);
  await pick(page, 'dark');
  // Applied at once, before any reload.
  expect('<html> data-bs-theme after the click', (await state(page)).theme, 'dark');

  await page.reload({waitUntil: 'networkidle'});
  let now = await state(page);
  expect('<html> data-bs-theme after a reload', now.theme, 'dark');
  expect('#themePref after picking Dark', now.pref, 'dark');
  expect('the ticked rows', JSON.stringify(now.ticked), JSON.stringify(['dark']));

  await openPrefs(page);
  const footer = await page.evaluate(() => [...document.querySelectorAll('#prefsModal .modal-footer button')]
    .map((b) => ({text: b.textContent.trim(), cls: b.className, dismiss: b.getAttribute('data-bs-dismiss')})));
  expect('the modal footer buttons', JSON.stringify(footer),
    JSON.stringify([{text: 'Cancel', cls: 'btn btn-outline-secondary float-start', dismiss: 'modal'}]));

  // System under a dark OS: <html> is dark, but the stored choice is ''.
  await page.emulateMedia({colorScheme: 'dark'});
  await pick(page, '');
  await page.reload({waitUntil: 'networkidle'});
  now = await state(page);
  expect('<html> data-bs-theme for System under a dark OS', now.theme, 'dark');
  expect('#themePref after picking System', now.pref, '');
  expect('the ticked rows', JSON.stringify(now.ticked), JSON.stringify(['']));
  const stored = await page.evaluate(() => window.fogPrefFetch());
  expect('the stored display.theme', stored['display.theme'], undefined);
}

async function checkLogin({browser, base}) {
  const context = await browser.newContext({colorScheme: 'dark'});
  const errors = [];
  try {
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(`exception: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
    await page.goto(`${base}/login`, {waitUntil: 'networkidle'});
    expect('/login data-bs-theme under a dark color scheme',
      await page.evaluate(() => document.documentElement.getAttribute('data-bs-theme')), 'dark');
  } finally {
    await context.close();
  }
  if (errors.length) throw new Error(`/login: ${errors.join('; ')}`);
}

module.exports = {
  name: 'ui16-02: System/Light/Dark theme, Preferences dialog',
  run: async (ctx) => {
    try {
      await checkPicker(ctx);
    } finally {
      // Leave the Administrator on System and the page on the default color
      // scheme, so a failure here cannot change the next check or the next run.
      await ctx.page.emulateMedia({colorScheme: null});
      await ctx.page.evaluate(() => window.fogPrefStore && window.fogPrefStore('display.theme', '')).catch(() => {});
    }
    await checkLogin(ctx);
  }
};
