/**
 * Module dependencies
 */

var xhr = require('xhr');
var utils = require('./utils');
var status = utils.status;

module.exports = XHRPolling;

/**
 * Make XHRPolling look like WebSocket
 *
 * @param {String} url
 */

function XHRPolling(url) {
  var self = this;
  self.url = utils.toHttp(url);
  self.poll();
}

XHRPolling.prototype.interval = 100;
XHRPolling.prototype.send = utils.xhrSend;
utils.handlers(XHRPolling.prototype);

XHRPolling.prototype.close = function() {
  var self = this;
  self.readyState = status.CLOSED;
  if (self.req) {
    self.req.abort();
    delete self.req;
  }
  clearTimeout(self.timeout);
  self.onclose();
  return self;
};

XHRPolling.prototype.poll = function() {
  var self = this;
  self.timeout = setTimeout(function() {
    self._poll();
  }, self.interval);
  return self;
};

XHRPolling.prototype._poll = function() {
  var self = this;

  var opts = {
    url: self.url + '?_=' + (+(new Date)),
    headers: {
      'cache-control': 'max-age=0',
      'x-socket-transport': 'xhrPolling'
    },
    credentials: self.credentials
  };

  function success(req) {
    delete self.req;
    if (req.status === 0) return self.onerror();

    if (self.readyState === status.CONNECTING) {
      self.readyState = status.OPEN;
      self.onopen();
    }

    var res = req.responseText;
    if (res && res.length > 0) self.onmessage({data: res});

    if (self.readyState === status.OPEN) self.poll();
  }

  self.req = xhr(opts, success, self.onerror);
};
