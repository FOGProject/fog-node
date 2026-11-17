/**
 * POST /api/v1/audit/datatable
 *
 * The rows of the Audit Log page (GET /audit), as DataTables server-side rows
 * {draw, recordsTotal, recordsFiltered, data}. Needs audit.view. The paging, the
 * 500-row bound, the search and the order are in api/helpers/audit/datatable.js.
 */
const SEARCH_FIELDS = ['createdBy', 'type', 'permission', 'outcome', 'subjectType', 'subjectLabel', 'ip'];
const ROW_FIELDS = [
  'id', 'createdAt', 'createdBy', 'ip', 'authSource', 'type', 'subjectType', 'subjectId',
  'subjectLabel', 'permission', 'outcome', 'correlationId', 'affectedCount', 'text'
];

module.exports = {
  friendlyName: 'Audit log datatable',
  description: 'The audit trail, as DataTables server-side rows.',
  fn: async function () {
    const req = this.req;
    const res = this.res;
    if (!sails.helpers.audit.can(req, 'audit.view')) {
      return res.forbidden();
    }
    return res.json(await sails.helpers.audit.datatable.with({req, where: {}, searchFields: SEARCH_FIELDS, fields: ROW_FIELDS}));
  }
};
