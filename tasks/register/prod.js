/**
 * `tasks/register/prod.js`
 *
 * ---------------------------------------------------------------
 *
 * This Grunt tasklist will be executed instead of `default` when
 * your Sails app is lifted in a production environment (e.g. using
 * `NODE_ENV=production node app`).
 *
 * For more information see:
 *   https://sailsjs.com/anatomy/tasks/register/prod.js
 *
 */
module.exports = function(grunt) {
  grunt.registerTask('prod', [
    'polyfill:prod', //« Remove this to skip transpilation in production (not recommended)
    'compileAssets',
    'babel',         //« Remove this to skip transpilation in production (not recommended)
    'concat',
    'terser',        //« Not 'uglify': it cannot parse modern JavaScript (#115)
    'cssmin',
    // No sails-linker step: views/layouts/layout.ejs links the bundles itself
    // in production, so a production start leaves that tracked file unchanged.
  ]);
};

