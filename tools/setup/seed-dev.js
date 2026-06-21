/**
 * Dev sample-data seed for fog-node.
 *
 * Resets the development database to a clean, playable baseline so a fresh
 * instance has something to click around on first load:
 *   - Administrator user + Administrator role + schema setting
 *   - a Default storage group with one storage node
 *   - a couple of images and a handful of sample hosts (with MACs, tags, and an
 *     image assignment) and a PXE menu
 *
 * SAFE on the schema (lifts Sails with migrate:'safe' — never auto-migrates),
 * but DESTRUCTIVE on data: it clears the seeded collections first. LOCAL
 * DEVELOPMENT ONLY — it refuses to run with NODE_ENV=production.
 *
 *   npm run seed:dev
 *   FOG_DEV_ADMIN_PASSWORD='supersecret' npm run seed:dev
 */
const config = require('../lib/config'),
  sails = require('sails');

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to run the dev seed with NODE_ENV=production (it clears data).');
  process.exit(1);
}

const adminEmail = process.env.FOG_DEV_ADMIN_EMAIL || 'admin@example.com';
const adminPassword = process.env.FOG_DEV_ADMIN_PASSWORD || 'fogadmin1';
if (adminPassword.length < 8) {
  console.error('FOG_DEV_ADMIN_PASSWORD must be at least 8 characters.');
  process.exit(1);
}

(function () {
  let cfg = config.getMergedSettings();
  cfg.log = { level: 'error' };
  if (!cfg.schema) cfg.schema = 1;
  cfg.appPath = config.appPath;
  cfg.models = { migrate: 'safe' }; // never auto-migrate (Mongo is schemaless)
  cfg.hooks = { grunt: false };     // no asset build needed just to seed

  sails.load(cfg, async (err) => {
    if (err) { console.error(err); process.exit(1); }
    try {
      // Clean slate for the seeded collections (dev only).
      await Promise.all([
        Host.destroy({}), Image.destroy({}), StorageNode.destroy({}),
        StorageGroup.destroy({}), PxeMenu.destroy({}), User.destroy({}),
        Role.destroy({}), Setting.destroy({})
      ]);

      // --- Baseline: schema revision + Administrator role + Administrator user ---
      await Setting.create({ name: 'schema', value: { revision: cfg.schema } });
      let adminRole = await Role.create({ name: 'Administrator', isAdmin: true, permissions: {} }).fetch();
      let admin = await User.create({ username: 'Administrator', email: adminEmail, password: adminPassword }).fetch();
      await User.addToCollection(admin.id, 'roles').members([adminRole.id]);

      // --- Storage: one group + one (master) node ---
      let sg = await StorageGroup.create({ name: 'Default', description: 'Default storage group' }).fetch();
      await StorageNode.create({
        name: 'DefaultMember', description: 'Default storage node',
        ip: '127.0.0.1', path: '/images/', ftppath: '/images/', snapinpath: '/opt/fog/snapins/',
        isMaster: true, isEnabled: true, maxClients: 10, storagegroup: sg.id
      });

      // --- Images ---
      let win = await Image.create({ name: 'Golden-Win11', description: 'Sample Windows 11 image', enabled: true }).fetch();
      await Image.create({ name: 'Ubuntu-22.04', description: 'Sample Ubuntu 22.04 image', enabled: true });

      // --- PXE menu ---
      await PxeMenu.create({ name: 'Default' });

      // --- Sample hosts ---
      let hosts = [
        { name: 'lab-pc-01', description: 'Lab A workstation', macs: ['00:11:22:33:44:01'], tags: ['lab-a', 'win11'], image: win.id },
        { name: 'lab-pc-02', description: 'Lab A workstation', macs: ['00:11:22:33:44:02'], tags: ['lab-a', 'win11'], image: win.id },
        { name: 'lab-pc-03', description: 'Lab B workstation', macs: ['00:11:22:33:44:03'], tags: ['lab-b'] },
        { name: 'reception-01', description: 'Front desk', macs: ['00:11:22:33:44:04'], tags: ['front-desk'] },
        { name: 'unprovisioned-01', description: 'Newly registered, no image', macs: ['00:11:22:33:44:05'], pending: true }
      ];
      for (let h of hosts) { await Host.create(h); }

      console.log('');
      console.log('Dev sample data seeded:');
      console.log('  users: 1 (Administrator)   roles: 1   storage groups: 1   storage nodes: 1');
      console.log('  images: 2   hosts: ' + hosts.length + '   pxe menus: 1');
      console.log('');
      console.log('  Login: Administrator / ' + adminPassword);
      console.log('');
      process.exit(0);
    } catch (e) {
      console.error('Seed failed: ' + (e && e.message ? e.message : e));
      process.exit(1);
    }
  });
})();
