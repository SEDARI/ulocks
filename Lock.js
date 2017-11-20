// TODO: think about adjusting terminology to flow terminology

"use strict";

var fs = require("fs");
var path = require("path");
var w = require("winston");
w.level = process.env.LOG_LEVEL;
var Promise = require('bluebird');

var Entity = require("./Entity.js");
var ArgTypes = null;

function valid(o) {
    return ((o !== undefined) && (o !== null));
}

/**
 * Constructs a new lock.
 * @class
 * @param {Object} lock JSON describing a lock
 */
function Lock(lock) {
    if(!valid(lockConstructors)) {
        w.error("Locks have not been initialized yet!");
        throw new Error("Locks have not been initialized yet");
    }

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
            if(lock.path)
                lock.lock = lock.path;

            if(!valid(lockConstructors[lock.lock])) {
                w.error("Lock '"+lock.lock+"' has not been registered! Cannot use this lock!");
                throw new Error("Lock '"+lock.lock+"' has not been registered! Cannot use this lock!");
            }

            if(lock.lock === undefined)
                throw new Error("Error: Lock '"+lock+"' does not specify a path");

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

/**
 * Stores constructors of all locks registered with this module
 * using the static method [registerLock]{@link Lock#registerLock} (mostly called from within a lock)
 * @static
 * @private
 */
var lockConstructors = {};
var lockInfos = {};

Lock.getLockInfos = function() {
    return lockInfos;
}

function readLocks(settings) {

    var lockFiles = [];
    var locks = [];
    var loads = [];
    if( settings.locks === "module" && settings.load_from_module){
      var mod = require(settings.load_from_module);
      mod.locks.forEach((l)=>{
            loads.push(new Promise(function(resolve, reject) {
                try {
                    l(Lock);
                    resolve();
                } catch(err) {
                    w.error("Unable to load lock in module '"+l+"'! Reason: " + err);
                    reject(err);
                }
            }));
          })
    }
    else{
      var dir = settings.locks;
      try {
          lockFiles = fs.readdirSync(dir);
          lockFiles.forEach(function(lockFile) {
              var filePath = path.join(dir, lockFile);
              var stats = fs.statSync(filePath);
              if (stats.isFile()) {
                  if (/\.js$/.test(filePath)) {
                      loads.push(new Promise(function(resolve, reject) {
                          try {
                              var newLock = require(filePath);
                              newLock(Lock);
                              resolve();
                          } catch(err) {
                              w.error("Unable to load lock in '"+filePath+"'! Reason: " + err);
                              reject(err);
                          }
                      }));
                  }
              }
          });
      } catch(err) {
          w.error("Unable to load Locks from directory '"+dir+"'");
          return Promise.reject(err);
      }
    }

    return new Promise(function(resolve, reject) {
        Promise.all(loads).then(function() {
            w.info("All locks read successfully.");
            resolve();
        }, function(e) {
            reject(e);
        });
    });
};

/**
 * Initializes the lock system, reading all locks from the directory specified in
 * settings.
 * @arg {Object} settings Checks whether <code>settings.locks</code> is an absolute path. If it is
 * the locks are loaded from this path. If not, locks are loaded relative to the path
 * the application was started from
 * @return {Promise} The returned promise resolves if each lock was loaded successfully,
 * rejects otherwise.
 * @static
 */
Lock.init = function(settings) {
    if(valid(lockConstructors) && Object.keys(lockConstructors).length > 0) {
        w.warn("Lock system has already been initialized. Skip this initialization.");
        return Promise.resolve();
    }

    var baseDir = process.cwd();

    if(!settings.locks) {
        w.error("Unable to initialize Locks. Invalid 'settings.locks' property!");
        return Promise.reject(new Error("Unable to initialize Locks. Invalid settings.locks property!"));
    }

    if(valid(settings.argTypes))
        ArgTypes = settings.argTypes;
    else
        w.warn("No argument types specified for your current lock system!");

    // if settings.locks starts with path separator, it contains the absolute
    // path to the directory from which the locks should be loaded
    //if settings.locks is module then we load the modules instead of reading files
    if(settings.locks !== "module" && settings.locks[0] !== path.sep)
        settings.locks = baseDir + path.sep + settings.locks;

    w.info("Searching for locks at '"+settings.locks+"'");

    return new Promise(function(resolve, reject) {
        readLocks(settings).then(function(v) {
            w.info("All locks successfully loaded and registered.");
            resolve();
        }, function(e) {
            w.error("Error occurred while loading locks.", e);
            reject(e);
        });
    });
};

/* TODO: check whether this code can be removed as the general constructor is available */
Lock.createLock = function(lock) {
    if(!lock)
        return new Lock();

    if(lock.path)
        lock.lock = lock.path;

    if(!(lock instanceof Lock) && !lock.lock) {
        throw new Error("Lock: Cannot create a lock from other than a Lock!");
        return null;
    }

    if(!valid(lockConstructors)) {
        w.error("Locks have not been initialized yet!");
        throw new Error("Locks have not been initialized yet");
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

/**
 * Registers a new lock, indicating the "type" of the lock (could also
 * be called the name of the lock) and its constructor, called when a new
 * lock of this type should be constructed, e.g. if it is contained in a
 * policy.
 *
 * @arg {string} type A unique name for the lock type to be registered
 * @arg {function} constructor The constructor to be called when a new lock
 * of this type is constructed
 * @throws Throws an error if type or constructor are invalid or if the lock
 * type has already been registered.
 * @static
 */
Lock.registerLock = function (type, constructor) {
    if(!lockConstructors)
        lockConstructors = {};

    if(lockConstructors[type]) {
        w.warn("Did not register lock '"+type+"' again. It is already a registered lock.");
        return;
    }

    if(!constructor) {
        throw new Error("Constructor for "+type+" is invalid.");
        return;
    }

    if(!valid(lockInfos[type]))
        lockInfos[type] = {};

    if(!valid(constructor.meta)) {
        w.warn("Lock '"+type+"' does not specify required meta information. Lock ignored!");
    } else {
        if(!valid(constructor.meta.arity)) {
            w.error("Lock '"+type+"' does not specify arity. Lock ignored!");
            return;
        } else
            lockInfos[type].arity = constructor.meta.arity;

        if(!valid(constructor.meta.scopes)) {
            w.warn("Lock '"+type+"' does not specify any scopes. Lock is valid for all entity types!");
        } else {
            for(var s in constructor.meta.scopes) {
                if(!valid(Entity.Types[constructor.meta.scopes[s]])) {
                    w.error("Lock '"+type+"' specifies scope '"+constructor.meta.scopes[s]+"' which does not represent an entity type. Lock ignored!");
                    delete lockInfos[type];
                    return;
                }
            }
            lockInfos[type].scopes = constructor.meta.scopes;
        }

        if(valid(constructor.meta.name))
            lockInfos[type].name = constructor.meta.name;

        if(valid(constructor.meta.args) && valid(ArgTypes)) {
            var aTypes = constructor.meta.args;
            for(var a in aTypes) {
                var aType = aTypes[a];
                if(!valid(ArgTypes[aType])) {
                    w.warn("Lock '"+ type +"' specifies argument type '"+aType+"' which does not represent a valid argument type. Lock may not be configurable in, e.g., UI components");
                }
            }
            lockInfos[type].args = constructor.meta.args;
        }

        if(valid(constructor.meta.descr))
            lockInfos[type].descr = constructor.meta.descr;
    }

    w.info("Success: Lock '"+type+"' is now registered.");

    lockConstructors[type] = constructor;
};

/**
 * Negates this lock
 * @function
 * @return {Lock} Reference to the same, but now negated, lock
 */
Lock.prototype.neg = function() {
    this.not = !this.not;

    return this;
};

/**
 * Transforms this lock into a string representation which can be read easily
 * @function
 * @return {string} String representation of the lock
 */
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

/**
 * Checks whether two locks are equal.
 * @arg {Lock} lock Lock to compare with <code>this</code> lock
 * @returns {Boolean} <code>true</code> if both locks are equal, i.e. type, arguments,
 * and negation are identical, <code>false</code> otherwise.
 */
Lock.prototype.eq = function(lock) {
    if(!lock)
        return false;

    if(!(this.lock === undefined && lock.lock === undefined)) {
        if(this.lock === undefined || lock.lock === undefined)
            return false;
        else {
            if(this.lock != lock.lock)
                return false;
        }
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

// TODO: Add reference to context
/**
 * Must be implemented by the corresponding lock class.
 * @arg {Context} lockContext The {@link Context} in which the lock is evaluated
 * @arg {Scope} scope ...
 * @returns {Promise.<Boolean>} Promise resolves to <code>true</code> if the lock is open in the provided
 * <code>lockContext</code>, to <code>false</code> if it is closed in the context, rejects otherwise.
 * @abstract
 */
Lock.prototype.isOpen = function(lockContext, scope) {
    w.log("error", "Lock '"+this.lock+"' is required to overwrite method isOpen!");
    return Promise.reject(new Error("Lock '"+this.lock+"' is required to overwrite method isOpen!"));
};

/**
 * Must be implemented by the corresponding lock class. Computes the least upper bound of <code>this</code> lock and the
 * lock provided as the argument
 * @arg {Lock} lock Lock against which the least upper bound is computed
 * @returns {Promise.<Lock>} Promise resolves with the <code>lub</code> if the computation was successful, rejects otherwise.
 * @abstract
 */
Lock.prototype.lub = function(lock) {
    w.error("Lock '"+this.lock+"' is required to overwrite method lub!");
    throw new Error("Lock '"+this.lock+"' is required to overwrite method lub!");
    return null;
};

/**
 * Must be implemented by the corresponding lock class. Checks whether <code>this</code> lock
 * is less or equally restrictive than the lock provided as an argument.
 * @arg {Lock} lock Lock to compare with <code>this</code> lock
 * @returns {Boolean} <code>true</code> if <code>this</code> is less or equally restrictive, <code>false</code> otherwise.
 * @abstract
 */
Lock.prototype.le = function (lock) {
    w.error("Lock '"+this.lock+"' is required to overwrite method le!");
    throw new Error("Lock '"+this.lock+"' is required to overwrite method le!");
    return false;
};

module.exports = Lock;
