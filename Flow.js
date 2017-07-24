/*jslint node: true */

"use strict";

var clone = require('clone');
var w = require('winston');
w.level = process.env.LOG_LEVEL;

var Lock = require("./Lock.js");
var Entity = require("./Entity.js");
var Action = require("./Action.js");

var Promise = require('bluebird');

function valid(o) {
    return ((o !== undefined) && (o !== null));
}

// TODO: support initialization with old format
function Flow(flow) {
    if(!valid(Flow.OpTypes))
        throw new Error("Flow has not been initialized. Call init of ULocks first.");
    
    if(!valid(flow)) {
        throw new Error("Flow: Error: Cannot construct flow from undefined flow.");
    }

    if(!flow.hasOwnProperty('op') || !valid(flow.op))
        throw new Error("Flow '"+JSON.stringify(flow)+"' does not specify underlying operation!");
    else
        this.op = flow.op;
    
    if(!valid(Flow.OpTypes[this.op]))
        throw new Error("Flow '"+JSON.stringify(flow)+"' specification uses unknown operation!");

    var totalLocks = 0;
    var numLocks = {};

    // TODO: check whether simple cloning is more efficient!
    if(flow.hasOwnProperty('locks') && valid(flow.locks)) {
        this.locks = {};

        // be downwards compatible to old policy format
        // where locks was a pure array
        if(flow.locks instanceof Array) {
            for(var i in flow.locks) {
                var l = Lock.createLock(flow.locks[i]);
                var key = l.lock;
                if(!this.locks.hasOwnProperty(key))
                    this.locks[key] = [];
                this.locks[key].push(l);
                numLocks[key]++;
                totalLocks++;
            }
        } else {
            for(var k in flow.locks) {
                this.locks[k] = [];
                numLocks[k] = 0;
                for(var j in flow.locks[k]) {
                    numLocks[k]++;
                    totalLocks++;
                    this.locks[k].push(Lock.createLock((flow.locks[k][j])));
                }
            }
        }

        if(totalLocks === 0) {
            delete this.locks;
        } else {
            for(var n in numLocks) {
                if(numLocks[n] === 0) {
                    delete this.locks[n];
                }
            }
        }
    }

    // TODO: Disable as actions moved up to Policy level (for now)
    /* if(flow.hasOwnProperty('actions') && valid(flow.actions)) {
        this.actions = [];
        for(var i in flow.actions) {
            try {
                this.actions.push(Action.createAction(flow.actions[i]));
            } catch(e) {
                this.actions = null;
                w.debug("Invalid action specification. Drop complete action chain and always delete data!");
                w.debug(e);
                break;
            }
        }
    }*/
}

Flow.OpTypes = null;

Flow.init = function(settings) {
    if(!settings.hasOwnProperty('opTypes'))
        return Promise.reject(new Error("ULocks: Flow cannot be initialized. Settings do not specify operation types!"))
    
    Flow.OpTypes = settings.opTypes;

    return Promise.resolve();
}

Flow.prototype.hasSrc = function() {
    return !(Flow.OpTypes[this.op] === 1)
};

Flow.prototype.hasTrg = function() {
    return (Flow.OpTypes[this.op] === 1)
};

