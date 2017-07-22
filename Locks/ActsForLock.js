var w = require('winston');
w.level = process.env.LOG_LEVEL;

module.exports = function(Lock) {
    "use strict";

    var ActsForLock = function(lock) {
        // call the super class constructor
        Lock.call(this, lock);
    };

    ActsForLock.meta = {
        arity: 1,
        descr: "Lock is open iff the user defined in this lock is acting for the entity to which the lock is applied",
        name: "acts for",
        scopes: [ "/sensor", "/client" ],
        args: [ "user" ]
    }

    Lock.registerLock("actsFor", ActsForLock);

    ActsForLock.prototype = Object.create(Lock.prototype);

    ActsForLock.prototype.copy = function() {
        var c = new ActsForLock(this);
        return c;
    }

    ActsForLock.prototype.handleSensor = function(entity, isStatic) {
        if(isStatic) {
            return Promise.reject(new Error("ActsForLock.prototype.handleSensor not implemented for static evaluation yet"));
        } else {
            if((!this.not &&                               // if this lock is not negated then
                entity.type == '/sensor' &&                     // if it is indeed a node and
                ((entity.data.userInfo &&                  // either if there is a user currently working on this node
                  entity.data.userInfo.id == this.args[1]) // and this user is the one specified in the lock
                 ||                                        // or
                 (!entity.data.userInfo &&                 // if there is no user currently working on this node,
                  // i.e. the execution is triggered automatically,
                  entity.data.ownerId == this.args[1]))    // and the owner of the node is equal to the argument specified in the lock
               ) ||
               (this.not &&                               // if the lock is negated then,
                ((entity.data.userInfo &&                 // in case there is a user executing the node, it must not be
                  entity.data.userInfo.id != this.args[1])   // the user specified in the lock arguments
                 ||
                 (!entity.data.userInfo &&                // if no user is executing the lock it must also not be owned by this user
                  entity.data.ownerId != this.args[1])))) {
                return Promise.resolve({ open: true, cond: false });
            } else {
                return Promise.resolve({ open: false, cond: false, lock: this });
            }
        }
    };

    ActsForLock.prototype.handleNode = function(entity, isStatic) {
        if(isStatic) {
            return Promise.reject(new Error("ActsForLock.prototype.handleNode not implemented for static evaluation yet"));
        } else {
            if((!this.not &&                              // if this lock is not negated then
                entity.type == 'node' &&                   // if it is indeed a node and
                ((entity.data.userInfo &&                  // either if there is a user currently working on this node
                  entity.data.userInfo.id == this.args[1]) // and this user is the one specified in the lock
                 ||                                        // or
                 (!entity.data.userInfo &&                 // if there is no user currently working on this node,
                  // i.e. the execution is triggered automatically,
                  entity.data.ownerId == this.args[1]))    // and the owner of the node is equal to the argument specified in the lock
               ) ||
               (this.not &&                               // if the lock is negated then,
                ((entity.data.userInfo &&                 // in case there is a user executing the node, it must not be
                  entity.data.userInfo.id != this.args[1])// the user specified in the lock arguments
                 ||
                 (!entity.data.userInfo &&                // if no user is executing the lock it must also not be owned by this user
                  entity.data.ownerId != this.args[1])))) {
                return Promise.resolve({ open: true, cond: false });
            } else {
                return Promise.resolve({ open: false, cond: false, lock: this });
            }
        }
    };

    // TODO: CURRENTLY SAME HANDLER AS FOR NODES - MUST DISTINGUISH APP NODES and REGULAR NODES
    ActsForLock.prototype.handleClient = function(entity, isStatic) {
        if(isStatic) {
            return Promise.reject(new Error("ActsForLock.prototype.handleApp not implemented for static evaluation yet"));
        } else {
            if((!this.not &&                               // if this lock is not negated then
                entity.type == '/client' &&                    // if it is indeed a node and
                ((entity.data.userInfo &&                  // either if there is a user currently working on this node
                  entity.data.userInfo.id == this.args[1]) // and this user is the one specified in the lock
                 ||                                        // or
                 (!entity.data.userInfo &&                 // if there is no user currently working on this node,
                  // i.e. the execution is triggered automatically,
                  entity.data.ownerId == this.args[1]))    // and the owner of the node is equal to the argument specified in the lock
               ) ||
               (this.not &&                                // if the lock is negated then,
                ((entity.data.userInfo &&                  // in case there is a user executing the node, it must not be
                  entity.data.userInfo.id != this.args[1]) // the user specified in the lock arguments
                 ||
                 (!entity.data.userInfo &&                 // if no user is executing the lock it must also not be owned by this user
                  entity.data.ownerId != this.args[1])))) {
                return Promise.resolve({ open: true, cond: false });
            } else {
                return Promise.resolve({ open: false, cond: false, lock: this });
            }
        }
    };

    ActsForLock.prototype.handleAny = function(entity, isStatic) {
        var self = this;
        return new Promise(function(resolve, reject) {
            if(isStatic) {
                reject(new Error("ActsForLock.prototype.handleAny is not supported in static analysis yet."));
            } else {
                self.handleSensor(entity, isStatic).then(function(r) {
                    if(r.open)
                        resolve(r);
                    else
                        self.handleNode(entity, isStatic).then(function(r) {
                            if(r.open)
                                resolve(r);
                            else
                                self.handleClient(entity, isStatic).then(function(r) {
                                    if(r.open)
                                        resolve(r);
                                    else {
                                        resolve({ open: false, cond: false, lock: self });
                                    }
                                }, function(e) {
                                    reject(e);
                                });
                        }, function(e) {
                            reject(e);
                        });
                }, function(e) {
                    reject(e);
                });
            }
        });
    };

    ActsForLock.prototype.isOpen = function(context, scope) {
        w.debug("ActsForLock.prototype.isOpen: Scope: ", scope);
        w.debug("ActsForLock.prototype.isOpen: Context: ", context);
        if(context) {
            switch(scope) {
            case "/any":
                return this.handleAny(context.entity, context.isStatic);
            case "node":
                return this.handleNode(context.entity, context.isStatic);
            case "/client":
                return this.handleClient(context.entity, context.isStatic);
            case "/sensor":
                return this.handleSensor(context.entity, context.isStatic);
            case "/user":
                w.debug("The entity lock actsFor cannot be applied to a user.");
		break;
            case "/msg":
                w.debug("The entity lock actsFor cannot be applied to a message.");
		break;
            default:
                w.debug("Unknown context for actsFor lock evaluation.");
		break;
            }

	    return Promise.resolve({open: false, cond: false});
        } else
            return Promise.reject(new Error("ActsForLock: Requires user, sender or receiver context to evaluate lock. Did you set context type?"));
    };

    ActsForLock.prototype.lub = function(lock) {
        if(this.eq(lock))
            return Lock.createLock(this);
        else {
            if(this.path == lock.path)
                return Lock.closedLock();
            else
                return null;
        }
    };

    ActsForLock.prototype.le = function(lock) {
        if(this.eq(lock))
            return true;
        else
            return false;
    };
};
