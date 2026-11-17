/**
 * The FOG settings catalog
 * (sails.config.fogSettings)
 *
 * The one code-side list of the runtime settings an admin may change while
 * fog-node runs. The database holds only the values an admin changed: one
 * Setting record per changed key. A key with no record, or with a bad stored
 * value, reads as its `default`. Read a value with
 * `await sails.helpers.settings.get(key)` (api/helpers/settings/get.js).
 *
 * FOG 1.6 keeps the same facts in `globalSettings` rows that
 * commons/schema.php seeds, plus a per-key switch in
 * FOGConfigurationPage.php. fog-node seeds no rows (`migrate: 'safe'`), so
 * the types, choices and validation live here, next to the readers.
 *
 * What goes in:
 *
 * - A key enters the catalog in the same change as the code that reads it,
 *   or in the change that moves its reader onto `sails.helpers.settings.get`.
 *   No key is listed for later: a listed key with no reader is a control
 *   that does nothing.
 * - Install-time configuration (the database URL, ports, paths, secrets)
 *   stays in config/local.js, which `npm run setup` writes. The catalog
 *   holds only what an admin may change while fog-node runs.
 * - A credential or a secret never goes in the catalog.
 * - The `schema` record (written by tools/setup/lib/schema.js, read by
 *   `npm run migrate`) is not a setting, and is never a catalog key.
 *
 * Each entry, keyed by the FOG 1.6 setting name:
 *
 *   category     the FOG 1.6 category name, e.g. 'FOG View Settings'
 *   description  the FOG 1.6 settingDesc text, as plain text (no HTML).
 *                Where fog-node behaves differently from 1.6, the text says
 *                what fog-node does: a wrong description on a trust setting
 *                misleads the admin who sets it.
 *   type         'select', 'number', 'text' or 'checkbox'
 *   options      for a 'select' only: an array of {value, label}
 *   default      the value when no record exists or the stored value is bad
 *   normalize    (value) => the cleaned value, or undefined for a bad value.
 *                The Setting value column is type json, so a stored value
 *                can be a string or a number.
 *   reload       true when the change takes effect after a page reload
 *                (the FOG 1.6 reload flag)
 */

