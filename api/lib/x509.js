/**
 * The one entry point to @peculiar/x509. Require this module, not the
 * package. @peculiar/x509 3.x uses tsyringe, which needs the Reflect
 * metadata polyfill before it loads. 1.x loaded the polyfill itself;
 * 3.x leaves it to the app.
 */
require('reflect-metadata');

module.exports = require('@peculiar/x509');
