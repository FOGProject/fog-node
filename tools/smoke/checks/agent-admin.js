/**
 * agent-admin: the fog-agent admin pages (Pending Hosts, Pending Agents,
 * Agent Tokens).
 *
 * It proves, in the browser: "Delete selected" on Pending Hosts sends
 * DELETE /api/v1/host/pending and removes the pending host; on /images it
 * still sends DELETE /api/v1/image; Pending Agents has no "Delete selected"
 * button; "Create token" shows a 48-hex token once, and "Revoke selected"
 * removes the token row. It seeds a pending host and an image over HTTP, as
 * ui16-03-shell.js does, and deletes what the UI did not. tools/smoke/ui.js
 * runs this file (see the comment at its top).
 */

const expect = (what, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what} is ${a}, expected ${e}`);
};

// Same-origin AJAX passes api/policies/apiCsrfGuard.js on /api/v1 mutations.
const AJAX = {'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json'};

// Opens a list with ?search= as its starting search, and waits for its rows.
async function openList({page, checkPage}, path, search) {
  await checkPage(page, {path: `${path}?search=${encodeURIComponent(search)}`, table: true});
  await page.locator('#listtable tbody tr', {hasText: search}).first().waitFor({timeout: 10000});
}

// A server value that holds markup must show as text: at least `cells` cells
// hold exactly `literal`, the table holds no element of the tags in `tags`,
// and the `onerror` of a seeded <img> has not run (window.__xss stays undefined).
async function expectLiteral(page, path, literal, tags, cells = 1) {
  const got = await page.evaluate(({literal, tags}) => ({
    cells: [...document.querySelectorAll('#listtable tbody td')].filter((td) => td.textContent === literal).length,
    elements: tags.reduce((n, tag) => n + document.querySelectorAll(`#listtable ${tag}`).length, 0),
    xss: typeof window.__xss
  }), {literal, tags});
  expect(`${path}: at least ${cells} cell(s) show ${literal} as text`, got.cells >= cells, true);
  expect(`${path}: the number of ${tags.join(', ')} elements in the table`, got.elements, 0);
  expect(`${path}: typeof window.__xss`, got.xss, 'undefined');
}

// Selects the row that holds `text` (not its first cell, which can be a link).
async function selectRow(page, text) {
  await page.locator('#listtable tbody tr', {hasText: text}).first().locator('td').nth(1).click();
}

// Clicks "Delete selected", confirms, and returns the DELETE request it sent.
async function deleteSelected(page) {
  const sent = page.waitForRequest((r) => r.method() === 'DELETE' && r.url().includes('/api/v1/'), {timeout: 10000});
  await page.click('#deleteSelected');
  await page.locator('.modal.show [data-fog-confirm]').click();
  const request = await sent;
  return {path: new URL(request.url()).pathname, body: request.postDataJSON()};
}

async function pendingHostsDelete(ctx, stamp) {
  const {page, base} = ctx;
  const name = `uiagent-${stamp}`;
  const res = await page.request.post(`${base}/api/v1/host`, {
    headers: AJAX, data: {name, pending: true, macs: [`02aa${String(stamp).slice(-8).padStart(8, '0')}`]}
  });
  if (!res.ok()) throw new Error(`POST /api/v1/host answered ${res.status()}`);
  const {id} = await res.json();
  try {
    await openList(ctx, '/hosts/pending', name);
    await selectRow(page, name);
    const sent = await deleteSelected(page);
    expect('the Pending Hosts delete path', sent.path, '/api/v1/host/pending');
    expect('the Pending Hosts delete body', sent.body, {id: [id]});
    await page.locator('#listtable tbody tr', {hasText: name}).waitFor({state: 'detached', timeout: 10000});
    const gone = await page.request.get(`${base}/api/v1/host/${id}`, {headers: AJAX});
    expect('the deleted pending host is still answered', (await gone.text()).includes(name), false);
  } finally {
    // The host is already gone when the UI delete worked; a second delete is harmless.
    await page.request.delete(`${base}/api/v1/host`, {headers: AJAX, data: {id: [id]}});
  }
}

async function imagesDelete(ctx, stamp) {
  const {page, base} = ctx;
  const name = `uiagent-img-${stamp}`;
  const res = await page.request.post(`${base}/api/v1/image`, {headers: AJAX, data: {name}});
  if (!res.ok()) throw new Error(`POST /api/v1/image answered ${res.status()}`);
  const {id} = await res.json();
  try {
    await openList(ctx, '/images', name);
    await selectRow(page, name);
    const sent = await deleteSelected(page);
    expect('the /images delete path', sent.path, '/api/v1/image');
    expect('the /images delete body', sent.body, {id: [id]});
    await page.locator('#listtable tbody tr', {hasText: name}).waitFor({state: 'detached', timeout: 10000});
  } finally {
    await page.request.delete(`${base}/api/v1/image`, {headers: AJAX, data: {id: [id]}});
  }
}

async function pendingAgentsNoDelete({page, checkPage}) {
  await checkPage(page, {path: '/hosts/pendingAgents', table: true});
  expect('/hosts/pendingAgents: #deleteSelected count', await page.locator('#deleteSelected').count(), 0);
  expect('/hosts/pendingAgents: Delete selected buttons', await page.getByRole('button', {name: 'Delete selected'}).count(), 0);
}

