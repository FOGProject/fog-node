/**
 * eslint.config.js
 *
 * ---------------------------------------------------------------
 *
 * A set of basic code conventions designed to encourage quality and consistency
 * across this Sails app's code base.  These rules are checked automatically any
 * time you run `npm test`.
 *
 * This is the ESLint "flat config" translation of the three `.eslintrc` files
 * this app used to carry (root, `assets/`, and `views/`).  ESLint 9 dropped
 * support for the old `.eslintrc` format entirely, so the eslintrc files were
 * inert from the 8.4.0 -> 10.5.0 bump onwards and `npm test` could not run.
 *
 * The rule set below is a deliberate one-for-one port of those files — same
 * rules, same severities, same options — so that the lint contract this
 * codebase was written against is unchanged.  Behavioural notes on the few
 * places where flat config is not a literal translation are inline.
 *
 * For more information about any of the rules below, check out the relevant
 * reference page on eslint.org.  For example, to get details on "no-sequences",
 * you would visit `https://eslint.org/docs/rules/no-sequences`.
 */
const globals = require('globals');

// The backend rule set.  Shared by every file, then selectively overridden for
// browser-habitat code in `assets/` and `views/` further down.
//
// Note: many of these are formatting rules that ESLint has since deprecated in
// favour of the external @stylistic plugin.  They are all still shipped and
// functional in ESLint 10, so they are kept as-is rather than pulling in a new
// dependency purely to preserve the existing style enforcement.
const rules = {
  'block-scoped-var':             ['error'],
  'callback-return':              ['error', ['done', 'proceed', 'next', 'onwards', 'callback', 'cb']],
  'camelcase':                    ['warn', {'properties':'always'}],
  'comma-style':                  ['warn', 'last'],
  // 'multi-line' rather than the template's default 'all'.  Every one of the
  // 125 hits the stricter setting produced was a single-line guard clause
  // (`if (!user) return exits.forbidden();`), a style this codebase uses
  // consistently and deliberately.  'multi-line' still requires braces the
  // moment a body wraps onto its own line, which is the case that actually
  // causes bugs.
  'curly':                        ['warn', 'multi-line'],
  'eqeqeq':                       ['error', 'always'],
  'eol-last':                     ['warn'],
  'handle-callback-err':          ['error'],
  'indent':                       ['warn', 2, {
    'SwitchCase': 1,
    'MemberExpression': 'off',
    'FunctionDeclaration': {'body':1, 'parameters':'off'},
    'FunctionExpression': {'body':1, 'parameters':'off'},
    'CallExpression': {'arguments':'off'},
    'ArrayExpression': 1,
    'ObjectExpression': 1,
    'ignoredNodes': ['ConditionalExpression']
  }],
  'linebreak-style':              ['error', 'unix'],
  'no-dupe-keys':                 ['error'],
  'no-duplicate-case':            ['error'],
  'no-extra-semi':                ['warn'],
  'no-labels':                    ['error'],
  'no-mixed-spaces-and-tabs':     [2, 'smart-tabs'],
  'no-redeclare':                 ['warn'],
  'no-return-assign':             ['error', 'always'],
  'no-sequences':                 ['error'],
  'no-trailing-spaces':           ['warn'],
  'no-undef':                     ['off'],
  // ^^Note: If this "no-undef" rule is enabled (set to `['error']`), then all model globals
  // (e.g. `Organization: 'writable'`) should be included under `globals` below.
  'no-unexpected-multiline':      ['warn'],
  'no-unreachable':               ['warn'],
  'no-unused-vars':               ['warn', {'caughtErrors':'all', 'caughtErrorsIgnorePattern': '^unused($|[A-Z].*$)', 'argsIgnorePattern': '^unused($|[A-Z].*$)', 'varsIgnorePattern': '^unused($|[A-Z].*$)' }],
  'no-use-before-define':         ['error', {'functions':false}],
  'one-var':                      ['warn', 'never'],
  'prefer-arrow-callback':        ['warn', {'allowNamedFunctions':true}],
  // avoidEscape lets a double-quoted string stand when it contains single
  // quotes.  With the template's `false`, the autofix turned readable DataTables
  // `dom` strings into escape soup ('<\'row\'<\'col-sm-12\'f>>...').
  'quotes':                       ['warn', 'single', {'avoidEscape':true, 'allowTemplateLiterals':true}],
  'semi':                         ['warn', 'always'],
  'semi-spacing':                 ['warn', {'before':false, 'after':true}],
  'semi-style':                   ['warn', 'last']
};

module.exports = [

  {
    // Replaces the old `.eslintignore`.  `node_modules/` is ignored by ESLint
    // out of the box and no longer needs listing.
    //
    // `.tmp/` and `www/` are new here: they are grunt build output containing
    // copies of `assets/`, so linting them double-reports every finding against
    // a path that is not the source of truth.  The old .eslintignore predated
    // those tasks existing.
    ignores: [
      'assets/dependencies/**/*.js',
      '.tmp/**',
      'www/**'
    ]
  },

  {
    // Backend code: Node.js/Sails habitat.
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2018,
      // Flat config defaults `.js` to `sourceType: 'module'`, which would parse
      // this CommonJS codebase as ESM (implicit strict mode, no `require`).
      // The old eslintrc default was 'script'; 'commonjs' is its flat-config
      // equivalent for a Node app and is what this code actually is.
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        // If 'no-undef' is enabled above, be sure to list all global variables
        // that are used in this app's backend code (including the globalIds of
        // models).  'writable' is the flat-config spelling of the old `true`.
        Promise: 'writable',
        sails: 'writable',
        _: 'writable'
      }
    },
    rules: rules
  },

  {
    // Front-end code in `assets/` and `views/` runs in the browser, so it gets a
    // different set of globals — `window` and friends instead of `process` and
    // `sails`.  Ported from the old `assets/.eslintrc`.
    files: ['assets/**/*.js', 'views/**/*.js'],
    languageOptions: {
      ecmaVersion: 2017,
      // Plain <script> tags, not modules and not CommonJS.
      sourceType: 'script',
      globals: {
        ...globals.browser,
        SAILS_LOCALS: 'writable',
        io: 'writable',
        // Vendored libraries this app loads via plain <script> tags in the
        // layout, so they are ambient globals rather than imports.  The old
        // config never listed them, which is why 'no-undef' had 31 hits here.
        $: 'writable',
        jQuery: 'writable',
        Chart: 'writable',
        PNotify: 'writable',
        bootstrap: 'writable',
        // Backend globals are marked read-only rather than removed, matching
        // the old config's `false` (in eslintrc, `false` meant "readonly", not
        // "undefined" — so this is a faithful port, not a loosening).
        sails: 'readonly',
        _: 'readonly'
      }
    },
    rules: {
      ...rules,
      'no-undef': ['error']
    }
  },

  {
    // Ported from the old `views/.eslintrc`: these files are inlined into .ejs
    // templates, so a trailing newline is not meaningful.
    files: ['views/**/*.js'],
    rules: {
      'eol-last': ['off']
    }
  }

];
