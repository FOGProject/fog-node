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
    let escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      escaped = escapeRe(q);

    // MACs are stored as bare lower-case hex with no separators (e.g.
    // "aabbccddeeff"), so strip any colon/hyphen/dot/space the user typed first
    // -- lets "aa:bb:cc", "AA-BB-CC" and "aabbcc" all match the `macs` array.
    let macStripped = q.replace(/[\s.:-]/g, ''),
      macEscaped = macStripped ? escapeRe(macStripped) : '';

    // The user-facing entities and which string fields to search. Hosts also
    // match on their hardware identifiers (macs/serial/asset/guid) and their
    // `tags` array, so a tech can paste a MAC/serial or type a (partial) tag and
    // land on the host. `tags` is a string array; a case-insensitive substring
    // regex matches any element, giving partial-tag matches for free.
    let searchConfig = [
      { model: 'host', label: 'Hosts', fields: ['name', 'description', 'ip', 'macs', 'serial', 'asset', 'guid', 'tags'] },
      { model: 'image', label: 'Images', fields: ['name', 'description'] },
      { model: 'storagegroup', label: 'Storage Groups', fields: ['name', 'description'] },
      { model: 'storagenode', label: 'Storage Nodes', fields: ['name', 'description', 'ip'] },
      { model: 'pxemenu', label: 'iPXE Menus', fields: ['name', 'description'] },
      { model: 'user', label: 'Users', fields: ['username', 'email', 'displayName'] }
    ];

    // Append entities contributed by enabled plugins (snapins, printers, ...).
    if (sails.plugins && Array.isArray(sails.plugins.search)) {
      searchConfig = searchConfig.concat(sails.plugins.search);
    }

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
          or = [];
        for (let f of fields) {
          if (f === 'macs') {
            // Only search the bare-hex array when the stripped query still has
            // something to match (skip e.g. a lone ":" that strips to empty).
            if (macEscaped) { or.push({ macs: { $regex: macEscaped, $options: 'i' } }); }
          } else {
            or.push({ [f]: { $regex: escaped, $options: 'i' } });
          }
        }
        if (!or.length) { continue; }
        let docs = await collection.find({ $or: or }).limit(inputs.limit).toArray();
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
