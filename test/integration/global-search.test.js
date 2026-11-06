const assert = require('assert');
const supertest = require('supertest');

// The global search (issue #153): GET /api/v1/search, which the sidebar
// select2 box reads, and the /search page, which renders the same groups.
describe('Global search::', () => {
  const app = () => sails.hooks.http.app;
  const TERM = 'zq153lab';
  // 12 hosts whose names hold the term: two start with it, ten do not.
  // `B-<term>` proves the case-insensitive name order: byte order would put it
  // before `a-<term>`.
  const OTHERS = [`B-${TERM}`].concat(Array.from({length: 9}, (v, i) => `m-${TERM}-${String(i).padStart(2, '0')}`));
  const HOSTS = [`${TERM}-b`, `a-${TERM}`, `${TERM}-a`].concat(OTHERS);
  // The 1.6 order: the prefix matches first, then all by name, ignoring case.
  const ORDER = [`${TERM}-a`, `${TERM}-b`, `a-${TERM}`].concat(OTHERS);

  let agent;
  before(async () => {
    await sails.models.host.destroy({name: {in: HOSTS}});
    await sails.models.host.createEach(HOSTS.map((name) => ({name})));
    agent = supertest.agent(app());
    let {body} = await agent.get('/csrfToken').expect(200);
    await agent.post('/login').type('form').set('Accept', 'text/html')
      .send({username: 'mochatestadmin', password: 'mochatestadmin', _csrf: body._csrf})
      .expect(302).expect('Location', '/');
  });
  after(() => sails.models.host.destroy({name: {in: HOSTS}}));

  // The host group of /api/v1/search?q=TERM, with an optional limit.
  async function hostGroup(limit) {
    let query = {q: TERM};
    if (limit !== undefined) { query.limit = limit; }
    const res = await agent.get('/api/v1/search').query(query).set('Accept', 'application/json').expect(200);
    assert.ok(Array.isArray(res.body), 'the response is an array');
    return res.body.find((g) => g.model === 'host');
  }
  const names = (group) => group.items.map((it) => it.name);

  it('returns the group fields, with the 1.6 singular label', async () => {
    const group = await hostGroup();
    assert.deepStrictEqual(Object.keys(group).sort(), ['items', 'label', 'model', 'plural', 'singular']);
    assert.strictEqual(group.model, 'host');
    assert.strictEqual(group.label, 'Hosts');
    assert.strictEqual(group.singular, 'Host');
    assert.strictEqual(group.plural, 'hosts');
    assert.deepStrictEqual(Object.keys(group.items[0]).sort(), ['id', 'name']);
  });

  it('caps each type at a positive limit', async () => {
    assert.deepStrictEqual(names(await hostGroup(2)), ORDER.slice(0, 2));
    assert.deepStrictEqual(names(await hostGroup(999)), ORDER);
  });

  for (const limit of [undefined, '0', 'abc', '-3']) {
    it(`returns every match for limit=${limit}`, async () => {
      assert.deepStrictEqual(names(await hostGroup(limit)), ORDER);
    });
  }

  it('puts the names that start with the term first, then sorts by name', async () => {
    const got = names(await hostGroup());
    assert.ok(got.indexOf(`${TERM}-b`) < got.indexOf(`a-${TERM}`), 'the prefix match comes before a-<term>');
    assert.ok(got.indexOf(`${TERM}-a`) < got.indexOf(`${TERM}-b`), '<term>-a comes before <term>-b');
  });

  it('still renders the host group on the /search page', async () => {
    const res = await agent.get('/search').query({q: TERM}).set('Accept', 'text/html').expect(200);
    assert.ok(res.text.includes('Hosts (10)'), 'the page shows the Hosts heading with the default limit of 10');
    assert.ok(res.text.includes(`>${TERM}-a</a>`), 'the page links the first host');
  });
});
