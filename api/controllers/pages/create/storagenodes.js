const fs = require('fs-extra'),
  path = require('path'),
  partialPath = path.join(__dirname, '..', '..', '..','views','pages','partials','create');
module.exports = {
  friendlyName: 'View storage nodes create',
  description: 'Display "Storage Node create" page.',
  exits: {
    success: {
      viewTemplatePath: 'pages/create'
    }
  },
  fn: async function () {
    let data = {
      model: 'storagenode',
      header: 'Create New Storage Node',
      formItems: {
        name: {
          textarea: false, text: 'Name', type: 'text', id: 'snname', classes: [], placeholder: 'DefaultMember'
        },
        ip: {
          textarea: false, text: 'IP Address', type: 'text', id: 'snip', classes: [], placeholder: '10.0.0.10'
        },
        path: {
          textarea: false, text: 'Image Path', type: 'text', id: 'snpath', classes: [], placeholder: '/images/'
        },
        ftppath: {
          textarea: false, text: 'FTP Path', type: 'text', id: 'snftppath', classes: [], placeholder: '/images/'
        },
        user: {
          textarea: false, text: 'Management Username', type: 'text', id: 'snuser', classes: [], placeholder: 'fogproject'
        },
        pass: {
          textarea: false, text: 'Management Password', type: 'password', id: 'snpass', classes: [], placeholder: ''
        },
        isMaster: {
          textarea: false, text: 'Is Master Node', type: 'checkbox', id: 'snmaster', classes: [], checked: false
        }
      },
      formButtons: {
        Cancel: { classes: ['btn-warning','float-start'], type: 'submit' },
        Create: { classes: ['btn-success','float-end'], type: 'submit' }
      },
      partialname: false
    };
    data.title = 'Create New Storage Node';
    data.form = await sails.helpers.formGenerator.with({
      model: data.model,
      method: 'post',
      action: `/${data.model}s/create`,
      id: `${data.model}-create`,
      classes: [`${data.model}-create-form`],
      formItems: data.formItems,
      formButtons: data.formButtons
    });
    let partial = path.join(partialPath, `${data.model}.js`);
    if (fs.existsSync(partial)) {
      data.partialname = partial;
    }
    return data;
  }
};
