/**
 * `tasks/config/terser`
 *
 * ---------------------------------------------------------------
 *
 * Minify client-side JavaScript files using terser.
 *
 * This replaces the Sails default `uglify` task (issue #115). Its uglify-es
 * cannot parse modern JavaScript, such as the class fields in the AdminLTE 4
 * bundle, so the production build failed. On Node 26 the uglify task does not
 * even load. terser parses current JavaScript and takes the same options.
 *
 */
module.exports = function(grunt) {

  grunt.config.set('terser', {
    dist: {
      src: ['.tmp/public/concat/production.js'],
      dest: '.tmp/public/min/production.min.js'
    },
    options: {
      mangle: {
        reserved: [
          'AsyncFunction',
          'SailsSocket',
          'Promise',
          'File',
          'FileList',
          'FormData',
          'Location',
          'RttcRefPlaceholder',
        ],
        keep_fnames: true//eslint-disable-line
      },
      compress: {
        keep_fnames: true//eslint-disable-line
      }
    }
  });

  // sails-hook-grunt does not load this plugin, so load it here.
  grunt.loadNpmTasks('grunt-terser');

};
