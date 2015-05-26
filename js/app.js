(function(window) {
  'use strict';

  function debug(str) {
    console.log('MANU SystemXHRService -*-:' + str);
  }

  // Ok, this kinda sucks because most APIs (and settings is one of them) cannot
  // be accessed from outside the main thread. So basically everything has to go
  // down to the SW thread, then back up here for processing, then back down to
  // be sent to the client. Yay us!
  var _XMLHttpRequests = {};
  var _listeners = {};

  function buildDOMRequestAnswer(channel, request) {
    debug('Building call --> ' + JSON.stringify(request));
    var remotePortId = evt.data.remotePortId;
    var request = evt.data.remoteData;
    var requestOp = request.data;

    _XMLHttpRequests[request.id] = new XMLHttpRequest(requestOp.options);
    // Let's assume this works always...
    channel.postMessage({remotePortId: remotePortId, data: {id: request.id}});
  }

  function executeOperation(operation, channel, request) {
    var request = evt.data.remoteData;
    var requestOp = request.data;
    _XMLHttpRequests[requestOp.xhrId][operation](...requestOp.params);
  }

  function setHandler(eventType, channel, request) {
    var remotePortId = evt.data.remotePortId;
    var request = evt.data.remoteData;
    var requestOp = request.data;

    function _buildResponseHeadersObject(responseHeaders) {
      var headers = responseHeaders.split(/\n/);
      var obj = {};
      // Last item is useless
      headers.pop();
      headers.forEach(header => {
        var trimeHeader = header.trim();
        var split = trimeHeader.split(/: /);
        obj[split[0].trim()] = split[1].trim();
      });

      return obj;
    }

    function listenerTemplate(evt) {
      var clonedEvent = window.ServiceHelper.cloneObject(evt, true);
      clonedEvent.responseHeaders =
        _buildResponseHeadersObject(evt.target.getAllResponseHeaders());
      channel.postMessage({
        remotePortId: remotePortId,
        data: {
          id: request.id,
          event: clonedEvent
        }
      });
    }

    _XMLHttpRequests[requestOp.xhrId][requestOp.operation] = listenerTemplate;
  };

  var _operations = {
    createXMLHttpRequest: buildDOMRequestAnswer.bind(this),

    abort: executeOperation.bind(this, 'abort'),

    open: executeOperation.bind(this, 'open'),

    overrideMimeType: executeOperation.bind(this, 'overrideMimeType'),

    send: executeOperation.bind(this, 'send'),

    setRequestHeader: executeOperation.bind(this, 'setRequestHeader'),

    addEventListener: function(channel, request) {
      var request = evt.data.remoteData;
      var requestOp = request.data;
      _listeners[request.id] = listenerTemplate;
      _XMLHttpRequests[requestOp.xhrId].
        addEventListener(requestOp.type, _listeners[request.id],
        requestOp.useCapture);
    },

    removeEventListener: function(channel, request) {
      var requestOp = evt.data.remoteData.data;
      _XMLHttpRequests[requestOp.xhrId].removeObserver
        (_listeners[requestOp.listenerId]);
    },

    dispatchEvent: function(channel, request) {
      var requestOp = evt.data.remoteData.data;
      _XMLHttpRequests[requestOp.xhrId].dispatchEvent(requestOp.event);
    }
  };
  ['onabort', 'onerror', 'onload', 'onloadend', 'onloadstart', 'onprogress',
    'ontimeout', 'onreadystatechange'].forEach( evt => {
      _operations[evt] = setHandler.bind(undefined, evt);
  });

  var processSWRequest = function(channel, evt) {
    // We can get:
    // * methodName
    // * onpropertychange
    // * createXMLHttpRequest
    // * addEventListener
    // * removeEventListener
    // * dispatchEvent
    // All the operations have a requestId, and all the operations over
    // a XMLHttpRequest also include a xhr id.
    var request = evt.data.remoteData;
    var requestOp = request.data;

    debug('processSWRequest --> processing a msg:' +
          (evt.data ? JSON.stringify(evt.data): 'msg without data'));

    if (requestOp in _operations) {
      _operations[requestOp] &&
        _operations[requestOp](channel, evt.data);
    } else {
      console.error('SMS service unknown operation:' + requestOp.op);
    }
  };


  // Testing purpose only!!!!
  window.addEventListener('load', function () {
    if (window.ServiceHelper) {
      debug('APP serviceWorker in navigator');
      window.ServiceHelper.register(processSWRequest);
    } else {
      debug('APP navigator does not have ServiceWorker');
      return;
    }
  });

})(window);
