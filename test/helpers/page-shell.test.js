const assert = require('assert');

// The two sync helpers behind the FOG 1.6 page shell (issue #147). They are
// called as the app calls them: .with() with no .now(), because Sails builds
// helpers with execStyle 'natural'. Each assertion uses strictEqual or checks
// a type first, so a helper that lost `sync: true` (its .with() returns a
// Deferred) or answers a truthy non-boolean fails here.
describe('Page shell helpers::', () => {
  describe('has-any-permission', () => {
    const has = (permissions) => sails.helpers.hasAnyPermission.with({permissions});

    it('is false for no permissions at all', () => {
      assert.strictEqual(has({}), false);
      assert.strictEqual(has(undefined), false);
    });

    it('is false when every flag is false', () => {
      assert.strictEqual(has({stock: {host: {read: false, create: false}, image: {read: false}}}), false);
    });

    it('is true when one flag is true', () => {
      assert.strictEqual(has({stock: {host: {read: false}, image: {read: false, update: true}}}), true);
    });

    it('is false for a truthy flag that is not true', () => {
      assert.strictEqual(has({stock: {host: {read: 'yes'}}}), false);
    });
  });

  describe('page-title', () => {
    const title = (identity) => sails.helpers.pageTitle.with({identity});
    const EXPECTED = {
      host:         ['Host',          'Hosts',          'Host Management'],
      image:        ['Image',         'Images',         'Image Management'],
      storagegroup: ['Storage Group', 'Storage Groups', 'Storage Group Management'],
      storagenode:  ['Storage Node',  'Storage Nodes',  'Storage Node Management'],
      pxemenu:      ['iPXE Menu',     'iPXE Menus',     'iPXE Management'],
      user:         ['User',          'Users',          'User Management'],
      role:         ['Role',          'Roles',          'Role Management'],
      task:         ['Task',          'Tasks',          'Task Management'],
      workflow:     ['Workflow',      'Workflows',      'Workflow Management'],
      snapin:       ['Snapin',        'Snapins',        'Snapin Management'],
      printer:      ['Printer',       'Printers',       'Printer Management']
    };

    Object.keys(EXPECTED).forEach((identity) => {
      it(`names ${identity}`, () => {
        const result = title(identity);
        assert.strictEqual(typeof result.singular, 'string');
        const [singular, plural, section] = EXPECTED[identity];
        assert.deepStrictEqual({...result}, {singular, plural, section});
      });
    });

    it('returns undefined for an unknown identity', () => {
      assert.strictEqual(title('nosuchmodel'), undefined);
      assert.strictEqual(title('constructor'), undefined);
    });
  });
});
