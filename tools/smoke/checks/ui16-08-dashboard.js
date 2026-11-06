/**
 * ui16-08: the FOG 1.6 dashboard layout and theme-aware charts (issue #152).
 *
 * It proves the 1.6 card layout on /, that each chart takes its colors from
 * the --fog-chart-* tokens (assets/styles/zz-fog-ui.css) and recolors on
 * fog:themechange with no reload, and the 1.6 bandwidth controls: Real Time
 * Off stops the redraw but not the /bandwidth poll, On redraws at once with
 * the kept samples, and Transmit/Receive picks the plotted direction.
 * tools/smoke/ui.js runs this file (see the comment at its top).
 *
 * A fresh CI database has no storage node, so the activity doughnut would
 * show its empty "No activity" ring. The check adds one enabled storage node
 * through the API for the run, and removes it after. /bandwidth answers from
 * a route here with a fixed transmit and receive rate, so the plotted
 * direction is known.
 */

const expect = (what, actual, expected) => {
  if (actual !== expected) throw new Error(`${what} is ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
};

// The /bandwidth answer: bytes per second. 250000 B/s is 2 Mbps, 125000 B/s
// is 1 Mbps (views/pages/partials/dashboard.js converts to Mbps).
const TX_MBPS = 2;
const RX_MBPS = 1;
const BANDWIDTH = {default_iface: 'smoke0', netstats: [{iface: 'smoke0', tx_sec: 250000, rx_sec: 125000}]};

// The cards in the one .row.gy-3, in order: their column class and title.
const CARDS = [
  {col: 'col-md-4', title: 'System Overview'},
  {col: 'col-md-4', title: 'Storage Group Activity'},
  {col: 'col-md-4', title: 'Storage Node Disk Usage'},
  {col: 'col-12', title: 'Imaging Over the last'},
  {col: 'col-12', title: 'Bandwidth'}
];

// A same-origin AJAX call: api/policies/apiCsrfGuard.js wants X-Requested-With.
const api = (page, method, url, body) => page.evaluate(async ({method, url, body}) => {
  const res = await fetch(url, {
    method,
    headers: {'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest'},
    body: body && JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`${method} ${url} answered ${res.status}`);
  return res.json();
}, {method, url, body});

// The token values, and each chart's colors as Chart.js resolved them: the
// x-tick color of each line chart, and the drawn legend label colors and
// dataset colors of each doughnut.
const readCharts = (page) => page.evaluate(() => {
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const chart = (id) => Chart.getChart(document.getElementById(id));
  const line = (id) => ({tick: chart(id).scales.x.options.ticks.color});
  const doughnut = (id) => ({
    labels: chart(id).data.labels,
    colors: chart(id).data.datasets[0].backgroundColor,
    legend: [...new Set(chart(id).legend.legendItems.map((item) => item.fontColor))]
  });
  return {
    tokens: {
      text: css('--fog-chart-text'), legend: css('--fog-chart-legend'),
      free: css('--fog-chart-free'), queued: css('--fog-chart-queued'), active: css('--fog-chart-active'),
      empty: css('--fog-chart-empty')
    },
    taskHistory: line('taskHistory'),
    bandwidth: line('bandwidth'),
    activity: doughnut('activityUsage'),
    disk: doughnut('diskUsage')
  };
});

// Every chart color must equal its token in the current theme.
function checkColors(theme, c) {
  for (const id of ['taskHistory', 'bandwidth']) {
    expect(`the ${theme} ${id} x-tick color`, c[id].tick, c.tokens.text);
  }
  for (const id of ['activity', 'disk']) {
    expect(`the ${theme} ${id} legend label colors`, JSON.stringify(c[id].legend), JSON.stringify([c.tokens.legend]));
  }
  expect(`the ${theme} activity colors`, JSON.stringify(c.activity.colors),
    JSON.stringify([c.tokens.free, c.tokens.queued, c.tokens.active]));
  expect(`the ${theme} disk usage colors`, JSON.stringify(c.disk.colors), JSON.stringify([c.tokens.free, c.tokens.queued]));
}

async function setTheme(page, theme) {
  await page.evaluate((t) => {
    document.documentElement.setAttribute('data-bs-theme', t);
    document.dispatchEvent(new CustomEvent('fog:themechange', {detail: {dark: t === 'dark'}}));
  }, theme);
}

const bandwidthData = (page) => page.evaluate(() => Chart.getChart(document.getElementById('bandwidth')).data.datasets[0].data);
const text = (page, sel) => page.evaluate((s) => document.querySelector(s).textContent.replace(/\s+/g, ' ').trim(), sel);
const active = (page, sel) => page.evaluate((s) => document.querySelector(s).classList.contains('active'), sel);

async function checkLayout(page) {
  const cards = await page.evaluate(() => [...document.querySelectorAll('.app-main .row.gy-3 > div')].map((col) => ({
    col: col.className,
    title: (col.querySelector(':scope > .card.card-primary.card-outline > .card-header > h4.card-title') || {}).textContent
  })));
  expect('the dashboard cards', JSON.stringify(cards), JSON.stringify(CARDS));
  expect('the .col-md-4 > .card.card-primary.card-outline count',
    await page.locator('.col-md-4 > .card.card-primary.card-outline').count(), 3);
  expect('the Imaging range link that is active', await text(page, '.graph-days.active'), '30 Days');
}

async function checkTheme(page) {
  const before = await page.evaluate(() => document.documentElement.getAttribute('data-bs-theme'));
  try {
    await setTheme(page, 'light');
    const light = await readCharts(page);
    expect('the activity doughnut labels', JSON.stringify(light.activity.labels), JSON.stringify(['Free', 'Queued', 'Active']));
    checkColors('light', light);
    await setTheme(page, 'dark');
    const dark = await readCharts(page);
    checkColors('dark', dark);
    if (dark.tokens.text === light.tokens.text) throw new Error(`--fog-chart-text is ${dark.tokens.text} in both themes`);
    if (dark.tokens.legend === light.tokens.legend) throw new Error(`--fog-chart-legend is ${dark.tokens.legend} in both themes`);
    // The empty "No activity" ring is not on screen here (the check adds a
    // storage node), so prove its token follows the theme.
    if (!light.tokens.empty || dark.tokens.empty === light.tokens.empty) {
      throw new Error(`--fog-chart-empty is "${light.tokens.empty}" light and "${dark.tokens.empty}" dark`);
    }
  } finally {
    await setTheme(page, before || 'light');
  }
}

async function checkBandwidth(page, requests) {
  expect('Transmit is active at first', await active(page, '#graph-bandwidth-filters-transmit'), true);
  expect('the bandwidth title', await text(page, '#graph-bandwidth-title'), 'Bandwidth - Transmit');
  expect('the time title', await text(page, '#graph-bandwidth-time-title'), 'Time - 2 Minutes');
  expect('Real Time On is active at first', await active(page, '#btn-on'), true);
  const plotted = await bandwidthData(page);
  expect('the plotted transmit rates', JSON.stringify([...new Set(plotted)]), JSON.stringify([TX_MBPS]));
  const tick = await page.evaluate(() => Chart.getChart(document.getElementById('bandwidth')).scales.y.ticks[0].label);
  if (!/^\d+\.\d{2} Mbps$/.test(tick)) throw new Error(`the bandwidth y tick reads "${tick}", expected Mbps with two decimals`);

  await page.click('#btn-off');
  expect('Real Time Off is active after the click', await active(page, '#btn-off'), true);
  const frozen = (await bandwidthData(page)).length;
  const sent = requests.count;
  await page.waitForTimeout(6000);
  expect('the bandwidth data length while Off', (await bandwidthData(page)).length, frozen);
  if (requests.count <= sent) throw new Error('no /bandwidth request was sent while Real Time was Off');

  await page.click('#btn-on');
  const grown = (await bandwidthData(page)).length;
  if (grown <= frozen) throw new Error(`On did not redraw the kept samples: ${grown} points, ${frozen} before`);

  await page.click('#graph-bandwidth-filters-receive');
  expect('the bandwidth title after Receive', await text(page, '#graph-bandwidth-title'), 'Bandwidth - Receive');
  expect('Transmit is active after Receive', await active(page, '#graph-bandwidth-filters-transmit'), false);
  expect('the plotted receive rates', JSON.stringify([...new Set(await bandwidthData(page))]), JSON.stringify([RX_MBPS]));
}

module.exports = {
  name: 'ui16-08: FOG 1.6 dashboard layout and theme-aware charts',
  run: async ({page, checkPage}) => {
    const requests = {count: 0};
    const onRequest = (r) => { if (new URL(r.url()).pathname === '/bandwidth') requests.count++; };
    await page.route('**/bandwidth', (route) => route.fulfill({json: BANDWIDTH}));
    page.on('request', onRequest);
    let node;
    try {
      await checkPage(page, {path: '/'});
      node = await api(page, 'POST', '/api/v1/storagenode',
        {name: `ui-smoke-152-${Date.now()}`, ip: '127.0.0.1', path: '/images/', maxClients: 10, isEnabled: true});
      await checkPage(page, {path: '/'});
      await page.waitForFunction(() => ['taskHistory', 'bandwidth'].every((id) => {
        const chart = Chart.getChart(document.getElementById(id));
        return chart && chart.data.datasets[0].data.length > 0;
      }), null, {timeout: 10000});
      await checkLayout(page);
      await checkTheme(page);
      await checkBandwidth(page, requests);
    } finally {
      page.off('request', onRequest);
      await page.unroute('**/bandwidth');
      if (node) await api(page, 'DELETE', `/api/v1/storagenode/${node.id}`);
    }
  }
};
