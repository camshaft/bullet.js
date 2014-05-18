/**
 * Module dependencies
 */

var xhr = require('xhr');

function noop() {}

var status = exports.status = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3
};

/**
 * Send a message using ajax. Used for both EventSource and
 * xhrPolling transports.
 *
 * @param {String} data
 */

exports.xhrSend = function (data) {
  var self = this;
  if (self.readyState !== status.CONNECTING && self.readyState !== status.OPEN) return self;

  var opts = {
    method: 'POST',
    url: self.url,
    headers: {
      'content-type': 'application/x-www-form-urlencoded; charset=utf-8',
      'cache-control': 'max-age=0',
      'x-socket-transport': 'xhrPolling'
    },
    data: data, // TODO do we encode this?
    credentials: self.credentials
  };

  function success(req) {
    var res = req.responseText;
    if (res && res.length > 0) self.onmessage({data: res});
  }

  xhr(opts, success, self.onerror);
  return self;
}

/**
 * Convert a ws url to http
 */

exports.toHttp = function (url) {
  return url.replace('ws:', 'http:').replace('wss:', 'https:');
}

/**
 * Mixin noop event functions
 */

exports.handlers = function (proto) {
  proto.readyState = status.CONNECTING;
  proto.onopen = noop;
  proto.onmessage = noop;
  proto.onerror = noop;
  proto.onclose = noop;
}

