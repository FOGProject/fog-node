/**
 * Whether a GET route answers a path (issue #148).
 *
 * The plugins hook builds sails.config.globals.knownGetPaths at lift: every
 * GET (or verb-less) route path of config/routes.js and of each enabled
 * plugin. This helper matches one path against that set, segment by segment.
 * A `:param` segment on either side matches any one segment, so the concrete
 * path /hosts/edit/abc and the pattern /hosts/edit/:id both match the route
 * /hosts/edit/:id.
 *
 * The sidebar builder (build-menu) uses it to hide a link whose page has no
 * route yet. It is the only route matcher; reuse it, do not write another.
 *
 * Usage: sails.helpers.isKnownGetPath.with({path: '/hosts/pending'}) -> false
 *
 * No .now(): Sails builds helpers with execStyle 'natural'
 * (node_modules/sails/lib/hooks/helpers/index.js), so .with() on a sync
 * helper returns the value itself, and the value has no .now().
 */
const isParam = (segment) => segment.startsWith(':');

// True when two paths have the same number of segments and each pair of
// segments is equal or has a :param on one side.
const segmentsMatch = (a, b) => {
  const left = a.split('/');
  const right = b.split('/');
  return left.length === right.length &&
    left.every((segment, i) => segment === right[i] || isParam(segment) || isParam(right[i]));
};

module.exports = {
  friendlyName: 'Is known GET path',
  description: 'Whether a GET route of the app or of an enabled plugin answers a path.',
  sync: true,
  inputs: {
    path: {type: 'string', required: true, description: 'A path such as /hosts/pending, or a pattern such as /roles/edit/:id.'}
  },
  exits: {
    success: {outputType: 'boolean'}
  },
  // A sync machine must answer through exits.success. A plain return value
  // makes the call throw "not actually synchronous".
  fn: function ({path}, exits) {
    const known = sails.config.globals.knownGetPaths || new Set();
    return exits.success(known.has(path) || [...known].some((route) => segmentsMatch(route, path)));
  }
};
