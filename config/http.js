module.exports.http = {
  middleware: {
  passportInit: require('passport').initialize(),
  passportSession: require('passport').session(),
    order: [
      'cookieParser',
      'session',
      'passportInit',
      'passportSession',
      'bodyParser',
      'compress',
      'poweredBy',
      'router',
      'www',
      'favicon'
    ]
  }
};