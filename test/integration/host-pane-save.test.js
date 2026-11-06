const assert = require('assert');
const supertest = require('supertest');

// A host edit tab is its own form (issue #149), so a save from the General
// tab carries only the General fields. general/save must update only the
// fields it receives and leave the macs and groups alone.
describe('Host pane save::', () => {
  const app = () => sails.hooks.http.app;
  const HTML = ['Accept', 'text/html'];
  const OLD = 'mocha149-pane-old';
  const NEW = 'mocha149-pane-new';

  // Signs in as a browser does: a CSRF token for the login form, then the
  // form POST, then a fresh token (the sign-in regenerates the session).
  async function signIn(username, password) {
    const agent = supertest.agent(app());
    let {body} = await agent.get('/csrfToken').expect(200);
    await agent.post('/login').type('form').set(...HTML)
      .send({username, password, _csrf: body._csrf})
      .expect(302).expect('Location', '/');
    ({body} = await agent.get('/csrfToken').expect(200));
    return {agent, csrf: body._csrf};
  }

  let admin;
  let host;
  before(async () => {
    await sails.models.host.destroy({name: {in: [OLD, NEW]}});
    admin = await signIn('mochatestadmin', 'mochatestadmin');
  });
  beforeEach(async () => {
    host = await sails.models.host.create({name: OLD, macs: ['aabbccddee01'], groups: ['mocha149']}).fetch();
  });
  // The host create made the Group mocha149 (group/ensure).
  afterEach(async () => {
    await sails.models.host.destroy({name: {in: [OLD, NEW]}});
    await sails.models.group.destroy({name: 'mocha149'});
  });

  it('saves the General fields and leaves the macs and groups unchanged', async () => {
    await admin.agent.post(`/hosts/edit/${host.id}`).type('form').set(...HTML)
      .send({_csrf: admin.csrf, name: NEW, description: 'x'})
      .expect(302);
    const after = await sails.models.host.findOne({id: host.id});
    assert.strictEqual(after.name, NEW);
    assert.strictEqual(after.description, 'x');
    assert.deepStrictEqual(after.macs, ['aabbccddee01']);
    assert.deepStrictEqual(after.groups, ['mocha149']);
  });
});
