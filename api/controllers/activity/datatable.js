/**
 * POST /api/v1/activity/datatable
 *
 * The rows of the Activity page (GET /activity), as DataTables server-side rows
 * {draw, recordsTotal, recordsFiltered, data}. Needs activity.view.
 *
 * Activity is a view over the audit trail (1.6 ADR 0023). A row shows when the
 * write succeeded and named its record (an access.api or access.page row with a
 * subjectType), or when the event marks itself renderable (the agent events).
 * Denials, failures, sign-ins and sign-outs stay on the Audit Log page only.
 *
 * The paging, the 500-row bound, the search and the order are in
 * api/helpers/audit/datatable.js. Each row carries a server-built `summary`
 * (api/helpers/audit/summary.js).
 */
const SEARCH_FIELDS = ['createdBy', 'subjectType', 'subjectLabel', 'ip'];
const ROW_FIELDS = ['id', 'createdAt', 'createdBy', 'ip', 'text'];
// The 1.6 "Administrative actions" rule, in Waterline.
const RULE = {
  outcome: 'allowed',
  or: [
    {renderable: true},
    {type: {in: ['access.api', 'access.page']}, subjectType: {'!=': ''}}
  ]
};

module.exports = {
  friendlyName: 'Activity datatable',
  description: 'The Activity feed, as DataTables server-side rows.',
  fn: async function () {
    const req = this.req;
    const res = this.res;
    if (!sails.helpers.audit.can(req, 'activity.view')) {
      return res.forbidden();
    }
    return res.json(await sails.helpers.audit.datatable.with({
      req,
      where: RULE,
      searchFields: SEARCH_FIELDS,
      fields: ROW_FIELDS,
      extra: (row) => ({summary: sails.helpers.audit.summary.with({row})})
    }));
  }
};
