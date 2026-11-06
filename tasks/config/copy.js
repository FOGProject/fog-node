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
        // Common elements for the most part.
        {
          expand: true,
          cwd: './node_modules',
          src: [
            'bootstrap/dist/js/bootstrap.bundle.min.js*',
            'jquery/dist/jquery.min.js',
            'inputmask/dist/jquery.inputmask.min.js',
            'pace-js/pace.min.js',
            '@pnotify/core/dist/PNotify.js',
            '@pnotify/mobile/dist/PNotifyMobile.js',
            'select2/dist/js/select2.full.min.js',
          ],
          dest: '.tmp/public/js'
        },
        {
          expand: true,
          cwd: './node_modules',
          src: [
            'admin-lte/dist/js/adminlte.min.js*',
            'admin-lte/build/js/**/*/js'
          ],
          dest: '.tmp/public/'
        },
        {
          expand: true,
          cwd: './node_modules/chart.js/dist/',
          src: [
            'chart.umd.min.js*'
          ],
          dest: '.tmp/public/js'
        },
        // Datatables Stuff
        // JS Stuff
        {
          expand: true,
          cwd: './node_modules',
          src: [
            'jszip/dist/jszip.min.js*',
            'pdfmake/build/pdfmake.min.js*',
            'datatables.net/js/dataTables.min.js*',
            'datatables.net-bs5/js/dataTables.bootstrap5.min.js*',
            'datatables.net-autofill/js/dataTables.autoFill.min.js*',
            'datatables.net-autofill-bs5/js/autoFill.bootstrap5.min.js*',
            'datatables.net-buttons/js/dataTables.buttons.min.js*',
            'datatables.net-buttons-bs5/js/buttons.bootstrap5.min.js*',
            'datatables.net-buttons/js/buttons.colVis.min.js*',
            'datatables.net-buttons/js/buttons.html5.min.js*',
            'datatables.net-buttons/js/buttons.print.min.js*',
            'datatables.net-colreorder/js/dataTables.colReorder.min.js*',
            'datatables.net-colreorder-bs5/js/colReorder.bootstrap5.min.js*',
            'datatables.net-keytable/js/dataTables.keyTable.min.js*',
            'datatables.net-keytable-bs5/js/keyTable.bootstrap5.min.js*',
            'datatables.net-responsive/js/dataTables.responsive.min.js*',
            'datatables.net-responsive-bs5/js/responsive.bootstrap5.min.js*',
            'datatables.net-rowgroup/js/dataTables.rowGroup.min.js*',
            'datatables.net-rowgroup-bs5/js/rowGroup.bootstrap5.min.js*',
            'datatables.net-rowreorder/js/dataTables.rowReorder.min.js*',
            'datatables.net-rowreorder-bs5/js/rowReorder.bootstrap5.min.js*',
            'datatables.net-scroller/js/dataTables.scroller.min.js*',
            'datatables.net-scroller-bs5/js/scroller.bootstrap5.min.js*',
            // No SearchPanes: 3.x is commercial (DataTables Plus), and no
            // table used it.
            'datatables.net-select/js/dataTables.select.min.js*',
            'datatables.net-select-bs5/js/select.bootstrap5.min.js*',
          ],
          dest: '.tmp/public/js'
        },
        // CSS Stuff
        {
          expand: true,
          cwd: './node_modules',
          src: [
            'datatables.net-bs5/css/dataTables.bootstrap5.min.css*',
            'datatables.net-autofill-bs5/css/autoFill.bootstrap5.min.css*',
            'datatables.net-buttons-bs5/css/buttons.bootstrap5.min.css*',
            'datatables.net-colreorder-bs5/css/colReorder.bootstrap5.min.css*',
            'datatables.net-keytable-bs5/css/keyTable.bootstrap5.min.css*',
            'datatables.net-responsive-bs5/css/responsive.bootstrap5.min.css*',
            'datatables.net-rowgroup-bs5/css/rowGroup.bootstrap5.min.css*',
            'datatables.net-rowreorder-bs5/css/rowReorder.bootstrap5.min.css*',
            'datatables.net-scroller-bs5/css/scroller.bootstrap5.min.css*',
            'datatables.net-select-bs5/css/select.bootstrap5.min.css*',
          ],
          dest: '.tmp/public/styles'
        },
        {
          expand: true,
          cwd: './node_modules',
          src: [
            'admin-lte/dist/css/adminlte.min.css*',
            'bootstrap/dist/css/bootstrap.min.css*',
            // Font Awesome 7 Free (as FOG 1.6). The v4 shims keep every
            // `fa fa-*` class rendering, so no icon is renamed.
            '@fortawesome/fontawesome-free/css/all.min.css',
            '@fortawesome/fontawesome-free/css/v4-shims.min.css',
            'icheck-bootstrap/icheck-bootstrap.min.css',
            'select2/dist/css/select2.min.css',
            'pace-js/themes/blue/pace-theme-minimal.css',
            '@pnotify/core/dist/PNotify.css',
            '@pnotify/mobile/dist/PNotifyMobile.css'
          ],
          dest: '.tmp/public/styles'
        },
        {
          expand: true,
          cwd: './node_modules',
          // all.min.css loads them from ../webfonts/, beside its css/ folder.
          src: ['@fortawesome/fontawesome-free/webfonts/**'],
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
