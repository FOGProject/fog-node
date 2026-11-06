const assert = require('assert');
const supertest = require('supertest');

// The list page server side (issue #150): the per-column datatable search and
// _searchtypes, the table settings helper, and the locals the list view reads.
describe('List pages::', () => {
  const app = () => sails.hooks.http.app;
  const HTML = ['Accept', 'text/html'];
  const HOSTS = ['mocha150-alpha', 'mocha150-bravo'];
  const SETTINGS = ['FOG_TABLE_SCROLL_MODE', 'FOG_VIEW_DEFAULT_SCREEN'];

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
  const setSetting = (name, value) => sails.models.setting.create({name, value});

  let admin;
  before(async () => {
    await sails.models.host.destroy({name: {in: HOSTS}});
    await sails.models.setting.destroy({name: {in: SETTINGS}});
    admin = await signIn('mochatestadmin', 'mochatestadmin');
  });
  afterEach(() => sails.models.setting.destroy({name: {in: SETTINGS}}));
  after(() => sails.models.host.destroy({name: {in: HOSTS}}));

  describe('get-data column search::', () => {
    it('matches a part of the name, and reports _searchtypes', async () => {
      await sails.models.host.createEach(HOSTS.map((name) => ({name})));
      const res = await admin.agent.post('/api/v1/host/datatable')
        .set('Accept', 'application/json')
        .send({
          draw: 1,
          columns: [
            {data: 'name', searchable: true, search: {value: 'alpha'}},
            {data: 'image', searchable: true, search: {value: ''}},
            {data: 'macs', searchable: true, search: {value: ''}},
            {data: 'description', searchable: false, search: {value: ''}}
          ],
          order: [{column: 0, dir: 'asc'}]
        }).expect(200);
      const names = res.body.data.map((h) => h.name).filter((n) => HOSTS.includes(n));
      assert.deepStrictEqual(names, ['mocha150-alpha']);
      assert.strictEqual(res.body._searchtypes.name, 'string');
      assert.strictEqual(res.body._searchtypes.image, false);
      assert.strictEqual(res.body._searchtypes.macs, false);
      assert.strictEqual(res.body._searchtypes.description, false);
    });
  });

  describe('table-settings::', () => {
    const read = () => sails.helpers.tableSettings();

    it('defaults with no record, and creates none', async () => {
      assert.deepStrictEqual(await read(), {scrollMode: 'infinite', pageLength: 25});
      assert.strictEqual(await sails.models.setting.count({name: {in: SETTINGS}}), 0);
    });

    it('reads a paged record and a numeric page length', async () => {
      await setSetting('FOG_TABLE_SCROLL_MODE', ' Paged ');
      await setSetting('FOG_VIEW_DEFAULT_SCREEN', '50');
      assert.deepStrictEqual(await read(), {scrollMode: 'paged', pageLength: 50});
    });

    it('accepts -1 for all rows', async () => {
      await setSetting('FOG_VIEW_DEFAULT_SCREEN', -1);
      assert.strictEqual((await read()).pageLength, -1);
    });

    it('falls back to the defaults for bad values', async () => {
      await setSetting('FOG_TABLE_SCROLL_MODE', 'sideways');
      await setSetting('FOG_VIEW_DEFAULT_SCREEN', 'abc');
      assert.deepStrictEqual(await read(), {scrollMode: 'infinite', pageLength: 25});
      await sails.models.setting.update({name: 'FOG_VIEW_DEFAULT_SCREEN'}).set({value: 0});
      assert.strictEqual((await read()).pageLength, 25);
    });
  });

  describe('the list view locals::', () => {
    const page = (path) => admin.agent.get(path).set(...HTML).expect(200);

    it('/hosts renders the paged scroll mode from the setting', async () => {
      await setSetting('FOG_TABLE_SCROLL_MODE', 'paged');
      const res = await page('/hosts');
      assert.ok(/<input type="hidden" id="scrollMode" value="paged">/.test(res.text), 'no paged scrollMode input');
    });

    it('/tasks has no #deleteSelected, and /hosts has', async () => {
      assert.ok(!(await page('/tasks')).text.includes('id="deleteSelected"'));
      assert.ok((await page('/hosts')).text.includes('id="deleteSelected"'));
    });

    it('/roles has no data-edit-base, and /hosts has', async () => {
      assert.ok(!(await page('/roles')).text.includes('data-edit-base'));
      assert.ok((await page('/hosts')).text.includes('data-edit-base="/hosts"'));
    });
  });

  describe('table preferences per user::', () => {
    const KEY = 'dt./hosts.listtable';
    let other;
    let otherUser;
    before(async () => {
      await User.destroy({username: 'mocha150other'});
      otherUser = await User.create({username: 'mocha150other', password: 'mocha150other', email: 'mocha150other@example.com'}).fetch();
      other = await signIn('mocha150other', 'mocha150other');
    });
    after(async () => {
      await UserPref.destroy({user: otherUser.id});
      await User.destroy({username: 'mocha150other'});
      const me = await User.findOne({username: 'mochatestadmin'});
      await UserPref.destroy({user: me.id, key: KEY});
    });

    it('keeps the key of user A out of the map of user B', async () => {
      const value = {order: [[0, 'asc']], length: 50};
      const res = await admin.agent.post('/account/preferences')
        .set('Accept', 'application/json').set('X-CSRF-Token', admin.csrf)
        .send({key: KEY, value}).expect(200);
      assert.deepStrictEqual(res.body[KEY], value);
      const mine = await admin.agent.get('/account/preferences').set('Accept', 'application/json').expect(200);
      assert.deepStrictEqual(mine.body[KEY], value);
      const theirs = await other.agent.get('/account/preferences').set('Accept', 'application/json').expect(200);
      assert.ok(!(KEY in theirs.body), 'user B holds the key of user A');
    });
  });
});
