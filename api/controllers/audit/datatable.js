/**
 * POST /api/v1/audit/datatable
 *
 * The rows of the Audit Log page (GET /audit), as DataTables server-side rows
 * {draw, recordsTotal, recordsFiltered, data}. Needs audit.view.
 *
 * The page size is bounded in the query, as 1.6 AuditManagement.php does: the
 * trail grows for the life of the install, so no request reads it whole. A
 * `length` that is missing, -1, not a number, or above MAX_ROWS reads MAX_ROWS
 * rows.
 *
 * Search: a case-insensitive substring match on createdBy, type, permission,
 * outcome, subjectType, subjectLabel and ip. It runs in the database query.
 * Without makeLikeModifierCaseInsensitive, sails-mongo matches case-sensitively.
 *
 * Order: createdAt DESC, then id DESC as a tie-break, so paging never skips or
 * repeats rows that share a millisecond. The client sets ordering: false.
 */
const MAX_ROWS = 500;
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
    // Safe for any JSON value (api/helpers/datatables/parse-request.js).
    const parsed = sails.helpers.datatables.parseRequest.with({body: req.body});
    const start = parsed.start;
    const text = parsed.search;
    // A length that is missing, -1, not a number, or above MAX_ROWS reads MAX_ROWS.
    const length = parsed.length > 0 && parsed.length <= MAX_ROWS ? parsed.length : MAX_ROWS;

    const where = text === '' ? {} : {or: SEARCH_FIELDS.map((field) => ({[field]: {contains: text}}))};
    const recordsTotal = await sails.models.auditlog.count();
    const recordsFiltered = text === '' ? recordsTotal : await sails.models.auditlog.count(where).meta({makeLikeModifierCaseInsensitive: true});
    const rows = await sails.models.auditlog.find(where)
      .meta({makeLikeModifierCaseInsensitive: true})
      .sort([{createdAt: 'DESC'}, {id: 'DESC'}])
      .skip(start)
      .limit(length);
    return res.json({
      draw: parsed.draw,
      recordsTotal,
      recordsFiltered,
      data: rows.map((row) => _.pick(row, ROW_FIELDS))
    });
  }
};
