module.exports.permissions = {
  stock: {
    // The Audit Log page (GET /audit, POST /api/v1/audit/datatable). The key is
    // audit, not auditlog: a stock.auditlog entry would open the generic
    // /api/v1/:model routes on the AuditLog model (ADR 0003).
    audit: {
      view: false
    },
    // The Activity page (GET /activity, POST /api/v1/activity/datatable). The
    // key matches no model, so it opens no generic /api/v1/:model route. An
    // admin role gets it through api/helpers/permissions/resolve.js, as every leaf.
    activity: {
      view: false
    },
    host: {
      create: false,
      destroy: false,
      read: false,
      update: false
    },
    // A host's group membership is a group edit (group.update), and a new
    // group name needs group.create too (api/helpers/group/authorize.js).
    group: {
      create: false,
      destroy: false,
      read: false,
      update: false
    },
    image: {
      capture: false,
      create: false,
      deploy: false,
      destroy: false,
      read: false,
      update: false
    },
    role: {
      assign: false,
      create: false,
      destroy: false,
      read: false,
      unassign: false,
      update: false
    },
    task: {
      create: false,
      destroy: false,
      read: false,
      update: false
    },
    user: {
      create: false,
      destroy: false,
      read: false,
      update: false
    },
    setting: {
      create: false,
      destroy: false,
      read: false,
      update: false,
    },
    workflow: {
      create: false,
      destroy: false,
      read: false,
      update: false
    },
    storagegroup: {
      create: false,
      destroy: false,
      read: false,
      update: false
    },
    storagenode: {
      create: false,
      destroy: false,
      read: false,
      update: false
    },
    pxemenu: {
      create: false,
      destroy: false,
      read: false,
      update: false
    }
  }
};
