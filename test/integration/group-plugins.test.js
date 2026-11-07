const assert = require('assert');
const path = require('path');
const supertest = require('supertest');

// The extends.group hook bus (issue #170): the plugins hook collects the group
// extensions of the enabled plugins only, and every sails.plugins group
// function reads sails.plugins.groupExtensions at call time. So a plugin that
// is not there has no tab, writes no row, has no Grants label and no
// groupResolve key, and the other plugins still work.
describe('Group plugins::', () => {
  const app = () => sails.hooks.http.app;
  const HTML = ['Accept', 'text/html'];
  const AJAX = ['X-Requested-With', 'XMLHttpRequest'];
  const P = 'mocha170p-';
  const coll = (name) => sails.getDatastore(sails.models.host.datastore).manager.collection(name);

  it('collects the group extensions of the named plugins only', () => {
    const {collect} = require('../../api/hooks/plugins');
    const got = collect(path.join(__dirname, '..', '..'), ['wol', 'ad', 'snapin']);
    assert.deepStrictEqual(got.groupExtensions.map((e) => e.name), ['snapin']);
    assert.deepStrictEqual(got.loaded, ['wol', 'ad', 'snapin']);
  });

  describe('with the printer plugin disabled', () => {
    let saved;
    let admin;
    let group;
    let host;
    let printer;
    let snapin;

    async function cleanup() {
      const groups = await sails.models.group.find({name: {startsWith: P}});
      const gids = groups.map((g) => String(g.id));
      await coll('plugin_printer_group').deleteMany({group: {$in: gids}});
      await coll('plugin_snapin_group').deleteMany({group: {$in: gids}});
      await sails.models.host.destroy({name: {startsWith: P}});
      await sails.models.group.destroy({name: {startsWith: P}});
      await sails.models.printer.destroy({name: {startsWith: P}});
      await sails.models.snapin.destroy({name: {startsWith: P}});
    }

    before(async () => {
      await cleanup();
      saved = sails.plugins.groupExtensions;
      sails.plugins.groupExtensions = saved.filter((e) => e.name !== 'printer');
      const agent = supertest.agent(app());
      let {body} = await agent.get('/csrfToken').expect(200);
      await agent.post('/login').type('form').set(...HTML)
        .send({username: 'mochatestadmin', password: 'mochatestadmin', _csrf: body._csrf}).expect(302);
      ({body} = await agent.get('/csrfToken').expect(200));
      admin = {agent, csrf: body._csrf};
      group = await sails.models.group.create({name: `${P}g`}).fetch();
      host = await sails.models.host.create({name: `${P}h`, groups: [group.name]}).fetch();
      printer = await sails.models.printer.create({name: `${P}p`}).fetch();
      snapin = await sails.models.snapin.create({name: `${P}s`}).fetch();
    });
    after(async () => {
      sails.plugins.groupExtensions = saved;
      await cleanup();
    });

    it('has a Snapin Associations tab and no Printer Associations tab on the group edit page', async () => {
      const res = await admin.agent.get(`/groups/edit/${group.id}`).set(...HTML).expect(200);
      assert.ok(res.text.includes('Snapin Associations'));
      assert.ok(!res.text.includes('Printer Associations'));
    });

    it('writes the snapin grants of a save and no printer grant', async () => {
      await admin.agent.post(`/groups/edit/${group.id}`).type('form')
        .set('Accept', 'application/json').set(...AJAX)
        .send({_csrf: admin.csrf, groupPrinters: [printer.id], groupDefaultPrinter: printer.id, groupSnapins: [snapin.id]})
        .expect(200);
      assert.strictEqual(await coll('plugin_snapin_group').countDocuments({group: String(group.id)}), 1);
      assert.strictEqual(await coll('plugin_printer_group').countDocuments({group: String(group.id)}), 0);
    });

    it('resolves a member with a snapin key and no printer key', async () => {
      const got = (await sails.plugins.groupResolve([host.id]))[String(host.id)];
      assert.deepStrictEqual(Object.keys(got), ['snapin']);
      assert.deepStrictEqual(got.snapin, {snapins: [String(snapin.id)], inherited: [String(snapin.id)]});
    });

    it('has no printer label in the Grants column', async () => {
      // A printer grant row from before the plugin was disabled stays, and
      // shows nowhere.
      await coll('plugin_printer_group').insertOne({group: String(group.id), printer: String(printer.id), isDefault: false});
      const res = await admin.agent.post('/api/v1/group/datatable').set('Accept', 'application/json')
        .send({
          draw: 1,
          columns: [{data: 'name', searchable: true, orderable: true, search: {value: ''}}],
          order: [{column: 0, dir: 'asc'}],
          search: {value: P, regex: false}
        }).expect(200);
      const row = res.body.data.find((g) => g.name === group.name);
      assert.deepStrictEqual(row.grants_list, ['1 snapin']);
      assert.strictEqual(row.grants, '1 snapin');
    });
  });
});
