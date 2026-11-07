const assert = require('assert');
const supertest = require('supertest');

// Group grants (issue #170, FOG 1.6 ADR 0038): a Group grants printers and
// snapins to every current member and every host that joins later; a host
// that leaves loses them; a grant given directly to a host is never affected.
// The printer and snapin plugins own the grants (extends.group), and
// sails.plugins.groupResolve answers what each host gets.
describe('Group grants::', () => {
  const app = () => sails.hooks.http.app;
  const HTML = ['Accept', 'text/html'];
  const AJAX = ['X-Requested-With', 'XMLHttpRequest'];
  const P = 'mocha170-';
  // A well-formed id that names no record.
  const ABSENT = '0123456789abcdef01234567';
  const coll = (name) => sails.getDatastore(sails.models.host.datastore).manager.collection(name);
  const printerRows = (group) => coll('plugin_printer_group').find({group: String(group.id)}).sort({_id: 1}).toArray();
  const snapinRows = (group) => coll('plugin_snapin_group').find({group: String(group.id)}).sort({_id: 1}).toArray();

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

  // The limited-role pattern of group-membership.test.js: a non-admin Role
  // with the given stock permissions, a User in it, and a signed-in agent.
  async function limited(name, stock) {
    const role = await sails.models.role.create({name: `mocha-170-${name}`, isAdmin: false, permissions: {stock}}).fetch();
    await sails.models.user.create({
      username: `mocha-170-${name}`,
      password: 'mocha-170-password',
      email: `mocha-170-${name}@example.com`,
      roles: [role.id]
    });
    return signIn(`mocha-170-${name}`, 'mocha-170-password');
  }

  // A group edit tab's Update, as the browser's form POST, answered in JSON.
  const saveGroup = (user, group, fields) => user.agent.post(`/groups/edit/${group.id}`).type('form')
    .set('Accept', 'application/json').set(...AJAX)
    .send(Object.assign({_csrf: user.csrf}, fields));

  // Every mocha170 record, and the plugin rows that point at them.
  async function cleanup() {
    const groups = await sails.models.group.find({name: {startsWith: P}});
    const gids = groups.map((g) => String(g.id)).concat(ABSENT);
    await coll('plugin_printer_group').deleteMany({group: {$in: gids}});
    await coll('plugin_snapin_group').deleteMany({group: {$in: gids}});
    const hosts = await sails.models.host.find({name: {startsWith: P}});
    const hids = hosts.map((h) => String(h.id)).concat(ABSENT);
    await coll('plugin_printer_host').deleteMany({host: {$in: hids}});
    await coll('plugin_printer_hostcfg').deleteMany({host: {$in: hids}});
    await coll('plugin_snapin_host').deleteMany({host: {$in: hids}});
    await sails.models.host.destroy({name: {startsWith: P}});
    await sails.models.group.destroy({name: {startsWith: P}});
    await sails.models.printer.destroy({name: {startsWith: P}});
    await sails.models.snapin.destroy({name: {startsWith: P}});
    await sails.models.user.destroy({username: {startsWith: 'mocha-170-'}});
    await sails.models.role.destroy({name: {startsWith: 'mocha-170-'}});
  }

  let admin;
  let g1;
  let g2;
  let h1;
  let h2;
  let p1;
  let p2;
  let p3;
  let s1;
  let s2;

  // A membership change from the host list, and what a host resolves to.
  const bulk = (body) => admin.agent.post('/api/v1/host/bulk').set(...AJAX).send(body).expect(200);
  const resolve = async (host) => (await sails.plugins.groupResolve([host.id]))[String(host.id)];

  before(async () => {
    await cleanup();
    admin = await signIn('mochatestadmin', 'mochatestadmin');
    g1 = await sails.models.group.create({name: `${P}g1`, order: 0}).fetch();
    g2 = await sails.models.group.create({name: `${P}g2`, order: 1}).fetch();
    h1 = await sails.models.host.create({name: `${P}h1`}).fetch();
    h2 = await sails.models.host.create({name: `${P}h2`}).fetch();
    p1 = await sails.models.printer.create({name: `${P}p1`}).fetch();
    p2 = await sails.models.printer.create({name: `${P}p2`}).fetch();
    p3 = await sails.models.printer.create({name: `${P}p3`}).fetch();
    s1 = await sails.models.snapin.create({name: `${P}s1`}).fetch();
    s2 = await sails.models.snapin.create({name: `${P}s2`}).fetch();
  });
  after(cleanup);

  it('has the tabs General, Host Associations, Printer Associations and Snapin Associations, with the 1.6 help', async () => {
    const res = await admin.agent.get(`/groups/edit/${g1.id}`).set(...HTML).expect(200);
    const tabs = [...res.text.matchAll(/<a class="nav-link[^"]*" data-bs-toggle="tab"[^>]*>([^<]*)<\/a>/g)].map((m) => m[1]);
    assert.deepStrictEqual(tabs, ['General', 'Host Associations', 'Printer Associations', 'Snapin Associations']);
    assert.ok(res.text.includes('Group Printer Assignment'));
    assert.ok(res.text.includes('Group Default Printer'));
    assert.ok(res.text.includes('Group Snapin Assignment'));
    assert.ok(res.text.includes('A printer granted here reaches every host in this group, including hosts added later. ' +
      'Removing a host from the group takes the printer away again. A printer the host was given directly is ' +
      'unaffected either way.'));
    assert.ok(res.text.includes('The default printer for hosts in this group. A host that has its own default keeps it.'));
    assert.ok(res.text.includes('A snapin granted here reaches every host in this group, including hosts added later. ' +
      'Granting a snapin does not run it.'));
  });

  it('gives a host that joins later the group grants, as inherited', async () => {
    await saveGroup(admin, g1, {groupPrinters: [p1.id], groupSnapins: [s1.id]}).expect(200);
    await bulk({id: [h1.id], addGroups: [g1.name]});
    const got = await resolve(h1);
    assert.deepStrictEqual(got.printer, {printers: [String(p1.id)], default: null, inherited: [String(p1.id)]});
    assert.deepStrictEqual(got.snapin, {snapins: [String(s1.id)], inherited: [String(s1.id)]});
  });

  it('shows the grants as labels on the group datatable, snapins first, and none for a group with none', async () => {
    const res = await admin.agent.post('/api/v1/group/datatable').set('Accept', 'application/json')
      .send({
        draw: 1,
        columns: [
          {data: 'name', searchable: true, orderable: true, search: {value: ''}},
          {data: 'members', searchable: false, orderable: false, search: {value: ''}},
          {data: 'grants', searchable: false, orderable: false, search: {value: ''}}
        ],
        order: [{column: 0, dir: 'asc'}],
        search: {value: P, regex: false}
      }).expect(200);
    const row = (name) => res.body.data.find((g) => g.name === name);
    assert.deepStrictEqual(row(g1.name).grants_list, ['1 snapin', '1 printer']);
    assert.strictEqual(row(g1.name).grants, '1 snapin, 1 printer');
    assert.deepStrictEqual(row(g2.name).grants_list, []);
    assert.strictEqual(row(g2.name).grants, '');
  });

  it('takes the grants away from a host that leaves', async () => {
    await bulk({id: [h1.id], removeGroups: [g1.name]});
    const got = await resolve(h1);
    assert.deepStrictEqual(got.printer, {printers: [], default: null, inherited: []});
    assert.deepStrictEqual(got.snapin, {snapins: [], inherited: []});
  });

  it('lists a printer or snapin the host has directly and through a group once, at the host\'s place', async () => {
    await sails.plugins.hostSave(h1.id, {printers: [p2.id, p1.id], snapins: [s2.id, s1.id]});
    await bulk({id: [h1.id], addGroups: [g1.name]});
    const got = await resolve(h1);
    assert.deepStrictEqual(got.printer, {printers: [String(p2.id), String(p1.id)], default: null, inherited: []});
    assert.deepStrictEqual(got.snapin, {snapins: [String(s2.id), String(s1.id)], inherited: []});
  });

  it('keeps a direct grant when the host leaves', async () => {
    await bulk({id: [h1.id], removeGroups: [g1.name]});
    const got = await resolve(h1);
    assert.deepStrictEqual(got.printer.printers, [String(p2.id), String(p1.id)]);
    assert.deepStrictEqual(got.printer.inherited, []);
    assert.deepStrictEqual(got.snapin.snapins, [String(s2.id), String(s1.id)]);
    assert.deepStrictEqual(got.snapin.inherited, []);
  });

  it('grants a default printer that the group does not grant yet, and keeps it on a printer that stays', async () => {
    await saveGroup(admin, g2, {groupDefaultPrinter: p2.id}).expect(200);
    assert.deepStrictEqual((await printerRows(g2)).map((r) => [r.printer, r.isDefault]), [[String(p2.id), true]]);
    await saveGroup(admin, g2, {groupPrinters: [p3.id, p2.id]}).expect(200);
    assert.deepStrictEqual((await printerRows(g2)).map((r) => [r.printer, r.isDefault]),
      [[String(p2.id), true], [String(p3.id), false]]);
    // The Printer Associations tab sends both keys: the list, then the default.
    await saveGroup(admin, g2, {groupPrinters: [p2.id, p3.id], groupDefaultPrinter: p3.id}).expect(200);
    assert.deepStrictEqual((await printerRows(g2)).map((r) => [r.printer, r.isDefault]),
      [[String(p2.id), false], [String(p3.id), true]]);
    await saveGroup(admin, g2, {groupPrinters: [p2.id], groupDefaultPrinter: p2.id}).expect(200);
    assert.deepStrictEqual((await printerRows(g2)).map((r) => [r.printer, r.isDefault]), [[String(p2.id), true]]);
  });

  it('leaves the grants alone on a save from another tab, and clears them on an empty key', async () => {
    await saveGroup(admin, g2, {groupSnapins: [s2.id]}).expect(200);
    await saveGroup(admin, g2, {description: 'mocha170'}).expect(200);
    assert.strictEqual((await printerRows(g2)).length, 1);
    assert.strictEqual((await snapinRows(g2)).length, 1);
    await saveGroup(admin, g2, {groupSnapins: ['']}).expect(200);
    assert.strictEqual((await snapinRows(g2)).length, 0);
    assert.strictEqual((await printerRows(g2)).length, 1);
  });

  it('grants only catalog printers and snapins, and keeps the default on an unknown default id', async () => {
    await saveGroup(admin, g2, {groupPrinters: [p2.id, ABSENT, 'not-an-id'], groupSnapins: ['not-an-id']})
      .expect(200);
    assert.deepStrictEqual((await printerRows(g2)).map((r) => [r.printer, r.isDefault]), [[String(p2.id), true]]);
    assert.strictEqual((await snapinRows(g2)).length, 0);
    // A printer deleted after the page loaded: the default stays.
    await saveGroup(admin, g2, {groupDefaultPrinter: ABSENT}).expect(200);
    assert.deepStrictEqual((await printerRows(g2)).map((r) => [r.printer, r.isDefault]), [[String(p2.id), true]]);
  });

  // No destroy would ever delete a row for a record that does not exist.
  it('writes no plugin row for a save to a group or host that does not exist', async () => {
    await saveGroup(admin, {id: ABSENT}, {groupPrinters: [p1.id], groupDefaultPrinter: p1.id, groupSnapins: [s1.id]});
    assert.strictEqual(await coll('plugin_printer_group').countDocuments({group: ABSENT}), 0);
    assert.strictEqual(await coll('plugin_snapin_group').countDocuments({group: ABSENT}), 0);
    await admin.agent.post(`/hosts/edit/${ABSENT}`).type('form')
      .set('Accept', 'application/json').set(...AJAX)
      .send({_csrf: admin.csrf, printers: [p1.id], defaultPrinter: p1.id, snapins: [s1.id]});
    assert.strictEqual(await coll('plugin_printer_host').countDocuments({host: ABSENT}), 0);
    assert.strictEqual(await coll('plugin_printer_hostcfg').countDocuments({host: ABSENT}), 0);
    assert.strictEqual(await coll('plugin_snapin_host').countDocuments({host: ABSENT}), 0);
  });

  it('takes the default of the first group in the order `order`, name, id, and the host default over both', async () => {
    await saveGroup(admin, g1, {groupDefaultPrinter: p1.id}).expect(200);
    await bulk({id: [h2.id], addGroups: [g1.name, g2.name]});
    // G1 (order 0) before G2 (order 1).
    assert.strictEqual((await resolve(h2)).printer.default, String(p1.id));
    assert.deepStrictEqual((await resolve(h2)).printer.printers, [String(p1.id), String(p2.id)]);
    // Swapped: G2 (order 0) before G1 (order 1).
    await sails.models.group.updateOne({id: g1.id}).set({order: 1});
    await sails.models.group.updateOne({id: g2.id}).set({order: 0});
    assert.strictEqual((await resolve(h2)).printer.default, String(p2.id));
    assert.deepStrictEqual((await resolve(h2)).printer.printers, [String(p2.id), String(p1.id)]);
    // The same order: the name decides, without case.
    await sails.models.group.updateOne({id: g2.id}).set({order: 1});
    assert.strictEqual((await resolve(h2)).printer.default, String(p1.id));
    // The host's own default wins over both.
    await sails.plugins.hostSave(h2.id, {defaultPrinter: p3.id});
    assert.strictEqual((await resolve(h2)).printer.default, String(p3.id));
  });

  it('answers a key for every host id, with empty sets for a host in no group', async () => {
    const got = await sails.plugins.groupResolve([h1.id, h2.id, ABSENT]);
    assert.deepStrictEqual(Object.keys(got).sort(), [String(h1.id), String(h2.id), ABSENT].sort());
    assert.deepStrictEqual(got[ABSENT].printer, {printers: [], default: null, inherited: []});
    assert.deepStrictEqual(got[ABSENT].snapin, {snapins: [], inherited: []});
  });

  it('refuses a grant save without group.update with 403, and changes no row', async () => {
    const user = await limited('readonly', {group: {read: true}});
    const before = {printers: await printerRows(g1), snapins: await snapinRows(g1)};
    await saveGroup(user, g1, {groupPrinters: [p3.id], groupDefaultPrinter: p3.id, groupSnapins: [s2.id]}).expect(403);
    assert.deepStrictEqual(await printerRows(g1), before.printers);
    assert.deepStrictEqual(await snapinRows(g1), before.snapins);
  });

  // A grant save is a group edit (group.update), so a create grants nothing.
  it('writes no grant on a group create', async () => {
    const res = await admin.agent.post('/groups/create').type('form')
      .set('Accept', 'application/json').set(...AJAX)
      .send({_csrf: admin.csrf, name: `${P}created`, groupPrinters: [p1.id], groupSnapins: [s1.id]}).expect(200);
    const created = {id: res.body.id};
    assert.strictEqual((await printerRows(created)).length, 0);
    assert.strictEqual((await snapinRows(created)).length, 0);
  });

  it('deletes the grant rows of a deleted group in both plugins', async () => {
    assert.ok((await printerRows(g1)).length > 0);
    assert.ok((await snapinRows(g1)).length > 0);
    await admin.agent.delete('/api/v1/group').set(...AJAX).send({id: [g1.id]}).expect(200);
    assert.strictEqual((await printerRows(g1)).length, 0);
    assert.strictEqual((await snapinRows(g1)).length, 0);
    // The other group keeps its grants.
    assert.strictEqual((await printerRows(g2)).length, 1);
  });
});
