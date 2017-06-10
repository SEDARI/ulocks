var w = require('winston');
w.level = process.env.LOG_LEVEL;

module.exports = function(Lock) {
    "use strict";

    var HasIdLock = function(lock) {
        // call the super class constructor
        Lock.call(this, lock);
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
    }

    HasIdLock.prototype.handleUser = function(subject, isStatic) {
        if(isStatic) {
            throw new Error("handleUser for hasId lock is not supported in static analysis yet");
        } else {
            if((subject.type == '/user' && subject.data.id == this.args[0] && !this.not) ||
               ((subject.type != '/user' || subject.data.id != this.args[0]) && this.not))
                return { open: true, cond: false };
            else
                return { open: false, cond: false, lock : this };
        }
    };

    HasIdLock.prototype.handleSensor = function(subject, isStatic) {
        if(isStatic) {
            throw new Error("handleSO for hasId lock is not supported in static analysis yet");
        } else {
            if((subject.type == 'sensor' && subject.data.id == this.args[0] && !this.not) ||
               ((subject.type != 'sensor' || subject.data.id != this.args[0]) && this.not))
                return { open: true, cond: false };
            else
                return { open: false, cond: false, lock : this };
        }
    };

    HasIdLock.prototype.handleAny = function(subject, isStatic) {
        if(isStatic) {
            throw new Error("HasIdLock.prototype.handleAny is not supported in static analysis, yet.");
        } else {
            var r = this.handleSensor(subject, isStatic);
            if(this.not) {
                if(!r.result)
                    return { open: false, cond: false, lock : this };
            } else
                if(r.result)
                    return r;

            r = this.handleUser(subject, isStatic);
            if(this.not) {
                if(!r.result)
                    return { open: false, cond: false, lock : this };
            } else
                if(r.result)
                    return r;

            if(this.not)
                return { open: true, cond: false };
            else
                return { open: false, cond: false, lock : this };
        }
    };

    HasIdLock.prototype.isOpen = function(context, scope) {
        if(context) {
            switch(scope) {
            case "/any" :
                return this.handleAny(context.entity, context.isStatic);
                break;
            case "/user" :
                return this.handleUser(context.entity, context.isStatic);
                break;
            case "/sensor" :
                return this.handleSensor(context.entity, context.isStatic);
                break;
            default :
                throw new Error("Unknown scope '"+scope+"' for hasId lock evaluation.");
            }
        } else
            throw new Error("HasIdLock: Requires user, sensor, sender or receiver context to evaluate lock. Did you set context type?");
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
}
