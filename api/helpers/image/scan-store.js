const fs = require('fs'),
  path = require('path');

module.exports = {
  friendlyName: 'Scan image store',
  description: 'Discover image folders already on disk and create Image records ' +
    'for any not yet defined. Create-only: never overwrites or deletes existing ' +
    'images. A folder counts as an image when it holds at least one partition ' +
    'file (e.g. d1p1.img).',
  inputs: {},
  exits: {
    success: { outputFriendlyName: 'Scan result' }
  },
  fn: async function () {
    let dir = sails.config.custom.imageStorePath || '/images',
      // FOG system dirs that live under the store but are not images.
      skip = ['dev', 'lost+found', 'postdownloadscripts', 'postinitscripts'],
      result = { path: dir, found: [], created: [], skipped: [] };

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      return Object.assign(result, { error: `Cannot read image store '${dir}': ${err.message}` });
    }

    let known = new Set((await sails.models.image.find()).map((i) => i.name));

    for (let entry of entries) {
      if (!entry.isDirectory()) { continue; }
      let name = entry.name;
      if (name.startsWith('.') || skip.indexOf(name) !== -1) { continue; }

      let hasPartition = false;
      try {
        hasPartition = fs.readdirSync(path.join(dir, name)).some((f) => /\.img$/i.test(f));
      } catch (unused) { continue; }
      if (!hasPartition) { continue; }

      result.found.push(name);
      if (known.has(name)) { result.skipped.push(name); continue; }

      let img = await sails.models.image.create({ name, path: name, createdBy: 'scan' }).fetch();
      result.created.push({ name, id: img.id });
    }
    return result;
  }
};
