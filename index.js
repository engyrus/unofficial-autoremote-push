// Unofficial AutoRemote add-on for Firefox
// Provides toolbar button and context menu items for pushing 
// page and image links to your Android device via AutoRemote.

// Jerry Kindall, engyrus@gmail.com, May 2016
// www.engyrus.com for occasional blog (more and more occasional every day)

// TODOS: add to Places context menu, error message when push fails

DEBUG = false;

var contextMenu = require("sdk/context-menu");
var windows = require("sdk/windows").browserWindows;
var tabs = require("sdk/tabs");
var buttons = require("sdk/ui/button/action");
var viewFor = require("sdk/view/core").viewFor;
var request = require("sdk/request").Request;
var pref = require("sdk/simple-prefs");
var prefs = pref.prefs;
var notifications = require("sdk/notifications");
var timers = require("sdk/timers");
var passwords = require("sdk/passwords");
var self = require("sdk/self");

var xulns = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
var label = "Push via AutoRemote";
var itemid = "unofficial-autoremote-push";
var myname = "AutoRemote Push (Unoffical)";

// Used to identify your personal AutoRemote page
var autoremote = /^https?:\/\/autoremotejoaomgcd.appspot.com\/\?key=/;

// Used to avoid slowing down things too much when loading pages
checkAPI = true;

var icons = {
  "16": "./icon-16.png",
  "32": "./icon-32.png",
  "64": "./icon-64.png"
}

var iconsfaded = {
  "16": "./icon-16f.png",
  "32": "./icon-32f.png",
  "64": "./icon-64f.png"
}

var blank = {
  "16": "./blank-16.png"
}

// add toolbar button
button = buttons.ActionButton({
  label: prefs.api ? label : "Set AutoRemote API",
  id: "b-" + itemid,
  icon: prefs.api ? icons : iconsfaded,
  onClick: function () { pushURL(tabs.activeTab.url); }
});

// add context menu for links and images
contextMenu.Item({
  label: label,
  context: contextMenu.SelectorContext("a[href], img[src]"),
  contentScript: 'self.on("click", function(node) { self.postMessage(node.src || node.href) })',
  onMessage: pushURL
});

// add context menu for pages
contextMenu.Item({
  label: label,
  context: contextMenu.PageContext(),
  contentScript: 'self.on("click", function(node) { self.postMessage(document.location.href) })',
  onMessage: pushURL
});

// add context menu for selection
contextMenu.Item({
  label: label,
  context: contextMenu.SelectionContext(),
  contentScript: 'self.on("click", function(node) { self.postMessage(window.getSelection().toString()) })',
  onMessage: pushText
});

// add context menu for tabs
function addtabmenu(window) {
  var doc = viewFor(window).document;
  if (!doc.getElementById(itemid)) {
    DEBUG && console.log(doc.getElementById("placesContext"));
    var menu = doc.getElementById("tabContextMenu");
    var item = doc.createElementNS(xulns, "menuseparator");
    item.setAttribute("id", "s-" + itemid);
    menu.appendChild(item);
    item = doc.createElementNS(xulns, "menuitem");
    item.setAttribute("label", label);
    item.setAttribute("id", itemid);
    item.addEventListener("command", function(e) { pushURL(e.target.ownerDocument.popupNode.linkedBrowser.currentURI.spec); } );
    menu.appendChild(item);
  }
}

// now add the tab context menu to all existing windows
for (var window of windows) {
  addtabmenu(window);
}
// and make sure it gets added to new windows too
windows.on("open", addtabmenu);

// remove our tab menu item on disable/uninstall
exports.onUnload = function() {
  for (var window of windows) {
    var doc = viewFor(window).document;
    var item = doc.getElementById(itemid);
    item && item.remove(); 
    item = doc.getElementById("s-" + itemid);
    item && item.remove();     
  }
};

// Recognize the API URL (only if we haven't already)
if (prefs.api) {
  checkAPI = false;
  } else {
  tabs.on('ready', function(tab) {
    var turl = tab.url;
    if (checkAPI) {
      if (prefs.api) {
        checkAPI = false;
      }
      else if (autoremote.test(turl)) {
        setAPI(turl);
      }
    }
  });
};

// Set the AutoRemote API URL
function setAPI(apiurl) {
  apiurl = apiurl.split("&")[0];
  if (prefs.secure) {
    apiurl = apiurl.replace("http://", "https://");
  }
  prefs.api = apiurl;
  button.icon = icons;            // enable our icon
  button.label = label;
  checkAPI = false;
  DEBUG && console.log("API set to " + prefs.api);
  notify("Your AutoRemote API URL has been set and you may now push links and text from this browser to your Android device.");
}

