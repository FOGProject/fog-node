/**
 * The DataTables server-side rows of an AuditLog view: the Audit Log page
 * (audit/datatable.js) and the Activity page (activity/datatable.js). The caller
 * checks its own permission first, then calls this helper.
 *
 * The page size is bounded in the query, as 1.6 AuditManagement.php does: the
 * trail grows for the life of the install, so no request reads it whole. A
 * `length` that is missing, -1, not a number, or above MAX_ROWS reads MAX_ROWS
 * rows.
 *
 * Search: a case-insensitive substring match on the searchFields. It runs in the
 * database query. Without makeLikeModifierCaseInsensitive, sails-mongo matches
 * case-sensitively. With a search, the query is {and: [where, {or: search}]}; a
 * `where` of {} is left out, so the query is {or: search}.
 *
 * recordsTotal counts the rows that match `where`, not the whole trail.
 *
 * Order: createdAt DESC, then id DESC as a tie-break, so paging never skips or
 * repeats rows that share a millisecond. The client sets ordering: false.
 *
 * Inputs: req, where (the base filter; {} for none), searchFields (field names),
 * fields (the row fields to pick), extra (optional: called with the stored row,
 * returns more keys to add to the picked row, such as Activity's `summary`).
 *
 * Usage: await sails.helpers.audit.datatable.with({req, where, searchFields, fields})
 */
const MAX_ROWS = 500;

module.exports = {
  friendlyName: 'Audit datatable',
  description: 'AuditLog rows as DataTables server-side rows.',
  inputs: {
    req: {type: 'ref', required: true},
    // Typed, so a wrong shape fails at the call, not deep in the query.
    where: {type: {}, required: true},
    searchFields: {type: ['string'], required: true},
    fields: {type: ['string'], required: true},
    extra: {type: 'ref', defaultsTo: null}
  },
  exits: {
    success: {description: '{draw, recordsTotal, recordsFiltered, data}.'}
  },
  fn: async function ({req, where, searchFields, fields, extra}) {
    // Safe for any JSON value (api/helpers/datatables/parse-request.js).
    const parsed = sails.helpers.datatables.parseRequest.with({body: req.body});
    const start = parsed.start;
    const text = parsed.search;
    // A length that is missing, -1, not a number, or above MAX_ROWS reads MAX_ROWS.
    const length = parsed.length > 0 && parsed.length <= MAX_ROWS ? parsed.length : MAX_ROWS;

    // Waterline normalizes criteria in place, and one request runs up to three
    // queries on `where`, so each query gets its own copy.
    const queryOf = () => {
      if (text === '') { return _.cloneDeep(where); }
      const search = {or: searchFields.map((field) => ({[field]: {contains: text}}))};
      return Object.keys(where).length === 0 ? search : {and: [_.cloneDeep(where), search]};
    };
    const recordsTotal = await sails.models.auditlog.count(_.cloneDeep(where));
    const recordsFiltered = text === '' ? recordsTotal : await sails.models.auditlog.count(queryOf()).meta({makeLikeModifierCaseInsensitive: true});
    const rows = await sails.models.auditlog.find(queryOf())
      .meta({makeLikeModifierCaseInsensitive: true})
      .sort([{createdAt: 'DESC'}, {id: 'DESC'}])
      .skip(start)
      .limit(length);
    return {
      draw: parsed.draw,
      recordsTotal,
      recordsFiltered,
      data: rows.map((row) => Object.assign(_.pick(row, fields), extra ? extra(row) : {}))
    };
  }
};