Flow.prototype.eq = function(otherFlow, conflicts) {
    var showConflicts = false;
    var matched = true;

    if(valid(conflicts)) {
        showConflicts = conflicts;
        if(showConflicts)
            matched = [];
    }

    if(!valid(this.op) || !valid(otherFlow.op) || this.op !== otherFlow.op)
        return false;

    var thisFlow = this;

    if((!valid(thisFlow.locks) || !valid(otherFlow.locks)) &&
       thisFlow.locks !== otherFlow.locks)
        return false;

    var tlength = 0;
    var olength = 0;
    if(valid(thisFlow.locks)) {
        tlength = Object.keys(thisFlow.locks).length;
        olength = Object.keys(otherFlow.locks).length;
    }

    if(!showConflicts && tlength != olength)
        return false;

    if(tlength > olength) {
        var tmpFlow = thisFlow;
        thisFlow = otherFlow;
        otherFlow = tmpFlow;
    }

    var thisHasLocks = thisFlow.hasOwnProperty('locks');
    if(thisHasLocks !== otherFlow.hasOwnProperty('locks'))
        return false;

    // TODO: Generate test case in which locks have length 0
    if(thisHasLocks) {
        for(var type in otherFlow.locks) {
            if(thisFlow.locks.hasOwnProperty(type)) {
                var l1 = thisFlow.locks[type];
                var l2 = otherFlow.locks[type];
                if(l2.length > l1.length) {
                    var tmp = l2;
                    l2 = l1;
                    l1 = tmp;
                }

                for(var k in l1) {
                    var found = false;

                    for(var i in l2) {
                        if(l1[k].eq(l2[i])) {
                            found = true;
                            break;
                        }
                    }
                    if(!found) {
                        if(showConflicts)
                            matched.push(Lock.createLock(l1[k]));
                        else
                            matched = false;
                    }
                }
            } else {
                if(showConflicts)
                    // put all locks in array which were not matched
                    for(var j in otherFlow.locks[type]) {
                        matched.push(Lock.createLock(otherFlow.locks[type][j]));
                    }
                else
                    matched = false;
            }
        }
    }

    return matched;
};

Flow.prototype.le = function(otherFlow, _showConflicts) {
    var showConflicts = false;
    var conflicts = false;
    if(valid(_showConflicts)) {
        showConflicts = _showConflicts;
        if(showConflicts)
            conflicts = [];
    }

    // incompatible flows to be compared
    // TODO: decide whether to better throw an error here
    // TODO: better compare operations!
    if(!valid(this.op) || !valid(otherFlow.op) || this.op !== otherFlow.op)
        return false;

    var thisFlow = this;

    var thisHasLocks = thisFlow.hasOwnProperty('locks');
    var otherHasLocks = otherFlow.hasOwnProperty('locks');

    // either this flow has no locks and the other has, then it is less restrictive
    // or both locks have no locks at all
    if(!thisHasLocks && otherHasLocks || (!thisHasLocks && !otherHasLocks))
        return true;
    else
        // if the other flow has no locks but this one has
        // the other flow is less restrictive (data can always flow)
        if(thisHasLocks && !otherHasLocks)
            return false;

    // at this point we can assume both flows have locks
    // if one flow has more lock types, it must be considered
    // to be more restrictive as it requires one more condition
    // to hold
    var thisTypes = Object.keys(thisFlow.locks).length;
    var otherTypes = Object.keys(otherFlow.locks).length;

    if(thisTypes > otherTypes)
        return false;
    else
        if(thisTypes < otherTypes)
            return true;

    for(var type in otherFlow.locks) {
        w.debug("\tcheck locks of type '"+type+"'");
        if(thisFlow.locks.hasOwnProperty(type)) {
            var l1 = thisFlow.locks[type];
            var l2 = otherFlow.locks[type];

            // find out whether every lock
            // in otherFlow has a smaller
            // counterpart in this flow
            var covered = [];
            for(var k in l1) {
                var found = false;
                for(var i in l2) {
                    w.debug("\t\t"+l1[k]+" <= "+l2[i]);
                    if(l1[k].le(l2[i])) {
                        found = true;
                        covered[i] = true;
                        w.debug("\t\t\t===> true");
                    } else
                        w.debug("\t\t\t===> false");
                }

                if(!found) {
                    if(showConflicts)
                        conflicts.push(Lock.createLock(l1[k]));
                    else
                        conflicts = true;
                }
            }

            for(var j in l2) {
                if(covered[j] !== true) {
                    if(showConflicts)
                        conflicts.push(Lock.createLock(l2[j]));
                    else
                        conflicts = true;
                }
            }
        } else {
            if(showConflicts)
                // put all locks in array which were not matched
                for(var h in otherFlow.locks[type]) {
                    conflicts.push(Lock.createLock(otherFlow.locks[type][h]));
                }
            else
                conflicts = true;
        }
    }

    if(showConflicts)
        return conflicts;
    else
        return !conflicts;
};

