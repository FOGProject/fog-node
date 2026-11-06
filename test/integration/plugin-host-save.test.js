const assert = require('assert');

// The snapin and printer plugins' extends.host.save hooks (issue #149). Each
// host tab is its own form, so a save that carries none of a plugin's keys
// must leave that plugin's links and config alone. A present, empty key
// means "none selected" and removes the links.
describe('Plugin host save::', () => {
  const P = 'mocha149-plug';
  const coll = (name) => sails.getDatastore(sails.models.host.datastore).manager.collection(name);
  let host;
  let snapin;
  let printer;

  const cleanup = async () => {
    const hosts = await sails.models.host.find({name: {startsWith: P}});
    for (const h of hosts) {
      await coll('plugin_snapin_host').deleteMany({host: String(h.id)});
      await coll('plugin_printer_host').deleteMany({host: String(h.id)});
      await coll('plugin_printer_hostcfg').deleteMany({host: String(h.id)});
    }
    await sails.models.host.destroy({name: {startsWith: P}});
    await sails.models.snapin.destroy({name: {startsWith: P}});
    await sails.models.printer.destroy({name: {startsWith: P}});
  };
  before(cleanup);
  afterEach(cleanup);

  beforeEach(async () => {
    host = await sails.models.host.create({name: `${P}-host`}).fetch();
    snapin = await sails.models.snapin.create({name: `${P}-snapin`}).fetch();
    printer = await sails.models.printer.create({name: `${P}-printer`}).fetch();
    await sails.plugins.hostSave(host.id, {
      snapins: [snapin.id], printers: [printer.id], printerLevel: '1', defaultPrinter: ''
    });
  });

  const snapinLinks = () => coll('plugin_snapin_host').find({host: String(host.id)}).toArray();
  const printerLinks = () => coll('plugin_printer_host').find({host: String(host.id)}).toArray();
  const printerCfg = () => coll('plugin_printer_hostcfg').findOne({host: String(host.id)});

  it('links the snapin and the printer and stores the printer level', async () => {
    assert.strictEqual((await snapinLinks()).length, 1);
    assert.strictEqual((await printerLinks()).length, 1);
    assert.strictEqual((await printerCfg()).level, '1');
  });

  it('keeps the links and the printer config on a General-pane save', async () => {
    await sails.plugins.hostSave(host.id, {name: `${P}-host`});
    const snapins = await snapinLinks();
    const printers = await printerLinks();
    assert.strictEqual(snapins.length, 1);
    assert.strictEqual(snapins[0].snapin, String(snapin.id));
    assert.strictEqual(printers.length, 1);
    assert.strictEqual(printers[0].printer, String(printer.id));
    assert.strictEqual((await printerCfg()).level, '1');
  });

  it('removes the snapin links on an empty snapins key and keeps the printer link', async () => {
    await sails.plugins.hostSave(host.id, {snapins: ['']});
    assert.strictEqual((await snapinLinks()).length, 0);
    assert.strictEqual((await printerLinks()).length, 1);
    assert.strictEqual((await printerCfg()).level, '1');
  });
});
