"use strict";

var fs = require("fs");
var path = require("path");

var PolicyConfig = require("./PolicyConfig");
var Entity = require("./Entity.js");

var lockConstructors = {};

// ## Constructor
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
                        resolve();
                    } catch(err) {
                        console.log("ERROR: Unable to load lock in '"+filePath+"'!");
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
    
    if(settings.lockDir[0] !== path.sep)
        settings.lockDir = baseDir + path.sep + settings.lockDir;
    
    return readLocks(settings.lockDir);
};

Lock.createLock = function(lock) {
    if(!lockConstructors[lock.lock]) {
        // console.log("CALL INITLOCKS FOR "+lock.lock);
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
    throw new Error("Lock: isOpen is required to be overwritten");
};

// function tries to merge this lock with the argument lock
// returns a new lock if successful, null otherwise
Lock.prototype.lub = function(lock) {
    throw new Error("Lock: lub is required to be overwritten");
};

Lock.prototype.eq = function(lock) {
    if(!lock)
        return false;
    
    if(!(this.lock === undefined && lock.lock === undefined)) {
        if(this.lock === undefined || lock.lock === undefined)
            return false;
        else
            if(this.lock != lock.lock)
                return false;
    }
    
    if(!(this.not === undefined && lock.not === undefined)) {
        if(this.not === undefined || lock.not === undefined)
            return false;
        else
            if(this.not != lock.not)
                return false;
    }
    
    if(!(this.args === undefined && lock.args === undefined)) {
        if(this.args === undefined || lock.args === undefined)
            return false;
        else {
            for(var i in this.args) {
                if(this.args[i] && this.args[i].type) {
                    if(JSON.stringify(this.args[i]) !== JSON.stringify(lock.args[i]))
                        return false;
                } else {
                    if(this.args[i] != lock.args[i])
                        return false;
                }
            }
        }
    }
    
    return true;
};

// returns true if lock is less restrictive than this lock
Lock.prototype.le = function (lock) {
    throw new Error("Lock: lub is required to be overwritten");        
};

module.exports = Lock;
