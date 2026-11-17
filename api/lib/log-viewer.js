// The constants of the Log Viewer, defined once: the tail helper
// (api/helpers/log/tail.js), the tail action (api/controllers/log/tail.js),
// the page (api/controllers/pages/logviewer.js) and the tests use them.

module.exports = {
  // The read size of the tail helper, and the most bytes it reads.
  CHUNK: 4096,
  MAX_READ: 4 * 1024 * 1024,
  // The Lines select (1.6 LogViewerManagement.php:442-450), and its default.
  LINES: [10, 25, 50, 100, 250, 500, 1000],
  DEFAULT_LINES: 100
};