Flow.prototype.getClosedLocks = function(context, scope, showConflicts) {
    w.debug(">>> Flow.prototype.getClosedLocks: ", this);
    var f = this;

    return new Promise(function(resolve, reject) {
        var allopen = true;
        var cond = false;
        var resLocks = [];

        if(f.hasOwnProperty('locks')) {
            var promises = [];

            var checkLock = function(lock, i) {
                var s;

                /* console.log("\t\tlock: "+lock);
                   console.log("\t\tCurrent lock state: ",context.locks); */

                // check whether lockstate is already in context
                /* if(context) {
                   s = context.getLockState(lock, context.sender);
                   }
                   console.log("LOCK STATE: ",s);
                   console.log("CONTEXT STATE: ",context.isStatic);*/

                // lock state is not know => compute it

                if(s === undefined) {
                    w.debug("Flow.prototype.getClosedLocks: lock state of '"+lock+"' not cached => get current value");
                    promises.push(lock.isOpen(context, scope));
                } else {
                    promises.push(Promise.resolve({ open : s, cond : false, lock : lock }));
                }
            };

            for(var type in f.locks) {
                var locks = f.locks[type];
                locks.forEach(checkLock);
            }

            Promise.all(promises).then(function(lockStates) {
                w.debug("all resolved/rejected ", lockStates);
                var conflicts = [];
                for(var i in lockStates) {
                    // if(context && s && s.cond == false)
                    // context.addLockState(lock, context.subject, s.result);

                    allopen = allopen && lockStates[i].open;
                    cond = cond || lockStates[i].cond;

                    if(!lockStates[i].open || lockStates[i].cond) {
                        if(lockStates[i].lock) {
                            conflicts.push(lockStates[i].lock);
                        }
                    }
                }

                var result = { open : allopen, cond : cond };

                if(conflicts.length > 0)
                    result.locks = conflicts;
                resolve(result);
            }, function(error) {
                w.error("Failed to evaluate lock in flow '"+f+"'!");
                w.error(error);
                reject(error);
            });
        } else {
            resolve({ open: true, cond: false });
        }
    });
};

// multiplies the locks in this flow with the lock in factor
// this method assumes that the array of locks is always
// minimal, i.e. there are no redundant locks
Flow.prototype.lubLock = function(factor) {
    var l = this.locks ? this.locks.length : 0;
    var newLocks = [];
    var merged = false;

    var lock = Lock.createLock(factor);



    if(this.locks && this.locks[lock.lock]) {
        var toMultiply = this.locks[lock.lock];

        for(var i in toMultiply) {
            var lub = (toMultiply[i]).lub(lock);
            if(lub) {
                newLocks.push(lub);
                merged = true;
            } /*else {
                newLocks.push(Lock.createLock(toMultiply[i]));
            }*/
        }
    }

    if(!merged)
        newLocks.push(lock);

    return newLocks;
};

Flow.prototype.addLock = function(lock) {
    var type = lock.lock;

    if(!this.hasOwnProperty("locks"))
        this.locks = {};

    if(!this.locks.hasOwnProperty(type))
        this.locks[type] = [];

    var locks = this.locks[type];
    var found = false;
    for(var i in locks) {
        var l = locks[i];
        if(l.eq(lock)) {
            found = true;
        } else {
            if(l.lub(lock) === null)
                closed = true;
        }
    }

    // TODO: insert closed lock and delete all other -> flow is always forbidden
    // if(closed)

    if(!found)
        this.locks[type].push(lock);
}

