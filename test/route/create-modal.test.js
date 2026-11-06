const assert = require('assert');
const supertest = require('supertest');

// GET /<plural>/create?modal=1 renders the form alone for fogCreateModal
// (issue #149): no layout, so no sidebar. Without ?modal=1 the page has the
// layout and no modal root.
describe('Create modal routes::', () => {
  const app = () => sails.hooks.http.app;
  const HTML = ['Accept', 'text/html'];

  // Signs in as a browser does: a CSRF token for the login form, then the form POST.
  async function signIn(username, password) {
    const agent = supertest.agent(app());
    const {body} = await agent.get('/csrfToken').expect(200);
    await agent.post('/login').type('form').set(...HTML)
      .send({username, password, _csrf: body._csrf})
      .expect(302).expect('Location', '/');
    return agent;
  }

  let agent;
  before(async () => {
    agent = await signIn('mochatestadmin', 'mochatestadmin');
  });

  it('renders the storage group form alone with ?modal=1', async () => {
    const res = await agent.get('/storagegroups/create?modal=1').set(...HTML).expect(200);
    assert.ok(res.text.includes('data-fog-create-modal'));
    assert.ok(res.text.includes('data-title="Create New Storage Group"'));
    assert.ok(/name="_csrf"/.test(res.text));
    assert.ok(!res.text.includes('app-sidebar'));
  });

  it('renders the storage group page with the layout and no modal root', async () => {
    const res = await agent.get('/storagegroups/create').set(...HTML).expect(200);
    assert.ok(res.text.includes('app-sidebar'));
    assert.ok(!res.text.includes('data-fog-create-modal'));
  });

  it('renders the snapin form alone with ?modal=1', async () => {
    const res = await agent.get('/snapins/create?modal=1').set(...HTML).expect(200);
    assert.ok(res.text.includes('data-title="Create New Snapin"'));
    assert.ok(!res.text.includes('app-sidebar'));
  });

  it('renders the printer form alone with ?modal=1', async () => {
    const res = await agent.get('/printers/create?modal=1').set(...HTML).expect(200);
    assert.ok(res.text.includes('data-title="Create New Printer"'));
    assert.ok(!res.text.includes('app-sidebar'));
  });
});
