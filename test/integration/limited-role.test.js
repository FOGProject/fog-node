const assert = require('assert');
const supertest = require('supertest');

// Issue #168: the models merged a limited (non-admin) role into
// sails.config.permissions. The first limited role to save, show or sign in
// replaced the shared defaults for the whole process. An admin then held only
// that subset until the next restart.
describe('Limited role permissions::', () => {
  const app = () => sails.hooks.http.app;
  const HTML = ['Accept', 'text/html'];
  const USERNAME = 'mocha-limited';
  const PASSWORD = 'mocha-limited-pw';
  const ROLE_A = 'mocha168-role-a';
  const ROLE_B = 'mocha168-role-b';

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

  // The defaults with every leaf true: what an admin holds.
  const allTrue = (node) => _.mapValues(node, (value) => (
    value !== null && typeof value === 'object' ? allTrue(value) : true
  ));

  const cleanup = async () => {
    await User.destroy({username: USERNAME});
    await Role.destroy({name: {in: [ROLE_A, ROLE_B]}});
  };

  let defaults;
  let roleA;
  before(async () => {
    defaults = _.cloneDeep(sails.config.permissions);
    await cleanup();
    // The example from the issue: role A holds a key the defaults do not have.
    roleA = await Role.create({name: ROLE_A, permissions: {stock: {host: {read: true}, bogus: {x: true}}}}).fetch();
    const roleB = await Role.create({name: ROLE_B, permissions: {stock: {image: {read: true}}}}).fetch();
    await User.create({
      username: USERNAME,
      password: PASSWORD,
      email: 'mocha-limited@example.com',
      roles: [roleA.id, roleB.id]
    });
  });
  after(cleanup);

  it('saves and shows a limited role without unknown keys, and leaves the defaults unchanged', async () => {
    const stored = await Role.findOne({id: roleA.id});
    assert.strictEqual(stored.permissions.stock.host.read, true);
    assert.strictEqual(stored.permissions.stock.host.update, false);
    assert.ok(!_.has(stored.permissions.stock, 'bogus'), 'the role stored an unknown key');

    const shown = JSON.parse(JSON.stringify(stored));
    assert.strictEqual(shown.permissions.stock.host.read, true);
    assert.strictEqual(shown.permissions.stock.image.read, false);
    assert.ok(!_.has(shown.permissions.stock, 'bogus'), 'the role showed an unknown key');

    assert.deepStrictEqual(sails.config.permissions, defaults);
  });

  it('signs a user in with the union of both roles, and leaves the defaults unchanged', async () => {
    const limited = await signIn(USERNAME, PASSWORD);
    const {body} = await limited.agent.get('/api/v1/user/me').expect(200);
    assert.strictEqual(body.permissions.stock.host.read, true);
    assert.strictEqual(body.permissions.stock.image.read, true);
    assert.strictEqual(body.permissions.stock.host.update, false);
    assert.ok(!_.has(body.permissions.stock, 'bogus'), 'the user holds an unknown key');

    assert.deepStrictEqual(sails.config.permissions, defaults);
  });

  it('still grants an admin every permission after a limited user signs in', async () => {
    await signIn(USERNAME, PASSWORD);
    const admin = await signIn('mochatestadmin', 'mochatestadmin');
    const {body} = await admin.agent.get('/api/v1/user/me').expect(200);
    assert.strictEqual(body.permissions.stock.image.deploy, true);
    assert.deepStrictEqual(body.permissions, allTrue(defaults));
  });

  it('leaves the stored permissions alone on an update that names neither permissions nor isAdmin', async () => {
    await Role.updateOne({id: roleA.id}).set({description: 'x'});
    const stored = await Role.findOne({id: roleA.id});
    assert.strictEqual(stored.description, 'x');
    assert.strictEqual(stored.permissions.stock.host.read, true);
  });
});
