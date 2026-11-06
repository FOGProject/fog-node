/**
 * ui16-04: the FOG 1.6 sidebar (issue #148).
 *
 * It proves the menu that api/helpers/build-menu.js builds and
 * views/layouts/partials/sidebar.ejs renders: the top-level order, labels and
 * icons; the User Administration group label; that every sidebar link to a
 * page of this server answers below 400 (no link to a page with no route, such
 * as /hosts/pending); no PLUGIN OPTIONS header while only the snapin and
 * printer plugins add items; and the 1.6 active state on /hosts/create and on
 * the edit page of the round-trip host. tools/smoke/ui.js runs this file (see
 * the comment at its top).
 */

const expect = (what, actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${what} is ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
};

// [label, icon] of each MAIN NAVIGATION item, from the table in issue #148.
const TOP = [
  ['Dashboard', 'fas fa-gauge-high'],
  ['Hosts', 'fas fa-desktop'],
  ['Groups', 'fas fa-sitemap'],
  ['Images', 'far fa-hard-drive'],
  ['Snapins', 'fas fa-cube'],
  ['Storage Groups', 'far fa-object-group'],
  ['Storage Nodes', 'fas fa-server'],
  ['Printers', 'fas fa-print'],
  ['Tasks', 'fas fa-bars-progress'],
  ['Workflows', 'fas fa-diagram-project'],
  ['User Administration', 'fas fa-shield'],
  ['iPXE Menu', 'fas fa-list-ol']
];

// What the sidebar on screen shows.
const sidebar = (page) => page.evaluate(() => {
  const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
  const main = document.querySelector('.app-sidebar nav > ul.sidebar-menu');
  // A node's own link: the <a> child of an <li>, with its label and icon.
  const link = (li) => {
    const a = li.querySelector(':scope > a.nav-link');
    const icon = a.querySelector(':scope > i.nav-icon');
    return {text: text(a.querySelector(':scope > p')), icon: icon.className.replace(/^nav-icon /, ''), cls: a.className};
  };
  const top = [...main.querySelectorAll(':scope > li.nav-item')];
  const group = top.find((li) => link(li).text === 'User Administration');
  const hosts = top.find((li) => link(li).text === 'Hosts');
  return {
    top: top.map((li) => [link(li).text, link(li).icon]),
    headers: [...document.querySelectorAll('.app-sidebar .nav-header')].map(text),
    pluginLists: document.querySelectorAll('.app-sidebar ul.plugin-options').length,
    groupChildren: group ? [...group.querySelectorAll(':scope > ul.nav-treeview > li.nav-item')].map((li) => [link(li).text, link(li).icon]) : null,
    hrefs: [...new Set([...document.querySelectorAll('.app-sidebar nav a[href^="/"]')].map((a) => a.getAttribute('href')))],
    activeSubs: [...document.querySelectorAll('.app-sidebar .nav-treeview a.nav-link.active')]
      .filter((a) => !a.parentElement.querySelector(':scope > ul.nav-treeview'))
      .map((a) => text(a)),
    hostsOpen: hosts ? hosts.classList.contains('menu-open') : null,
    hostsActive: hosts ? link(hosts).cls.split(' ').includes('active') : null,
    hostsSubs: hosts ? [...hosts.querySelectorAll('ul.nav-treeview a.nav-link')].map((a) => [text(a), a.querySelector('i').className]) : null,
    open: [...main.querySelectorAll('li.menu-open')].map((li) => link(li).text)
  };
});

async function checkShape({page, base, checkPage}) {
  await checkPage(page, {path: '/'});
  const got = await sidebar(page);
  // Every link to this server answers. page.request, because a 4xx on
  // ctx.page fails the check before this line could name the link.
  const bad = [];
  for (const href of got.hrefs) {
    const res = await page.request.get(`${base}${href}`, {headers: {Accept: 'text/html'}});
    if (res.status() >= 400) bad.push(`${href} answered ${res.status()}`);
  }
  if (bad.length) throw new Error(`sidebar links fail: ${bad.join('; ')}`);
  for (const href of ['/snapins/create', '/printers/create']) {
    if (!got.hrefs.includes(href)) throw new Error(`the sidebar has no ${href} link`);
  }
  expect('the MAIN NAVIGATION items', got.top, TOP);
  expect('the sidebar headers', got.headers, ['MAIN NAVIGATION', 'RESOURCES']);
  expect('the number of ul.plugin-options', got.pluginLists, 0);
  expect('the User Administration children', got.groupChildren, [['Users', 'fas fa-users'], ['Roles', 'fas fa-user-shield']]);
  expect('the Hosts sub-links', got.hostsSubs, [['List All Hosts', 'nav-icon far fa-circle'], ['Create New Host', 'nav-icon far fa-circle']]);
}

async function checkActive(page, path, activeSubs) {
  const got = await sidebar(page);
  expect(`${path}: the active sub-links`, got.activeSubs, activeSubs);
  expect(`${path}: .menu-open on the Hosts li`, got.hostsOpen, true);
  expect(`${path}: .active on the Hosts .nav-link`, got.hostsActive, true);
  expect(`${path}: the open items`, got.open, ['Hosts']);
}

async function checkCreate({page, checkPage}) {
  await checkPage(page, {path: '/hosts/create'});
  await checkActive(page, '/hosts/create', ['Create New Host']);
}

// The edit page of the host that the round trip created (ctx.created.host).
async function checkEdit({page, checkPage, created}) {
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
  await checkActive(page, path, []);
}

module.exports = {
  name: 'ui16-04: FOG 1.6 sidebar',
  run: async (ctx) => {
    await checkShape(ctx);
    await checkCreate(ctx);
    await checkEdit(ctx);
  }
};
