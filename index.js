// Unofficial AutoRemote add-on for Firefox
// Provides toolbar button and context menu items for pushing 
// page and image links to your Android device via AutoRemote.

// Jerry Kindall, engyrus@gmail.com, May 2016
// www.engyrus.com for occasional blog (more and more occasional every day)

var contextMenu = require("sdk/context-menu");
var windows = require("sdk/windows").browserWindows;
var tabs = require("sdk/tabs");
var buttons = require("sdk/ui/button/action");
var viewFor = require("sdk/view/core").viewFor;
var request = require("sdk/request").Request;
var prefs = require('sdk/simple-prefs').prefs;
var notifications = require("sdk/notifications");

var xulns = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
var label = "Push via AutoRemote";
var itemid = "unofficial-autoremote-push";
var myname = "AutoRemote Push (Unoffical)";

// Used to identify your personal AutoRemote page
var autoremote = /^https?:\/\/autoremotejoaomgcd.appspot.com\/\?key=/;

// Flag to check to make sure we have a valid API URL.  Once we know we do,
// we set it to false to avoid continually hitting the prefs API.
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

// toolbar button
button = buttons.ActionButton({
  label: prefs.api ? label : "Set AutoRemote API",
  id: "b-" + itemid,
  icon: prefs.api ? icons : iconsfaded,
  onClick: function () { pushURL(tabs.activeTab.url); }
});

// context menu for links and images
contextMenu.Item({
  label: label,
  context: contextMenu.SelectorContext("a[href], img[src]"),
  contentScript: 'self.on("click", function(node) { self.postMessage(node.src || node.href) })',
  onMessage: pushURL
});

// context menu for pages
contextMenu.Item({
  label: label,
  context: contextMenu.PageContext(),
  contentScript: 'self.on("click", function(node) { self.postMessage(document.location.href) })',
  onMessage: pushURL
});

// add context menu for tabs
function addtabmenu(window) {
  let doc = viewFor(window).document;
  if (!doc.getElementById(itemid)) {
    let menu = doc.getElementById("tabContextMenu");
    let item = doc.createElementNS(xulns, "menuseparator");
    menu.appendChild(item);
    item = doc.createElementNS(xulns, "menuitem");
    item.setAttribute("label", label);
    item.setAttribute("id", itemid);
    item.addEventListener("command", function(e) { pushURL(e.target.ownerDocument.popupNode.linkedBrowser.currentURI.spec); } );
    menu.appendChild(item);
  }
}

// now add the tab context menu to all existing windows
for (let window of windows) {
  addtabmenu(window);
}
// and make sure it gets added to new windows too
windows.on("open", addtabmenu);

// Recognize the API URL
tabs.on('ready', function(tab) {
  let turl = tab.url;
  if (checkAPI) {
    if (prefs.api) {
      checkAPI = false;
    }
    else if (autoremote.test(turl) && turl.indexOf("&") < 0) {
      setAPI(turl);
      checkAPI = false;
    }
  }
});

// Set the AutoRemote API URL
function setAPI(apiurl) {
  if (prefs.secure) {
    prefs.api = apiurl.replace("http://", "https://");
  }
  button.icon = icons;  // make our icons nicer
  button.label = label;
  console.log("API set to " + prefs.api);
  notify("Your AutoRemote API URL has been set and you may now push links from this browser to your Android device.");
}

// Push a URL to the device using the AutoRemote API
function pushURL(url) {
  if (url && url.indexOf("about:") != 0) {
    if (autoremote.test(url) && url.indexOf("&") < 0) {
      setAPI(url);
    } else if (prefs.api) {
      var api = prefs.api;
      if (prefs.secure && api.indexOf("https://") != 0) {
        api = api.replace("http://", "https://");
        prefs.api = api;
      }
      api = api.replace("/?", "/sendintent?") + "&intent=";
      request({url: api + encodeURIComponent(url), onComplete: function () { }}).get();
      console.log("Pushed " + url);
      notify("A link has been pushed to your device.\n\n" + url.split("/").slice(0, 3).join("/") + "/ ...");
    } else {
      console.log("API URL not defined");
      notify("The AutoRemote API URL has not been set.\n\nOpen AutoRemote on your phone and go to the displayed goo.gl URL in this browser.");
    }
  } else {
     console.log("Unsupported URL scheme");
  }
  return true;
}

// Display a notification
function notify(text) {
  if (prefs.notify) {
    notifications.notify({
      title: myname,
      text: text,
      iconURL: "./icon-64.png"
    });
  }
}
