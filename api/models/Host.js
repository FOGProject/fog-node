/**
 * Host.js
 *
 * @description :: A model definition represents a database table/collection.
 * @docs        :: https://sailsjs.com/docs/concepts/models-and-orm/models
 */
const MAC_HEX = /^[0-9a-fA-F]{12}$/;

// Normalise + validate the `macs` json array: accept any common separator style
// (colon/hyphen/dot) or bare 12 hex, store the canonical upper-case colon form,
// drop blanks/dupes, and reject anything that isn't a MAC address.
function normalizeMacs(values, proceed) {
  if (!Object.prototype.hasOwnProperty.call(values, 'macs')) {
    return proceed();
  }
  let raw = values.macs;
  if (typeof raw === 'string') {
    raw = raw.split(/[\s,]+/);
  }
  if (!Array.isArray(raw)) {
    raw = (raw === null || typeof raw === 'undefined') ? [] : [raw];
  }
  let out = [];
  for (let entry of raw) {
    if (entry === null || typeof entry === 'undefined') {
      continue;
    }
    let hex = String(entry).replace(/[\s.:-]/g, '');
    if (hex === '') {
      continue;
    }
    if (!MAC_HEX.test(hex)) {
      return proceed(new Error(`Invalid MAC address: ${entry}`));
    }
    // Stored canonical form: bare lower-case hex, no separators (e.g.
    // "aabbccddeeff"). Displayed as aa:bb:cc:dd:ee:ff at the view layer.
    let mac = hex.toLowerCase();
    if (out.indexOf(mac) === -1) {
      out.push(mac);
    }
  }
  values.macs = out;
  return proceed();
}

// Normalise the `tags` json array: accept a comma/newline-separated string or an
// array, trim, drop blanks, and de-dupe (case-insensitively, keeping first form).
function normalizeTags(values) {
  if (!Object.prototype.hasOwnProperty.call(values, 'tags')) {
    return;
  }
  let raw = values.tags;
  if (typeof raw === 'string') {
    raw = raw.split(/[\n,]+/);
  }
  if (!Array.isArray(raw)) {
    raw = (raw === null || typeof raw === 'undefined') ? [] : [raw];
  }
  let out = [], seen = {};
  for (let entry of raw) {
    if (entry === null || typeof entry === 'undefined') { continue; }
    let tag = String(entry).trim();
    if (tag === '') { continue; }
    let key = tag.toLowerCase();
    if (!seen[key]) { seen[key] = true; out.push(tag); }
  }
  values.tags = out;
}

// Canonicalise the fingerprint fields so identity matching is stable: trim, and
// lower-case the guid/serial/asset (SMBIOS values vary in case across firmware).
function normalizeIdentity(values) {
  ['guid', 'serial', 'asset'].forEach((k) => {
    if (Object.prototype.hasOwnProperty.call(values, k) && typeof values[k] === 'string') {
      values[k] = values[k].trim().toLowerCase();
    }
  });
}

module.exports = {
  attributes: {
    name: {
      type: 'string',
      required: true,
      maxLength: 63,
      regex: /^[a-z\d]([a-z\d\-]{0,61}[a-z\d])?(\.[a-z\d]([a-z\d\-]{0,61}[a-z\d])?)*$/i,
      unique: true
    },
    description: {
      type: 'string'
    },
    // NOTE: not `unique` and not `isUUID`. A unique index on an optional field
    // makes every host created without a guid collide (empty/null guids are
    // "equal"), which 409s the 2nd host; and isUUID rejects the empty string on
    // edit. The hardware guid is set/validated at registration time instead.
    guid: {
      type: 'string'
    },
    macs: {
      type: 'json'
    },
    // Free-form labels for organising/filtering hosts. These replace 1.x groups
    // for the "named set + group-by" use case (see docs/adr/0001). Stored as a
    // de-duped string array.
    tags: {
      type: 'json'
    },
    // --- Hardware fingerprint (issue #198): a host is identified by the scored
    //     makeup of the physical machine, not by MAC alone. iPXE exposes these
    //     SMBIOS values natively. `guid` is the SMBIOS product UUID. ---
    serial: {
      type: 'string'
    },
    asset: {
      type: 'string'
    },
    // --- FOG 1.x `hosts` scalar fields (friendly names; snake_case
    //     security fields normalised to camelCase) ---
    ip: {
      type: 'string'
    },
    building: {
      type: 'number',
      isInteger: true,
      defaultsTo: 0
    },
    deployed: {
      type: 'string'
    },
    createdBy: {
      type: 'string'
    },
    // Active Directory domain-join fields moved OUT to the `ad` plugin
    // (plugins/ad) -- it owns its own collection + contributes the AD tab via
    // the host:form/host:save/host:destroy hooks. See docs/adr/0001.
    productKey: {
      type: 'string'
    },
    printerLevel: {
      type: 'number',
      isInteger: true,
      defaultsTo: 0
    },
    kernelArgs: {
      type: 'string'
    },
    kernel: {
      type: 'string'
    },
    kernelDevice: {
      type: 'string'
    },
    init: {
      type: 'string'
    },
    pending: {
      type: 'boolean',
      defaultsTo: false
    },
    pubKey: {
      type: 'string'
    },
    secToken: {
      type: 'string'
    },
    secTime: {
      type: 'string'
    },
    pingstatus: {
      type: 'string'
    },
    biosexit: {
      type: 'string'
    },
    efiexit: {
      type: 'string'
    },
    enforce: {
      type: 'boolean',
      defaultsTo: false
    },
    token: {
      type: 'string'
    },
    tokenlock: {
      type: 'boolean',
      defaultsTo: false
    },
    image: {
      model: 'image'
    },
    groups: {
      collection: 'group',
      via: 'hosts'
    },
    workflows: {
      collection: 'workflow',
      via: 'host'
    },
    snapins: {
      collection: 'snapin',
      via: 'hosts',
      dominant: true
    },
    printers: {
      collection: 'printer',
      via: 'hosts',
      dominant: true
    },
    defaultPrinter: {
      model: 'printer'
    }
  },
  beforeCreate: function(values, proceed) {
    normalizeIdentity(values);
    normalizeTags(values);
    return normalizeMacs(values, proceed);
  },
  beforeUpdate: function(values, proceed) {
    normalizeIdentity(values);
    normalizeTags(values);
    return normalizeMacs(values, proceed);
  }
};
