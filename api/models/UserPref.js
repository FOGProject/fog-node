/**
 * UserPref.js
 *
 * @description :: One preference of one user: the theme (display.theme), the
 *   display timezone (display.timezone), or a saved table layout (dt.<table>).
 *   The equivalent of the FOG 1.6 `userPrefs` table. Read and write it only
 *   through api/services/UserPrefStore.js, which validates each key and value
 *   and tolerates the duplicate rows described there.
 *
 *   It has no `stock.userpref` entry in config/permissions.js on purpose. So
 *   the generic /api/v1/:model routes (list, find, create, update, destroy,
 *   DataTables) refuse it, and no user can read or write another user's rows.
 *   For the same reason User has no inverse `collection` of these: populateAll()
 *   in the generic list and find would then emit every user's preferences.
 *   User.beforeDestroy deletes a user's rows.
 *
 * @docs        :: https://sailsjs.com/docs/concepts/models-and-orm/models
 */
module.exports = {
  attributes: {
    user: {
      model: 'user',
      required: true
    },
    key: {
      type: 'string',
      required: true
    },
    value: {
      type: 'json'
    }
  }
};
