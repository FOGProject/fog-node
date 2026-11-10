const assert = require('assert');
const crypto = require('crypto');
const supertest = require('supertest');

// The Pending Agents and Agent Tokens pages, the Hosts sidebar links and the
// dashboard callouts. The rows of both pages come from the admin JSON routes
// (agent-admin.test.js); this file proves the pages answer, check host.read,
// and carry the 1.6 titles, columns and buttons.
describe('Agent pages::', function () {
  // GET / runs the systeminformation probes in pages/dashboard.js (slow on Windows).
  this.timeout(20000);

  const app = () => sails.hooks.http.app;
  const HTML = ['Accept', 'text/html'];
  const RUN = crypto.randomBytes(3).toString('hex');
  const PREFIX = 'mpa' + RUN;

  // Signs in as a browser does (see limited-role.test.js).
  async function signIn(username, password) {
    const agent = supertest.agent(app());
    let res = await agent.get('/csrfToken').expect(200);
    await agent.post('/login').type('form').set(...HTML)
      .send({username, password, _csrf: res.body._csrf})
      .expect(302).expect('Location', '/');
    res = await agent.get('/csrfToken').expect(200);
    return {agent, csrf: res.body._csrf};
  }
  // A non-admin user whose role holds the given stock.host permissions.
  async function limited(label, host) {
    const name = `${PREFIX}-${label}`;
    const role = await sails.models.role.create({name, isAdmin: false, permissions: {stock: {host}}}).fetch();
    await sails.models.user.create({username: name, password: 'mocha-pages-pw', email: `${name}@example.com`, roles: [role.id]});
    return signIn(name, 'mocha-pages-pw');
  }

  const fingerprints = [];
  async function enrollmentRow(state = 'pending') {
    const fingerprint = crypto.randomBytes(32).toString('hex');
    fingerprints.push(fingerprint);
    return sails.models.agentenrollment.create({fingerprint, csr: 'x', hostname: PREFIX, state}).fetch();
  }
  async function cleanup() {
    await sails.models.agentenrollment.destroy({fingerprint: fingerprints});
    await sails.models.host.destroy({name: {startsWith: PREFIX}});
    await sails.models.user.destroy({username: {startsWith: PREFIX}});
    await sails.models.role.destroy({name: {startsWith: PREFIX}});
  }

  let admin;
  before(async () => {
    await cleanup();
    admin = await signIn('mochatestadmin', 'mochatestadmin');
  });
  afterEach(cleanup);

  const heads = (html) => [...html.matchAll(/<th>([^<]*)<\/th>/g)].map((m) => m[1]);

  describe('GET /hosts/pendingAgents', () => {
    it('answers 200 for an admin, with the 1.6 title, columns and no Delete selected', async () => {
      const res = await admin.agent.get('/hosts/pendingAgents').set(...HTML).expect(200);
      assert.ok(res.text.includes('<h4 class="card-title">All Pending Agents</h4>'), 'the title');
      assert.deepStrictEqual(heads(res.text), ['Host', 'Reason', 'Platform', 'Agent', 'From', 'Identity', 'Requested']);
      assert.ok(!res.text.includes('id="deleteSelected"'), 'no Delete selected');
      assert.ok(!res.text.includes('data-edit-base'), 'no edit link base');
      assert.ok(!res.text.includes('data-selectable="false"'), 'rows are selectable');
      assert.ok(res.text.includes('data-singular="agent"') && res.text.includes('data-plural="agents"'));
    });

    it('answers 403 without host.read', async () => {
      const none = await limited('agents-none', {update: true, create: true, destroy: true});
      await none.agent.get('/hosts/pendingAgents').set(...HTML).expect(403);
    });
  });

  describe('GET /hosts/agentTokens', () => {
    it('answers 200 for an admin, with the 1.6 title, columns and no Delete selected', async () => {
      const res = await admin.agent.get('/hosts/agentTokens').set(...HTML).expect(200);
      assert.ok(res.text.includes('<h4 class="card-title">Agent Enrollment Tokens</h4>'), 'the title');
      assert.deepStrictEqual(heads(res.text), ['Name', 'State', 'Uses left', 'Expires', 'Created by', 'Created']);
      assert.ok(!res.text.includes('id="deleteSelected"'), 'no Delete selected');
      assert.ok(!res.text.includes('data-edit-base'), 'no edit link base');
      assert.ok(res.text.includes('data-singular="token"') && res.text.includes('data-plural="tokens"'));
    });

    it('answers 403 without host.read', async () => {
      const none = await limited('tokens-none', {update: true, create: true, destroy: true});
      await none.agent.get('/hosts/agentTokens').set(...HTML).expect(403);
    });
  });

  describe('the Hosts sidebar', () => {
    it('lists Pending Hosts, Pending Agents and Agent Tokens, in the 1.6 order', async () => {
      const html = (await admin.agent.get('/').set(...HTML).expect(200)).text;
      const links = ['/hosts/pending', '/hosts/pendingAgents', '/hosts/agentTokens'].map((href) => html.indexOf(`href="${href}"`));
      assert.ok(links.every((i) => i > 0), `all three links render: ${links}`);
      assert.ok(links[0] < links[1] && links[1] < links[2], 'in menu order');
    });
  });

  describe('the dashboard callouts', () => {
    const callout = (html, id) => (new RegExp(`<div[^>]*id="${id}"[^>]*>[\\s\\S]*?</div>`).exec(html) || [])[0];

    it('shows the agents callout only when an enrollment is pending, and links both callouts', async function () {
      // A development database can hold pending rows of its own; this test does not remove them.
      if (await sails.models.agentenrollment.count({state: 'pending'})) { this.skip(); }
      assert.strictEqual(callout((await admin.agent.get('/').set(...HTML).expect(200)).text, 'pendingAgentsCallout'), undefined);

      await enrollmentRow();
      const hosts = await sails.models.host.count({pending: true});
      if (!hosts) { await sails.models.host.create({name: `${PREFIX}-pending`, pending: true}); }
      let html = (await admin.agent.get('/').set(...HTML).expect(200)).text;
      let agents = callout(html, 'pendingAgentsCallout');
      assert.ok(agents, '#pendingAgentsCallout renders');
      assert.ok(/class="callout callout-warning alert-dismissible"/.test(agents), 'a dismissible warning callout');
      assert.ok(agents.includes('<h4>1 Pending agent</h4>'), 'its h4 reads "1 Pending agent"');
      assert.ok(agents.includes('Click <a href="/hosts/pendingAgents"><b>here</b></a> to review.'), 'it links to /hosts/pendingAgents');
      assert.ok(callout(html, 'pendingCallout').includes('<a href="/hosts/pending">'), 'the hosts callout links to /hosts/pending');

      await enrollmentRow();
      html = (await admin.agent.get('/').set(...HTML).expect(200)).text;
      assert.ok(callout(html, 'pendingAgentsCallout').includes('<h4>2 Pending agents</h4>'), 'its h4 reads "2 Pending agents"');
    });

    it('does not count a decided enrollment', async function () {
      if (await sails.models.agentenrollment.count({state: 'pending'})) { this.skip(); }
      await enrollmentRow('denied');
      await enrollmentRow('issued');
      assert.strictEqual(callout((await admin.agent.get('/').set(...HTML).expect(200)).text, 'pendingAgentsCallout'), undefined);
    });
  });
});
