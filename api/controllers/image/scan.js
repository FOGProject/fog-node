module.exports = {
  friendlyName: 'Scan image store',
  description: 'Scan the image store directory and create Image records for newly-found image folders.',
  fn: async function () {
    let req = this.req,
      res = this.res,
      perms = req.user && req.user.permissions && req.user.permissions.stock && req.user.permissions.stock.image;

    // Creating image records, so require the image create permission.
    if (!perms || !perms.create) { return res.forbidden(); }

    return res.json(await sails.helpers.image.scanStore());
  }
};