Flow.prototype.lub = function(flow) {
    w.debug(">>> Flow.prototype.lub(\n\t"+this+",\n\t"+flow+")");

    // flows are incompatible and there is
    // no upper bound on them; we would need
    // a new policy for this
    if(!valid(this.op) || !valid(flow.op) || this.op !== flow.op) {
        // console.log("Error: try to lub source and target flow");
        return null;
    } else {
        var newFlow = new Flow(this);

        for(var type in flow.locks) {
            for(var i in flow.locks[type]) {
                var r = newFlow.lubLock((flow.locks[type])[i]);

                if(!newFlow.hasOwnProperty("locks"))
                    newFlow.locks = {};
                newFlow.locks[type] = [];

                if(r.length > 0) {
                    for(var k in r) {
                        newFlow.addLock(r[k]);
                    }
                }
            }
        }

        return newFlow;
    }
};

Flow.prototype.toString = function() {
    var str = "";
    var l = this.hasOwnProperty('locks') ? this.locks.length : 0;

    if(Flow.OpTypes[this.op] === 1) {
        if(this.hasOwnProperty('locks')) {
            var c = 0;
            for(var t  in this.locks) {
                (this.locks[t]).forEach(function(lock,i) {
                    if(c > 0  || i > 0)
                        str += " ^ ";
                    str += lock;
                });
                c++;
            }
        } else
            str += "always";

        str = "{ "+str+" ==> TARGET";

        // TODO: Disabled for now as actions moved up to policy level
        /* if(this.hasOwnProperty('actions')) {
            var al = this.actions.length
            str += " do ";

            this.actions.forEach(function(action,i) {
                str += action;
                if(i < al - 1)
                    str += " then ";
            });

            str += " ";
        }*/
        str += " }";
    } else {
        str = "{ SOURCE ==> ";
        if(this.hasOwnProperty('locks')) {
            var c = 0;
            for(var t  in this.locks) {
                (this.locks[t]).forEach(function(lock,i) {
                    str += lock;
                    if(i < l - 1)
                        str += " ^ ";
                });
            }
        } else
            str += "always";

        // TODO: Disabled for now as actions moved up to policy level
        /* if(this.hasOwnProperty('actions')) {
            var al = this.actions.length
            str += " do ";

            this.actions.forEach(function(action,i) {
                str += action;
                if(i < al - 1)
                    str += " then ";
            });

            str += " ";
        }*/

        str += " }";
    }
    return str;
};

// TODO: Disabled for now as actions moved up to policy level
/* Flow.prototype.actOn = function(data, context, scope) {
    var self = this;
    return new Promise(function(resolve, reject) {
        if(self.hasOwnProperty('actions')) {
            if(self.actions !== null) {
                var newData = Promise.resolve(clone(data));
                self.actions.forEach(function(action) {
                    newData = newData.then(function(v) {
                        if(action.apply !== undefined)
                            return action.apply(v, context, scope);
                        else
                            return Promise.reject(new Error("Action does not define method 'apply'"));
                    }, function(e) {
                        w.error("Flow.prototype.actOn is not able to apply actions as one action is defined inappropriately.");
                        return Promise.reject(e);
                    });
                });

                newData.then(function(v) {
                    w.debug("All actions have been applied.");
                    resolve(v);
                });
            } else {
                resolve(null);
            }
        } else
            resolve(clone(data));
    });
}*/

Flow.prototype.compile2PolicyEval = function() {
    var srctrg = this.source ? this.source.compile2PolicyEval() : this.target.compile2PolicyEval();

    var condition = "";
    for(var l in this.locks) {
        if(l > 0)
            condition += " && ";
        condition += '(' + this.locks[l].compile2PolicyEval() + ')';
    }

    var result = "";

    if(this.target) {
        if(condition.length)
            result = srctrg + " = (!"+condition+") ? "+srctrg+" : ";
        else
            result = srctrg + " = ";
    } else {
        if(condition.length)
            result = " = "+condition+" ? " + srctrg + " : ";
        else
            result = " = " + srctrg + ";";
    }

    return result;
};

module.exports = Flow;
