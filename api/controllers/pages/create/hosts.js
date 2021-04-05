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
        header: 'Create New Host',
        forms: await sails.helpers.formGenerator.with({
          model: 'host',
          method: 'post',
          action: '/hosts/create',
          id: 'host-create',
          classes: [
            'test',
            'host-create-input-form'
          ]
        }),
        formItems: {
          hostname: {
            input: true,
            textarea: false,
            text: 'Host Name',
            type: 'text',
            maxlength: 15,
            validation: "/^((?!-)[A-Za-z0-9-]{1,63}(?<!-)\.)+[A-Za-z]{2,6}$/",
            required: true,
            id: 'hostname',
            class: ['hostname'],
            placeholder: 'MYHOSTNAME'
          },
          macs: {
            input: true,
            textarea: false,
            text: 'MAC Address',
            type: 'text',
            maxlength: 17,
            validation: "/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})|([0-9a-fA-F]{4}\.[0-9a-fA-F]{4}\.[0-9a-fA-F]{4})$/",
            required: true,
            id: 'macaddress',
            class: [],
            placeholder: 'AA:BB:CC:DD:EE:FF'
          },
          description: {
            input: false,
            textarea: true,
            text: 'Description',
            id: 'hostdescription',
            class: [],
            placeholder: 'Some general description'
          }
        },
        title: 'Create New Host',
        partialname: false
      };
    let partial = path.join(partialPath, `${data.model}.js`);
    if (fs.existsSync(partial)) {
      data.partialname = partial;
    }
    return data;
  }
};
