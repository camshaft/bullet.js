/**
 * Module dependencies
 */

var utils = require('./utils');
var status = utils.status;

module.exports = EventSource;

/**
 * Make EventSource look like WebSocket
 *
 * @param {String} url
 */

function EventSource(url) {
  var self = this;

  self.url = utils.toHttp(url);

  var source = self.source = new window.EventSource(self.url);

  source.onopen = function() {
    self.readyState = status.OPEN;
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

EventSource.prototype.send = utils.xhrSend;
utils.handlers(EventSource.prototype);

EventSource.prototype.close = function() {
  var self = this;
  self.readyState = status.CLOSED;
  self.source.close();
  delete self.source;
  self.onclose();
  return self;
};