module.exports.fogSettings = {

  // The list page tables (api/helpers/table-settings.js, issue #150).
  // 1.6 schema.php step 296.
  FOG_TABLE_SCROLL_MODE: {
    category: 'FOG View Settings',
    description: 'This setting defines how the management tables page through '
      + 'records. infinite loads rows as you scroll; paged uses the classic '
      + 'page-number bar.',
    type: 'select',
    options: [
      {value: 'infinite', label: 'Infinite scroll'},
      {value: 'paged', label: 'Paged'}
    ],
    default: 'infinite',
    // 'infinite' or 'paged', in any case and with surrounding spaces.
    normalize: (value) => {
      let mode = String(value).trim().toLowerCase();
      return (mode === 'infinite' || mode === 'paged') ? mode : undefined;
    },
    reload: true
  },

  // The rows per page of a list table with no saved per-user layout
  // (api/helpers/table-settings.js, issue #150). The description is the
  // repaired text of 1.6 schema.php step 397.
  FOG_VIEW_DEFAULT_SCREEN: {
    category: 'FOG View Settings',
    description: 'This setting defines how many rows a management list shows '
      + 'to a user who has not yet saved a layout of their own. Column order, '
      + 'visibility, sort and row count are remembered per user once changed, '
      + 'so this is the starting default rather than a fixed limit.',
    type: 'select',
    options: [
      {value: 10, label: '10'},
      {value: 25, label: '25'},
      {value: 50, label: '50'},
      {value: 100, label: '100'},
      {value: -1, label: 'All'}
    ],
    default: 25,
    // Whole numbers only: a positive count, or -1 for all rows. A numeric
    // string such as '50' counts. A count the picker does not offer stays
    // valid, as in 1.6.
    normalize: (value) => {
      let text = String(value).trim();
      return /^(-1|[1-9][0-9]*)$/.test(text) ? Number(text) : undefined;
    },
    reload: true
  },

  // Issue #201: the readers below used to call Setting.findOne themselves.
  // Each normalize() and default copies the rule of the reader it replaced,
  // so no stored value, missing record or bad value changes a decision. The
  // test in test/helpers/settings-catalog.test.js holds the old rules.

  // How api/helpers/agent/resolve-host.js matches an enrolling agent
  // (1.6 schema.php). That reader acts only on 'off'. 'log' and
  // 'enforce' both keep the SMBIOS-first match, as the 1.6 enrollment path
  // does with either, and a missing record reads 'log' (not 'off').
  FOG_HOST_IDENTIFY_SMBIOS: {
    category: 'General Settings',
    description: 'How much to trust the SMBIOS identity (UUID, system serial, '
      + 'chassis asset tag) a fog-agent reports when it enrolls. Off: the MAC '
      + 'addresses alone find the host. Log or Enforce: a unique firmware '
      + 'match wins over the MAC. fog-node has no boot identity path yet, so '
      + 'Log and Enforce act the same.',
    type: 'select',
    options: [
      {value: 'off', label: 'Off'},
      {value: 'log', label: 'Log'},
      {value: 'enforce', label: 'Enforce'}
    ],
    default: 'log',
    // 'off', 'log' or 'enforce', in any case and with surrounding spaces.
    normalize: (value) => {
      let mode = String(value).trim().toLowerCase();
      return (mode === 'off' || mode === 'log' || mode === 'enforce') ? mode : undefined;
    },
    reload: false
  },

  // The deploy shortcut of api/helpers/agent/auto-approve.js (1.6 schema.php
  // step 416, moved to FOG Agent by a later step). A value below 1 disables
  // the shortcut, so a stored 0 is a good value and stays 0. Only a value
  // that is not a number reads as the default.
  FOG_AGENT_ENROLL_DEPLOY_WINDOW: {
    category: 'FOG Agent',
    description: 'Hours after this server completes a deploy to a host during '
      + 'which an agent presenting that host\'s firmware identity is enrolled '
      + 'without an admin approving it. A value below 1 disables the '
      + 'shortcut. fog-node does not record deploys yet, so the shortcut does '
      + 'not fire until it does.',
    type: 'number',
    default: 24,
    // Number(), as the reader did: '' and null are 0, which disables.
    normalize: (value) => {
      let hours = Number(value);
      return Number.isNaN(hours) ? undefined : hours;
    },
    reload: false
  },

  // The poll_interval of POST /agent/v1/poll (api/controllers/agent/poll.js,
  // 1.6 schema.php step 116), in seconds.
  FOG_CLIENT_CHECKIN_TIME: {
    category: 'FOG Client',
    description: 'This setting returns the client service checkin times to '
      + 'the server.',
    type: 'number',
    default: 60,
    // An integer, because the Go agent's PollInterval is an int and fails to
    // decode 90.5. 1.6 casts with (int) and passes 0 or a negative number
    // on: the agent then keeps its own default. A missing or non-numeric
    // value gives the default.
    normalize: (value) => {
      let interval = parseInt(value, 10);
      return Number.isNaN(interval) ? undefined : interval;
    },
    reload: false
  },

  // The password reveal control of api/helpers/form-generator.js (1.6
  // schema.php step 271). 1.6 defaults to on. fog-node is off when no record
  // exists, and stays so.
  FOG_ENABLE_SHOW_PASSWORDS: {
    category: 'General Settings',
    description: 'Show a control that displays a password field as plain '
      + 'text. Off when no value is set.',
    type: 'checkbox',
    default: false,
    // FOG stores its settings as strings, so '0' and 'false' mean off. Always
    // a boolean, so no stored value is bad.
    normalize: (value) => !!value && value !== '0' && value !== 'false',
    reload: false
  }

};
