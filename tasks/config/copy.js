/**
 * `tasks/config/copy`
 *
 * ---------------------------------------------------------------
 *
 * Copy files and/or folders.
 *
 * For more information, see:
 *   https://sailsjs.com/anatomy/tasks/config/copy.js
 *
 */
module.exports = function(grunt) {

  grunt.config.set('copy', {
    dev: {
      files: [
        {
          expand: true,
          cwd: './assets',
          src: ['**/*.!(coffee|less)'],
          dest: '.tmp/public'
        },
        {
          expand: true,
          cwd: './node_modules',
          src: [
            'admin-lte/dist/js/adminlte.min.js',
            'bootstrap/dist/js/bootstrap.bundle.min.js',
            'datatables/media/js/jquery.dataTables.min.js',
            'jquery/dist/jquery.min.js',
            'select2/dist/js/select2.full.min.js'
          ],
          dest: '.tmp/public/js'
        },
        {
          expand: true,
          cwd: './node_modules',
          src: [
            'admin-lte/dist/css/adminlte.min.css',
            'bootstrap/dist/css/bootstrap.min.css',
            'datatables/media/css/jquery.dataTables.min.css',
            'font-awesome/css/font-awesome.min.css',
            'icheck-bootstrap/icheck-bootstrap.min.css',
            'select2/dist/css/select2.min.js',
          ],
          dest: '.tmp/public/styles'
        },
        {
          expand: true,
          cwd: './node_modules',
          src: ['font-awesome/fonts/**'],
          dest: '.tmp/public/styles'
        }
      ]
    },
    build: {
      files: [{
        expand: true,
        cwd: '.tmp/public',
        src: ['**/*'],
        dest: 'www'
      }]
    },
    beforeLinkBuildProd: {
      files: [{
        expand: true,
        cwd: '.tmp/public/hash',
        src: ['**/*'],
        dest: '.tmp/public/dist'
      }]
    },
  });

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // This Grunt plugin is part of the default asset pipeline in Sails,
  // so it's already been automatically loaded for you at this point.
  //
  // Of course, you can always remove this Grunt plugin altogether by
  // deleting this file.  But check this out: you can also use your
  // _own_ custom version of this Grunt plugin.
  //
  // Here's how:
  //
  // 1. Install it as a local dependency of your Sails app:
  //    ```
  //    $ npm install grunt-contrib-copy --save-dev --save-exact
  //    ```
  //
  //
  // 2. Then uncomment the following code:
  //
  // ```
  // // Load Grunt plugin from the node_modules/ folder.
  // grunt.loadNpmTasks('grunt-contrib-copy');
  // ```
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

};
