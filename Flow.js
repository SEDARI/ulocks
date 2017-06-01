"use strict";

var w = require("winston");
w.level = process.env.LOG_LEVEL;

var Lock = require("./Lock.js");
var Entity = require("./Entity.js");

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
        delete this['target'];
	if(!valid(this.op))
	    this.op = Flow.OpTypes.Write;
    } else {
        this.target = new Entity(flow.target);
        // ensure source is not defined
        delete this['source'];
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
	    for(var l in flow.locks) {
		var l = Lock.createLock(flow.locks[l])
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
		for(var i in flow.locks[k]) {
		    numLocks[k]++;
		    totalLocks++;
		    this.locks[k].push(Lock.createLock((flow.locks[k][i])));
		}
            }
	}
	    
	if(totalLocks === 0) {
	    delete this.locks;
	} else {
	    for(k in numLocks) {
		if(numLocks[k] === 0) {
		    delete this.locks[k];
		}
	    }
	}
    }
};

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

// TODO: compare operations also!!
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
    var otherFlow = otherFlow;

    if(Object.keys(thisFlow.locks).length > Object.keys(otherFlow.locks).length) {
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
		    for(var k in otherFlow.locks[type]) {
			matched.push(Lock.createLock(otherFlow.locks[type][k]));
		    }
		else
		    matched = false;
	    }
	}
    }

    return matched;
};

Flow.prototype.le2 = function(otherFlow) {
    console.log("LE: "+this+" <= "+otherFlow);

    var conflictLocks = [];
    var result = undefined;

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

    var complies = true;
    var covered = [];

    for(var l1 in this.locks) {
        var lock1 = this.locks[l1];
        if(!otherFlow.locks || otherFlow.locks.length === 0) {
            complies = false;
            continue;
        }
        
        for(var l2 in otherFlow.locks) {
            var lock2 = otherFlow.locks[l2];
            if(lock1.lock === lock2.lock) {
                // console.log("cmp "+lock1+" and "+lock2);
                if(lock1.le(lock2)) {
                    // console.log("** set true **");
                    covered[l1] = true;
                } else {
                    // TODO RECORD CONFLICT FOR CONFLICT RESOLUTION
                }
            }
        }
    }
            
    var complies = true;
    if(this.locks && this.locks.length) {
        for(var l1 in this.locks) {
            if(!covered[l1]) {
                // console.log("CONFLICT: "+JSON.stringify(otherFlow.locks[l2]));
                complies = false;
            }
        }
    }
    // console.log("\t=> "+complies);

    return complies;
};

Flow.prototype.le = function(otherFlow, _showConflicts) {
    console.log("LE: "+this+" <= "+otherFlow);

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
    var otherFlow = otherFlow;

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
		var found = false
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

	    for(var i in l2) {
		if(covered[i] !== true) {
		    if(showConflicts)
			conflicts.push(Lock.createLock(l2[i]));
		    else
			conflicts = true;
		}
	    }
	} else {
	    if(showConflicts)
		// put all locks in array which were not matched
		for(var k in otherFlow.locks[type]) {
		    conflicts.push(Lock.createLock(otherFlow.locks[type][k]));
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

// TODO: Change into promissing version
Flow.prototype.getClosedLocks = function(context, scope) {
    var conflictLocks = [];
    var allopen = true;
    var conditional = false;
    var resLocks = [];

    if(this.hasOwnProperty('locks')) {
        // console.log("\t\t-X-");
        var f = this;
        this.locks.forEach(function(lock, i) {
            var s = undefined;

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
                // console.log("\t\tlock state not cached => get current value");

                s = lock.isOpen(context, scope);
		
                if(context && s && s.conditional == false)
                    context.addLockState(lock, context.subject, s.result);
            } else {
                s = { result : s, conditional : false, lock : lock };
            }
            
            allopen = allopen && s.result;
            conditional = conditional || s.conditional;
	    
            if(!s.result || s.conditional) {
                // s.id = f.id;
                if(s.lock) {
                    conflictLocks.push(s.lock);
                }
            }
        });
	
        if(conflictLocks.length) {
            var dummyFlow = new Flow({ target : { type : Entity.MinType } });
            for(var cl in conflictLocks) {
                dummyFlow.locks = dummyFlow.lubLock(conflictLocks[cl]);
            }
            resLocks = dummyFlow.locks;
        }
    }
    
    var result = { allopen : allopen, conditional : conditional };
    
    if(resLocks && resLocks.length)
        result.locks = resLocks;
    
    return result;
};

// multiplies the locks in this flow with the lock in factor
// this method assumes that the array of locks is always
// minimal, i.e. there are no redundant locks
Flow.prototype.lubLock = function(factor) {
    var l = this.locks ? this.locks.length : 0;
    var newLocks = [];
    var merged = false;
    var conflict = false;
    
    /* 
       console.log("-----------------------");
       console.log("this: "+this);
       console.log("Factor: "+factor);
    */
    
    
    var lock = factor.copy();
    
    for(var i = 0; i < l; i++) {
        var newLock = this.locks[i].lub(lock);
        // if the lub returns null, we cannot compute it
        if(newLock) {
            if(newLock.lock.length) {
                newLocks.push(newLock);
                merged = true;
            } else 
                throw new Error("Flow: The result of the least upper bound must be either null or a real lock. However, the lock '"+JSON.stringify(newLock)+"' was generated from '"+this.locks[i]+"' and '"+lock+"'");
        } else {
            newLocks.push(this.locks[i]);
        }
    }
    
    if(!merged) {
        newLocks.push(lock);
    }
    
    return newLocks;
};

Flow.prototype.lub = function(flow) {
    // console.log("\n*** lub(\n\t"+this+",\n\t"+flow+") --> ");
    
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
            if(this.target.dominates(flow.target) || flow.target.dominates(this.target)) {
                if(this.target.dominates(flow.target))
                    newFlow.target = new Entity(flow.target);
                else
                    newFlow.target = new Entity(this.target);
            } else 
                return null;
        } else if(this.source) {
            if(this.source.dominates(flow.source) || flow.source.dominates(this.source)) {
                if(this.source.dominates(flow.source))
                    newFlow.source = new Entity(flow.source);
                else 
                    newFlow.source = new Entity(this.source);
            } else
                return null;
        }

        var fl = flow.locks ? flow.locks.length : 0;
        var i = 0;
        for(; i < fl; i++)
            newFlow.locks = newFlow.lubLock(flow.locks[i]);
        
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
