/**
 * `tasks/config/concat`
 *
 * ---------------------------------------------------------------
 *
 * An intermediate step to generate monolithic files that can
 * then be passed in to `uglify` and/or `cssmin` for minification.
 *
 * For more information, see:
 *   https://sailsjs.com/anatomy/tasks/config/concat.js
 *
 */
const path = require('path');

// The production CSS bundle is served from /min/, not from each file's own
// folder, so a relative url() in a source file points to the wrong place. For
// example, font-awesome's url(../fonts/x.woff2) became /fonts/x.woff2, a 404
// (issue #115). Rewrite each relative url() to an absolute path, based on the
// file it came from. data:, http(s):, absolute, and #fragment URLs stay.
const absoluteCssUrls = (src, filepath) => {
  const dir = path.posix.dirname(filepath.split(path.sep).join('/').replace(/^\.tmp\/public\//, ''));
  return src.replace(/url\(\s*(['"]?)(?!data:|https?:|\/|#)([^'")]+)\1\s*\)/g,
    (match, quote, rel) => `url(${quote}/${path.posix.join(dir, rel)}${quote})`);
};

module.exports = function(grunt) {

  grunt.config.set('concat', {
    js: {
      src: require('../pipeline').jsFilesToInject,
      dest: '.tmp/public/concat/production.js'
    },
    css: {
      options: {process: absoluteCssUrls},
      src: require('../pipeline').cssFilesToInject,
      dest: '.tmp/public/concat/production.css'
    }
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
  //    $ npm install grunt-contrib-concat --save-dev --save-exact
  //    ```
  //
  //
  // 2. Then uncomment the following code:
  //
  // ```
  // // Load Grunt plugin from the node_modules/ folder.
  // grunt.loadNpmTasks('grunt-contrib-concat');
  // ```
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

};
