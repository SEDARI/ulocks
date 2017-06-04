module.exports = function(Action) {
    "use strict";
    
    var Log = function(action) {
        Action.call(this, action);
    }

    Action.register("log", Log);
    
    Log.prototype = Object.create(Action.prototype);

    Log.prototype.copy = function(d) {
        var c = new Log(d);
        return c;
    }

    Log.prototype.apply = function(msg) {
        console.log("Apply log action");

	console.log("Log-Action: " + JSON.stringify(msg));

        return Promise.resolve(msg);
    }
    
    Log.prototype.toString = function(args) {
        return "<< log >>";
    }
}
