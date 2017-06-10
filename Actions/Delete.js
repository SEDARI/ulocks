var w = require('winston');
w.level = process.env.LOG_LEVEL;

module.exports = function(Action) {
    "use strict";
    
    var Delete = function(action) {
        Action.call(this, action);
    }

    Action.register("delete", Delete);
    
    Delete.prototype = Object.create(Action.prototype);

    Delete.prototype.copy = function(d) {
        var c = new Delete(d);
        return c;
    }

    Delete.prototype.apply = function(msg) {
        w.debug("Apply delete action");

        return Promise.resolve(null);
    }
    
    Delete.prototype.toString = function(args) {
        return "<< delete >>";
    }
}
