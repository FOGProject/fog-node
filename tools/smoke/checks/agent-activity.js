/**
 * The Agent Activity page (issue #207).
 *
 * It proves, in a browser, that GET /agent-activity loads with a group header
 * that shows the host name and its event count, and that the expand toggle
 * loads the host's events. The smoke run empties its database, so the check
 * makes its own data: a host with a MAC (POST /api/v1/host), then an agent
 * enrollment for that MAC (POST /agent/v1/enroll), which writes an agent.enroll
 * row for the host. The MAC is in colon form: the enroll route drops a bare
 * 12-digit MAC. The check deletes the host at the end. tools/smoke/ui.js runs
 * this file (see the comment at its top).
 */

const crypto = require('crypto');
const enroll = require('../lib/agent-enroll');

const expect = (what, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what} is ${a}, expected ${e}`);
};

// Same-origin AJAX passes api/policies/apiCsrfGuard.js on /api/v1 mutations.
const AJAX = {'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json'};

module.exports = {
  name: 'agent-activity: the Agent Activity page',
  run: async ({page, base, checkPage}) => {
    const name = `aa-smoke-${crypto.randomBytes(4).toString('hex')}`;
    // A locally administered MAC (02:...), in colon form.
    const mac = ['02', ...crypto.randomBytes(5).toString('hex').match(/../g)].join(':');

    const made = await page.request.post(`${base}/api/v1/host`, {headers: AJAX, data: {name, macs: [mac]}});
    if (!made.ok()) throw new Error(`POST /api/v1/host answered ${made.status()}`);
    const host = await made.json();
    try {
      // The enrollment, as the agent sends it: a real CSR over HTTP.
      const enrolled = await enroll(page, base, {hostname: name, macs: [mac]});
      if (![200, 202].includes(enrolled.status())) throw new Error(`POST /agent/v1/enroll answered ${enrolled.status()}`);

      await checkPage(page, {path: '/agent-activity', table: true});
      expect('the visible headings', (await page.locator('#listtable thead th').allInnerTexts()).map((t) => t.trim()), ['When', 'Event', 'Detail', 'Outcome']);
      const group = page.locator('#listtable tbody tr.dtrg-group', {hasText: name});
      await group.first().waitFor({timeout: 10000});
      const header = (await group.first().innerText()).trim();
      if (!/ - \d+ events?/.test(header)) throw new Error(`the group header is ${JSON.stringify(header)}, expected the event count`);

      // The expand toggle loads the host's events.
      const loaded = page.waitForResponse((r) => r.url().endsWith('/api/v1/agent-activity/host') && r.request().method() === 'POST', {timeout: 10000});
      await group.first().locator('.fog-aa-toggle').click();
      expect('the status of the host events request', (await loaded).status(), 200);
      await page.locator('#listtable tbody tr.dtrg-group', {hasText: name}).locator('.fog-aa-toggle', {hasText: 'Collapse'}).waitFor({timeout: 10000});
      const rows = await page.locator('#listtable tbody tr:not(.dtrg-group):not(.dt-empty)').count();
      if (rows < 1) throw new Error('the expanded host shows no event row');
    } finally {
      await page.request.delete(`${base}/api/v1/host`, {headers: AJAX, data: {id: [host.id]}});
    }
  }
};
