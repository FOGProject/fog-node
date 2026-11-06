/**
 * ui16-11a: the FOG 1.6 Group record and Group Management pages (issue #169).
 *
 * It proves the sidebar entry, a create from the /groups Add modal with the
 * Group Order field and the 1.6 toast, the host list's "Edit groups" modal
 * adding two hosts to the group, the Members and Grants columns of /groups,
 * the group edit page's info card and tabs, "Remove selected" on its Host
 * Associations tab, and a group delete that keeps its hosts.
 * tools/smoke/ui.js runs this file (see the comment at its top). It creates
 * and deletes its own group and hosts.
 */

const expect = (what, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what} is ${a}, expected ${e}`);
};

const TOAST = '#fog-toast-container .toast-body';

// $.ajax from the page, so fog.csrf.js adds the CSRF header.
const ajax = (page, opts) => page.evaluate((o) => new Promise((resolve, reject) => {
  jQuery.ajax(Object.assign({contentType: 'application/json'}, o, {data: o.data && JSON.stringify(o.data)}))
    .done(resolve).fail((xhr) => reject(new Error(`${o.type} ${o.url} answered ${xhr.status}`)));
}), opts);

// Opens a list and waits for its first answer.
async function openList(page, checkPage, path) {
  await checkPage(page, {path, table: true});
  await page.waitForFunction(() => jQuery('#listtable').DataTable().ajax.json() !== undefined, null, {timeout: 10000});
}

const rows = (page) => page.evaluate(() => jQuery('#listtable').DataTable().rows().data().toArray());

// The info card facts: [label, value] as shown (the label is upper case).
const facts = (page) => page.evaluate(() => [...document.querySelectorAll('#edit-info-card .col')]
  .map((col) => [col.children[0].innerText.trim(), col.children[1].innerText.trim()]));

async function sidebar({page, checkPage}) {
  await checkPage(page, {path: '/'});
  const got = await page.evaluate(() => {
    const main = document.querySelector('.app-sidebar nav > ul.sidebar-menu');
    const items = [...main.querySelectorAll(':scope > li.nav-item')].map((li) => {
      const a = li.querySelector(':scope > a.nav-link');
      return {
        text: a.querySelector(':scope > p').textContent.replace(/\s+/g, ' ').trim(),
        icon: a.querySelector(':scope > i.nav-icon').className.replace(/^nav-icon /, ''),
        subs: [...li.querySelectorAll('ul.nav-treeview a.nav-link')].map((s) => s.textContent.replace(/\s+/g, ' ').trim())
      };
    });
    return items;
  });
  const at = got.findIndex((i) => i.text === 'Groups');
  if (at === -1) throw new Error('the sidebar has no Groups entry');
  expect('the Groups icon', got[at].icon, 'fas fa-sitemap');
  expect('the entries around Groups', [got[at - 1].text, got[at + 1].text], ['Hosts', 'Images']);
  expect('the Groups sub-links', got[at].subs, ['List All Groups', 'Create New Group']);
}

// The /groups Add modal: the 1.6 title, the Group Order field, the 1.6 toast.
async function createGroup({page, checkPage}, name) {
  await openList(page, checkPage, '/groups');
  await page.locator('.btn-actionbox #createnew').click();
  const modal = page.locator('#entityModal.show');
  await modal.locator('form').waitFor({state: 'visible', timeout: 10000});
  expect('the create modal title', (await modal.locator('.modal-title').innerText()).trim(), 'Create New Group');
  if (!(await modal.locator('input#grouporder[type="number"]').count())) throw new Error('the create modal has no Group Order field');
  if (!(await modal.locator('small.form-text', {hasText: 'Lowest first.'}).count())) throw new Error('the Group Order field has no 1.6 help text');
  await modal.locator('#groupname').fill(name);
  await modal.locator('button[type="submit"]').click();
  await page.locator(TOAST, {hasText: 'Group added!'}).waitFor({state: 'visible', timeout: 5000});
  await page.waitForFunction((n) => jQuery('#listtable').DataTable().rows().data().toArray().some((r) => r.name === n),
    name, {timeout: 10000});
  return (await rows(page)).find((r) => r.name === name).id;
}

// The same name in upper case from the Add modal: the 1.6 failure toast, the
// message beside the form, and no second Group. A page of its own, because
// the 400 answer would fail the check on ctx.page.
async function createDuplicate({browser, login, checkPage}, name) {
  const context = await browser.newContext();
  try {
    const other = await context.newPage();
    await login(other);
    await openList(other, checkPage, '/groups');
    await other.locator('.btn-actionbox #createnew').click();
    const modal = other.locator('#entityModal.show');
    await modal.locator('form').waitFor({state: 'visible', timeout: 10000});
    await modal.locator('#groupname').fill(name.toUpperCase());
    await modal.locator('button[type="submit"]').click();
    const toast = other.locator('#fog-toast-container .toast', {hasText: 'A group already exists with this name!'});
    await toast.waitFor({state: 'visible', timeout: 5000});
    expect('the duplicate toast title', (await toast.locator('.toast-header strong').innerText()).trim(), 'Group Create Fail');
    expect('the duplicate message beside the form', (await modal.locator('.fog-form-error').innerText()).trim(),
      'A group already exists with this name!');
    const same = (await ajax(other, {url: '/api/v1/group', type: 'GET'})).filter((g) => g.name.toLowerCase() === name.toLowerCase());
    expect('the Groups with the name after the duplicate', same.map((g) => g.name), [name]);
  } finally {
    await context.close();
  }
}

// Deletes the group and hosts of this run, found by name: a step can fail
// after its record exists. Each delete runs even when another fails. It
// returns what it could not delete.
async function cleanup({page, checkPage}, name, hostNames) {
  const left = [];
  try {
    // $.ajax needs a loaded page, and the page may be anywhere.
    await checkPage(page, {path: '/'});
  } catch (e) {
    return [`no page to clean up from: ${e.message}`];
  }
  for (const [model, mine] of [['group', (r) => r.name === name], ['host', (r) => hostNames.includes(r.name)]]) {
    try {
      const ids = (await ajax(page, {url: `/api/v1/${model}`, type: 'GET'})).filter(mine).map((r) => r.id);
      if (ids.length) await ajax(page, {url: `/api/v1/${model}`, type: 'DELETE', data: {id: ids}});
    } catch (e) {
      left.push(`${model}: ${e.message}`);
    }
  }
  return left;
}

// The host list: select both hosts, "Edit groups", pick the group, Add.
async function addHosts({page, checkPage}, name, stamp) {
  await openList(page, checkPage, `/hosts?search=${stamp}`);
  expect('the hosts found', (await rows(page)).length, 2);
  // A cell without the edit link, so the click selects the row.
  const trs = page.locator('#listtable tbody tr');
  await trs.nth(0).locator('td').nth(2).click();
  await trs.nth(1).locator('td').nth(2).click();
  await page.locator('.dt-buttons button', {hasText: 'Edit groups'}).click();
  const modal = page.locator('.modal.show', {hasText: 'Group Membership'});
  await modal.waitFor({state: 'visible', timeout: 5000});
  expect('the membership modal title', (await modal.locator('.modal-title').innerText()).trim(), 'Group Membership — 2 selected host(s)');
  expect('the membership modal buttons', (await modal.locator('.modal-footer button').allInnerTexts()).map((t) => t.trim()),
    ['Cancel', 'Remove', 'Add']);
  await modal.locator('.select2-selection--multiple').click();
  await modal.locator('.select2-search__field').fill(name);
  await page.locator('.select2-results__option', {hasText: name}).first().waitFor({state: 'visible', timeout: 5000});
  await modal.locator('.select2-search__field').press('Enter');
  expect('the picked groups', await page.evaluate(() => jQuery('#groupSelect').val()), [name]);
  await modal.locator('[data-fog-confirm]').click();
  await page.locator(TOAST, {hasText: 'Added 2 host(s) to 1 group(s).'}).waitFor({state: 'visible', timeout: 5000});
  await page.waitForFunction((n) => {
    const data = jQuery('#listtable').DataTable().rows().data().toArray();
    return data.length === 2 && data.every((r) => Array.isArray(r.groups) && r.groups.includes(n));
  }, name, {timeout: 10000});
  const chips = await page.evaluate(() => [...document.querySelectorAll('#listtable tbody tr')]
    .map((tr) => [...tr.querySelectorAll('.fog-tag-list .badge')].map((b) => b.innerText.trim())));
  expect('the Groups chips of both rows', chips, [[name], [name]]);
}

// /groups: Members 2, and an empty Grants cell.
async function listRow({page, checkPage}, name) {
  await openList(page, checkPage, `/groups?search=${name}`);
  const row = (await rows(page)).find((r) => r.name === name);
  if (!row) throw new Error(`/groups has no row ${name}`);
  expect('the Members of the group', row.members, 2);
  const cells = await page.evaluate(() => [...document.querySelectorAll('#listtable tbody tr:first-child td')].map((td) => td.innerText.trim()));
  expect('the /groups row cells', cells, [name, '2', '']);
}

// The edit page: the info card, the tabs, then Remove selected for one host.
async function editPage({page, checkPage}, name, groupId, hostName) {
  const path = `/groups/edit/${groupId}`;
  await checkPage(page, {path});
  expect('the info card', await facts(page), [['GROUP', name], ['MEMBERS', '2']]);
  expect('the tabs', (await page.locator('ul.nav-tabs[role="tablist"] a.nav-link').allInnerTexts()).map((t) => t.trim()),
    ['General', 'Host Associations']);
  await page.getByRole('tab', {name: 'Host Associations'}).click();
  const pane = page.locator('#tab-host-associations');
  expect('the pane title', (await pane.locator('h4.card-title').innerText()).trim(), 'Group Host Associations');
  await page.waitForFunction(() => jQuery('#group-host-table').DataTable().ajax.json() !== undefined, null, {timeout: 10000});
  await pane.locator('input[type="search"]').fill(hostName);
  await page.waitForFunction((h) => {
    const data = jQuery('#group-host-table').DataTable().rows().data().toArray();
    return data.length === 1 && data[0].name === h;
  }, hostName, {timeout: 10000});
  expect('the Associated box of the host', await pane.locator('#group-host-table tbody tr input[type="checkbox"]').isChecked(), true);
  await pane.locator('#group-host-table tbody tr td').first().click();
  await pane.locator('#group-host-remove').click();
  const dialog = page.locator('.modal.show', {hasText: 'Remove host Associations'});
  await dialog.waitFor({state: 'visible', timeout: 5000});
  await dialog.locator('[data-fog-confirm]').click();
  await page.locator(TOAST, {hasText: 'Group updated!'}).waitFor({state: 'visible', timeout: 5000});
  await page.waitForFunction(() => {
    const box = document.querySelector('#group-host-table tbody tr input[type="checkbox"]');
    return box && !box.checked;
  }, null, {timeout: 10000});
  await checkPage(page, {path});
  expect('the info card after Remove selected', await facts(page), [['GROUP', name], ['MEMBERS', '1']]);
}

// Delete from the edit page: the hosts stay, and neither holds the name.
async function deleteGroup({page, checkPage}, groupId, hostIds) {
  await checkPage(page, {path: `/groups/edit/${groupId}`});
  await page.click('#tab-general [data-fog-delete]');
  await page.locator('.modal.show [data-fog-confirm]').waitFor({state: 'visible', timeout: 5000});
  await Promise.all([page.waitForNavigation({waitUntil: 'networkidle'}), page.click('.modal.show [data-fog-confirm]')]);
  expect('the page after Delete', new URL(page.url()).pathname, '/groups');
  for (const id of hostIds) {
    const host = await ajax(page, {url: `/api/v1/host/${id}`, type: 'GET'});
    if (!host || host.id !== id) throw new Error(`the host ${id} is gone after the group delete`);
    expect(`the groups of host ${host.name}`, host.groups, []);
  }
}

module.exports = {
  name: 'ui16-11a: FOG 1.6 Group Management',
  run: async (ctx) => {
    const {page} = ctx;
    const stamp = Date.now();
    const name = `ui16-11a-${stamp}`;
    const hostNames = [`ui16-11a-${stamp}-h1`, `ui16-11a-${stamp}-h2`];
    let failure;
    try {
      await sidebar(ctx);
      const groupId = await createGroup(ctx, name);
      await createDuplicate(ctx, name);
      const hostIds = [];
      for (const hostName of hostNames) {
        hostIds.push((await ajax(page, {url: '/api/v1/host', type: 'POST', data: {name: hostName}})).id);
      }
      await addHosts(ctx, name, stamp);
      await listRow(ctx, name);
      await editPage(ctx, name, groupId, hostNames[0]);
      await deleteGroup(ctx, groupId, hostIds);
    } catch (e) {
      failure = e;
    }
    const left = await cleanup(ctx, name, hostNames);
    if (failure) throw failure;
    if (left.length) throw new Error(`the cleanup failed: ${left.join('; ')}`);
  }
};
