var w = require('winston');
w.level = process.env.LOG_LEVEL;

module.exports = function(Action) {
    "use strict";
    
    var Replace = function(action) {
	    Action.call(this, action);
    }

    Action.register("replace", Replace);
    
    Replace.prototype = Object.create(Action.prototype);

    Replace.prototype.copy = function(r) {
        var c = new Replace(r);
        return c;
    }

    Replace.Types = Object.freeze({
	    "fixed" : "fixed",
	    "subject": "subject", // some subject property
	    "object": "object", // object property
	    "data": "data", // data property
	    "function": "function" // some function executed on the data
	    // and which returns the replacement
    });

    Replace.prototype.apply = function(msg) {
	    w.debug("Apply replacement action");

	    if(msg === null || msg === undefined)
	        return Promise.resolve(msg);

	    if(this.args[0] == Replace.Types.fixed) {
	        msg = this.args[1];
	    }
	    
        return Promise.resolve(msg);
    }
    
    Replace.prototype.toString = function(args) {
        return "<< replace >>";
    }
}
