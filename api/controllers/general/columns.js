module.exports = {
  friendlyName: 'Columns',
  description: 'List datatable columns.',
  fn: async function () {
    let req = this.req;
    let res = this.res;
    return await sails.helpers.datatables.getColumns(req, res);
  }
};
