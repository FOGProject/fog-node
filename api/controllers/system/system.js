module.exports = {
  friendlyName: 'Info',
  description: 'Info system.',
  inputs: {
  },
  exits: {
  },
  fn: async function (inputs) {
    return await sails.helpers.system.hwinfo();
  }
};
