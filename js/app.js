(function(window) {
  'use strict';

  function debug(str) {
    console.log('MANU - SystemXHRService -*-:' + str);
  }

  // Ok, this kinda sucks because most APIs (and settings is one of them) cannot
  // be accessed from outside the main thread. So basically everything has to go
  // down to the SW thread, then back up here for processing, then back down to
  // be sent to the client. Yay us!
  var _XMLHttpRequests = {};

  var processSWRequest = function(channel, evt) {
    // We can get:
    // * methodName
    // * TODO on events
    // * createXMLHttpRequest
    // All the operations have a requestId, and all the operations over
    // a XMLHttpRequest also include a xhr id.
    var remotePortId = evt.data.remotePortId;
    var request = evt.data.remoteData;
    var requestOp = request.data;

    function observerTemplate(evt) {
      channel.postMessage({
        remotePortId: remotePortId,
        data: {
          id: request.id,
          data: {
            evt: evt
          }
        }
      });
    }

    if (requestOp.operation === 'createXMLHttpRequest') {
      _XMLHttpRequests[request.id] = new XMLHttpRequest(requestOp.options);
      console.info(_XMLHttpRequests);
      // Let's assume this works always...
      channel.postMessage({remotePortId: remotePortId, data: {id: request.id}});
    } else if (requestOp.operation === 'onreadystatechange') {
      _XMLHttpRequests[requestOp.xhrId].onchange = observerTemplate;
    } else {
      var method = 'call';
      if (requestOp.params && typeof requestOp.params === 'object') {
        method = 'apply';
      }
      _XMLHttpRequests[requestOp.xhrId][requestOp.operation]
        [method](_XMLHttpRequests[requestOp.xhrId], requestOp.params);
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