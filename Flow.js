/*jslint node: true */

"use strict";

var clone = require('clone');
var w = require('winston');
w.level = process.env.LOG_LEVEL;

var Lock = require("./Lock.js");
var Entity = require("./Entity.js");
var Action = require("./Action.js");

function valid(o) {
    return ((o !== undefined) && (o !== null));
}

// TODO: support initialization with old format
function Flow(flow) {
    if(!valid(flow)) {
        throw new Error("Flow: Error: Cannot construct flow from undefined flow.");
    }

    // either source or target needs to be defined
    if((!flow.hasOwnProperty('source') || !valid(flow.source)) &&
       (!flow.hasOwnProperty('target') || !valid(flow.target))) {
        throw new Error("Flow '"+JSON.stringify(flow)+"' does not specify source or target.");
    }

    // source or target cannot be defined at the same time
    if(flow.hasOwnProperty('source') && valid(flow.source) &&
       flow.hasOwnProperty('target') && valid(flow.target)) {
        throw new Error("Flow specifies source and target at the same time.");
    }

    if(flow.hasOwnProperty('op') && valid(flow.op))
        this.op = flow.op;

    // either source or target is defined
    if(flow.source !== undefined) {
        this.source = new Entity(flow.source);
        // ensure target is not defined
        delete this.target;
        if(!valid(this.op))
            this.op = Flow.OpTypes.Write;
    } else {
        this.target = new Entity(flow.target);
        // ensure source is not defined
        delete this.source;
        if(!valid(this.op))
            this.op = Flow.OpTypes.Read;
    }

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

    if(flow.hasOwnProperty('actions') && valid(flow.actions)) {
        this.actions = [];
        for(var i in flow.actions) {
            this.actions.push(Action.createAction(flow.actions[i]));
        }
    }
}

Flow.OpTypes = {
    Read: "read",
    Write: "write",
    Exec: "execute",
    Delete: "delete"
};

Flow.prototype.hasSrc = function() {
    return this.hasOwnProperty('source');
};

Flow.prototype.hasTrg = function() {
    return this.hasOwnProperty('target');
};

// TODO: also compare operations and actions!!
Flow.prototype.eq = function(otherFlow, conflicts) {
    var showConflicts = false;
    var matched = true;
    
    if(valid(conflicts)) {
        showConflicts = conflicts;
        if(showConflicts)
            matched = [];
    }
    
    if(this.hasOwnProperty('target') && !this.target.eq(otherFlow.target) ||
       this.hasOwnProperty('source') && !this.source.eq(otherFlow.source)) {
        return false;
    }

    var thisFlow = this;

    var tlength = Object.keys(thisFlow.locks).length;
    var olength = Object.keys(otherFlow.locks).length;

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
                    console.log("l1: ", l1);
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
    w.debug("Flow.prototype.le: "+this+" <= "+otherFlow);

    var showConflicts = false;
    var conflicts = false;
    if(valid(_showConflicts)) {
        showConflicts = _showConflicts;
        if(showConflicts)
            conflicts = [];
    }   

    // incompatible flows to be compared
    // TODO: decide whether to better throw an error here
    if((valid(this.target) && valid(otherFlow.source)) ||
       (valid(this.source) && valid(otherFlow.target)))
        return false;

    // TODO: should not happen
    if(!valid(this.source) && !valid(this.target))
        return false;

    // TODO: Clarify which intention that has!
    if(!otherFlow.source && !otherFlow.target)
        return true;

    if(this.target) {
        if(!this.target.dominates(otherFlow.target))
            return false;
    } else {
        if(!this.source.dominates(otherFlow.source))
            return false;
    }

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
    w.debug("-> Flow.prototype.getClosedLocks: ", this);
    var f = this;
    
    return new Promise(function(resolve, reject) {
        var conflicts = [];
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
                console.log("lockStates: ", lockStates);
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

                // TODO: Check whether this simplification is required or whether
                // it just induces extra overhead 
                if(conflicts.length) {
                    var dummyFlow = new Flow({ target : { type : Entity.MinType } });
                    for(var cl in conflicts) {
                        dummyFlow.locks = dummyFlow.lubLock(conflicts[cl]);
                    }
                    resLocks = dummyFlow.locks;
                }

                var result = { open : allopen, cond : cond };
                
                if(resLocks && resLocks.length)
                    result.locks = resLocks;
                
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

    if(this.locks[lock.lock]) {
        var toMultiply = this.locks[lock.lock];

        console.log("factor: ", factor);
        console.log("multiply with: ", toMultiply);
        
        for(var i in toMultiply) {
            console.log("i: ", i);
            console.log("toMultiply[i]: ", toMultiply[i]);
            var lub = (toMultiply[i]).lub(lock);
            console.log("\tlub: ", lub);
            if(lub) {
                newLocks.push(lub);
                merged = true;
            } else {
                newLocks.push(Lock.createLock(toMultiply[i]));
            }
        }
    }

    if(!merged)
        newLocks.push(lock);

    console.log("newLocks: ", newLocks);

    return newLocks;
};

Flow.prototype.lub = function(flow) {
    w.debug(">>> Flow.prototype.lub(\n\t"+this+",\n\t"+flow+")");
    
    // flows are incompatible and there is
    // no upper bound on them; we would need
    // a new policy for this
    if(this.source && !flow.source ||
       this.target && !flow.target) {
        // console.log("Error: try to lub source and target flow");
        return null;
    } else {
        var newFlow = new Flow(this);
        
        if(this.target) {
            if(this.target.dominates(flow.target))
                newFlow.target = new Entity(flow.target);
            else if(flow.target.dominates(this.target))
                newFlow.target = new Entity(this.target);
            else 
                return null;
        } else if(this.source) {
            if(this.source.dominates(flow.source))
                newFlow.source = new Entity(flow.source);
            else if(flow.source.dominates(this.source))
                newFlow.source = new Entity(this.source);
            else
                return null;
        }

        for(var type in flow.locks) {
            for(var i in flow.locks[type]) {
                var r = newFlow.lubLock((flow.locks[type])[i]);
                if(r.length > 0) {
                    newFlow.locks[type] = [];
                    for(var k in r) {
                        newFlow.locks[type].push(r[k]);
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

    if(this.hasOwnProperty('target')) {
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

        str = "{"+str+" ==> " + this.target;

        if(this.hasOwnProperty('actions')) {
            var al = this.actions.length
            str += " do ";

            this.actions.forEach(function(action,i) {
                str += action;
                if(i < al - 1)
                    str += " then ";
            });

            str += " ";
        }
        str += "}";
    } else {
        str = "{" + this.source + " ==> ";
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

        if(this.hasOwnProperty('actions')) {
            var al = this.actions.length
            str += " do ";

            this.actions.forEach(function(action,i) {
                str += action;
                if(i < al - 1)
                    str += " then ";
            });

            str += " ";
        }

        str += "}";
    }
    return str;
};

Flow.prototype.actOn = function(data, context, scope) {
    console.log(">> Flow.prototype.actOn");
    var self = this;
    return new Promise(function(resolve, reject) {
        if(self.hasOwnProperty('actions') && valid(self.actions)) {
            console.log("found some actions");
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
        } else
            resolve(clone(data));
    });
}

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
