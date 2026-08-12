module.exports = {
  friendlyName: 'Datatable',
  description: 'List datatable.',
  fn: async function () {
    let req = this.req;
    let res = this.res;
    return await sails.helpers.datatables.getData(req, res);
  }
};
