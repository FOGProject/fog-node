module.exports = {
  friendlyName: 'Listme',
  description: 'Listme user.',
  fn: async function(inputs) {
    let req = this.req;
    return req.user;
  }
};
