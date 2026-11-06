const assert = require('assert');

// The form-generator helper (issue #149): the FOG 1.6 field grid, the footer
// buttons per mode, one form per edit tab, and the password reveal. It is
// called as the app calls it: .with() inside an await, with no .now().
describe('Form generator::', () => {
  const SETTING = 'FOG_ENABLE_SHOW_PASSWORDS';
  let savedSetting;

  const gen = (opts) => sails.helpers.formGenerator.with(Object.assign({
    model: 'host', action: '/hosts/create', id: 'mocha149-form'
  }, opts));
  const count = (html, re) => (html.match(re) || []).length;

  // One of each item type, keyed by real host attributes where one exists.
  // `zzchecks` and `zzsecret` are not host attributes: the generator tolerates
  // unknown attributes, and the first test proves it.
  const allItems = () => ({
    name: {text: 'Host Name', type: 'text', id: 'f-name', classes: [], value: 'pc1'},
    description: {text: 'Host Description', type: 'text', textarea: true, id: 'f-desc', classes: [], value: 'about'},
    pending: {text: 'Pending', type: 'checkbox', id: 'f-pending', classes: [], checked: true},
    image: {
      text: 'Host Image', type: 'select', id: 'f-image', classes: [],
      options: [{value: 'i1', label: 'Image One', selected: true}]
    },
    macs: {text: 'Host MACs', type: 'maclist', value: ['aabbccddee01']},
    tags: {text: 'Host Tags', type: 'taginput', value: ['a', 'b']},
    zzchecks: {
      text: 'Host Checks', type: 'checktable',
      options: [{value: 'c1', label: 'Check One', checked: true}, {value: 'c2', label: 'Check Two'}]
    },
    zzsecret: {text: 'Host Secret', type: 'password', id: 'f-secret', classes: []}
  });

  const eye = '<i class="far fa-eye-slash fogpasswordeye"></i>';

  before(async () => {
    savedSetting = await sails.models.setting.findOne({name: SETTING});
    await sails.models.setting.destroy({name: SETTING});
  });
  afterEach(() => sails.models.setting.destroy({name: SETTING}));
  after(async () => {
    await sails.models.setting.destroy({name: SETTING});
    if (savedSetting) {
      await sails.models.setting.create({name: savedSetting.name, value: savedSetting.value});
    }
  });

  describe('field rows', () => {
    let html;
    before(async () => {
      html = await gen({mode: 'create', formItems: allItems()});
    });

    it('renders one row mb-3 per item, each with a col-sm-3 label and a col-sm-9 control', () => {
      assert.strictEqual(count(html, /<div class="row mb-3">/g), 8);
      assert.strictEqual(count(html, /<label class="col-sm-3 col-form-label"/g), 8);
      assert.strictEqual(count(html, /<div class="col-sm-9">/g), 8);
    });

    it('renders a text input with its label bound by for', () => {
      assert.ok(html.includes('<label class="col-sm-3 col-form-label" for="f-name">Host Name</label>'));
      assert.ok(/<input type="text" id="f-name" class="form-control" name="name"[^>]* value="pc1"/.test(html));
    });

    it('renders a textarea', () => {
      assert.ok(/<textarea id="f-desc" class="form-control" name="description">about<\/textarea>/.test(html));
    });

    it('renders a checkbox with a hidden false and a checked box', () => {
      assert.ok(html.includes('<input type="hidden" name="pending" value="false"/>'));
      assert.ok(/<input type="checkbox" class="form-check-input" id="f-pending" name="pending" value="true" checked\/>/.test(html));
    });

    it('renders a select with the (none) option and the selected option', () => {
      assert.ok(/<select class="form-control" id="f-image" name="image">/.test(html));
      assert.ok(html.includes('<option value="">(none)</option>'));
      assert.ok(html.includes('<option value="i1" selected>Image One</option>'));
    });

    it('renders a maclist with a macs[] input and no for on its label', () => {
      assert.ok(html.includes('<label class="col-sm-3 col-form-label">Host MACs</label>'));
      assert.ok(html.includes('data-maclist'));
      assert.ok(/name="macs\[\]" value="aabbccddee01"/.test(html));
    });

    it('renders a taginput with its tags', () => {
      assert.ok(html.includes('<div data-taginput data-name="tags" data-tags="a,b"></div>'));
    });

    it('renders a checktable with a checked and an unchecked row', () => {
      assert.ok(html.includes('data-assoc-picker'));
      assert.ok(/name="zzchecks\[\]" value="c1" checked\/>/.test(html));
      assert.ok(/name="zzchecks\[\]" value="c2"\/>/.test(html));
      assert.ok(html.includes('<strong>1</strong> of 2 selected'));
    });

    it('renders a password input', () => {
      assert.ok(/<input type="password" id="f-secret" class="form-control" name="zzsecret"/.test(html));
    });
  });

  describe('checktable', () => {
    it('always renders the hidden empty input, with and without options', async () => {
      const hidden = '<input type="hidden" name="zzchecks[]" value=""/>';
      const item = (options) => ({zzchecks: {text: 'Checks', type: 'checktable', options}});
      const full = await gen({mode: 'create', formItems: item([{value: 'c1', label: 'One'}])});
      const empty = await gen({mode: 'create', formItems: item([])});
      assert.strictEqual(count(full, /<input type="hidden" name="zzchecks\[\]" value=""\/>/g), 1);
      assert.ok(full.includes(hidden));
      assert.ok(empty.includes(hidden));
      assert.ok(empty.includes('None available.'));
    });
  });

  describe('footer per mode', () => {
    const items = () => ({name: {text: 'Name', type: 'text', id: 'f-name', classes: []}});

    it('create has one Create button, no Cancel, and no modal root', async () => {
      const html = await gen({mode: 'create', formItems: items()});
      assert.strictEqual(count(html, /<button type="submit" class="btn btn-primary float-end">Create<\/button>/g), 1);
      assert.ok(!html.includes('Cancel'));
      assert.ok(!html.includes('data-fog-create-modal'));
      assert.ok(!html.includes('Update'));
    });

    it('create-modal has the modal root, Cancel (type button) then Create', async () => {
      const html = await gen({mode: 'create-modal', formItems: items()});
      assert.ok(html.includes('<div data-fog-create-modal data-title="Create New Host">'));
      const cancel = '<button type="button" class="btn btn-outline-secondary float-start" data-bs-dismiss="modal" data-fog-cancel>Cancel</button>';
      assert.strictEqual(count(html, /data-fog-cancel>Cancel<\/button>/g), 1);
      assert.ok(html.includes(cancel));
      const create = html.indexOf('>Create</button>');
      assert.ok(create > -1, 'no Create button');
      assert.ok(html.indexOf(cancel) < create, 'Cancel does not come before Create');
    });
  });

  describe('edit mode', () => {
    const items = () => ({
      name: {text: 'Name', type: 'text', id: 'f-name', classes: []},
      macs: {text: 'MACs', type: 'maclist', value: ['aabbccddee01'], tab: 'MAC Addresses'}
    });
    const edit = (formItems, extra) => gen(Object.assign({
      mode: 'edit', formItems, action: '/hosts/edit/1', id: 'host-edit',
      record: {id: '1', name: 'pc1'}, listUrl: '/hosts'
    }, extra));

    it('renders one form, one Update and one pane per tab', async () => {
      const html = await edit(items(), {tabOrder: ['General', 'MAC Addresses']});
      const panes = html.split('class="tab-pane').slice(1);
      assert.strictEqual(panes.length, 2);
      assert.strictEqual(count(html, /<form/g), 2);
      panes.forEach((pane) => {
        assert.strictEqual(count(pane, /<form/g), 1);
        assert.strictEqual(count(pane, />Update<\/button>/g), 1);
      });
    });

    it('renders Delete once, as a type button, in the General pane only', async () => {
      const html = await edit(items(), {tabOrder: ['General', 'MAC Addresses']});
      const panes = html.split('class="tab-pane').slice(1);
      assert.strictEqual(count(html, />Delete<\/button>/g), 1);
      assert.ok(panes[0].includes('id="tab-general"'));
      assert.strictEqual(count(panes[0], />Delete<\/button>/g), 1);
      assert.strictEqual(count(panes[1], />Delete<\/button>/g), 0);
      assert.ok(html.includes('<button type="button" class="btn btn-danger float-start" data-fog-delete'));
      assert.ok(html.includes('data-id="1" data-name="pc1" data-list="/hosts"'));
    });

    it('puts each item in its own tab form', async () => {
      const html = await edit(items(), {tabOrder: ['General', 'MAC Addresses']});
      const panes = html.split('class="tab-pane').slice(1);
      assert.ok(panes[0].includes('name="name"'));
      assert.ok(!panes[0].includes('macs[]'));
      assert.ok(panes[1].includes('macs[]'));
      assert.ok(!panes[1].includes('name="name"'));
    });

    it('still renders the tab bar for a single tab', async () => {
      const html = await edit({name: items().name});
      assert.ok(html.includes('class="nav nav-tabs"'));
      assert.strictEqual(count(html, /class="nav-link/g), 1);
      assert.strictEqual(count(html, /<form/g), 1);
      assert.strictEqual(count(html, />Delete<\/button>/g), 1);
    });

    it('uses the card-primary card-outline tabs card', async () => {
      const html = await edit(items());
      assert.ok(html.includes('<div class="card card-primary card-outline">'));
      assert.ok(html.includes('<div class="card-header p-0 border-bottom-0">'));
    });
  });

  describe('escaping', () => {
    it('escapes a value in a text input, a textarea, a tag and a record name', async () => {
      const bad = '"><b>x</b>';
      const html = await gen({
        mode: 'edit', action: '/hosts/edit/1', record: {id: '1', name: bad}, listUrl: '/hosts',
        formItems: {
          name: {text: 'Name', type: 'text', id: 'f-name', classes: [], value: bad},
          description: {text: 'Description', type: 'text', textarea: true, classes: [], value: bad},
          tags: {text: 'Tags', type: 'taginput', value: [bad]}
        }
      });
      assert.ok(!html.includes('<b>x</b>'));
      assert.ok(html.includes('value="&quot;&gt;&lt;b&gt;x&lt;/b&gt;"'));
      assert.ok(html.includes('&quot;&gt;&lt;b&gt;x&lt;/b&gt;</textarea>'));
      assert.ok(html.includes('data-name="&quot;&gt;&lt;b&gt;x&lt;/b&gt;"'));
    });

    // Select options and checktable rows show the names of other stored
    // records (an image, a snapin, a printer): the main stored-XSS path.
    it('escapes the label and value of a select option and a checktable row', async () => {
      const bad = '"><b>x</b>';
      const html = await gen({
        mode: 'create',
        formItems: {
          image: {text: 'Image', type: 'select', id: 'f-image', classes: [], options: [{value: bad, label: bad}]},
          zzchecks: {text: 'Checks', type: 'checktable', options: [{value: bad, label: bad}]}
        }
      });
      assert.ok(!html.includes('<b>x</b>'));
      assert.ok(html.includes('<option value="&quot;&gt;&lt;b&gt;x&lt;/b&gt;">&quot;&gt;&lt;b&gt;x&lt;/b&gt;</option>'));
      assert.ok(html.includes('<td class="assoc-name">&quot;&gt;&lt;b&gt;x&lt;/b&gt;</td>'));
      assert.ok(html.includes('name="zzchecks[]" value="&quot;&gt;&lt;b&gt;x&lt;/b&gt;"'));
    });
  });

  describe('password toggle', () => {
    const secret = {zzsecret: {text: 'Secret', type: 'password', id: 'f-secret', classes: []}};

    it('is present when FOG_ENABLE_SHOW_PASSWORDS is 1', async () => {
      await sails.models.setting.create({name: SETTING, value: '1'});
      const html = await gen({mode: 'create', formItems: secret});
      assert.ok(html.includes(`<span class="input-group-text">${eye}</span>`));
      assert.ok(html.includes('<div class="input-group">'));
    });

    it('is absent when there is no FOG_ENABLE_SHOW_PASSWORDS record', async () => {
      const html = await gen({mode: 'create', formItems: secret});
      assert.ok(!html.includes('fogpasswordeye'));
      assert.ok(!html.includes('input-group'));
      assert.ok(html.includes('type="password"'));
    });

    it('is absent when FOG_ENABLE_SHOW_PASSWORDS is 0', async () => {
      await sails.models.setting.create({name: SETTING, value: '0'});
      const html = await gen({mode: 'create', formItems: secret});
      assert.ok(!html.includes('fogpasswordeye'));
    });
  });
});
