var w = require('winston');
w.level = process.env.LOG_LEVEL;

var ULocks = require("../index.js");
var settings = require("./settings.js");

ULocks.init(settings).then(
    function() {
	w.debug("ULocks successfully initialized");
    }, function(e) {
        w.error("Something went wrong during initialization of the ulocks policies. Cannot run tests.");
        w.error(e);
    }
);
