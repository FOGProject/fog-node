module.exports = {
  friendlyName: 'Association fields',
  description: 'Build edit-form items for a model\'s associations: singleton (model) associations become selects, multi (collection) associations become checkbox tables. Pass the populated record, or null for a new record.',
  inputs: {
    model: {
      type: 'string',
      required: true
    },
    record: {
      type: 'ref',
      defaultsTo: null
    },
    skip: {
      description: 'Association attribute names to omit.',
      type: 'ref',
      defaultsTo: ['groups', 'workflows']
    }
  },
  exits: {
    success: {
      outputFriendlyName: 'Association form items'
    }
  },
  fn: async function (inputs) {
    let Model = sails.models[inputs.model];
    if (!Model) {
      return {};
    }
    let attrs = Model.attributes,
      record = inputs.record || {},
      skip = inputs.skip || [],
      out = {};

    for (let key of Object.keys(attrs)) {
      let attr = attrs[key];
      if (skip.indexOf(key) !== -1) { continue; }
      let targetIdentity = attr.model || attr.collection;
      if (!targetIdentity || !sails.models[targetIdentity]) { continue; }

      let Target = sails.models[targetIdentity],
        sortKey = Target.attributes.name ? 'name ASC' : (Target.attributes.username ? 'username ASC' : 'createdAt ASC'),
        candidates = await Target.find().sort(sortKey),
        label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()),
        labelOf = (c) => c.name || c.username || c.id;

      if (attr.model) {
        let curId = (record[key] && (record[key].id || record[key])) || null;
        out[key] = {
          text: label, classes: [], textarea: false, type: 'select',
          options: candidates.map((c) => ({ value: c.id, label: labelOf(c), selected: c.id === curId }))
        };
      } else {
        let curIds = (record[key] || []).map((x) => x.id || x);
        out[key] = {
          text: label, classes: [], textarea: false, type: 'checktable',
          options: candidates.map((c) => ({ value: c.id, label: labelOf(c), checked: curIds.indexOf(c.id) !== -1 }))
        };
      }
    }
    return out;
  }
};
