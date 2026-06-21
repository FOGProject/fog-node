module.exports = {
  friendlyName: 'Global search',
  description: 'Search across the user-facing models, filtered by the caller\'s read permissions.',
  inputs: {
    q: {
      type: 'string',
      defaultsTo: ''
    },
    permissions: {
      description: 'The caller\'s resolved permissions object (req.user.permissions).',
      type: 'ref',
      defaultsTo: {}
    },
    limit: {
      type: 'number',
      defaultsTo: 10
    }
  },
  exits: {
    success: {
      outputFriendlyName: 'Result groups'
    }
  },
  fn: async function (inputs) {
    let q = (inputs.q || '').trim(),
      perms = inputs.permissions || {},
      groups = [];

    if (!q) {
      return groups;
    }

    // Escape the query so it is matched as a literal substring (no regex
    // injection / ReDoS from user input), then match case-insensitively.
    let escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // The user-facing entities and which string fields to search.
    let searchConfig = [
      { model: 'host', label: 'Hosts', fields: ['name', 'description', 'ip'] },
      { model: 'image', label: 'Images', fields: ['name', 'description'] },
      { model: 'printer', label: 'Printers', fields: ['name', 'description', 'printerModel', 'ip'] },
      { model: 'storagegroup', label: 'Storage Groups', fields: ['name', 'description'] },
      { model: 'storagenode', label: 'Storage Nodes', fields: ['name', 'description', 'ip'] },
      { model: 'pxemenu', label: 'iPXE Menus', fields: ['name', 'description'] },
      { model: 'user', label: 'Users', fields: ['username', 'email', 'displayName'] }
    ];

    for (let cfg of searchConfig) {
      let Model = sails.models[cfg.model];
      if (!Model) { continue; }
      // Permission gate: only search models the caller can read.
      if (!_.get(perms, 'stock.' + cfg.model + '.read')) { continue; }

      let fields = cfg.fields.filter((f) => !_.isUndefined(Model.attributes[f]));
      if (!fields.length) { continue; }

      try {
        // Use the native Mongo collection for a case-insensitive regex search
        // (Waterline's `contains` is case-sensitive under sails-mongo).
        let db = sails.getDatastore(Model.datastore).manager,
          collection = db.collection(Model.tableName),
          docs = await collection
            .find({ $or: fields.map((f) => ({ [f]: { $regex: escaped, $options: 'i' } })) })
            .limit(inputs.limit)
            .toArray();
        if (docs.length) {
          groups.push({
            model: cfg.model,
            label: cfg.label,
            plural: cfg.model + 's',
            items: docs.map((d) => ({
              id: String(d._id),
              name: d.name || d.username || String(d._id)
            }))
          });
        }
      } catch (err) {
        sails.log.warn(`globalSearch: ${cfg.model} search failed: ${err.message}`);
      }
    }

    return groups;
  }
};
