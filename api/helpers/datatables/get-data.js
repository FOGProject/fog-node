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
    badRequest: {
      outputFriendlyName: 'Bad data being request',
    },
    success: {
      outputFriendlyName: 'Data',
    },
  },
  fn: async function (inputs) {
    let req = inputs.req,
      res = inputs.res,
      params = req.allParams(),
      model = params.model,
      options = params.options || params || {},
      columns = params.columns || {},
      query = req.query;

    if (!model || !sails.models[model]) {
      return {
        error: 'Model does not exist'
      };
    }

    // Set the model object
    model = sails.models[model];

    // Default column options.
    let _columns = [
      {
        data: '',
        name: '',
        searchable: false,
        orderable: false,
        search: {
          regex: false,
          value: ''
        }
      }
    ];

    // Merge both Object, columns and _columns into _columns
    _.assign(_columns, columns);

    // default datatable options
    let _options = {
      draw: 0,
      columns: _columns,
      skip: 0,
      length: 10,
      search: {
        value: '',
        regex: false
      },
      order: [
        {
          column: 0,
          dir: 'asc'
        }
      ]
    };


    // If we passed options, let the query override as needed.
    _.assign(_options, query);
    // Merge both Object, options and _options into _options
    _.assign(_options, options);

    let _response = {
      draw: _options.draw,
      recordsTotal: 0,
      recordsFiltered: 0,
      data: []
    };

    var _reverse = {};

    // Build where Criteria
    var where = [],
      whereQuery = {},
      select = [];

    if (_.isArray(_options.columns)) {
      _options.columns.forEach(function(column, index) {
        // This handles the column search
        if (_.isNull(column.data) || !column.searchable) {
          return true;
        }
        if (_.isBoolean(column.reverse)) {
          let joinedModel = _.split(column.data,'.',2)[0],
            association = _.find(model.associations,['alias',joinedModel]);
          if (_.isUndefined(association)) {
            _response.error = `Association ${joinedModel} not found on this model: ${model.identity}`;
            return true;
          }
          _reverse.model = sails.models[association.model || association.collection];
          let joinCriteria = _.split(column.data,'.',2)[1];
          if (_.isUndefined(joinCriteria)) {
            _reverse.criteria = {
              id: column.search.value
            }
          } else {
            _reverse[joinCriteria] = column.search.value;
          }
          return true;
        }
        let col = column.data.split('.')[0];
        if (_.isPlainObject(column.search.value)) {
          if ((column.search.value.from != '') && (column.search.value.to != '')) {
            whereQuery[column.data] = {
              '>=': column.search.value.from,
              '<': column.search.value.to
            };
          }
        } else {
          if (_.isString(column.search.value) &&
            !_.isEqual(column.search.value, '')
          ) {
            whereQuery[col] = column.search.value;
          } else if (_.isNumber(column.search.value) ||
            _.isArray(column.search.value)
          ) {
            whereQuery[col] = column.search.value;
          }
        }

        // This handles the global search function of this column
        let filter = {};
        filter[col] = {
          'contains': _options.search.value
        };
        select.push(col);
        where.push(filter);
      });
    }

    if (where.length) {
      whereQuery.or = where;
    }

    var sortColumn = {};
    _.forEach(_options.order, async function(value, key) {
      var sortBy = _options.columns[value.column].data;
      if (_.includes(sortBy, '.')) {
        let dir = value.dir.toUpperCase();
        if (dir !== 'ASC' || dir !== 'DESC') dir = 'ASC';
        sortBy = sortBy.substr(0, sortBy.indexOf('.'));
        if (sortBy) {
          sortColumn[sortBy] = dir
        }
      }
    });
    var findOpts = {};
    if (!_.isEmpty(whereQuery)) findOpts.where = whereQuery;
    if (+_options.skip) findOpts.skip = +_options.skip;
    if (!_.isEmpty(sortColumn)) findOpts.sort = sortColumn;
    if (+_options.length) findOpts.limit = +_options.length;
    if (findOpts.limit === -1) delete findOpts.limit;

    if (!_.isEmpty(_response['error'])) {
      delete _response.data;
      return _response;
    }
    if (!_.isEmpty(_reverse)) {
      let association = await _.find(_reverse.model.associations, ['collection',model.identity]) || await _.find(_reverse.model.associations, ['model', model.identity]);
      if (_.isUndefined(association)) {
        _response.error = `Association not found on this model: ${model.identity}`;
        delete _response.data;
        return _response;
      }
      _response.data = await _reverse.model.findOne(findOpts.where || {}).populate(association.alias, findOpts);
      _response.recordsTotal = await model.count();
      _response.recordsFiltered = await model.count(findOpts.where || {});
      return _response;
    }

    _response.data = await model.find(findOpts).populateAll();
    _response.recordsTotal = await model.count();
    _response.recordsFiltered = await model.count(findOpts.where || {});
    return _response;
  }
};
