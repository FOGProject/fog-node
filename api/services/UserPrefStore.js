/**
 * UserPrefStore -- one user's preferences (the UserPref model) as a
 * {key: value} map.
 *
 * FOG 1.6 keeps these in `userPrefs`, with a UNIQUE KEY on (user, key), so a
 * write there is an upsert. fog-node runs with migrate: 'safe' and has no
 * unique index, so two tabs can each create a row for the same key. Every
 * operation here tolerates that duplicate:
 *   - a set updates every row that matches {user, key}, and creates one only
 *     when none matches;
 *   - a delete removes every match;
 *   - a read takes the newest row per key.
 *
 * save() validates first and writes nothing on a rejection. It accepts three
 * key forms only. The size limits keep one user from filling the collection.
 */

// Sizes are the UTF-8 bytes of the value as JSON.
const MAX_VALUE_BYTES = 64 * 1024;
const MAX_TOTAL_BYTES = 1024 * 1024;
const MAX_KEYS = 200;
// A saved table layout (ui16-06): `dt.` and the table's own key.
const DT_KEY = /^dt\.[A-Za-z0-9._/-]{1,180}$/;
const THEMES = ['light', 'dark'];

// Built at the first timezone write, not at load.
let timeZones = null;

const jsonBytes = (value) => Buffer.byteLength(JSON.stringify(value), 'utf8');

// A value of '' or null deletes the key.
const isDelete = (value) => value === '' || value === null;

// The rejection message for a key and value, or null when both are valid.
function check(key, value) {
  if (key === 'display.theme') {
    if (!isDelete(value) && !THEMES.includes(value)) {
      return 'display.theme must be "", "light" or "dark".';
    }
  } else if (key === 'display.timezone') {
    if (!timeZones) { timeZones = new Set(Intl.supportedValuesOf('timeZone')); }
    if (!isDelete(value) && !timeZones.has(value)) {
      return 'display.timezone must be "" or a time zone id that this server knows.';
    }
  } else if (typeof key !== 'string' || !DT_KEY.test(key)) {
    return 'Unknown preference key.';
  }
  if (value === undefined) { return 'A value is required.'; }
  if (!isDelete(value) && jsonBytes(value) > MAX_VALUE_BYTES) {
    return 'A preference value may be at most 64 KB as JSON.';
  }
  return null;
}

/**
 * Reads one user's preferences.
 *
 * @param {string}   userId the user's id
 * @param {string[]} [keys] read only these keys
 *
 * @return {Promise<object>} {key: value}, the newest row per key
 */
async function read(userId, keys) {
  let where = {user: userId};
  if (keys) { where.key = {in: keys}; }
  let prefs = {};
  // Oldest first, so the newest row of a duplicated key is assigned last.
  for (let row of await UserPref.find(where).sort('updatedAt ASC')) {
    prefs[row.key] = row.value;
  }
  return prefs;
}

/**
 * Sets one preference of one user, or deletes it when the value is '' or null.
 *
 * @param {string} userId the user's id
 * @param {string} key    the preference key
 * @param {*}      value  the new value
 *
 * @return {Promise<object>} {error} on a rejection (nothing written), else
 *   {prefs}, the user's new map
 */
async function save(userId, key, value) {
  let error = check(key, value);
  if (error) { return {error}; }
  if (isDelete(value)) {
    await UserPref.destroy({user: userId, key});
    return {prefs: await read(userId)};
  }
  let prefs = await read(userId);
  if (!Object.hasOwn(prefs, key) && Object.keys(prefs).length >= MAX_KEYS) {
    return {error: `A user may have at most ${MAX_KEYS} preferences.`};
  }
  prefs[key] = value;
  let total = Object.keys(prefs).reduce((sum, k) => sum + jsonBytes(prefs[k]), 0);
  if (total > MAX_TOTAL_BYTES) {
    return {error: 'One user\'s preferences may total at most 1 MB as JSON.'};
  }
  let updated = await UserPref.update({user: userId, key}).set({value}).fetch();
  if (!updated.length) { await UserPref.create({user: userId, key, value}); }
  return {prefs: await read(userId)};
}

module.exports = {read, save};
