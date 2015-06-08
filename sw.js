// ADDED FOR POLYFILL: Import the polyfill script
this.
  importScripts('/systemxhr-server/common/polyfill/navigator_connect_sw.js');
// END ADDED FOR POLYFILL

(function(sw) {
  'use strict';

  // This is a very basic sample Service Worker (SW) that  acts as a server for
  // navigator.connect. I'm going to mark with a comment where the app MUST
  // add some extra code to use the navigator.connect POLYFILL
  // So if you just want to know that, search for:
  // ADDED FOR POLYFILL

  var resolveACL;

  function debug(str) {
    console.log('Setting Service SW -*- -->' + str);
  }

  /**
   * The keys of acl file will be regular expression.
   * This function return true when it find the first one which match with the
   * the parameter. False ioc
   * This is the same code used in app.js but only for this function it isn't
   * worth it to have a utilities files
   */
  function isAllowed(aUrl) {
    return sw.aclPromise.then(acl => {
      for (var developer in acl) {
        var allowedOrgs  = acl[developer].allowedOrigins;
        if (allowedOrgs.some(regexp => regexp.test(aUrl))) {
          return true;
        }
      }
      return false;
    });
  }

  sw.addEventListener('install', function(evt) {
    debug('SW Install event');
  });

  sw.addEventListener('activate', function(evt) {
    debug('SW activate event');
  });

  sw.addEventListener('fetch', function(evt) {
    debug('SW fetch event');
  });

  sw.channelToMT = new Promise((resolve, reject) => {
    sw.resolveChannel = resolve;
    sw.rejectChannel = reject;
  });


  sw._portId = 1;
  sw._ports = {};

  sw.channelToMT.then(channel => {
    channel.onmessage = evt => {
      var remotePort = sw._ports[evt.data.remotePortId];
      remotePort.postMessage(evt.data.data);
    };
  });

  // This has a *HUGE* problem currently! It's not safe to accept more than one
  // connection! mostly because we're multiplexing the channel to the MT without
  // really multiplexing it
  sw.onconnect = function(msg) {
    debug('SW onconnect: We should have a port here on msg.source. ' +
          (msg.source.postMessage ? 'yes!' : 'no :('));
    // msg.source should have the endpoint to send and receive messages,
    // so we can do:

    msg.acceptConnection(isAllowed(msg.targetURL));

    var myTargetURL = msg.targetURL;
    var remotePort = msg.source;
    var myPortId = sw._portId++;
    sw._ports[myPortId] = remotePort;

    remotePort.onmessage = aMsg => {
      debug('SW msg received:' + JSON.stringify(aMsg.data));
      var requestId = aMsg.data.id;
      if (requestId) {
        debug('onmessage. Got Request:' + JSON.stringify(aMsg.data));
        // In sw APIS do not work!!!! We need to request it to the main thread

        // Since this doesn't work the first time, and we don't want to have to
        // do a reload, we'll work around this by making the main thread pass
        // us a MessageChannel to talk to it
        sw.channelToMT.then(channel => {
          // TO-DO: Multiplex the channel!
          channel.postMessage({targetURL: myTargetURL,
                               remotePortId: myPortId,
                               remoteData: aMsg.data});
        });
      } else {
        // Hmm...
        debug('onmessage: got a message without id');
      }
    };
  };

  sw.aclPromise = new Promise((resolve, reject) => {resolveACL = resolve;});

  sw.messageListener = evt => {
    debug('SW onmessage ---> '+ JSON.stringify(evt.data));

    if (sw.NCPolyfill.isInternalMessage(evt)) {
      debug('SW msg is internal, do not process');
      return;
    }

    resolveACL(evt.data.acl);
    // The only message we should get here is a MessageChannel to talk back to
    // the main thread... so...
    if (evt.ports && evt.ports[0]) {
      debug('Got a channel from the parent');
      sw.resolveChannel(evt.ports[0]);
    } else {
      debug('Did not got a channel!');
      sw.rejectChannel('I did not got a channel');
    }
    // And I can remove the listener, I don't need this anymore
    sw.removeEventListener('message', sw.messageListener);
  };

  sw.addEventListener('message', sw.messageListener);

})(this);
