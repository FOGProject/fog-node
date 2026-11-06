const assert = require('assert');

// The FOG 1.6 sidebar (issue #148): the route matcher (is-known-get-path)
// and the menu builder (build-menu). Both are sync helpers, called as the app
// calls them: .with() with no .now(), because Sails builds helpers with
// execStyle 'natural'. A helper that lost `sync: true` returns a Deferred, and
// the strictEqual and Array.isArray assertions below fail on it.
describe('Sidebar menu helpers::', () => {
  const known = (path) => sails.helpers.isKnownGetPath.with({path});
  const build = (currentPath, items) => sails.helpers.buildMenu.with({
    items: items || sails.config.globals.menuItems,
    currentPath
  });

  // Run fn with a fake knownGetPaths, then put the real one back.
  let real;
  const withKnown = (paths, fn) => {
    sails.config.globals.knownGetPaths = new Set(paths);
    try { return fn(); } finally { sails.config.globals.knownGetPaths = real; }
  };
  before(() => { real = sails.config.globals.knownGetPaths; });

  // Every section and leaf in the tree, groups opened up.
  const entries = (menu) => menu.flatMap((n) => (n.type === 'group' ? n.children : [n]));
  const find = (menu, text) => entries(menu).find((n) => n.text === text);
  const subTexts = (node) => (node.subLinks || []).map((s) => s.text);
  const activeSubs = (menu) => entries(menu).flatMap((n) => (n.subLinks || []).filter((s) => s.active));

  describe('is-known-get-path', () => {
    const FAKE = ['/hosts', '/hosts/create', '/roles/edit/:id'];

    it('matches a concrete path', () => {
      withKnown(FAKE, () => assert.strictEqual(known('/hosts/create'), true));
    });

    it('matches a pattern against a pattern, and a concrete path against a pattern', () => {
      withKnown(FAKE, () => {
        assert.strictEqual(known('/roles/edit/:id'), true);
        assert.strictEqual(known('/roles/edit/abc'), true);
      });
    });

    it('misses a path no route answers', () => {
      withKnown(FAKE, () => {
        assert.strictEqual(known('/hosts/pending'), false);
        assert.strictEqual(known('/roles/edit'), false);
        assert.strictEqual(known('/roles/edit/abc/more'), false);
      });
    });

    it('reads the GET paths the plugins hook built from the real routes', () => {
      // '/hwinfo' is a verb-less key in config/routes.js; '/snapins/create' is
      // a snapin plugin route; '/task-history' answers POST only.
      assert.strictEqual(known('/hwinfo'), true);
      assert.strictEqual(known('/snapins/create'), true);
      assert.strictEqual(known('/printers/create'), true);
      assert.strictEqual(known('/hosts/edit/abc'), true);
      assert.strictEqual(known('/task-history'), false);
      assert.strictEqual(known('/hosts/pending'), false);
    });
  });

  describe('build-menu', () => {
    it('orders the top level as 1.6 does, with the plugin items inline', () => {
      const menu = build('/');
      assert.ok(Array.isArray(menu), 'build-menu returned no array');
      assert.deepStrictEqual(menu.map((n) => [n.text, n.icon]), [
        ['Dashboard', 'fas fa-gauge-high'],
        ['Hosts', 'fas fa-desktop'],
        ['Groups', 'fas fa-sitemap'],
        ['Images', 'far fa-hard-drive'],
        ['Snapins', 'fas fa-cube'],
        ['Storage Groups', 'far fa-object-group'],
        ['Storage Nodes', 'fas fa-server'],
        ['Printers', 'fas fa-print'],
        ['Tasks', 'fas fa-bars-progress'],
        ['Workflows', 'fas fa-diagram-project'],
        ['User Administration', 'fas fa-shield'],
        ['iPXE Menu', 'fas fa-list-ol']
      ]);
      assert.deepStrictEqual(menu.filter((n) => n.pluginOption), []);
      const admin = menu.find((n) => n.text === 'User Administration');
      assert.strictEqual(admin.type, 'group');
      assert.deepStrictEqual(admin.children.map((n) => [n.text, n.icon]), [['Users', 'fas fa-users'], ['Roles', 'fas fa-user-shield']]);
    });

    it('shows a sub-link only while a GET route answers it', () => {
      // '/hwinfo' stands for a verb-less route key; '/snapins/create' for a
      // plugin route.
      const paths = ['/', '/hwinfo', '/hosts', '/hosts/create', '/snapins', '/snapins/create'];
      const menu = withKnown(paths, () => build('/'));
      assert.ok(Array.isArray(menu), 'build-menu returned no array');
      assert.deepStrictEqual(subTexts(find(menu, 'Hosts')), ['List All Hosts', 'Create New Host']);
      assert.deepStrictEqual(subTexts(find(menu, 'Snapins')), ['List All Snapins', 'Create New Snapin']);
      // A route added for a hidden sub-link brings it back, with no
      // config/globals.js change.
      const more = withKnown(paths.concat(['/hosts/pending']), () => build('/'));
      assert.deepStrictEqual(subTexts(find(more, 'Hosts')), ['List All Hosts', 'Create New Host', 'Pending Hosts']);
    });

    it('drops the sub-links with no route from the real menu', () => {
      const menu = build('/');
      assert.deepStrictEqual(subTexts(find(menu, 'Hosts')), ['List All Hosts', 'Create New Host']);
      assert.deepStrictEqual(subTexts(find(menu, 'Images')), ['List All Images', 'Create New Image']);
      assert.deepStrictEqual(subTexts(find(menu, 'Snapins')), ['List All Snapins', 'Create New Snapin']);
      assert.deepStrictEqual(subTexts(find(menu, 'Printers')), ['List All Printers', 'Create New Printer']);
      assert.deepStrictEqual(subTexts(find(menu, 'iPXE Menu')), ['List All iPXE Menus', 'Create New iPXE Menu']);
    });

    it('turns a section with only "List All" into a leaf link', () => {
      const menu = build('/');
      ['Tasks', 'Workflows', 'Roles'].forEach((text) => {
        const node = find(menu, text);
        assert.strictEqual(node.type, 'leaf', `${text} is a ${node.type}`);
        assert.strictEqual(node.link, `/${text.toLowerCase()}`);
      });
    });

    it('on /hosts/create, makes "Create New Host" the one active sub-link and opens Hosts', () => {
      const menu = build('/hosts/create');
      assert.ok(Array.isArray(menu), 'build-menu returned no array');
      assert.deepStrictEqual(activeSubs(menu).map((s) => s.text), ['Create New Host']);
      const hosts = find(menu, 'Hosts');
      assert.strictEqual(hosts.open, true);
      assert.strictEqual(hosts.active, true);
      assert.deepStrictEqual(entries(menu).filter((n) => n.active).map((n) => n.text), ['Hosts']);
    });

    it('on /hosts, makes "List All Hosts" the active sub-link', () => {
      assert.deepStrictEqual(activeSubs(build('/hosts')).map((s) => s.text), ['List All Hosts']);
    });

    it('on /hosts/edit/abc, opens Hosts with no active sub-link', () => {
      const menu = build('/hosts/edit/abc');
      assert.deepStrictEqual(activeSubs(menu), []);
      const hosts = find(menu, 'Hosts');
      assert.strictEqual(hosts.open, true);
      assert.strictEqual(hosts.active, true);
    });

    it('opens the User Administration group when one of its children is active', () => {
      const menu = build('/users/create');
      const group = menu.find((n) => n.text === 'User Administration');
      assert.strictEqual(group.open, true);
      assert.strictEqual(group.active, true);
      assert.strictEqual(find(menu, 'Users').open, true);
      assert.deepStrictEqual(activeSubs(menu).map((s) => s.text), ['Create New User']);
      assert.strictEqual(build('/hosts').find((n) => n.text === 'User Administration').open, false);
    });

    it('makes a leaf active on its own path only by its first segment', () => {
      assert.strictEqual(find(build('/'), 'Dashboard').active, true);
      assert.strictEqual(find(build('/hosts'), 'Dashboard').active, false);
      assert.strictEqual(find(build('/roles'), 'Roles').active, true);
    });

    it('puts a plugin item with no order under PLUGIN OPTIONS, sorted by label without case', () => {
      const items = sails.config.globals.menuItems.concat([
        {text: 'zeta', link: '/zeta', icon: 'fas fa-z'},
        {text: 'Alpha', link: '/alpha', icon: 'fas fa-a'},
        {text: 'beta', link: '/beta', icon: 'fas fa-b'}
      ]);
      const menu = build('/', items);
      assert.ok(Array.isArray(menu), 'build-menu returned no array');
      assert.deepStrictEqual(menu.filter((n) => n.pluginOption).map((n) => n.text), ['Alpha', 'beta', 'zeta']);
      assert.strictEqual(menu.filter((n) => !n.pluginOption).length, sails.config.globals.menuItems.length);
      assert.deepStrictEqual(menu.slice(-3).map((n) => n.pluginOption), [true, true, true]);
    });

    // The rendered sidebar.ejs, signed in as the suite's admin: the PLUGIN
    // OPTIONS header, its collapse link and the separate plugin list render
    // only while an item has no order.
    describe('the rendered PLUGIN OPTIONS block', () => {
      const supertest = require('supertest');
      const HTML = ['Accept', 'text/html'];
      let agent;
      before(async () => {
        agent = supertest.agent(sails.hooks.http.app);
        const {body} = await agent.get('/csrfToken').expect(200);
        await agent.post('/login').type('form').set(...HTML)
          .send({username: 'mochatestadmin', password: 'mochatestadmin', _csrf: body._csrf})
          .expect(302).expect('Location', '/');
      });
      const hostsPage = async () => (await agent.get('/hosts').set(...HTML).expect(200)).text;

      it('renders under PLUGIN OPTIONS a plugin item with no order', async () => {
        const items = sails.config.globals.menuItems;
        sails.config.globals.menuItems = items.concat([
          {text: 'zeta', link: '/zeta', icon: 'fas fa-z'},
          {text: 'Alpha', link: '/alpha', icon: 'fas fa-a'}
        ]);
        let html;
        try { html = await hostsPage(); } finally { sails.config.globals.menuItems = items; }
        assert.match(html, /<li class="nav-header">\s*PLUGIN OPTIONS\s*<a href="#" class="plugin-options-alternate float-end"><i class="fas fa-minus"><\/i><\/a>\s*<\/li>/);
        const list = /<ul class="nav sidebar-menu flex-column plugin-options" data-lte-toggle="treeview" data-accordion="true">([\s\S]*?)<\/ul>/.exec(html);
        assert.ok(list, 'there is no ul.plugin-options');
        assert.deepStrictEqual([...list[1].matchAll(/href="([^"]+)"/g)].map((m) => m[1]), ['/alpha', '/zeta']);
      });

      it('renders no PLUGIN OPTIONS block with only the snapin and printer plugins', async () => {
        const html = await hostsPage();
        assert.ok(!html.includes('PLUGIN OPTIONS'), 'the page has a PLUGIN OPTIONS header');
        assert.ok(!html.includes('plugin-options'), 'the page has a plugin-options element');
      });
    });

    it('leaves the config items unchanged', () => {
      const before = JSON.stringify(sails.config.globals.menuItems);
      build('/hosts/create');
      assert.strictEqual(JSON.stringify(sails.config.globals.menuItems), before);
    });
  });
});
