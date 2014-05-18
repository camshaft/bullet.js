/**
 * Module dependencies
 */

var xhr = require('xhr');

/**
 * Expose Bullet
 */

module.exports = Bullet;

/**
 * States
 */

var CONNECTING = 0;
var OPEN = 1;
var CLOSING = 2;
var CLOSED = 3;

var DELAY_DEFAULT = 80;
var DELAY_MAX = 10000;

function noop() {}

var TRANSPORTS = [
  'websocket',
  'eventsource',
  'xhrpolling'
];

/**
 * Bullet
 *
 * @param {String} url
 * @param {Object} options
 */

function Bullet(url, opts) {
  if (!(this instanceof Bullet)) return new Bullet(url, opts);
  opts = opts || {};

  this.url = url;
  this.delay = DELAY_DEFAULT;
  this.transports = opts.transports || TRANSPORTS;
  this.init();
}

handlers(Bullet.prototype);
Bullet.prototype.onheartbeat = noop;
Bullet.prototype.ondisconnect = noop;

Bullet.prototype.setURL = function(url) {
  this.url = url;
  return this;
};

Bullet.prototype.send = function(data) {
  if (!this.transport) return false;
  return this.transport.send(data);
};

Bullet.prototype.close = function() {
  this.readyState = CLOSING;
  if (this.transport) this.transport.close();
};

Bullet.prototype.init = function() {
  var self = this;
  var Transport = getTransport(self.transports, self.cursor);

  if (!Transport) {
    delete self.cursor;
    self.ondisconnect();

    setTimeout(function() {self.init();}, DELAY_MAX);
    return false;
  }

  var t = self.transport = new Transport(self.url);
  self.cursor = t.__cursor;

  t.onopen = function() {
    if (t.heart) self.heartbeat = setInterval(function() {self.onheartbeat();}, 20000);
    if (self.readyState === OPEN) return;
    self.delay = DELAY_DEFAULT;
    self.readyState = OPEN;
    self.onopen();
  };

  t.onerror = t.onclose = function() {
    if (self.readyState === CLOSED || !t) return;
    var prev = t.__cursor;
    delete self.transport;
    t = null;
    clearInterval(self.heartbeat);

    if (self.readyState === CLOSING) {
      self.readyState = CLOSED;
      return self.onclose();
    }

    var delay = self.delay *= 2;
    if (delay > DELAY_MAX) delay = self.delay = DELAY_MAX;

    // try the next transport - this one disconnected while connecting
    if (self.readyState === CONNECTING) {
      self.cursor = prev + 1;
      delay = self.delay = DELAY_DEFAULT;
    }

    setTimeout(function() {self.init();}, delay);
  };

  t.onmessage = function(e) {
    self.onmessage(e);
  };
};

/**
 * Make EventSource look like WebSocket
 *
 * @param {String} url
 */

function EventSourceWS(url) {
  var self = this;

  self.url = toHttp(url);

  var source = self.source = new EventSource(self.url);

  source.onopen = function() {
    self.readyState = OPEN;
    self.onopen();
  };

  source.onmessage = function(event) {
    self.onmessage(event);
  };

  source.onerror = function() {
    source.close();
    self.onerror();
  };
}

EventSourceWS.prototype.send = xhrSend;
handlers(XHRPollingWS.prototype);

EventSourceWS.prototype.close = function() {
  var self = this;
  self.readyState = CLOSED;
  self.source.close();
  delete self.source;
  self.onclose();
  return self;
};

/**
 * Make XHRPolling look like WebSocket
 *
 * @param {String} url
 */

function XHRPollingWS(url) {
  var self = this;
  self.url = toHttp(url);
  self.poll();
}

XHRPollingWS.prototype.interval = 100;
XHRPollingWS.prototype.send = xhrSend;
handlers(XHRPollingWS.prototype);

XHRPollingWS.prototype.close = function() {
  var self = this;
  self.readyState = CLOSED;
  if (self.req) {
    self.req.abort();
    delete self.req;
  }
  clearTimeout(self.timeout);
  self.onclose();
  return self;
};

XHRPollingWS.prototype.poll = function() {
  var self = this;
  self.timeout = setTimeout(function() {
    self._poll();
  }, self.interval);
  return self;
};

XHRPollingWS.prototype._poll = function() {
  var self = this;

  var opts = {
    url: self.url,
    headers: {
      'cache-control': 'max-age=0',
      'x-socket-transport': 'xhrPolling'
    },
    credentials: self.credentials
  }

  function success(req) {
    delete self.req;
    if (req.status === 0) return self.onerror();

    if (self.readyState === CONNECTING) {
      self.readyState = OPEN;
      self.onopen();
    }

    var res = req.responseText;
    if (res && res.length > 0) self.onmessage({data: res});

    if (self.readyState === OPEN) self.poll();
  }

  self.req = xhr(opts, success, self.onerror);
};

/**
 * Send a message using ajax. Used for both EventSource and
 * xhrPolling transports.
 *
 * @param {String} data
 */

function xhrSend(data) {
  var self = this;
  if (self.readyState !== CONNECTING && self.readyState !== OPEN) return self;

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
 * Feature detection
 */

function getTransport(acceptable, i) {
  if (typeof i === 'undefined') i = 0;
  if (acceptable.length <= i) return false;

  var key = acceptable[i];
  if (typeof key === 'function') return function(url) {
    var t = new key(url);
    t.__cursor = i;
    return t;
  };

  var transport = transports[key];
  var Transport;
  if (transport && (Transport = transport())) return function(url) {
    var t = new Transport(url);
    t.__cursor = i;
    return t;
  };

  return getTransport(acceptable, i + 1);
}

var transports = {
  websocket: function () {
    var transport = window.WebSocket || window.MozWebSocket;
    if (!transport) return false;
    transport.prototype.heart = true;
    return transport;
  },
  eventsource: function() {
    if (!window.EventSource) return false;
    return EventSourceWS;
  },
  xhrpolling: function() {
    return XHRPollingWS;
  }
};

/**
 * Convert a ws url to http
 */

function toHttp(url) {
  return url.replace('ws:', 'http:').replace('wss:', 'https:');
}

/**
 * Mixin noop event functions
 */

function handlers(proto) {
  proto.readyState = CONNECTING;
  proto.onopen = noop;
  proto.onmessage = noop;
  proto.onerror = noop;
  proto.onclose = noop;
}
