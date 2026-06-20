module.exports = {
  friendlyName: 'Host association fields',
  description: 'Build the form items for a host\'s editable associations (image + default printer as selects, printers + snapins as checkbox tables). Pass the populated host record, or null/none for a new host.',
  inputs: {
    record: {
      type: 'ref',
      defaultsTo: null
    }
  },
  exits: {
    success: {
      outputFriendlyName: 'Association form items'
    }
  },
  fn: async function (inputs) {
    let record = inputs.record || {};

    let [images, printers, snapins] = await Promise.all([
      sails.models.image.find().sort('name ASC'),
      sails.models.printer.find().sort('name ASC'),
      sails.models.snapin.find().sort('name ASC')
    ]);

    // Support both populated association objects and raw ids (or absent).
    let imageId = record.image ? (record.image.id || record.image) : null,
      defPrinterId = record.defaultPrinter ? (record.defaultPrinter.id || record.defaultPrinter) : null,
      snapinIds = (record.snapins || []).map((s) => s.id || s),
      printerIds = (record.printers || []).map((p) => p.id || p);

    return {
      image: {
        text: 'Image', classes: [], textarea: false, type: 'select',
        options: images.map((i) => ({ value: i.id, label: i.name, selected: i.id === imageId }))
      },
      defaultPrinter: {
        text: 'Default Printer', classes: [], textarea: false, type: 'select',
        options: printers.map((p) => ({ value: p.id, label: p.name, selected: p.id === defPrinterId }))
      },
      printers: {
        text: 'Printers', classes: [], textarea: false, type: 'checktable',
        options: printers.map((p) => ({ value: p.id, label: p.name, checked: printerIds.indexOf(p.id) !== -1 }))
      },
      snapins: {
        text: 'Snapins', classes: [], textarea: false, type: 'checktable',
        options: snapins.map((s) => ({ value: s.id, label: s.name, checked: snapinIds.indexOf(s.id) !== -1 }))
      }
    };
  }
};
