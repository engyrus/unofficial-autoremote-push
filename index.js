// Unofficial AutoRemote add-on for Firefox
//
// Provides toolbar button and context menu items for pushing 
// links and text to your Android device via AutoRemote.

// Jerry Kindall, Engyrus - engyrus@gmail.com
// www.engyrus.com (more and more occasional blogging every day)

// Not affiliated with João Dias, author of AutoRemote

// TODOS: add context menu item to Places context menu

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
var itemid = "unofficial-autoremote-push";
var myname = "AutoRemote Push (Unoffical)";
var bullet = '\u2022';
var rbullet = RegExp(bullet, "g");

// Used to identify personal AutoRemote page
var autoremote = /^https?:\/\/autoremotejoaomgcd.appspot.com\/\?key=/;

var enabled = {
  "16": "./icon-16.png",
  "32": "./icon-32.png",
  "64": "./icon-64.png"
}

var disabled = {
  "16": "./icon-16f.png",
  "32": "./icon-32f.png",
  "64": "./icon-64f.png"
}

var blank = {
  "16": "./blank-16.png"
}

function label(item) {
  if (item) return "Push $ via AutoRemote".replace("$", item);
  return "Push via AutoRemote";
}

// add toolbar button
button = buttons.ActionButton({
  label: prefs.api ? label("page") : "Set AutoRemote API",
  id: "b-" + itemid,
  icon: prefs.api ? enabled : disabled,
  onClick: function () { pushURL(tabs.activeTab.url); }
});

// add context menu for links and images
contextMenu.Item({
  label: label("link"),
  context: contextMenu.SelectorContext("a[href], img[src]"),
  contentScript: 'self.on("click", function(node) { self.postMessage(node.src || node.href) })',
  onMessage: pushURL
});

// add context menu for pages
contextMenu.Item({
  label: label("page"),
  context: contextMenu.PageContext(),
  contentScript: 'self.on("click", function(node) { self.postMessage(document.location.href) })',
  onMessage: pushURL
});

// add context menu for selection
contextMenu.Item({
  label: label("text"),
  context: contextMenu.SelectionContext(),
  contentScript: 'self.on("click", function(node) { self.postMessage(window.getSelection().toString()) })',
  onMessage: pushText
});

// add context menu for tabs
function addtabmenu(window) {
  var doc = viewFor(window).document;
  if (!doc.getElementById(itemid)) {
    var menu = doc.getElementById("tabContextMenu");
    item = doc.createElementNS(xulns, "menuitem");
    item.setAttribute("label", label("tab"));
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
  }
};

// Recognize the API URL on tab load
tabs.on('ready', function(tab) {
  if (!prefs.api && autoremote.test(tab.url)) {
    prefs.api = makeAPI(tab.url);
  }
});

// Set the AutoRemote API URL
function makeAPI(apiurl) {
  apiurl = apiurl.split("&")[0];
  if (prefs.secure) {
    apiurl = apiurl.replace("http://", "https://");
  }
  return apiurl;
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
  if (!api) return;
  if (url && url.indexOf("about:") != 0) {
    if (autoremote.test(url)) {
      prefs.api = makeAPI(url);
    } else if (api) {
      api = api.replace("/?", "/sendintent?") + "&intent=";
      api += encodeURIComponent(url);
      if (prefs.password) api += "&password=" + encodeURIComponent(prefs.password);
      try {
        request({url: api,
          onComplete: function() {
            optnotify("A link has been pushed to your device.\n\n" + url.split("/").slice(0, 3).join("/") + "/ ...");
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
              optnotify("Text has been pushed to your device.\n\n" + text.slice(0, 40) + "...");
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

// Display a notification
function notify(text) {
    notifications.notify({
      title: myname,
      text: text,
      iconURL: "./icon-64.png"
    });
}

// Display a notification or flash our toolbar icon
function optnotify(text) {
  if (prefs.notify) {
    notify(text);
  } else {
    flash(button.icon, 5);
  }
}

// flash our toolbar icon
function flash(icon, flashes) {
  button.icon = ((button.icon["16"] == icon["16"]) ? blank : icon); 
  if (flashes) timers.setTimeout(function () { flash(icon, flashes - 1); }, 250);
}

// return a string of bullets the same length as a string; may also pass integer
function bullets(text) { return bullet.repeat(text.length == undefined ? text : text.length); }

// stores reference to timer for masking password
timer = null;

// Store password securely as a credential; display mask of password in prefs
// May I just mention for the record that the password API is a giant pain?
pref.on("password", function () {
  if (timer != null) timers.clearTimeout(timer);
  var pass = prefs.password;
  // empty password field is OK
  if (!pass) return;
  // if there's a bullet, but it's not ALL bullets, remove all bullets
  if (pass.indexOf(bullet) + 1 && pass != bullets(pass)) {
    prefs.password = pass.replace(rbullet, "");
    return;
  }
  // mask and store after 2.5 sec of no typing
  if (pass != bullets(pass)) {
    var store = function() { 
      if (pass) passwords.store({realm: "AutoRemote API", username: "autoremote", password: pass});
          }
    timer = timers.setTimeout(function() {
      passwords.search({
        url: self.uri, username: "autoremote",
        onComplete: function (creds) {
          creds.forEach(function (cred) { passwords.remove({
            realm: cred.realm, username: cred.username, password: cred.password, onComplete: store
          }) });
          if (!creds.length) store();
          prefs.password = bullets(pass);
          optnotify("Your API password has been securely stored in Firefox's Saved Logins."); 
        }});
    }, 2500);
  }
});

// Handle editing of API URL in preferences
pref.on("api", function() {
  if (autoremote.test(prefs.api)) {
    if (prefs.api.indexOf("&") + 1) {
      prefs.api = makeAPI(prefs.api);
      return;
    }
  } else if (prefs.api) { 
    prefs.api = "";   // only allow paste of valid API URL
    return;
  }
  button.icon  = prefs.api ? enabled : disabled;
  button.label = prefs.api ? label("page") : "Set AutoRemote API"; 
  if (prefs.api) {
    DEBUG && console.log("API set to " + prefs.api);
    optnotify("Your AutoRemote API URL has been set and you may now push links and text from this browser to your Android device.");
  }
});

pref.on("device", function() {
  try {
    var dev = prefs.device;
    DEBUG && console.log("selected device " + dev);
    prefs.name = prefs["name"+dev];
    prefs.api = prefs["api"+dev];
    prefs.textcmd = prefs["textcmd"+dev];
    prefs.linkcmd = prefs["linkcmd"+dev];
    prefs.password = prefs["password"+dev];
  } catch (e) { DEBUG && console.log(e); }
});

DEBUG && console.log("initialized");
DEBUG && console.log(prefs.device);
// DEBUG && console.log(doc.getElementById("placesContext"));
