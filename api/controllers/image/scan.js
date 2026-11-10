module.exports = {
  friendlyName: 'Scan image store',
  description: 'Scan the image store directory and create Image records for newly-found image folders.',
  fn: async function () {
    let req = this.req;
    let res = this.res;

    // Creating image records, so require the image create permission.
    if (!sails.helpers.audit.can(req, 'image.create')) { return res.forbidden(); }

    return res.json(await sails.helpers.image.scanStore());
  }
};
