const assert = require('assert');

// The info-card helper (issue #149): the FOG 1.6 facts card above the edit
// tabs. Called as the app calls it: .with() inside an await, with no .now().
describe('Info card helper::', () => {
  const P = 'mocha149-ic';
  const card = async (model, record) => sails.helpers.infoCard.with({model, record});
  const labelsOf = (html) => [...html.matchAll(/<div class="small text-secondary text-uppercase">([^<]*)<\/div>/g)].map((m) => m[1]);
  const valuesOf = (html) => [...html.matchAll(/<div class="fw-semibold">(.*?)<\/div>/g)].map((m) => m[1]);
  const node = (name, group, extra) => sails.models.storagenode.create(Object.assign({
    name, ip: '10.0.0.1', path: '/images', storagegroup: group.id
  }, extra)).fetch();

  const cleanup = async () => {
    await sails.models.storagenode.destroy({name: {startsWith: P}});
    await sails.models.storagegroup.destroy({name: {startsWith: P}});
  };
  before(cleanup);
  afterEach(cleanup);

  it('shows the three storage group facts in order, with no ID, Created or Updated label', async () => {
    const group = await sails.models.storagegroup.create({name: `${P}-group`}).fetch();
    await node(`${P}-master`, group, {isMaster: true});
    await node(`${P}-member`, group);
    const html = await card('storagegroup', await sails.models.storagegroup.findOne({id: group.id}).populateAll());

    assert.ok(html.includes('id="edit-info-card"'));
    assert.ok(html.includes('class="card mb-3"'));
    assert.deepStrictEqual(labelsOf(html), ['Storage Group', 'Master Node', 'Storage Nodes']);
    assert.deepStrictEqual(valuesOf(html), [`${P}-group`, `${P}-master`, '2']);
    ['ID', 'Created', 'Updated'].forEach((l) => assert.ok(!labelsOf(html).includes(l), `unexpected label ${l}`));
  });

  it('shows None and 0 for a storage group with no nodes', async () => {
    const group = await sails.models.storagegroup.create({name: `${P}-empty`}).fetch();
    const html = await card('storagegroup', await sails.models.storagegroup.findOne({id: group.id}).populateAll());
    assert.deepStrictEqual(labelsOf(html), ['Storage Group', 'Master Node', 'Storage Nodes']);
    assert.deepStrictEqual(valuesOf(html), [`${P}-empty`, 'None', '0']);
  });

  it('shows None when the group has nodes but none is the master', async () => {
    const group = await sails.models.storagegroup.create({name: `${P}-nomaster`}).fetch();
    await node(`${P}-member`, group);
    const html = await card('storagegroup', await sails.models.storagegroup.findOne({id: group.id}).populateAll());
    assert.deepStrictEqual(valuesOf(html), [`${P}-nomaster`, 'None', '1']);
  });

  it('shows an em dash for an empty fact', async () => {
    // The model requires a path, so the record is passed in without one.
    const html = await card('storagenode', {name: `${P}-node`, isMaster: false, maxClients: 10});
    const values = valuesOf(html);
    assert.deepStrictEqual(labelsOf(html), ['Storage Node', 'Storage Group', 'Role', 'Image Path', 'Max Clients']);
    assert.strictEqual(values[3], '<span class="text-muted">&mdash;</span>');
    assert.strictEqual(values[1], '<span class="text-muted">&mdash;</span>');
    assert.strictEqual(values[0], `${P}-node`);
  });

  it('escapes a value', async () => {
    const html = await card('storagenode', {name: '"><b>x</b>', path: '/images'});
    assert.ok(!html.includes('<b>x</b>'));
    assert.ok(html.includes('&quot;&gt;&lt;b&gt;x&lt;/b&gt;'));
  });
});
