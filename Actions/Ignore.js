var w = require('winston');
w.level = process.env.LOG_LEVEL;

module.exports = function(Action) {
    "use strict";
    
    var Ignore = function(action) {
        Action.call(this, action);
    }

    Action.register("ignore", Ignore);
    
    Ignore.prototype = Object.create(Action.prototype);

    Ignore.prototype.copy = function(i) {
        var c = new Ignore(i);
        return c;
    }
    
    Ignore.prototype.apply = function(msg) {
        w.debug("Apply ignore action");

        return Promise.resolve(msg);
    }
    
    Ignore.prototype.toString = function(args) {
        return "<< ignore >>";
    }
}
