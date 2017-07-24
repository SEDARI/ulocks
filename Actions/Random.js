var w = require('winston');
w.level = process.env.LOG_LEVEL;

module.exports = function(Action) {
    "use strict";
    
    var Randomize = function(action) {
	    Action.call(this, action);
    }

    Action.register("randomize", Randomize);
    
    Randomize.prototype = Object.create(Action.prototype);

    Randomize.prototype.copy = function(d) {
        var c = new Randomize(d);
        return c;
    }

    Randomize.prototype.apply = function(msg) {
	    w.debug("Apply randomization action");
	    
	    if(msg === null || msg === undefined)
	        return Promise.resolve(msg);
	    
	    var l = msg.length;
	    // store possible characters in arg of action!
	    var choice = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"+
	        "abcdefghijklmnopqrstuvwxyz"+
	        "0123456789"+"?ß*+'#_-:.;,!\"§$%&/()=";
	    
	    msg = "";
	    for(;l > 0; l--)
	        msg += choice.charAt(Math.floor(Math.random() * choice.length));
	    
        return Promise.resolve(msg);
    }
    
    Randomize.prototype.toString = function(args) {
        return "<< randomize >>";
    }
}
