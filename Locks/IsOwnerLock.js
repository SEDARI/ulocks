var w = require('winston');
w.level = process.env.LOG_LEVEL;

module.exports = function(Lock) {
    "use strict";

    var IsOwnerLock = function(lock) {
        // call the super class constructor
        Lock.call(this, lock);
    };

    IsOwnerLock.meta = {
        scopes: [ "/client", "/sensor" ],
        arity: 1,
        descr: "This lock is open iff the currently logged in user owns the entity to which this lock is applied to.",
        name: "owns"
    };

    Lock.registerLock("isOwner", IsOwnerLock);

    IsOwnerLock.prototype = Object.create(Lock.prototype);

    IsOwnerLock.prototype.copy = function() {
        var c = new IsOwnerLock(this);
        return c;
    }

    IsOwnerLock.prototype.isOpen = function(context, scope) {
	w.debug("IsOwnerLock.prototype.isOpen");
	if(valid(context)) {
	    if(!context.isStatic) {
		if(valid(context.entity) && valid(context.entity.data) && valid(context.entity.data.id)) {
                    var other = context.getOtherEntity();
                    if(valid(other) && valid(other.data) && valid(other.data.owner)) {
		        if(context.entity.data.id === other.data.owner)
			    return Promise.resolve({open: true, cond: false});
		        else
			    return Promise.resolve({open: false, cond: false, lock: this});
                    } else {
                        return Promise.reject(new Error("IsOwnerLock.prototype.isOpen cannot evaluate opposing entities in message context or context is invalid!"));
                    }
		} else {
                    return Promise.reject(new Error("IsOwnerLock.prototype.isOpen current context is invalid!"));
                }
	    } else {
		return Promise.reject(new Error("IsOwnerLock.prototype.isOpen not implemented for static analysis, yet"));
	    }
	} else
	    return Promise.reject(new Error("IsOwnerLock.prototype.isOpen: Context is invalid"));
    };

    IsOwnerLock.prototype.lub = function(lock) {
        if(this.eq(lock))
		    return this;
        else {
            if(this.lock == lock.lock)
                return Lock.closedLock();
            else
                return null;
        }
    };

    function valid(o) {
	return o !== undefined && o !== null;
    }
}
