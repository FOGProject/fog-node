module.exports = {
  friendlyName: 'iPXE boot',
  description: 'Serve a dynamic iPXE boot script. A PXE-booting machine chains here; by default it boots the local disk, and the admin-defined PXE menu entries are offered. (Task-driven auto capture/deploy + FOS kernels are a later, gated step.)',
  exits: {
    success: {
      description: 'iPXE script returned.'
    }
  },
  fn: async function () {
    let req = this.req,
      res = this.res,
      mac = String(req.param('mac') || '').replace(/[^0-9a-fA-F]/g, '').toLowerCase(),
      host = null;

    // Identify the host by its hardware fingerprint (issue #198), not MAC alone:
    // iPXE passes the SMBIOS values (${uuid}/${serial}/${asset}/${mac}).
    try {
      let match = await sails.helpers.identifyHost.with({
        fingerprint: {
          guid: req.param('uuid'),
          serial: req.param('serial'),
          asset: req.param('asset'),
          mac: mac
        }
      });
      if (match) { host = match.host; }
    } catch (unused) { /* fall through to anonymous menu */ }

    let menus = await sails.models.pxemenu.find().sort('name ASC'),
      lines = [];

    lines.push('#!ipxe');
    lines.push(':start');
    lines.push('menu FOG Project (fog-node)');
    lines.push(`item --gap -- Host: ${host ? host.name : (mac || 'unknown')}`);
    lines.push('item local Boot from local disk');
    menus.forEach((m, i) => {
      lines.push(`item pxe${i} ${m.name}`);
    });
    lines.push('choose --default local --timeout 5000 selected || goto local');
    lines.push('goto ${selected}');
    lines.push('');
    lines.push(':local');
    lines.push('echo Booting from local disk');
    lines.push('sanboot --no-describe --drive 0x80 || exit');
    menus.forEach((m, i) => {
      lines.push('');
      lines.push(`:pxe${i}`);
      lines.push(m.params || 'echo No parameters configured && sleep 3 && goto start');
      lines.push('goto start');
    });

    res.set('Content-Type', 'text/plain');
    return res.send(lines.join('\n') + '\n');
  }
};
