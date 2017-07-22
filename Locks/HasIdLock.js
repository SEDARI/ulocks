// TODO: Review lub and le operations

var w = require('winston');
w.level = process.env.LOG_LEVEL;

module.exports = function(Lock) {
    "use strict";

    var HasIdLock = function(lock) {
        // call the super class constructor
        Lock.call(this, lock);
    };

    HasIdLock.meta = {
        arity: 1,
        descr: "This lock is open iff the entity to which this lock is applied to has the specified ID.",
        name: "has ID",
        args: [
            "id"
        ]
    };

    Lock.registerLock("hasId", HasIdLock);

    HasIdLock.prototype = Object.create(Lock.prototype);

    HasIdLock.prototype.le = function(other) {
        w.debug("HasIdLock.prototype.le: "+this+" <= "+other);
        if(this.eq(other))
            return true;
        else {
            w.debug("\t====> false");
            return false;
        }
    };

    HasIdLock.prototype.copy = function() {
        var c = new HasIdLock(this);
        return c;
    };

    HasIdLock.prototype.isOpen = function(context, scope) {
	w.debug("HasIdLock.prototype.isOpen");
	if(valid(context)) {
	    if(!context.isStatic) {
		if(valid(context.entity) && valid(context.entity.data) && valid(context.entity.data.id)) {
		    if(context.entity.data.id == this.args[0])
			return Promise.resolve({open: true, cond: false});
		    else
			return Promise.resolve({open: false, cond: false, lock: this});
		} else {
		    return Promise.reject(new Error("HasIdLock.prototype.isOpen: Entity in context does not specify the property 'id'!" + JSON.stringify(context,null,2)));
		}
	    } else {
		return Promise.reject(new Error("HasIdLock.prototype.isOpen not implemented for static analysis, yet"));
	    }
	} else
	    return Promise.reject(new Error("HasIdLock.prototype.isOpen: Context is invalid"));
    };

    HasIdLock.prototype.lub = function(lock) {
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
	return (o !== undefined && o !== null);
    }
}
