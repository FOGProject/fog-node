module.exports = {
  friendlyName: 'Listme',
  description: 'Listme user.',
  fn: async function() {
    let req = this.req;
    return req.user;
  }
};
