/** 
 * Lock module
 * @module Lock
 * @author Daniel Schreckling
 */

"use strict";

var fs = require("fs");
var path = require("path");
var w = require("winston");

var PolicyConfig = require("./PolicyConfig");
var Entity = require("./Entity.js");

var lockConstructors = {};

w.level = process.env.LOG_LEVEL;

/** 
 * @class Lock
 * @param {object} lock JSON describing a lock
 */
function Lock(lock) {

    /* if(this.constructor === Object) {
       throw new Error("Error: Lock: Can't instantiate an abstract class!");
       } */

    /* if(!lockConstructors == {}) {
        Lock.initLocks();
    }*/

    if(this.constructor === Object &&
       lock && lock.lock && lockConstructors[lock.lock]) {
        throw new Error("Lock: Use Lock.createLock to generate Locks of type '"+lock.lock+"'");
    } else {
        if(lock === undefined) {
            this.lock = "";
            this.args = [];
            this.not = false;
        } else {
            if(lock.lock === undefined)
                throw new Error("Error: Lock does not specify a path");

            this.lock = lock.lock;
            if(lock.args !== undefined) {
                var l = lock.args.length;
                this.args = []

                for(var i = 0; i < l; i++) {
                    if(lock.args[i] && lock.args[i].type) {
                        this.args[i] = new Entity(lock.args[i]);
                    } else
                        this.args[i] = lock.args[i];
                }
            }
            if(lock.not === undefined)
                this.not = false;
            else
                this.not = lock.not;
        }
    }
};

function readLocks(dir) {
    var lockFiles = [];
    var locks = [];
    var loads = [];

    try {
        lockFiles = fs.readdirSync(dir);
    } catch(err) {
        return Promise.reject(err);
    }
    
    lockFiles.forEach(function(lockFile) {
        loads.push(new Promise( function(resolve, reject) {
            var filePath = path.join(dir, lockFile);
            var stats = fs.statSync(filePath);
            if (stats.isFile()) {
                if (/\.js$/.test(filePath)) {
                    try {
                        var newLock = require(filePath);
                        newLock(Lock);
                        w.log('info', "Success: Lock in '"+filePath+"' is now registered.");
                        resolve();
                    } catch(err) {
                        w.log('error', "Unable to load lock in '"+filePath+"'!");
                        reject(err);
                    }
                }
            }
        }));
    });

    return Promise.all(loads);
};

Lock.init = function(settings) {
    var baseDir = process.cwd();

    if(!settings.locks) {
        w.log('error', "Unable to initialize Locks. Invalid 'settings.locks' property!");
        return Promise.reject(new Error("Unable to initialize Locks. Invalid settings.locks property!"));
    }

    // if settings.actions starts with path separator, it contains the absolute 
    // path to the directory from which the actions should be loaded
    if(settings.locks[0] !== path.sep)
        settings.locks = baseDir + path.sep + settings.locks;

    w.log('info', "Searching for locks at '"+settings.locks+"'"); 
    
    return readLocks(settings.locks);
};

Lock.createLock = function(lock) {
    if(!lockConstructors[lock.lock]) {
        Lock.initLocks();
    }
    
    if(!lock)
        return new Lock();
    
    if(!(lock instanceof Lock) && !lock.lock) {
        throw new Error("Lock: Cannot create a lock from other than a Lock!");
        return null;
    }
        
    if(!lockConstructors[lock.lock]) {
        throw new Error("Lock '"+lock.lock+"' does not exist!");
        return null;
    }

    return new (lockConstructors[lock.lock])(lock);
};

Lock.closedLock = function() {
    return Lock.createLock({ lock : "closed" });
};

Lock.openLock = function() {
    return Lock.createLock({ lock : "open" });
};

Lock.registerLock = function (type, constructor) {
    if(!lockConstructors)
        lockConstructors = {};

    if(lockConstructors[type]) {
        throw new Error(type+" is already a registered lock.");
        return;
    }

    if(!constructor)
        throw new Error("Constructor for "+type+" is invalid.");

    lockConstructors[type] = constructor;
};

Lock.prototype.neg = function() {
    this.not = !this.not;
    
    return this;
};

Lock.prototype.toString = function() {
    var str = "[[ ";
    
    if(this.not && this.not == true)
        str += "not ";
    
    str += this.lock;
    
    if(this.args !== undefined) {
        var l = this.args.length - 1;
        
        if(l >= 0)
            str += "(";
        
        this.args.forEach(function(e,i) {
            str += e;
            if(i < l)
                str += ", ";
            else
                str += ")";
        });
    }
    str += " ]]";
    
    return str;
};

// **method isOpen** must be overwritten by the corresponding lock class
Lock.prototype.isOpen = function(lockContext) {
    w.log("error", "Lock '"+this.lock+"' is required to overwrite method isOpen!");
    return Promise.reject(new Error("Lock '"+this.lock+"' is required to overwrite method isOpen!"));
};

// function tries to merge this lock with the argument lock
// returns a new lock if successful, null otherwise
Lock.prototype.lub = function(lock) {
    w.log("error", "Lock '"+this.lock+"' is required to overwrite method lub!");
    return Promise.reject(new Error("Lock '"+this.lock+"' is required to overwrite method lub!"));
};

Lock.prototype.eq = function(lock) {
    if(!lock)
        return Promise.resolve(false);
    
    if(!(this.lock === undefined && lock.lock === undefined)) {
        if(this.lock === undefined || lock.lock === undefined)
            return Promise.resolve(false);
        else
            if(this.lock != lock.lock)
                return Promise.resolve(false);
    }
    
    if(!(this.not === undefined && lock.not === undefined)) {
        if(this.not === undefined || lock.not === undefined)
            return Promise.resolve(false);
        else
            if(this.not != lock.not)
                return Promise.resolve(false);
    }
    
    if(!(this.args === undefined && lock.args === undefined)) {
        if(this.args === undefined || lock.args === undefined)
            return Promise.resolve(false);
        else {
            for(var i in this.args) {
                if(this.args[i] && this.args[i].type) {
                    if(JSON.stringify(this.args[i]) !== JSON.stringify(lock.args[i]))
                        return Promise.resolve(false);
                } else {
                    if(this.args[i] != lock.args[i])
                        return Promise.resolve(false);
                }
            }
        }
    }
    
    return Promise.resolve(true);
};

// returns true if lock is less restrictive than this lock
Lock.prototype.le = function (lock) {
    w.log("error", "Lock '"+this.lock+"' is required to overwrite method le!");
    return Promise.reject(new Error("Lock '"+this.lock+"' is required to overwrite method le!"));
};

module.exports = Lock;
