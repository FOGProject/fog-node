/**
 * PxeMenu.js
 *
 * @description :: A PXE/iPXE boot-menu entry. Mirrors FOG 1.x `pxeMenuOptions`
 *                 (the sidebar's "iPXE Menu"). The separate 1.x `ipxe`
 *                 hardware-mapping table is intentionally not modelled yet.
 * @docs        :: https://sailsjs.com/docs/concepts/models-and-orm/models
 */
module.exports = {
  attributes: {
    name: {
      type: 'string',
      required: true,
      unique: true
    },
    description: {
      type: 'string'
    },
    params: {
      type: 'string'
    },
    default: {
      type: 'boolean',
      defaultsTo: false
    },
    regMenu: {
      type: 'boolean',
      defaultsTo: false
    },
    args: {
      type: 'string'
    },
    hotkey: {
      type: 'boolean',
      defaultsTo: false
    },
    keysequence: {
      type: 'string'
    }
  }
};
