/**
 * ui16-03: the FOG 1.6 page shell (issue #147).
 *
 * It proves the frame around every signed-in page: the content header
 * (#sectionTitle and #pageTitle) and the tab title on every routed page, the
 * account dropdown, the sidebar brand and user panel, the footer, the canvas
 * color, <html lang>, the <noscript> block, the signed-in 404, and the no-role
 * banner for a user whose roles grant nothing. tools/smoke/ui.js runs this
 * file (see the comment at its top).
 */

const expect = (what, actual, expected) => {
  if (actual !== expected) throw new Error(`${what} is ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
};

// [section, page] for each page, from the table in issue #147. A page in
// ctx.PAGES with no row here fails the check, so a new page gets its row.
const HEADERS = {
  '/': ['Dashboard', 'Dashboard'],
  '/search?q=ui-smoke': ['Search', 'Results for "ui-smoke"'],
  '/account': ['Account', 'My Account'],
  '/hwinfo': ['Hardware Information', 'Server Information'],
  '/hosts': ['Host Management', 'All Hosts'],
  '/images': ['Image Management', 'All Images'],
  '/storagegroups': ['Storage Group Management', 'All Storage Groups'],
  '/storagenodes': ['Storage Node Management', 'All Storage Nodes'],
  '/pxemenus': ['iPXE Management', 'All Boot Menu Items'],
  '/roles': ['Role Management', 'All Roles'],
  '/tasks': ['Task Management', 'All Tasks'],
  '/users': ['User Management', 'All Users'],
  '/workflows': ['Workflow Management', 'All Workflows'],
  '/snapins': ['Snapin Management', 'All Snapins'],
  '/printers': ['Printer Management', 'All Printers'],
  '/hosts/create': ['Host Management', 'Create New Host'],
  '/images/create': ['Image Management', 'Create New Image'],
  '/storagegroups/create': ['Storage Group Management', 'Create New Storage Group'],
  '/storagenodes/create': ['Storage Node Management', 'Create New Storage Node'],
  '/pxemenus/create': ['iPXE Management', 'Create New iPXE Menu'],
  '/users/create': ['User Management', 'Create New User']
};

const NO_ROLE_TEXT = 'No role assigned: this account has no role, so it has no access to any management page. ' +
  'Ask an administrator to assign it a role.';
const NOSCRIPT_TEXT = 'You must enable JavaScript to use FOG Management.';
// The 1.6 clock format 'M j, Y g:i A T', for example "Nov 6, 2026 5:12 AM CST".
const CLOCK = /^[A-Z][a-z]{2} \d{1,2}, \d{4} \d{1,2}:\d{2} [AP]M \S+$/;
// Same-origin AJAX passes api/policies/apiCsrfGuard.js on /api/v1 mutations.
const AJAX = {'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json'};

// The content header and tab title of the page on screen.
const header = (page) => page.evaluate(() => {
  const titles = document.querySelectorAll('#sectionTitle');
  const h1 = titles[0];
  return {
    count: titles.length,
    headers: document.querySelectorAll('.app-content-header').length,
    // The <h1> text without its <small>.
    section: h1 ? [...h1.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join('').trim() : null,
    page: h1 && h1.querySelector('small#pageTitle') ? h1.querySelector('small#pageTitle').textContent.trim() : null,
    title: document.title
  };
});

async function checkHeader(page, path, [section, pageTitle]) {
  const got = await header(page);
  expect(`${path}: the number of #sectionTitle`, got.count, 1);
  expect(`${path}: the number of .app-content-header`, got.headers, 1);
  expect(`${path}: #sectionTitle`, got.section, section);
  expect(`${path}: #pageTitle`, got.page, pageTitle);
  expect(`${path}: document.title`, got.title, `${pageTitle} | FOG Project`);
}

async function checkHeaders({page, checkPage, PAGES}) {
  const paths = PAGES.map((p) => p.path).concat(['/snapins', '/printers']);
  for (const path of paths) {
    if (!HEADERS[path]) throw new Error(`${path} has no expected header in tools/smoke/checks/ui16-03-shell.js`);
    const spec = PAGES.find((p) => p.path === path) || {path, table: true};
    await checkPage(page, spec);
    await checkHeader(page, path, HEADERS[path]);
  }
}

// The edit page of the host that the round trip created (ctx.created.host).
async function checkEditHeader({page, checkPage, created}) {
  const name = created.host;
  if (!name) throw new Error('the host round trip failed, so there is no host edit page to check');
  await checkPage(page, {path: '/hosts', table: true});
  await page.locator('table tbody', {hasText: name}).waitFor({timeout: 10000});
  const id = await page.evaluate((n) => {
    const row = jQuery.fn.dataTable.tables({api: true}).rows().data().toArray().find((r) => r.name === n);
    return row && row.id;
  }, name);
  if (!id) throw new Error(`no DataTables row has the name ${name}`);
  const path = `/hosts/edit/${id}`;
  await checkPage(page, {path});
  await checkHeader(page, path, ['Host Management', `Edit: ${name} ID: ${id}`]);
}

// The signed-in 404 renders through the layout, which has no section there.
// page.request, because a 404 on ctx.page fails the check.
async function checkNotFound({page, base}) {
  const res = await page.request.get(`${base}/no-such-page`, {headers: {Accept: 'text/html'}});
  expect('the status of /no-such-page', res.status(), 404);
  const html = await res.text();
  if (!html.includes('id="accountMenu"')) throw new Error('the 404 page is not the signed-in layout (no #accountMenu)');
  if (html.includes('id="sectionTitle"')) throw new Error('the 404 page renders a content header');
}

async function checkChrome({page, base, checkPage}) {
  const me = await (await page.request.get(`${base}/api/v1/user/me`, {headers: {Accept: 'application/json'}})).json();
  const name = me.displayName || me.username;
  await checkPage(page, {path: '/hosts', table: true});

  const got = await page.evaluate(() => {
    const toggle = document.getElementById('accountMenu');
    const menu = toggle && toggle.nextElementSibling;
    const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
    const footer = document.querySelector('.app-footer');
    const noscript = document.querySelector('body > noscript');
    const panel = document.querySelector('.user-panel .fog-user');
    const left = document.querySelector('.app-header .navbar-nav');
    return {
      toggle: toggle && {
        cls: toggle.className, bs: toggle.getAttribute('data-bs-toggle'),
        title: toggle.getAttribute('title'), aria: toggle.getAttribute('aria-label'),
        icon: toggle.querySelector('i') ? toggle.querySelector('i').className : null
      },
      menuClass: menu && menu.className,
      items: menu ? [...menu.children].map((li) => {
        const el = li.firstElementChild;
        const icon = el.querySelector('i');
        return {tag: el.tagName.toLowerCase(), cls: el.className, id: el.id, href: el.getAttribute('href'),
          icon: icon ? icon.className : '', text: text(el)};
      }) : [],
      accountLinks: menu ? menu.querySelectorAll('a[href="/account"]').length : null,
      navbarLeft: left ? text(left) : null,
      brandImages: document.querySelectorAll('.sidebar-brand img').length,
      brandText: text(document.querySelector('.sidebar-brand')),
      panel: panel && {text: text(panel), href: panel.getAttribute('href')},
      footerVersion: document.getElementById('footerVersion') && document.getElementById('footerVersion').getAttribute('href'),
      footer: footer && text(footer),
      lang: document.documentElement.getAttribute('lang'),
      themeColor: document.querySelector('meta[name="theme-color"]') && document.querySelector('meta[name="theme-color"]').content,
      noscript: noscript && noscript.textContent,
      banners: document.querySelectorAll('#no-role-banner').length
    };
  });

  if (!got.toggle) throw new Error('there is no #accountMenu');
  expect('the #accountMenu class', got.toggle.cls, 'nav-link dropdown-toggle');
  expect('the #accountMenu data-bs-toggle', got.toggle.bs, 'dropdown');
  expect('the #accountMenu title', got.toggle.title, 'Account');
  expect('the #accountMenu aria-label', got.toggle.aria, 'Account');
  expect('the #accountMenu icon', got.toggle.icon, 'fas fa-circle-user');
  expect('the account menu class', got.menuClass, 'dropdown-menu dropdown-menu-end');
  const clock = got.items[2] && got.items[2].text;
  if (!CLOCK.test(clock || '')) throw new Error(`the account menu time is ${JSON.stringify(clock)}, expected the 1.6 format`);
  const shape = got.items.map(({tag, cls, id, href, icon, text}, i) => (i === 2 ? {tag, cls, icon} : {tag, cls, id, href, icon, text}));
  const divider = {tag: 'hr', cls: 'dropdown-divider', id: '', href: null, icon: '', text: ''};
  expect('the account menu items', JSON.stringify(shape), JSON.stringify([
    {tag: 'h6', cls: 'dropdown-header mb-0', id: '', href: null, icon: '', text: name},
    divider,
    {tag: 'span', cls: 'dropdown-item-text small text-body-secondary', icon: 'far fa-clock fa-fw me-1'},
    divider,
    {tag: 'a', cls: 'dropdown-item', id: 'prefsMenuItem', href: '#', icon: 'fas fa-sliders fa-fw me-2', text: 'Preferences'},
    divider,
    {tag: 'a', cls: 'dropdown-item', id: '', href: '/logout', icon: 'fas fa-right-from-bracket fa-fw me-2', text: 'Log out'}
  ]));
  expect('the /account links in the account menu', got.accountLinks, 0);
  expect('the left navbar text', got.navbarLeft, 'Toggle navigation FOG Project');
  expect('the <img> in .sidebar-brand', got.brandImages, 0);
  expect('the .sidebar-brand text', got.brandText, 'FOG Project');
  expect('the .user-panel .fog-user', JSON.stringify(got.panel), JSON.stringify({text: name, href: '/account'}));
  expect('the #footerVersion href', got.footerVersion, '/hwinfo');
  const copyright = `Copyright © 2012-${new Date().getFullYear()} FOG Project`;
  if (!(got.footer || '').includes(copyright)) throw new Error(`the footer reads ${JSON.stringify(got.footer)}, expected "${copyright}"`);
  expect('<html lang>', got.lang, 'en');
  expect('the theme-color meta', got.themeColor, '#367fa9');
  if (!(got.noscript || '').includes('id="noscriptMessage"') || !got.noscript.includes(NOSCRIPT_TEXT)) {
    throw new Error(`the <noscript> block is ${JSON.stringify(got.noscript)}`);
  }
  expect('the Administrator no-role banners', got.banners, 0);

  // Preferences opens from the account menu.
  await page.click('#accountMenu');
  await page.click('#prefsMenuItem');
  await page.locator('#prefsModal.show').waitFor({state: 'visible', timeout: 5000});
  // Cancel, not Escape: Bootstrap ignores a key during the fade-in, and a
  // click waits until the dialog stops moving.
  await page.click('#prefsModal .modal-footer [data-bs-dismiss="modal"]');
  await page.locator('#prefsModal').waitFor({state: 'hidden', timeout: 5000});
}

// The 1.6 canvas: bg-body-tertiary on the signed-in <body>.
async function checkCanvas({page, checkPage}) {
  await checkPage(page, {path: '/hosts', table: true});
  const got = await page.evaluate(() => {
    const html = document.documentElement;
    const before = html.getAttribute('data-bs-theme');
    html.setAttribute('data-bs-theme', 'light');
    const light = getComputedStyle(document.body).backgroundColor;
    html.setAttribute('data-bs-theme', 'dark');
    const dark = getComputedStyle(document.body).backgroundColor;
    if (before === null) html.removeAttribute('data-bs-theme'); else html.setAttribute('data-bs-theme', before);
    return {tertiary: document.body.classList.contains('bg-body-tertiary'), light, dark};
  });
  expect('bg-body-tertiary on <body>', got.tertiary, true);
  expect('the light body background', got.light, 'rgb(248, 249, 250)');
  expect('the dark body background', got.dark, 'rgb(43, 48, 53)');
}

// A user with no role sees the banner until a dismiss, for the browser session.
async function checkNoRole({page, browser, base}) {
  const username = `uismokenorole${Date.now()}`;
  const password = `${username}-pw`;
  const res = await page.request.post(`${base}/api/v1/user`, {
    headers: AJAX, data: {username, password, email: `${username}@example.com`}
  });
  if (!res.ok()) throw new Error(`POST /api/v1/user answered ${res.status()}`);
  const {id} = await res.json();
  const context = await browser.newContext();
  const errors = [];
  try {
    const p = await context.newPage();
    p.on('pageerror', (e) => errors.push(`exception: ${e.message}`));
    await p.goto(`${base}/login`, {waitUntil: 'networkidle'});
    expect('the /login document.title', await p.title(), 'Login | FOG Project');
    await p.fill('input[name="username"]', username);
    await p.fill('input[name="password"]', password);
    await Promise.all([p.waitForNavigation({waitUntil: 'networkidle'}), p.click('button[type="submit"]')]);
    if (new URL(p.url()).pathname === '/login') throw new Error(`${username} could not sign in`);
    await p.goto(`${base}/account`, {waitUntil: 'networkidle'});
    const banner = p.locator('#no-role-banner');
    expect('the no-role banners for a user with no role', await banner.count(), 1);
    expect('the no-role banner text', (await banner.textContent()).replace(/\s+/g, ' ').trim(), NO_ROLE_TEXT);
    await p.click('#no-role-banner .btn-close');
    await p.locator('#no-role-banner .alert').waitFor({state: 'detached', timeout: 5000});
    await p.reload({waitUntil: 'networkidle'});
    expect('the no-role banners after a dismiss and a reload', await p.locator('#no-role-banner').count(), 0);
  } finally {
    await context.close();
    const del = await page.request.delete(`${base}/api/v1/user/${id}`, {headers: AJAX});
    if (!del.ok()) errors.push(`DELETE /api/v1/user/${id} answered ${del.status()}`);
  }
  if (errors.length) throw new Error(`no-role user: ${errors.join('; ')}`);
}

module.exports = {
  name: 'ui16-03: FOG 1.6 page shell',
  run: async (ctx) => {
    await checkHeaders(ctx);
    await checkEditHeader(ctx);
    await checkNotFound(ctx);
    await checkChrome(ctx);
    await checkCanvas(ctx);
    await checkNoRole(ctx);
  }
};
