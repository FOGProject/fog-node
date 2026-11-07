/**
 * Generic edit page.
 *
 * Handles GET /<plural>/edit/:id for any model: loads the record and builds an
 * edit form from the model's scalar attributes (associations, system fields,
 * password and permissions are skipped). Submits to POST /<plural>/edit/:id,
 * which is handled by general/save.
 */
const path = require('path');

// The 1.6 group field labels (GroupManagement.php _addFields).
const GROUP_LABELS = {name: 'Group Name', description: 'Group Description', order: 'Group Order'};
const GROUP_PARTIAL = path.join(__dirname, '..', '..', '..', 'views', 'pages', 'partials', 'edit', 'group.js');

// The 1.6 "Associations > Host Associations" tab of a group (GroupManagement.php
// ~1793-1798, renderAssocTab in FOGPageRender.php ~90-165). fog-node has no tab
// dropdowns, so it is a top-level tab. The table lists every host, and
// views/pages/partials/edit/group.js fills it and wires the buttons. The
// group name is the one record value here, and it is escaped.
function groupHostPane(name) {
  return `
            <div class="card card-primary card-outline">
              <div class="card-header">
                <h4 class="card-title">Group Host Associations</h4>
              </div>
              <div class="card-body">
                <table id="group-host-table" class="table table-striped table-hover w-100" data-group-name="${_.escape(name)}">
                  <thead><tr><th>Host Name</th><th>Associated</th></tr></thead>
                  <tbody></tbody>
                </table>
                <div class="clearfix mt-2">
                  <button type="button" id="group-host-send" class="btn btn-primary float-end">Add selected</button>
                  <button type="button" id="group-host-remove" class="btn btn-danger float-start">Remove selected</button>
                </div>
              </div>
            </div>`;
}

module.exports = {
  friendlyName: 'Edit',
  description: 'Display a generic edit form for a record.',
  exits: {
    success: {
      viewTemplatePath: 'pages/create'
    },
    notFound: {
      responseType: 'notFound'
    }
  },
  fn: async function () {
    let req = this.req;
    let segments = req.path.split('/').filter(Boolean);
    let plural = segments[0];
    let model = plural.replace(/s$/, '');
    let id = req.param('id');
    let skip = ['id', 'createdAt', 'updatedAt', 'password', 'permissions'];

    if (!model || !sails.models[model]) {
      throw 'notFound';
    }

    // populateAll so association edit widgets can reflect current values.
    let record = await sails.models[model].findOne({ id }).populateAll();
    if (!record) {
      throw 'notFound';
    }

    let attrs = sails.models[model].attributes;
    let formItems = {};
    Object.keys(attrs).forEach((key) => {
      let attr = attrs[key];
      if (attr.collection || attr.model) { return; } // associations
      if (skip.includes(key)) { return; }

      // Host MACs get a dedicated multi-value widget with a primary picker.
      // Stored bare (aabbccddeeff) -> displayed as aa:bb:cc:dd:ee:ff.
      if (model === 'host' && key === 'macs') {
        let stored = Array.isArray(record[key]) ? record[key] : (record[key] ? [record[key]] : []);
        formItems[key] = {
          text: 'MAC Addresses',
          id: `${model}-macs`,
          classes: [],
          textarea: false,
          type: 'maclist',
          value: stored.map((m) => {
            let hex = String(m).replace(/[^0-9a-fA-F]/g, '').toLowerCase();
            return hex.length === 12 ? hex.match(/.{2}/g).join(':') : m;
          })
        };
        return;
      }

      // Groups: a chip/token input over the json array (see fog.taginput.js).
      // A name with no Group creates one on save (api/helpers/group/ensure.js).
      if (model === 'host' && key === 'groups') {
        let stored = Array.isArray(record[key]) ? record[key] : [];
        formItems[key] = {
          text: 'Groups', id: 'hostgroups', classes: [], textarea: false,
          type: 'taginput', value: stored
        };
        return;
      }

      let label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
      // The 1.6 group field labels (GroupManagement.php _addFields).
      if (model === 'group' && GROUP_LABELS[key]) { label = GROUP_LABELS[key]; }
      let val = record[key];
      let item = { text: label, id: `${model}-${key}`, classes: [], textarea: false };

      if (attr.type === 'boolean') {
        item.type = 'checkbox';
        item.checked = !!val;
      } else if (attr.type === 'number') {
        item.type = 'number';
        item.value = (val === undefined || val === null) ? '' : val;
      } else {
        item.type = 'text';
        if (key === 'description') { item.textarea = true; }
        if (val !== null && typeof val === 'object') { val = JSON.stringify(val); }
        item.value = (val === undefined || val === null) ? '' : val;
      }
      // The 1.6 Group Order placeholder and help text (GroupManagement.php
      // ~119-140). The text is the attribute description (api/models/Group.js).
      if (model === 'group' && key === 'order') {
        item.placeholder = '0';
        item.help = attr.description;
      }
      formItems[key] = item;
    });

    // Associations: singleton -> select, multi -> checkbox table. (workflows are
    // omitted by the helper's default skip list.)
    Object.assign(formItems, await sails.helpers.associationFields.with({ model, record }));

    // Plugin-contributed host fields (e.g. the AD plugin's tab).
    if (model === 'host' && sails.plugins && sails.plugins.hostForm) {
      Object.assign(formItems, await sails.plugins.hostForm(record));
    }
    // Plugin group grant tabs (the printer and snapin plugins' Printer and
    // Snapin Associations, 1.6 GroupManagement.php ~1799-1812).
    if (model === 'group' && sails.plugins && sails.plugins.groupForm) {
      Object.assign(formItems, await sails.plugins.groupForm(record));
    }

    let names = sails.helpers.pageTitle.with({identity: model});
    // A user has a username, not a name.
    let name = record.name || record.username || '';
    let data = {
      model,
      // The FOG 1.6 content header and tab title (FOGPage.php:481): the
      // section, then "Edit: <name> ID: <id>".
      // The guard is live: this action takes its model from the URL, and a
      // plugin can route an edit page for a model the map does not name. Then
      // section is undefined, and the layout renders no content header.
      section: names && names.section,
      page: `Edit: ${name} ID: ${record.id}`,
      partialname: false
    };
    // The sticky FOG 1.6 info card above the tabs.
    data.infoCard = await sails.helpers.infoCard.with({ model, record });
    let tabOrder = await sails.helpers.formTabs.with({ model, formItems });
    // One form per tab, each posting only its own fields to the same save
    // endpoint (general/save changes only the fields it receives).
    data.form = await sails.helpers.formGenerator.with({
      model,
      mode: 'edit',
      method: 'post',
      action: `/${plural}/edit/${id}`,
      id: `${model}-edit`,
      classes: [`${model}-edit-form`],
      formItems,
      tabOrder,
      record: { id: String(record.id), name },
      listUrl: `/${plural}`,
      panes: model === 'group' ? [{tab: 'Host Associations', html: groupHostPane(name)}] : []
    });
    // The Host Associations table and buttons.
    if (model === 'group') { data.partialname = GROUP_PARTIAL; }
    // The user edit page gets an admin credential panel (reset password /
    // regenerate API token) rendered by pages/create.ejs.
    if (model === 'user') { data.credentialPanel = { userId: String(id) }; }
    return data;
  }
};
