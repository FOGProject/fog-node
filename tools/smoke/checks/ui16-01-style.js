/**
 * ui16-01: the FOG 1.6 stylesheet, Font Awesome 7 and DataTables Bootstrap 5
 * (issue #145).
 *
 * It proves that assets/styles/zz-fog-ui.css (the port of FOG 1.6
 * fog-default-ui.scss) loads after the vendor stylesheets, and that Font
 * Awesome 7 and its v4 shims render. The expected values are the ones the
 * ported 1.6 rules set. tools/smoke/ui.js runs this file (see the comment at
 * its top).
 */

// .app-sidebar .sidebar-menu .nav-link { font-size: 0.875rem } (1.6 compact
// sidebar density).
const SIDEBAR_FONT_SIZE = '14px';
// body { background-color: var(--fog-canvas) }, --fog-canvas: #eef1f5.
const CANVAS_LIGHT = 'rgb(238, 241, 245)';
// [data-bs-theme="dark"] body { background-color: var(--fog-bg) }, which is
// var(--bs-body-bg) under the dark theme: #212529.
const CANVAS_DARK = 'rgb(33, 37, 41)';
// The sidebar link color in light mode. The <aside> carries
// data-bs-theme="dark" in both themes, and the 1.6 sidebar rules set no link
// color of their own, so this is the dark-sidebar color that 1.6 shows.
const SIDEBAR_LINK_COLOR = 'rgb(194, 199, 208)';
// .app-main .select2-container--default .select2-selection--single
// { height: calc(1.5em + 0.6rem + 2px) }: 1.5 x 14px + 9.6px + 2px = 32.6px.
// Chromium lays out in 1/64 px, so it reports 32.5938px; compare within 0.05.
const SELECT2_HEIGHT = 32.6;

const expect = (what, actual, expected) => {
  if (actual !== expected) throw new Error(`${what} is ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
};

// The first top-level sidebar link. A submenu link is smaller (0.85rem).
const SIDEBAR_LINK = '.app-sidebar .sidebar-menu > .nav-item > .nav-link';

async function checkHosts({page, checkPage}) {
  await checkPage(page, {path: '/hosts', table: true});
  const light = await page.evaluate((sel) => {
    const link = getComputedStyle(document.querySelector(sel));
    return {fontSize: link.fontSize, color: link.color, body: getComputedStyle(document.body).backgroundColor};
  }, SIDEBAR_LINK);
  expect('the sidebar .nav-link font size', light.fontSize, SIDEBAR_FONT_SIZE);
  expect('the sidebar .nav-link color', light.color, SIDEBAR_LINK_COLOR);
  expect('the body background', light.body, CANVAS_LIGHT);
  const dark = await page.evaluate(() => {
    const html = document.documentElement;
    const before = html.getAttribute('data-bs-theme');
    html.setAttribute('data-bs-theme', 'dark');
    const bg = getComputedStyle(document.body).backgroundColor;
    if (before === null) html.removeAttribute('data-bs-theme'); else html.setAttribute('data-bs-theme', before);
    return bg;
  });
  expect('the dark-theme body background', dark, CANVAS_DARK);
}

async function checkFonts({page}) {
  // An fa fa-* class (through the v4 shims) and an FA 7 class must both draw
  // a glyph in the Font Awesome 7 font.
  const glyphs = await page.evaluate(async () => {
    const out = {};
    for (const cls of ['fa fa-dashboard', 'fas fa-gauge-high']) {
      const i = document.createElement('i');
      i.className = cls;
      document.body.appendChild(i);
      const before = getComputedStyle(i, '::before');
      out[cls] = {content: before.content, family: before.fontFamily};
      i.remove();
    }
    await document.fonts.ready;
    out.faces = [...document.fonts].map((f) => ({family: f.family.replace(/["']/g, ''), status: f.status}));
    return out;
  });
  for (const cls of ['fa fa-dashboard', 'fas fa-gauge-high']) {
    const {content, family} = glyphs[cls];
    // FA 7 computes to `"<glyph>" / ""` (the glyph, then empty alt text).
    const glyph = (/^"((?:[^"\\]|\\.)*)"/.exec(content) || [])[1];
    if (!glyph) throw new Error(`<i class="${cls}"> has no ::before glyph: ${content}`);
    if (!family.includes('Font Awesome 7')) throw new Error(`<i class="${cls}"> uses the font ${family}`);
  }
  if (!glyphs.faces.some((f) => f.family === 'Font Awesome 7 Free' && f.status === 'loaded')) {
    throw new Error(`no loaded Font Awesome 7 Free face: ${JSON.stringify(glyphs.faces)}`);
  }

  // Every woff2 that a page stylesheet names must load. In production the
  // stylesheet is the minified bundle, so this proves its rewritten font URLs.
  const sheets = await page.evaluate(() => [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.href));
  const fonts = new Set();
  for (const href of sheets) {
    const css = await (await page.request.get(href)).text();
    for (const [, url] of css.matchAll(/url\(\s*['"]?([^'")]+\.woff2)['"]?\s*\)/g)) fonts.add(new URL(url, href).href);
  }
  if (![...fonts].some((u) => u.endsWith('/fa-solid-900.woff2'))) throw new Error(`no stylesheet names fa-solid-900.woff2: ${[...fonts].join(', ')}`);
  for (const url of fonts) {
    const status = (await page.request.get(url)).status();
    if (status !== 200) throw new Error(`HTTP ${status}: ${url}`);
  }
}

async function checkSelect2({page, checkPage}) {
  await checkPage(page, {path: '/hosts/create'});
  // The Image select is on the Associations tab, hidden until a user opens it.
  await page.getByRole('tab', {name: 'Associations'}).click();
  await page.locator('#tab-associations .select2-selection--single').first().waitFor({state: 'visible', timeout: 5000});
  const height = await page.evaluate(() => {
    const box = [...document.querySelectorAll('.app-main .select2-container--default .select2-selection--single')]
      .find((el) => el.offsetParent !== null);
    return box ? getComputedStyle(box).height : null;
  });
  if (height === null) throw new Error('no visible select2 box on /hosts/create');
  if (Math.abs(parseFloat(height) - SELECT2_HEIGHT) > 0.05) {
    throw new Error(`the select2 box height is ${height}, expected ${SELECT2_HEIGHT}px`);
  }
}

module.exports = {
  name: 'ui16-01: FOG 1.6 stylesheet, Font Awesome 7, select2',
  run: async (ctx) => {
    await checkHosts(ctx);
    await checkFonts(ctx);
    await checkSelect2(ctx);
  }
};