// Get the AutoRemote API URL from the prefs
function getAPI() {
  var api = prefs.api;
  if (api) {
    if (prefs.secure && api.indexOf("https://") != 0) {
      api = api.replace("http://", "https://");
      prefs.api = api;  
    }
  } else {
      DEBUG && console.log("API URL not defined");
      notify("The AutoRemote API URL has not been set.\n\nOpen AutoRemote on your phone and go to the displayed goo.gl URL in this browser.");
  }
  return api;
}

// Push a URL to the device
function pushURL(url) {
  if (prefs.linkcmd) return pushText(url, prefs.linkcmd);
  var api = getAPI();
  if (url && url.indexOf("about:") != 0) {
    if (autoremote.test(url)) {
      setAPI(url);
    } else if (api) {
      api = api.replace("/?", "/sendintent?") + "&intent=";
      api += encodeURIComponent(url);
      if (prefs.password) api += "&password=" + encodeURIComponent(prefs.password);
      try {
        request({url: api,
          onComplete: function() {
            notify("A link has been pushed to your device.\n\n" + url.split("/").slice(0, 3).join("/") + "/ ...");
            DEBUG && console.log("Pushed " + url);
          }
        }).get();
      } catch (e) {
        notify("ERROR pushing a link to your device.\n\n" + url.split("/").slice(0, 3).join("/") + "/ ...");
        DEBUG && console.log("Error pushing " + url + '\n\n' + e);      
      }
    }
  } else {
    DEBUG && console.log("Unsupported URL scheme 'about'");
  }
  return true;
}

// Push text to the device. Optional cmd may be passed (for pushing links using the messaging API)
function pushText(text, cmd) {
  var api = getAPI();
  if (text) {
    if (api) {
      send = function (cred) {
        try {
          api = api.replace("/?", "/sendmessage?");
          api += "&message=" + (cmd || prefs.textcmd) + "=:=" + encodeURIComponent(text);
          if (cred.password) api += "&password=" + encodeURIComponent(cred.password);
          request({url: api,
            onComplete: function() {
              notify("Text has been pushed to your device.\n\n" + text.slice(0, 40) + "...");
              DEBUG && console.log("Pushed " + text);
            }
          }).get();
        } catch (e) {
          notify("ERROR pushing a link to your device.\n\n" + url.split("/").slice(0, 3).join("/") + "/ ...");
          DEBUG && console.log("Error pushing " + url + '\n\n' + e);      
        }
      };
      if (prefs.password) {   // retrieve the shadowed password
        passwords.search({url: self.uri,
          onComplete: function (creds) { creds.forEach(send) }
        });
      } else {
        send({});
      }
    }
  } else {
    DEBUG && console.log("No text selected"); 
  }
  return true;
}

// Display a notification or, if that's turned off, flash our toolbar icon
function notify(text) {
  if (prefs.notify) {
    notifications.notify({
      title: myname,
      text: text,
      iconURL: "./icon-64.png"
    });
  } else {
    flashIcon(button.icon, 5);
  }
}

// flash our toolbar icon
function flashIcon(baseicon, flashes) {
  button.icon = ((button.icon["16"] == baseicon["16"]) ? blank : baseicon); 
  if (flashes) timers.setTimeout(function () { flashIcon(baseicon, flashes - 1); }, 250);
}

// return a string of bullets the same length as a string; may also pass integer
function bullets(text) { return '\u2022'.repeat(text.length == undefined ? text : text.length); }

timer = null;

// Store password securely as a credential; display mask of password in prefs
// May I just mention for the record that an asynchronous password API is a giant pain?
pref.on("password", function () {
  if (timer != null) timers.clearTimeout(timer);
  var pass = prefs.password;
  if (!(pass && pass == bullets(pass))) {
    var store = function() { if (pass) passwords.store({realm: "AutoRemote API", username: "autoremote", password: pass}); }
    timer = timers.setTimeout(function() {
      passwords.search({
        url: self.uri, username: "autoremote",
        onComplete: function (creds) {
          creds.forEach(function (cred) { passwords.remove({
            realm: cred.realm, username: cred.username, password: cred.password, onComplete: store
          }) });
          if (!creds.length) store();
          prefs.password = bullets(pass);
        }});
    }, 3000);
  }
});

// Handle editing of API URL in preferences
pref.on("api", function() {
  if (autoremote.test(prefs.api)) setAPI(prefs.api);
});
