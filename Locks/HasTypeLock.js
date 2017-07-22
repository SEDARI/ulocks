// TODO: Review isOpen, lub and le operations
// they should be able to respect type hierarchies, e.g. flow to an client
// should also allow flow of a message to its subcomponents, i.e. variables
// apis, ...

var w = require('winston');
w.level = process.env.LOG_LEVEL;

module.exports = function(Lock) {
    "use strict";

    var HasTypeLock = function(lock) {
        // call the super class constructor
        Lock.call(this, lock);
    };

    HasTypeLock.meta = {
        arity: 1,
        descr: "This lock is open iff the entity to which this lock is applied to has the specified type",
        name: "has type",
        args: [
            "type"
        ]
    }

    Lock.registerLock("hasType", HasTypeLock);

    HasTypeLock.prototype = Object.create(Lock.prototype);

    HasTypeLock.prototype.le = function(other) {
        w.debug("HasTypeLock.prototype.le: "+this+" <= "+other);
        if(this.eq(other))
            return true;
        else {
            w.debug("\t====> false");
            return false;
        }
    };

    HasTypeLock.prototype.copy = function() {
        var c = new HasTypeLock(this);
        return c;
    }

    HasTypeLock.prototype.isOpen = function(context, scope) {
	w.debug("HasTypeLock.prototype.isOpen");
	if(valid(context)) {
	    if(!context.isStatic) {
		if(valid(context.entity) && valid(context.entity.type)) {
		    if(context.entity.type == this.args[0])
			return Promise.resolve({open: true, cond: false});
		    else
			return Promise.resolve({open: false, cond: false, lock: this});
		}
	    } else {
		return Promise.reject(new Error("HasTypeLock.prototype.isOpen not implemented for static analysis, yet"));
	    }
	} else
	    return Promise.reject(new Error("HasTypeLock.prototype.isOpen: Context is invalid"));
    };

    HasTypeLock.prototype.lub = function(lock) {
        if(this.eq(lock))
            return this;
        else {
            if(this.lock == lock.lock)
                return Lock.closedLock();
            else
                return null;
        }
    }

    function valid(o) {
	return o !== undefined && o !== null;
    }
}
