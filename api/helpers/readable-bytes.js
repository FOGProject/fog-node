const sizes = ['iB','KiB','MiB','GiB','TiB','PiB','EiB','ZiB','YiB'];
module.exports = {
  friendlyName: 'Readable bytes',
  description: 'Returns human usable information',
  inputs: {
    bytes: {
      friendlyName: 'Bytes',
      description: 'The size in bytes',
      type: 'number',
      isInteger: true,
      required: true
    }
  },
  exits: {
    success: {
      description: 'All done.',
    },
  },
  fn: async function (inputs) {
    let bytes = inputs.bytes;
    if (!bytes || bytes <= 0 || !isFinite(bytes)) {
      return `0 ${sizes[0]}`;
    }
    let i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2) * 1} ${sizes[i]}`;
  }
};
