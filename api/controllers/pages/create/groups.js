const fs = require('fs-extra');
const path = require('path');
const partialPath = path.join(__dirname, '..', '..', '..','views','pages','partials','create');
module.exports = {
  friendlyName: 'View groups create',
  description: 'Display "Group create" page.',
  exits: {
    success: {
      viewTemplatePath: 'pages/create'
    }
  },
  fn: async function () {
    // ?modal=1 (fogCreateModal in assets/fog/fog.common.js): the form alone,
    // with no layout. No other signal sets the modal mode.
    let modal = this.req.query.modal === '1';
    // The fields of 1.6 _addFields (GroupManagement.php ~82-150).
    let data = {
      model: 'group',
      formItems: {
        name: {
          textarea: false,
          text: 'Group Name',
          type: 'text',
          id: 'groupname',
          classes: []
        },
        description: {
          textarea: true,
          text: 'Group Description',
          type: 'text',
          id: 'groupdescription',
          classes: []
        },
        order: {
          textarea: false,
          text: 'Group Order',
          type: 'number',
          id: 'grouporder',
          classes: [],
          placeholder: '0',
          // The 1.6 help text, kept on the attribute (api/models/Group.js).
          help: sails.models.group.attributes.order.description
        }
      },
      partialname: false
    };
    // The FOG 1.6 content header and tab title read the section, then "Create New <singular>".
    let names = sails.helpers.pageTitle.with({identity: data.model});
    data.section = names.section;
    data.page = `Create New ${names.singular}`;
    data.form = await sails.helpers.formGenerator.with({
      model: data.model,
      method: 'post',
      action: `/${data.model}s/create`,
      id: `${data.model}-create`,
      classes: [`${data.model}-create-form`],
      formItems: data.formItems,
      mode: modal ? 'create-modal' : 'create'
    });
    let partial = path.join(partialPath, `${data.model}.js`);
    if (fs.existsSync(partial)) {
      data.partialname = partial;
    }
    if (modal) {
      data.modal = true;
      data.layout = false;
    }
    return data;
  }
};
