var w = require('winston');
w.level = process.env.LOG_LEVEL;

module.exports = function(Lock) {
    "use strict";
    
    var AttributeEqLock = function(lock) {
        // call the super class constructor
        Lock.call(this, lock);
    }

    Lock.registerLock("attrEq", AttributeEqLock);

    AttributeEqLock.prototype = Object.create(Lock.prototype);

    AttributeEqLock.prototype.copy = function() {
        var c = new AttributeEqLock(this);
        return c;
    }

    AttributeEqLock.prototype.isOpen = function(context, scope) {
	w.debug("AttributeEqLock.prototype.isOpen");
	if(valid(context)) {
	    if(!context.isStatic) {              
		if(valid(context.entity) && valid(context.entity.data)) {
		    if(context.entity.data.hasOwnProperty(this.args[0]) &&
                       valid(context.entity.data[this.args[0]]) &&
                       context.entity.data[this.args[0]] == this.args[1]) {
			return Promise.resolve({open: true, cond: false});
                    } else {
			return Promise.resolve({open: false, cond: false, lock: this});
                    }
		} else {
		    return Promise.reject(new Error("AttributeEqLock.prototype.isOpen: Entity in context does not specify the property 'id'!" + JSON.stringify(context,null,2)));
		}
	    } else {
		return Promise.reject(new Error("AttributeEqLock.prototype.isOpen not implemented for static analysis, yet"));
	    }
	} else
	    return Promise.reject(new Error("AttributeEqLock.prototype.isOpen: Context is invalid"));
    };

    AttributeEqLock.prototype.lub = function(lock) {
        if(this.eq(lock))
            return Lock.createLock(this);
        else
            return null;
    };

    AttributeEqLock.prototype.le = function(lock) {
        if(this.eq(lock))
            return true;
        else
            return false;
    };

    function valid(o) {
	return (o !== undefined && o !== null);
    }
}