async function tokenCreateAndRevoke(ctx, stamp) {
  const {page} = ctx;
  const name = `uiagent-token-${stamp}`;
  await ctx.checkPage(page, {path: '/hosts/agentTokens', table: true});
  expect('/hosts/agentTokens: #deleteSelected count', await page.locator('#deleteSelected').count(), 0);

  await page.getByRole('button', {name: 'Create token'}).click();
  const form = page.locator('.modal.show');
  await form.locator('#tokenName').waitFor({state: 'visible', timeout: 10000});
  await form.locator('#tokenName').fill(name);
  await form.locator('[data-fog-confirm]').click();

  // The token shows once, in its own modal: 48 lowercase hex characters.
  const field = page.locator('#mintedToken');
  await field.waitFor({state: 'visible', timeout: 10000});
  const token = await field.inputValue();
  if (!/^[0-9a-f]{48}$/.test(token)) throw new Error(`the minted token is ${JSON.stringify(token)}, expected 48 hex characters`);
  const command = (await page.locator('#mintedCommand').innerText()).trim();
  expect('the sample command', command, `fog-agent enroll --server ${new URL(page.url()).origin} --ca ca.cert.pem --token ${token}`);
  expect('the CA download link', await page.locator('.modal.show a[download]').getAttribute('href'), '/management/other/ca.cert.pem');
  await page.locator('.modal.show [data-fog-confirm]').click();
  await page.locator('#mintedToken').waitFor({state: 'detached', timeout: 10000});
  const shown = await page.evaluate((t) => document.documentElement.outerHTML.includes(t), token);
  expect('the token is still in the page after Done', shown, false);

  // The list shows the row (never the token); "Revoke selected" removes it.
  await page.locator('#listtable tbody tr', {hasText: name}).first().waitFor({timeout: 10000});
  await selectRow(page, name);
  await page.getByRole('button', {name: 'Revoke selected'}).click();
  const sent = page.waitForRequest((r) => r.method() === 'DELETE' && r.url().includes('/api/v1/agent/token/'), {timeout: 10000});
  await page.locator('.modal.show [data-fog-confirm]').click();
  await sent;
  await page.locator('#listtable tbody tr', {hasText: name}).waitFor({state: 'detached', timeout: 10000});
}

// Markup in server values (an agent chooses its own version text; an admin
// names a token) must show as text on both list pages.
async function markupAsText(ctx) {
  const {page, base, checkPage} = ctx;
  const img = '<img src=x onerror=window.__xss=1>';
  const bold = '<b>t</b>';

  // An enrollment, as the agent sends it: a real CSR over HTTP (no MAC: no pending host is created).
  // The agent chooses its version, hostname and serial; each shows in its own cell.
  const crypto = require('crypto');
  const x509 = require('@peculiar/x509');
  const keys = await crypto.webcrypto.subtle.generateKey({name: 'ECDSA', namedCurve: 'P-256'}, true, ['sign', 'verify']);
  const csr = await x509.Pkcs10CertificateRequestGenerator.create({name: '', keys, signingAlgorithm: {name: 'ECDSA', hash: 'SHA-256'}});
  const enrolled = await page.request.post(`${base}/agent/v1/enroll`, {
    data: {protocol: 1, agent_version: img, os: 'linux', arch: 'amd64', hostname: img, identity: {macs: [], system_serial: img}, csr_pem: csr.toString('pem')}
  });
  expect('the status of POST /agent/v1/enroll', enrolled.status(), 202);
  const minted = await page.request.post(`${base}/api/v1/agent/token`, {
    headers: AJAX, data: {name: bold, uses: 1, expires: Date.now() + 3600 * 1000}
  });
  if (!minted.ok()) throw new Error(`POST /api/v1/agent/token answered ${minted.status()}`);
  const token = await minted.json();
  try {
    await checkPage(page, {path: '/hosts/pendingAgents', table: true});
    // Wait on the table data, not on the cell text: unescaped markup would not show as text.
    const loaded = (field, value) => page.waitForFunction(([f, v]) => jQuery('#listtable').DataTable().rows().data().toArray().some((r) => r[f] === v),
      [field, value], {timeout: 10000});
    await loaded('agentVersion', img);
    await expectLiteral(page, '/hosts/pendingAgents', img, ['img'], 3);
    await checkPage(page, {path: '/hosts/agentTokens', table: true});
    await loaded('name', bold);
    await expectLiteral(page, '/hosts/agentTokens', bold, ['b']);
  } finally {
    await page.request.delete(`${base}/api/v1/agent/token/${token.id}`, {headers: AJAX});
    // An enrollment has no delete. A denied row is final and leaves the pending list.
    const rows = await (await page.request.get(`${base}/api/v1/agent/enrollments`, {headers: AJAX})).json();
    for (const row of rows.data.filter((r) => r.agentVersion === img)) {
      await page.request.post(`${base}/api/v1/agent/enrollment/${row.id}/deny`, {headers: AJAX});
    }
  }
}

module.exports = {
  name: 'agent-admin: pending hosts, pending agents, agent tokens',
  run: async (ctx) => {
    const stamp = Date.now();
    await pendingHostsDelete(ctx, stamp);
    await imagesDelete(ctx, stamp);
    await pendingAgentsNoDelete(ctx);
    await tokenCreateAndRevoke(ctx, stamp);
    await markupAsText(ctx);
  }
};
