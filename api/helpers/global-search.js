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
      description: 'The most results per type. 0 or less means no limit, as in FOG 1.6.',
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
    let q = (inputs.q || '').trim();
    let perms = inputs.permissions || {};
    let groups = [];

    if (!q) {
      return groups;
    }

    // Escape the query so it is matched as a literal substring (no regex
    // injection / ReDoS from user input), then match case-insensitively.
    let escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let escaped = escapeRe(q);

    // MACs are stored as bare lower-case hex with no separators (e.g.
    // "aabbccddeeff"), so strip any colon/hyphen/dot/space the user typed first
    // -- lets "aa:bb:cc", "AA-BB-CC" and "aabbcc" all match the `macs` array.
    let macStripped = q.replace(/[\s.:-]/g, '');
    let macEscaped = macStripped ? escapeRe(macStripped) : '';

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
        let db = sails.getDatastore(Model.datastore).manager;
        let collection = db.collection(Model.tableName);
        let or = [];
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
        // The FOG 1.6 order (Route.php:5657): names that start with the term
        // first, then by name. Every searchable type names a record by
        // `name`, except users, which have `username` (as the items below).
        let nameField = _.isUndefined(Model.attributes.name) ? 'username' : 'name';
        let pipeline = [
          { $match: { $or: or } },
          { $addFields: { _searchPrefix: { $regexMatch: { input: '$' + nameField, regex: '^' + escaped, options: 'i' } } } },
          // true sorts after false, so -1 puts the prefix matches first.
          { $sort: { _searchPrefix: -1, [nameField]: 1 } }
        ];
        // 0 or less is no limit (1.6 Route.php:5658-5660), so a negative
        // value never reaches $limit.
        if (inputs.limit > 0) { pipeline.push({ $limit: inputs.limit }); }
        // A case-insensitive collation sorts the names as the 1.6 MySQL
        // collation does ("b-lab" before "X-lab"); byte order would not.
        let docs = await collection.aggregate(pipeline, { collation: { locale: 'en', strength: 2 } }).toArray();
        if (docs.length) {
          // The 1.6 group label (the singular type name). A plugin type that
          // page-title.js does not know uses its own label.
          let title = sails.helpers.pageTitle.with({ identity: cfg.model });
          groups.push({
            model: cfg.model,
            label: cfg.label,
            singular: title ? title.singular : cfg.label,
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
