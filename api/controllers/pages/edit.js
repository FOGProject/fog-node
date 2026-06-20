/**
 * Generic edit page.
 *
 * Handles GET /<plural>/edit/:id for any model: loads the record and builds an
 * edit form from the model's scalar attributes (associations, system fields,
 * password and permissions are skipped). Submits to POST /<plural>/edit/:id,
 * which is handled by general/save.
 */
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
    let req = this.req,
      segments = req.path.split('/').filter(Boolean),
      plural = segments[0],
      model = plural.replace(/s$/, ''),
      id = req.param('id'),
      skip = ['id', 'createdAt', 'updatedAt', 'password', 'permissions'];

    if (!model || !sails.models[model]) {
      throw 'notFound';
    }

    let record = await sails.models[model].findOne({ id });
    if (!record) {
      throw 'notFound';
    }

    let attrs = sails.models[model].attributes,
      formItems = {};
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

      let label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()),
        val = record[key],
        item = { text: label, id: `${model}-${key}`, classes: [], textarea: false };

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
      formItems[key] = item;
    });

    let title = model.charAt(0).toUpperCase() + model.slice(1),
      data = {
        model,
        header: `Edit ${title}`,
        title: `Edit ${title}`,
        partialname: false
      };
    data.form = await sails.helpers.formGenerator.with({
      model,
      method: 'post',
      action: `/${plural}/edit/${id}`,
      id: `${model}-edit`,
      classes: [`${model}-edit-form`],
      formItems,
      formButtons: {
        Cancel: { classes: ['btn-warning', 'float-start'], type: 'submit' },
        Save: { classes: ['btn-success', 'float-end'], type: 'submit' }
      }
    });
    return data;
  }
};
