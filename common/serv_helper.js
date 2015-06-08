(function(window) {
  'use strict';

  function debug(str) {
    console.log('-*-*- ServHelper: ' + str);
  }

  var ACCESS_CTRL_FILE = 'acl.json';

  function getACL(aUrl) {
    function aclPathFromURL(aUrl) {
      if (!aUrl) {
        debug('Trying to recover an acl file but didn\'t get a URL');
        return {};
      }
      // Error ctrl?
      var url = new URL(aUrl);
      var pathname = url.pathname;
      return pathname.substring(0, pathname.lastIndexOf('/') + 1);
    }

    return new Promise((resolve, reject) => {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', aclPathFromURL(aUrl) + ACCESS_CTRL_FILE, true);
      xhr.responseType = 'json';

      xhr.onerror = function(error) {
        reject(error);
      };
      xhr.onload = function() {
        if (xhr.response !== null) {
          var response = xhr.response;
          for (var developer in response) {
            var allowedOrgs = response[developer].allowedOrigins;
            if (!allowedOrgs) {
              reject(new Error('Wrong acl file. Developer ' + developer +
                     ' does not have allowedOrigins keys'));
            }
            for (var i = 0, li = allowedOrgs.length; i < li; i++) {
              allowedOrgs[i] = new RegExp(allowedOrgs[i]);
            }
          }
          resolve(response);
        } else {
          reject(new Error('No valid JSON object was found (' +
          xhr.status + ' ' + xhr.statusText + ')'));
        }
      };
      xhr.send();
    });
  };

  function getRules(aAcl, aUrl) {
    for (var developer in aAcl) {
      var allowedOrgs  = aAcl[developer].allowedOrigins;
      if (allowedOrgs.some(regexp => regexp.test(aUrl))) {
        return aAcl[developer].rules;
      }
    }
    return null;
  }

  /**
   * Return true if:
   *  - aAcl or aTargetURL or aOperation or aForbidCall are not received
   *  - There is no match for aTargetURL on any of the aAcl allowedOrigin fields
   *  - If there's a match for aTargetURL, the corresponding rules field is
   *    not empty and there is not an specific constraint for "operation" or
   *    aForbidCall(constraints) returns true.
   * Return false otherwise.
   *
   */
  function isForbidden(aAcl, aTargetURL, aOperation, aForbidCall) {
    if (!aAcl || !aTargetURL || !aOperation || !aForbidCall ||
        (typeof aForbidCall !== 'function')) {
      return true;
    }
    var rules = getRules(aAcl, aTargetURL);
    // I'm so sorry, but you need to explicitly allow everything.
    // If you want everybody to access everything write:
    // {
    //   "allowedEverybody": {
    //     "allowedOrigins": [".*"],
    //     "rules": {}
    //   }
    // }
    if (!rules) {
      return true;
    }

    if (Object.keys(rules).length === 0) {
      return false;
    }
    var constraints = rules[aOperation];

    return !constraints ||
           (constraints.length !== 0 && aForbidCall(constraints));
  };

  // This is a very basic sample app that uses a SW and acts as a server for
  // navigator.connect. I'm going to mark with a comment where the app MUST
  // add some extra code to use the navigator.connect SHIM
  // So if you just want to know that, search for:
  // ADDED FOR POLYFILL

  var register = function(evt) {
    debug('APP executing register...');
    var origin = document.location.origin;
    navigator.serviceWorker.
      register('/WebAPI_pf/services/sw.js', {scope: './'}).
      then(function(reg) {
        debug('APP Registration succeeded. Scope: ' + reg.scope);
        if (reg.installing) {
          debug('APP registration --> installing');
        } else if (reg.waiting) {
          debug('APP registration --> waiting');
        } else if (reg.active) {
          debug('APP registration --> active');
        }
      }).catch(function(error) {
        debug('APP Registration failed with ' + error);
      });
  };

  var unregister = function(evt) {
    debug('APP Unregister...');
    navigator.serviceWorker.getRegistrations().then(regs => {
      regs.forEach(reg => {
        reg.unregister();
        debug('APP Unregister done');
      });
    });
  };

  // Circular objects will cause this to hang
  var cloneObject = function(obj, recursive) {
    if (typeof obj !== 'object') {
      return obj;
    }

    var cloned = {};
    for (var key in obj) {
      if (Array.isArray(obj[key])) {
        cloned[key] = [];
        var dest = cloned[key];
        var source = obj[key];
        for (var i = 0, l = source.length; i < l; i++) {
          dest[i] = cloneObject(source[i], recursive);
        }
      } else if (typeof obj[key] === 'object') {
        cloned[key] = recursive && cloneObject(obj[key], recursive) || obj[key];
      } else if (typeof obj[key] !== 'function' || obj[key] === null) {
        cloned[key] = obj[key];
      }
    }
    return cloned;
  };

  if ('serviceWorker' in navigator) {
    window.ServiceHelper = {
      register: function(processSWRequest) {
        register();
        var aclPromise = getACL(document.location.href);
        Promise.all([aclPromise, navigator.serviceWorker.ready]).then(
          ([acl, sw]) => {
            // Let's pass the SW some way to talk to us...
            var mc = new MessageChannel();
            mc.port1.onmessage = processSWRequest.bind(this, acl, mc.port1);
            sw.active && sw.active.postMessage({'acl': acl}, [mc.port2]);
          }
        ).catch(error => debug('Error during register: ' + error));
      },
      unregister: unregister,
      cloneObject: cloneObject,
      isForbidden: isForbidden
    };
  } else {
    debug('APP navigator does not have ServiceWorker');
    return;
  }
})(window);
