/**
 * Module dependencies
 */

var xhr = require('xhr');
var EventSource = require('./eventsource');
var XHRPolling = require('./xhrpolling');
var utils = require('./utils');
var status = utils.status;

/**
 * Expose Bullet
 */

module.exports = Bullet;

/**
 * Defaults
 */

var DELAY_DEFAULT = 80;
var DELAY_MAX = 10000;

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

/**
 * Noops
 */

utils.handlers(Bullet.prototype);
Bullet.prototype.onheartbeat = noop;
Bullet.prototype.ondisconnect = noop;
function noop() {}

/**
 * Set the connection url
 *
 * The connection will automatically be reloaded
 *
 * @param {String} url
 * @return {Bullet}
 * @api public
 */

Bullet.prototype.setURL = function(url) {
  this.url = url;
  if (this.transport) this.transport.close();
  return this;
};

/**
 * Send data over the socket
 *
 * @param {String} data
 * @api public
 */

Bullet.prototype.send = function(data) {
  if (!this.transport) return false;
  return this.transport.send(data);
};

/**
 * Close the socket connection
 *
 * @return {Bullet}
 * @api public
 */

Bullet.prototype.close = function() {
  this.readyState = status.CLOSING;
  if (this.transport) this.transport.close();
  return this;
};

/**
 * Initialize the connection
 *
 * @api private
 */

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
    if (!t) return;
    if (t.heart) t.heart = setInterval(function() {self.onheartbeat();}, 20000);
    if (self.readyState === status.OPEN) return;
    self.delay = DELAY_DEFAULT;
    self.readyState = status.OPEN;
    self.onopen();
  };

  t.onerror = t.onclose = function() {
    if (self.readyState === status.CLOSED || !t) return;
    var prev = t.__cursor;
    clearInterval(t.heart);

    delete self.transport;
    t = null;

    if (self.readyState === status.CLOSING) {
      self.readyState = status.CLOSED;
      return self.onclose();
    }

    var delay = self.delay *= 2;
    if (delay > DELAY_MAX) delay = self.delay = DELAY_MAX;

    // try the next transport - this one disconnected while connecting
    if (self.readyState === status.CONNECTING) {
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
    return EventSource;
  },
  xhrpolling: function() {
    return XHRPolling;
  }
};
