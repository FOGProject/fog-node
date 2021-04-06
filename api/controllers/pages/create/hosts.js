const fs = require('fs-extra'),
  path = require('path'),
  partialPath = path.join(__dirname, '..', '..', '..','views','pages','partials','create');
module.exports = {
  friendlyName: 'View hosts create',
  description: 'Display "Hosts create" page.',
  exits: {
    success: {
      viewTemplatePath: 'pages/create'
    }
  },
  fn: async function () {
    let req = this.req,
      res = this.res,
      data = {
        model: 'host',
        header: 'Create New Host',
        formItems: {
          name: {
            textarea: false,
            text: 'Host Name',
            type: 'text',
            id: 'hostname',
            classes: ['hostname'],
            placeholder: 'MYHOSTNAME'
          },
          macs: {
            textarea: false,
            text: 'MAC Address',
            type: 'text',
            validations: {
              minLength: 12,
              maxLength: 17,
              regex: /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})|([0-9a-fA-F]{4}\.[0-9a-fA-F]{4}\.[0-9a-fA-F]{4})$/,
            },
            id: 'macaddress',
            classes: [],
            placeholder: 'AA:BB:CC:DD:EE:FF'
          },
          description: {
            textarea: true,
            text: 'Description',
            type: 'text',
            id: 'hostdescription',
            classes: [],
            placeholder: 'Some general description'
          }
        },
        formButtons: {
          Cancel: {
            classes: ['btn-warning','float-left'],
            type: 'submit'
          },
          Create: {
            classes: ['btn-success','float-right'],
            type: 'submit'
          }
        },
        partialname: false
      },
      partial = path.join(partialPath, `${data.model}.js`);
    data.title = `Create New ${data.model.charAt(0).toUpperCase() + data.model.slice(1)}`,
    data.form = await sails.helpers.formGenerator.with({
      model: data.model,
      method: 'post',
      action: `/${data.model}s/create`,
      id: `${data.model}-create`,
      classes: [`${data.model}-create-form`],
      formItems: data.formItems,
      formButtons: data.formButtons
    });
    if (fs.existsSync(partial)) {
      data.partialname = partial;
    }
    return data;
  }
};
