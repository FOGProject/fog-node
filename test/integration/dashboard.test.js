const assert = require('assert');
const fs = require('fs');
const path = require('path');
const supertest = require('supertest');

// The FOG 1.6 dashboard layout (issue #152).
describe('Dashboard::', function () {
  // Each GET / runs the systeminformation probes in pages/dashboard.js. On
  // Windows they shell out to PowerShell, and one render takes over mocha's
  // 2000 ms default (CI tests (Windows, Node 22) timed out on all three).
  this.timeout(20000);
  const app = () => sails.hooks.http.app;
  const HOST = 'zq152-pending';

  let agent;
  before(async () => {
    agent = supertest.agent(app());
    let {body} = await agent.get('/csrfToken').expect(200);
    await agent.post('/login').type('form').set('Accept', 'text/html')
      .send({username: 'mochatestadmin', password: 'mochatestadmin', _csrf: body._csrf})
      .expect(302).expect('Location', '/');
  });
  afterEach(() => sails.models.host.destroy({name: HOST}));

  const dashboard = async () => (await agent.get('/').set('Accept', 'text/html').expect(200)).text;
  // The #pendingCallout element, from its opening tag to its closing </div>.
  const callout = (html) => (/<div[^>]*id="pendingCallout"[^>]*>[\s\S]*?<\/div>/.exec(html) || [])[0];

  it('shows no pending callout with no pending host', async function () {
    // api/controllers/pages/dashboard.js counts Host.pending. A development
    // database can hold pending hosts of its own; this test does not remove them.
    if (await sails.models.host.count({pending: true})) { this.skip(); }
    assert.strictEqual(callout(await dashboard()), undefined);
  });

  it('shows the 1.6 callout for one pending host', async () => {
    // On an empty database (CI) this is the "1 Pending host" case.
    const n = await sails.models.host.count({pending: true}) + 1;
    const title = n === 1 ? '1 Pending host' : `${n} Pending hosts`;
    await sails.models.host.create({name: HOST, pending: true});
    const html = callout(await dashboard());
    assert.ok(html, '#pendingCallout renders');
    assert.ok(/class="callout callout-warning alert-dismissible"/.test(html), 'it is a dismissible warning callout');
    assert.ok(/<button[^>]*class="btn-close"[^>]*data-bs-dismiss="alert"/.test(html), 'it has a .btn-close that dismisses it');
    assert.ok(html.includes(`<h4>${title}</h4>`), `its h4 reads "${title}"`);
    assert.ok(html.includes('Click <a href="/hosts/pending"><b>here</b></a> to review.'), 'it links to /hosts/pending');
  });

  it('renders the three 1.6 cards across the top', async () => {
    const html = await dashboard();
    const titles = [...html.matchAll(/<div class="col-md-4">\s*<div class="card card-primary card-outline">\s*<div class="card-header">\s*<h4 class="card-title">([^<]*)<\/h4>/g)]
      .map((m) => m[1]);
    assert.deepStrictEqual(titles, ['System Overview', 'Storage Group Activity', 'Storage Node Disk Usage']);
  });

  it('holds no hex color literal in the chart script', () => {
    const script = fs.readFileSync(path.join(__dirname, '..', '..', 'views', 'pages', 'partials', 'dashboard.js'), 'utf8');
    const hex = script.match(/#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/gi);
    assert.strictEqual(hex, null, `the script names ${hex}`);
  });
});
