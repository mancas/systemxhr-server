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
    var remotePortId = evt.data.remotePortId;
    var request = evt.data.remoteData;
    var requestOp = request.data;

    function listenerTemplate(evt) {
      var clonedEvent = window.ServiceHelper.cloneObject(evt);
      clonedEvent.allResponseHeaders = evt.target.getAllResponseHeaders();
console.info(clonedEvent);
      channel.postMessage({
        remotePortId: remotePortId,
        data: {
          id: request.id,
          event: clonedEvent
        }
      });
    }

    if (requestOp.operation === 'createXMLHttpRequest') {
      _XMLHttpRequests[request.id] = new XMLHttpRequest(requestOp.options);
      // Let's assume this works always...
      channel.postMessage({remotePortId: remotePortId, data: {id: request.id}});
    } else if (requestOp.operation === 'onreadystatechange') {
      _XMLHttpRequests[requestOp.xhrId].onreadystatechange = listenerTemplate;
    } else if (requestOp.operation === 'onpropertychange') {
      _XMLHttpRequests[requestOp.xhrId][requestOp.handler] = listenerTemplate;
    } else if (requestOp.operation === 'addEventListener') {
      _listeners[request.id] = listenerTemplate;
      _XMLHttpRequests[requestOp.xhrId].
        addEventListener(requestOp.type, _listeners[request.id],
        requestOp.useCapture);
    } else if (requestOp.operation === 'removeEventListener') {
      _XMLHttpRequests[requestOp.xhrId].removeObserver(_listeners[request.id]);
    } else if (requestOp.operation === 'dispatchEvent') {
      _XMLHttpRequests[requestOp.xhrId].dispatchEvent(requestOp.event);
    } else {
      _XMLHttpRequests[requestOp.xhrId][requestOp.operation].
        apply(...requestOp.params);
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
