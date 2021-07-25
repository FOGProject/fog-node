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
            'vue/dist/vue.min.js',
            'vue-router/dist/vue-router.min.js',
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
          cwd: './node_modules/admin-lte/node_modules/chart.js/dist/',
          src: [
            'Chart.bundle.min.js'
          ],
          dest: '.tmp/public/js'
        },
        {
          expand: true,
          cwd: './node_modules/chartjs-plugin-labels/src/',
          src: [
            'chartjs-plugin-labels.js'
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
            'datatables.net/js/jquery.dataTables.min.js*',
            'datatables.net-bs4/js/dataTables.bootstrap4.min.js*',
            'datatables.net-autofill/js/dataTables.autoFill.min.js*',
            'datatables.net-autofill-bs4/js/autoFill.bootstrap4.min.js*',
            'datatables.net-buttons/js/dataTables.buttons.min.js*',
            'datatables.net-buttons-bs4/js/buttons.bootstrap4.min.js*',
            'datatables.net-buttons/js/buttons.colVis.min.js*',
            'datatables.net-buttons/js/buttons.flash.min.js*',
            'datatables.net-buttons/js/buttons.print.min.js*',
            'datatables.net-colreorder/js/dataTables.colReorder.min.js*',
            'datatables.net-colreorder-bs4/js/colReorder.bootstrap4.min.js*',
            'datatables.net-keytable/js/dataTables.keyTable.min.js*',
            'datatables.net-keytable-bs4/js/keyTable.bootstrap4.min.js*',
            'datatables.net-responsive/js/dataTables.responsive.min.js*',
            'datatables.net-responsive-bs4/js/responsive.bootstrap4.min.js*',
            'datatables.net-rowgroup/js/dataTables.rowGroup.min.js*',
            'datatables.net-rowgroup-bs4/js/rowGroup.bootstrap4.min.js*',
            'datatables.net-rowreorder/js/dataTables.rowReorder.min.js*',
            'datatables.net-rowreorder-bs4/js/rowReorder.bootstrap4.min.js*',
            'datatables.net-scroller/js/dataTables.scroller.min.js*',
            'datatables.net-scroller-bs4/js/scroller.bootstrap4.min.js*',
            'datatables.net-searchpanes/js/dataTables.searchPanes.min.js*',
            'datatables.net-searchpanes-bs4/js/searchPanes.bootstrap4.min.js*',
            'datatables.net-select/js/dataTables.select.min.js*',
            'datatables.net-select-bs4/js/select.bootstrap4.min.js*',
          ],
          dest: '.tmp/public/js'
        },
        // CSS Stuff
        {
          expand: true,
          cwd: './node_modules',
          src: [
            'datatables.net-bs4/css/dataTables.bootstrap4.min.css*',
            'datatables.net-autofill-bs4/css/autoFill.bootstrap4.min.css*',
            'datatables.net-buttons-bs4/css/buttons.bootstrap4.min.css*',
            'datatables.net-colreorder-bs4/css/colReorder.bootstrap4.min.css*',
            'datatables.net-keytable-bs4/css/keyTable.bootstrap4.min.css*',
            'datatables.net-responsive-bs4/css/responsive.bootstrap4.min.css*',
            'datatables.net-rowgroup-bs4/css/rowGroup.bootstrap4.min.css*',
            'datatables.net-rowreorder-bs4/css/rowReorder.bootstrap4.min.css*',
            'datatables.net-scroller-bs4/css/scroller.bootstrap4.min.css*',
            'datatables.net-searchpanes-bs4/css/searchPanes.bootstrap4.min.css*',
            'datatables.net-select-bs4/css/select.bootstrap4.min.css*',
          ],
          dest: '.tmp/public/styles'
        },
        {
          expand: true,
          cwd: './node_modules',
          src: [
            'admin-lte/dist/css/adminlte.min.css*',
            'bootstrap/dist/css/bootstrap.min.css*',
            'font-awesome/css/font-awesome.min.css',
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
