module.exports = {
  friendlyName: 'Get data for datatables',
  description: '',
  inputs: {
    req: {
      friendlyName: 'Request',
      description: 'A reference to the request object (req)',
      type: 'ref',
      required: true
    },
    res: {
      friendlyName: 'Response',
      description: 'A reference to the response object (res)',
      type: 'ref'
    }
  },
  exits: {
    success: {
      outputFriendlyName: 'Data',
    }
  },
  fn: async function (inputs, exits) {
    var req = inputs.req,
      res = inputs.res,
      params = req.allParams(),
      model = params.model,
      options = params.options || params || {};

    if (!model || !sails.models[model]) {
      return {
        error: `Model: ${model} does not exist`
      };
    }

    // Set the model object
    model = sails.models[model];

    // Default column options.
    var _columns = [
      {
        data: '',
        name: '',
        searchable: false,
        orderable: false,
        search: {
          value: ''
        }
      }
    ];

    // Default order options.
    var order = [
      {
        column: 0,
        dir: 'ASC'
      }
    ];

    // default datatable options
    var _options = {
      draw: 0,
      columns: _columns,
      skip: 0,
      length: 10,
      search: {
        value: '',
        regex: false
      },
      order: order
    };


    // Merge both Object, options and _options into _options
    _.assign(_options, options);

    var _response = {
      draw: _options.draw,
      recordsTotal: 0,
      recordsFiltered: 0,
      data: []
    };

    var _reverse = {};

    // Build where Criteria
    var where = [],
      whereQuery = {or: []},
      select = [],
      order = [];

    if (_.isArray(_options.columns)) {
      _options.columns.forEach((column, index) => {
        if (_.isNull(column.data) || !column.searchable) return true;
        var columnType = false;
        if (!_.isUndefined(model.attributes[column.data])) {
          columnType = model.attributes[column.data].type;
        }
        if (false === columnType || 'boolean' === columnType) return true;
        if (_.isBoolean(column.reverse)) {
          var joinedModel = _.split(column.data, '.', 2)[0],
            association = _.find(model.associations, ['alias', joinedModel]);
          if (_.isUndefined(association)) {
            _response.error = `Association ${joinedModel} not found on this model: ${model.identity}`;
            return true;
          }
          _reverse.model = sails.models[association.model || association.collection];
          var joinedCriteria = _.split(column.data, '.', 2)[1];
          if (_.isUndefined(joinCriteria)) {
            _reverse.criteria = {
              id: column.search.value
            };
          } else {
            _reverse[joinCriteria] = column.search.value;
          }
          return true;
        }
        if (_.isPlainObject(column.search.value)) {
          if ((column.search.value.from != '') && (column.search.value.to != '')) {
            whereQuery[column.data] = {
              '>=': column.search.value.from,
              '<': column.search.value.to
            };
          }
        } else if (_.isString(column.search.value)) {
          var col = column.data.split('.')[0];
          var regexp = new RegExp(column.search.value, 'i');
          if (!_.isEqual(column.search.value, '')) {
            whereQuery[col] = regexp;
          }
        } else if (_.isNumber(column.search.value)) {
          var col = column.data.split('.')[0];
          whereQuery[col] = column.search.value;
        } else if (_.isArray(column.search.value)) {
          var col = column.data.split('.')[0];
          whereQuery[col] = column.search.value;
        }

        // This handles the global search function of this column
        var col = column.data.split('.')[0];

        var filter = {};
        if (!_.isEqual(_options.search.value, '')) {
          filter[col] = {
            contains: _options.search.value
          };
        }
        select.push(col);
        where.push(filter);
      });
    }
    whereQuery.or = where;

    var sortColumn = {};
    _.forEach(_options.order, (value, key) => {
      var sortBy = _options.columns[value.column].data;
      if (_.includes(sortBy, '.')) {
        sortBy = sortBy.substr(0, sortBy.indexOf('.'));
      }
      var sortDir = value.dir.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
      sortColumn[sortBy] = sortDir;
      order.push(sortColumn);
    });

    // Find the database on the query and total items in teh database;
    if (!_.isEmpty(_response.error)) {
      delete _response.data;
      return exits.error(_response);
    }

    let findOpts = {
      where: whereQuery,
      skip: +_options.start || -1,
      limit: +_options.length || -1,
      sort: order
    };

    if (findOpts.skip < 1) delete findOpts.skip;
    if (findOpts.limit < 1) delete findOpts.limit;

    if (!_.isEmpty(_reverse)) {
      var association = _.find(_reverse.model.associations, ['collection', model.identity]) || _.find(_reverse.model.associations, ['model', model.identity]);
      if (_.isUndefined(association)) {
        _response.error = `Association not found on this model: ${model.identity}`;
        delete _response.data;
        return exits.error(_response);
      }
      await _reverse.model.findOne({where: _reverse.criteria}).populate(association.alias, findOpts).exec(async (err, item) => {
        if (err) {
          _response.error = err;
          delete _response.data;
          return exits.error(_response);
        }
        _response.data = item;
        await model.count({where: whereQuery}).exec(async (err, cnt) => {
          if (err) {
            _response.error = err;
            delete _response.data;
            return exits.error(_response);
          }
          _response.recordsFiltered = cnt;
          await model.count().exec(async (err, num) => {
            if (err) {
              _response.error = err;
              delete _response.data;
              return exits.error(_response);
            }
            _response.recordsTotal = num;
            return exits.success(_response);
          });
        });
      });
    }

    await model.find(findOpts).populateAll().exec(async (err, items) => {
      if (err) {
        _response.error = err;
        delete _response.data;
        return exits.error(_response);
      }
      _response.data = items;
      await model.count({where: whereQuery}).exec(async (err, cnt) => {
        if (err) {
          _response.error = err;
          delete _response.data;
          return exits.error(_response);
        }
        _response.recordsFiltered = cnt;
        await model.count().exec(async (err, num) => {
          if (err) {
            _response.error = err;
            delete _response.data;
            return exits.error(_response);
          }
          _response.recordsTotal = num;
          return exits.success(_response);
        });
      });
    });
  }
};
