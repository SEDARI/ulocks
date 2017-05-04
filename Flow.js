"use strict";

var Lock = require("./Lock.js");
var Entity = require("./Entity.js");

function valid(o) {
    return ((o !== undefined) && (o !== null));
}

var Flow = (function() {

    // Constructor
    var cls = function(flow) {
        if(!valid(flow)) {
            throw new Error("Flow: Error: Cannot construct flow from undefined flow.");
        }

        // either source or target needs to be defined
        if((!flow.hasOwnProperty('source') || !valid(flow.source)) &&
           (!flow.hasOwnProperty('target') || !valid(flow.target))) {
            throw new Error("Flow: Error: Flow '"+JSON.stringify(flow)+"' does not specify source or target.");
        }

        // source or target cannot be defined at the same time
        if(flow.hasOwnProperty('source') && valid(flow.source) &&
           flow.hasOwnProperty('target') && valid(flow.target)) {
            throw new Error("Flow: Error: Flow specifies source and target at the same time.");
        }

        // either source or target is defined
        if(flow.source !== undefined) {
            this.source = new Entity(flow.source);
            // ensure target is not defined
            delete this['target'];
        } else {
            this.target = new Entity(flow.target);
            // ensure source is not defined
            delete this['source'];
        }

        if(flow.hasOwnProperty('locks') && valid(flow.locks) && flow.locks.length) {
            var l = flow.locks.length;
            if(l > 0) {
                this.locks = [];
                for(var i = 0; i < l; i++) {
                    this.locks[i] = Lock.createLock(flow.locks[i]);
                }
            }
        } else
            delete this['locks'];
    };

    cls.gid = 0;

    cls.prototype = {
        hasSrc : function() {
            return this.hasOwnProperty('source');
        },

        hasTrg : function() {
            return this.hasOwnProperty('target');
        },

        eq : function(otherFlow) {
            if(this.hasOwnProperty('target') && !this.target.eq(otherFlow.target) ||
               this.hasOwnProperty('source') && !this.source.eq(otherFlow.source)) {
                return false;
            }

            if(this.hasOwnProperty('locks') !== otherFlow.hasOwnProperty('locks'))
                return false;

            if(this.hasOwnProperty('locks')) {
                if(this.locks.length !== otherFlow.locks.length)
                    return false;

                // TODO: Generate test case in which locks have length 0
                var matched = [];
                for(var i in this.locks) {
                    var found = false;
                    for(var k in otherFlow.locks) {
                        if(this.locks[i].eq(otherFlow.locks[k])) {
                            found = true;
                            matched[k] = true;
                        }
                    }
                    if(!found)
                        return false;
                }

                for(var k in otherFlow.locks)
                    if(matched[k] !== true)
                        return false;
            }

            return true;
        },

        le : function(otherFlow) {
            // console.log("LE: "+this+" <= "+otherFlow);

            var conflictLocks = [];
            var result = undefined;

            // incompatible flows to be compared
            if(valid(this.target) || valid(this.source))
                return undefined;

            if(!this.source && !this.target)
                return false;

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
        },

        // TODO: Change into promissing version
        getClosedLocks : function(context, scope) {
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
        },

        // multiplies the locks in this flow with the lock in factor
        // this method assumes that the array of locks is always
        // minimal, i.e. there are no redundant locks
        lubLock : function(factor) {
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
        },

        lub : function(flow) {
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
        },

        toString : function() {
            var str = "";
            var l = this.hasOwnProperty('locks') ? this.locks.length : 0;

            if(this.hasOwnProperty('target')) {
                if(this.hasOwnProperty('locks')) {
                    this.locks.forEach(function(lock,i) {
                        str += lock;
                        if(i < l - 1)
                            str += " ^ ";
                    });
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
                    this.locks.forEach(function(lock,i) {
                        str += lock;
                        if(i < l - 1)
                            str += " ^ ";
                    });
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
        },

        compile2PolicyEval : function() {
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
        }
    };

    return cls;
})();

if(global && typeof print !== "function")
    module.exports = Flow;
