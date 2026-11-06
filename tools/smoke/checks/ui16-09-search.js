/**
 * ui16-09: the FOG 1.6 select2 universal search in the sidebar (issue #153).
 *
 * It types the round-trip host's name into #universal-search-select, one
 * character and then the rest, and proves: a results group appears after one
 * character; the "Host" group holds the host and ends with a
 * "--> See all results" entry for /hosts?search=<name>; the box is a
 * .select2-selection--multiple inside .app-sidebar; the open dropdown is a
 * child of <body>; no bg-white, bg-light or text-dark stays in the search
 * markup; and picking the host opens its edit page. tools/smoke/ui.js runs
 * this file (see the comment at its top).
 */

const BOX = '.app-sidebar #globalSearchWrap .select2-selection--multiple';
// The open dropdown. select2 puts it in its own .select2-container.
const DROPDOWN = '.select2-container--open > .select2-dropdown';

// The groups that the open dropdown shows: each label, and each entry's text
// and URL. select2 4.1 keeps an entry's data in its own cache (Utils.GetData),
// not in jQuery data.
const groups = (page) => page.evaluate((sel) => {
  const utils = jQuery.fn.select2.amd.require('select2/utils');
  const dropdown = document.querySelector(sel);
  if (!dropdown) return [];
  return [...dropdown.querySelectorAll('li.select2-results__option[role="group"]')].map((g) => ({
    label: g.querySelector(':scope > .select2-results__group').textContent,
    items: [...g.querySelectorAll(':scope > ul > li.select2-results__option')].map((li) => {
      const data = utils.GetData(li, 'data');
      return {text: li.textContent, url: data && data.url};
    })
  }));
}, DROPDOWN);

module.exports = {
  name: 'ui16-09: FOG 1.6 select2 universal search',
  run: async ({page, base, checkPage, created}) => {
    const name = created.host;
    if (!name) throw new Error('the host round trip failed, so there is no host to search for');
    await checkPage(page, {path: '/'});

    const stale = await page.evaluate(() => document.querySelectorAll('#globalSearchWrap .bg-white, #globalSearchWrap .bg-light, #globalSearchWrap .text-dark').length);
    if (stale) throw new Error(`${stale} element(s) in #globalSearchWrap carry bg-white, bg-light or text-dark`);

    await page.locator(BOX).waitFor({state: 'visible', timeout: 5000});
    await page.click(BOX);
    await page.keyboard.type(name[0]);
    // minimumInputLength is 1: one character shows the groups.
    await page.locator(`${DROPDOWN} .select2-results__group`).first().waitFor({timeout: 10000});

    await page.keyboard.type(name.slice(1));
    // Wait for the results of the whole name: the one-character results may
    // also hold the host, but their "See all results" URL has the short term.
    const all = `/hosts?search=${encodeURIComponent(name)}`;
    await page.waitForFunction(({sel, url}) => {
      const utils = jQuery.fn.select2.amd.require('select2/utils');
      return [...document.querySelectorAll(`${sel} li.select2-results__option`)]
        .some((li) => (utils.GetData(li, 'data') || {}).url === url);
    }, {sel: DROPDOWN, url: all}, {timeout: 10000});

    const host = (await groups(page)).find((g) => g.label === 'Host');
    if (!host) throw new Error(`no "Host" group: ${JSON.stringify(await groups(page))}`);
    const hit = host.items.find((it) => it.text === name);
    if (!hit) throw new Error(`the Host group does not hold ${name}: ${JSON.stringify(host.items)}`);
    const last = host.items[host.items.length - 1];
    if (last.text !== '--> See all results' || last.url !== all) {
      throw new Error(`the last Host entry is ${JSON.stringify(last)}, expected "--> See all results" for ${all}`);
    }

    const where = await page.evaluate(({box, sel}) => ({
      boxInSidebar: !!document.querySelector(box),
      dropdownParent: (document.querySelector(sel).parentElement.parentElement || {}).tagName,
      dropdownInSidebar: !!document.querySelector(sel).closest('.app-sidebar')
    }), {box: BOX, sel: DROPDOWN});
    if (!where.boxInSidebar) throw new Error('no .select2-selection--multiple inside .app-sidebar');
    if (where.dropdownParent !== 'BODY' || where.dropdownInSidebar) {
      throw new Error(`the dropdown container is a child of <${where.dropdownParent}>, expected <BODY> outside .app-sidebar`);
    }

    // Picking the host opens its edit page.
    if (!/^\/hosts\/edit\/[^/]+$/.test(hit.url)) throw new Error(`the host entry URL is ${hit.url}`);
    await Promise.all([
      page.waitForURL(base + hit.url, {waitUntil: 'networkidle', timeout: 10000}),
      // Not the group <li>: it holds the host entry, so its text matches too.
      page.locator(`${DROPDOWN} li.select2-results__option:not([role="group"])`, {hasText: name}).first().click()
    ]);
  }
};
