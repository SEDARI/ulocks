"use strict";

var clone = require('clone');
var w = require('winston');
w.level = process.env.LOG_LEVEL;

var Lock = require("./Lock.js");
var Flow = require("./Flow.js");
var Entity = require("./Entity.js");
var Context = require("./Context.js");
var Action = require("./Action.js");

function valid(o) {
    return (o !== undefined) && (o !== null);
}

// TODO: Review merging of conflicts!
// TODO: It should be possible to distinguish where
// the conflicting locks come from, i.e. which entity
// caused the conflict lock to be in the conflictset
function processConflicts(conflicts1, conflicts2) {
    var grant1 = false, grant2 = false, finalgrant = false;
    var cond1 = true, cond2 = true, finalcond = true;

    var conflicts = [];

    if(!valid(conflicts1))
        throw new Error("Conflict1 must be defined!");

    if(!valid(conflicts2)) {
        grant2 = true;
        cond2 = false;
    }

    /* console.log();
       console.log("Merge conflict1 and conflict2:");
       console.log("conflict1: "+JSON.stringify(conflicts1));
       console.log("conflict2: "+JSON.stringify(conflicts2)); */

    for(var c1 in conflicts1) {
        var conflict1 = conflicts1[c1];

        if(valid(conflict1.locks))
            conflicts = conflicts.concat(conflict1.locks);
        else if(valid(conflict1.entity))
            conflicts.push(conflict1.entity);

        // only one lock set needs to be open
        grant1 = grant1 || conflict1.open;

        if(conflict1.open) {
            cond1 = cond1 && conflict1.cond;
        }
    }

    for(var c2 in conflicts2) {
        var conflict2 = conflicts2[c2];

        if(valid(conflict2.locks))
            conflicts = conflicts.concat(conflict2.locks);
        else if(valid(conflict2.entity))
            conflicts.push(conflict2.entity);

        // only one lock set needs to be open
        grant2 = grant2 || conflict2.open;

        if(conflict2.open) {
            cond2 = cond2 && conflict2.cond;
        }
    }

    var reducedConflicts = [];
    // simplify conflicts
    for(var i in conflicts) {
        var c = conflicts[i];
        var found = false;
        for(var j in reducedConflicts) {
            if(c.eq(reducedConflicts[j])) {
                found = true;
                break;
            }
        }
        if(!found)
            reducedConflicts.push(c);
    }

    // TODO - Postprocess conflicts and reduce where possible (lub?)

    cond1 = grant1 && cond1;
    cond2 = grant2 && cond2;

    finalgrant = grant1 && grant2;
    finalcond = finalgrant && (cond1 || cond2);

    // console.log("\tResult of merge: "+JSON.stringify({grant : finalgrant, cond : finalcond, conflicts : reducedConflicts}));

    if(finalcond)
        return { grant: true, cond: true, conflicts : reducedConflicts };
    else {
        if(finalgrant)
            return { grant: true, cond: false };
        else
            return { grant: false, cond: false, conflicts: reducedConflicts };
    }
};

function Policy(flows, entity) {
    w.debug("Policy.Policy("+JSON.stringify(flows)+", "+entity+")");
    
    if(!flows)
        throw new Error("Policy: Cannot construct policy without valid flow specifications.");

    if(flows instanceof Policy || (flows.flows instanceof Object)) {
        var policy = flows;

        if(entity) {
            throw new Error("Policy: Entity must be undefined to construct Policy object from other Policy object");
        }

        if(policy.hasOwnProperty("entity") && valid(policy.entity)) {
            this.entity = new Entity(policy.entity);
        }

        if(policy.hasOwnProperty("flows") && valid(policy.flows)) {
            this.flows = {};
            // support old format without operation classification
            if(policy.flows instanceof Array) {
                for(var i in policy.flows) {
                    var newFlow = new Flow(policy.flows[i]);
                    this.addFlow(newFlow);
                }
            } else {
                for(var op in policy.flows) {
                    var opFlows = policy.flows[op].flows;
                    for(var i in opFlows) {
                        var newFlow = new Flow(opFlows[i]);
                        this.addFlow(newFlow);
                    }

                    var opActions = policy.flows[op].actions;
                    if(valid(opActions)) {
                        this.flows[op].actions = [];
                        for(var i in opActions) {
                            var newAction = Action.createAction(opActions[i]);
                            this.flows[op].actions.push(newAction);
                        }
                    }
                }
            }
        }

        // This only supports actions in the old policy format
        // and simplifies their definition
        if(policy.hasOwnProperty("actions") && valid(policy.actions)) {
            for(var op in this.flows) {
                if(policy.actions.hasOwnProperty(op)) {
                    this.flows[op].actions = [];
                    for(var a in policy.actions[op]) {
                        var newAction = Action.createAction((policy.actions[op])[a]);
                        this.flows[op].actions.push(newAction);
                    }
                }
            }
        }
    } else {
        // if no entity is specified for the policy, it is
        // a data policy, a policy for a specific entity otherwise
        if(valid(entity))
            this.entity = new Entity(entity);

        if(valid(flows)) {
            if(flows instanceof Array) {
                w.debug("Construct Policy from flow array");
                this.flows = {};
                for(var i in flows)
                    this.addFlow(new Flow(flows[i]));
            } else
                throw new Error("Policy: Cannot construct rule from flows which are not contained in an array!");
        }
    }
}; // End Constructor;

// ## Public Static Constants
//
// the constant field **Operation** enumerates all valid operations defined in the policy framework
//
// * READ - Any reading operation on the entity
// * WRITE - Any modification of the current state of an entity
// * EXEC - the execution of the entity
// * DEL - the deletion of the entity
Policy.Operation = Object.freeze({
    READ  : 1,
    WRITE : 2,
    EXEC  : 3,
    DEL   : 4
});

// the constant field **Direction** describes the flow of information in the policy framework
//
// * INCOMING denotes a flow of data towards an entity
// * OUTGOING denotes a flow of data leaving an entity
Policy.Direction = Object.freeze({
    INCOMING : 1,
    OUTGOING : 2
});

// ## Static Methods

// **method top()** returns the most restrictive policy of the framework
Policy.top = function() {
    return new Policy([]);
};

// TODO: generate a flow entry for every operation
// **method bot()** returns the least restrictive policy of the framework
Policy.bot = function() {
    return new Policy(
        [{ op: "read" },
         { op: "write" } ],
        { type : Entity.MinType });
};

// ## Public Methods

Policy.prototype.add = function(toAdd) {
    if(toAdd instanceof Policy) {
        if(!this.entity.eq(toAdd.entity)) {
            throw new Error("Policy: Cannot add a policy to another policy if they are not specified over the same entity");
        }

        for(var f in toAdd.flows) {
            this.addFlow(new Flow(toAdd.flows[f]));
        }
    } else if(toAdd instanceof Flow) {
        this.addFlow(new Flow(toAdd));
    } else
        throw new Error("Policy: Cannot add entity '"+toAdd+"' to Policy as it is neither of type Policy nor of Flow");
};

Policy.prototype.contains = function(flow) {
    if(!(flow instanceof Flow) && !valid(flow.op))
        return false;
    for(var op in this.flows) {
        var flows = this.flows[op];
        for(var f in flows) {
            if(newFlow.eq(flows[f]))
                return true;
        }
    }
    return false;
}

Policy.prototype.covers = function(flow) {
    if(!(flow instanceof Flow) && !valid(flow.op))
        return false;
    for(var op in this.flows) {
        var flows = this.flows[op].flows;
        for(var f in flows) {
            if(flow.le(flows[f]))
                return true;
        }
    }
    return false;
}

Policy.prototype.addFlow = function(newFlow) {
    w.debug("Policy.addFlow");    

    if(newFlow instanceof Flow) {
        var found = false;

        if(!this.covers(newFlow)) {
            if(!this.flows.hasOwnProperty(newFlow.op)) {
                this.flows[newFlow.op] = {};
                this.flows[newFlow.op].flows = [];
            }
            this.flows[newFlow.op].flows.push(newFlow);
        }
    } else
        throw new Error("Policy: Call to addFlow with an object other than a Flow");
};

Policy.prototype.getFlows = function(op) {
    if(!valid(op)) {
        var all = [];
        for(var op in this.flows) {
            all = all.concat(this.flows[op].flows);
        }
        return all;
    } else {
        if(this.flows.hasOwnProperty(op))
            return this.flows[op].flows;
        else
            return null;
    }   
};

Policy.prototype.getActions = function(op) {
    if(!valid(op)) {
        return null;
    } else {
        if(this.flows.hasOwnProperty(op) &&
           (this.flows[op].actions instanceof Array) &&
           this.flows[op].actions.length > 0)
            return this.flows[op].actions;
        else
            return null;
    }   
};

Policy.prototype.isDataPolicy = function() {
    return this.entity === undefined || this.entity === null;
};

// **method checkFlow** checks whether data with the policy
// *this* can flow from the source with policy *source*
// to the target with policy *target*, i.e. this method validates
// whether the security policy of the data complies with the
// target and whether the target allows the incoming data

// context.subject is the message itself (this is the corresponding policy)
// context.object is the target
Policy.prototype.checkIncoming = function(trgPolicy, context) {
    var item_flowPromises = []; // the eval result for the item entering this node
    var entity_flowPromises = []; // the eval result for the entity where data enters

    var dataPolicy = new Policy(this);

    /* console.log("=========== CHECKINCOMING ===========");
       console.log("trgPolicy: "+ trgPolicy);
       console.log("dataPolicy: "+ dataPolicy);
       if(context && context.locks)
       console.log("lock context: "+JSON.stringify(context.locks, null, 2)); */

    // First verify whether the data policy allows the
    // flow into the target/this node

    // console.log("Iterate data policy: ");

    // TODO: Ensure that flowTo and flowFrom are valid ops and are mapped to read/write
    var dataFlows = dataPolicy.getFlows("read");

    if(dataFlows !== null) {
        // here the subject to be checked is the target
        // and the object is the message itself
        for(var f in dataFlows) {
            var flow = dataFlows[f];
            
            // console.log("\ttype of policy target dominates actual target");
            
            var tmpContext = new Context(context);
            tmpContext.setReceiverContext();
            
            // iterate through all locks of the flow and determine its closed locks
            item_flowPromises.push(flow.getClosedLocks(tmpContext, context.receiver.type));
        }
    }

    w.debug("---- check whether node policy accepts message ----");

    var targetFlows = trgPolicy.getFlows("write");
    if(targetFlows !== null) {
        // Second, verify whether the node policy of the
        // node receiving data allows the data to enter the node
        for(var f in targetFlows) {
            var flow = targetFlows[f];
            var tmpContext = new Context(context);
            tmpContext.setMsgContext();

            // TODO: ensure msg entity type is always there
            entity_flowPromises.push(flow.getClosedLocks(tmpContext, 'msg'));
        }
    }

    return new Promise(function(resolve, reject) {
        Promise.all(item_flowPromises).then(function(itemEvals) {
            Promise.all(entity_flowPromises).then(function(entityEvals) {
                // console.log("CONFLICTS: ", itemEvals, entityEvals);
                
                resolve(processConflicts(itemEvals, entityEvals));
            }, function(e) {
                reject(e);
            });
        }, function(e) {
            reject(e);
        });
    });
};

Policy.prototype.checkOutgoing = function(sourcePolicy, context) {
    var dataPolicy = this;
    var dresult = []; // the eval result for the item coming entering
    var eresult = []; // the eval result for the entity where data enters

    // TODO need to be implemented in a useful way

    return processConflicts(dresult, eresult);
},


// **method checkFlow** checks whether data with the policy *dataPolicy*
// trying to enter or leaving (specified by *direction*) the object with
// *this* policy is allowed or not. The *context* provides information
// about the status of the locks
//
// returns an object of the form `{ result : boolean, conditional : boolean }`
Policy.prototype.checkFlow = function(policy, direction, context) {
    /* console.log("====================== CHECKFLOW =======================");
       console.log("sender: ", context ? context.sender : undefined);
       console.log("receiver: ", context ? context.receiver : undefined);
       console.log("policy: "+JSON.stringify(policy));
       console.log("direction: "+JSON.stringify(direction));
       console.log("context: ",context); */


    if(!valid(policy) || !valid(direction) || !valid(context)) {
        return Promise.reject(new Error("Policy.prototype.checkFlow: Invalid policy, context, or flow direction specification!"));
    }

    switch(direction) {
    case Policy.Direction.INCOMING: return this.checkIncoming(policy, context);
    case Policy.Direction.OUTGOING: return this.checkOutgoing(policy, context);
    default: return Promise.reject(new Error("Undefined flow direction"));
    }

    return Promise.reject(new Error("Policy.prototype.checkFlow: Should not get here"));
};


// TODO: we may alter interface if policy contains defined entity,
// in this case the policy entity becomes the subjectEntity
//
// checks whether access of subject to the object with
// operation and the given flow specification is allowed
Policy.prototype.checkAccess = function(subjectPolicy, context, operation) {
    if(!valid(subjectPolicy) || !valid(context))
        return Promise.reject(new Error("Policy.checkAccess: Invalid subjectPolicy or context specification!"));

    if(!valid(Flow.OpTypes[operation]))
        return Promise.reject(new Error("Policy.checkAccess: Invalid access operation '"+operation+"'! Operations must be defined in ULock settings."));

    if(Flow.OpTypes[operation] === 0)
        return this.checkWrite(subjectPolicy, context, operation);
    else
        return this.checkRead(subjectPolicy, context, operation);
};

// TODO: also use writerPolicy
// TODO: Check whether op is set in test cases
// TODO: check whether this method should be replaced by checkAccess entirely
Policy.prototype.checkWrite = function(writerPolicy, context, op) {
    var self = this;

    if(!valid(writerPolicy) || !valid(context) || !valid(context.sender))
        return Promise.reject(new Error("Policy.checkWrite: Invalid writerPolicy or context specification!"));

    if(!valid(op))
        op = "write";

    return new Promise(function(resolve, reject) {
        var flowPromises = [];
        w.debug("============ checkWriteAccess ============: ");
        w.debug("Context: " + JSON.stringify(context, null, 2));
        w.debug("WriterPolicy: " + writerPolicy);
        w.debug("ObjectPolicy: " + self);

        // check whether the writer with writerPolicy can write to *self*
        var opFlows = self.getFlows(op);
        for(var f in opFlows) {
            var flow = opFlows[f];
            flowPromises.push(flow.getClosedLocks(context, context.sender.type));
        }

        Promise.all(flowPromises).then(function(results) {
            var evalResult = processConflicts(results);
            // Backwards compatibility
            evalResult.result = evalResult.grant;
            
            if(!evalResult.grant) {
                var a = self.getActions(op);
                if(a !== null)
                    evalResult.actions = a;
            }
            
            resolve(evalResult);
        }, function(error) {
            reject(error);
        });
    });
};

// TODO: also use readerPolicy
Policy.prototype.checkRead = function(readerPolicy, context, op) {
    var self = this;
    w.debug("Policy.checkRead");

    if(!valid(readerPolicy) || !valid(context) || !valid(context.sender))
        return Promise.reject(new Error("Policy.prototype.checkRead: Invalid readerPolicy or context specification!"));

    if(!valid(op))
        op = "read";

    return new Promise(function(resolve, reject) {
        w.debug("============ checkReadAccess ============");

        var flowPromises = [];
        var opFlows = self.getFlows(op);
        for(var f in opFlows) {         
            var flow = opFlows[f];
            flowPromises.push(flow.getClosedLocks(context, context.sender.type));
        }

        Promise.all(flowPromises).then(function(results) {
            var finalResult = processConflicts(results);
            // TODO: Backwards compatibility
            finalResult.result = finalResult.grant;

            if(!finalResult.grant) {
                var a = self.getActions(op);
                if(a !== null)
                    finalResult.actions = a;
            }
            resolve(finalResult);
        }, function(error) {
            reject(error);
        });
    });
};

Policy.prototype.eq = function(other) {
    if(!(other instanceof Policy))
        other = new Policy(other);

    if(!valid(this.entity)) {
        if(this.entity !== other.entity) {
            return false;
        }
    } else
        if(!this.entity.eq(other.entity)) {
            return false;
        }

    if(Object.keys(this.flows).length != Object.keys(other.flows).length)
        return false;

    var covered = {};
    for(var op in this.flows) {
        for(var f1 in this.flows[op].flows) {
            var matched = false;
            var flow1 = this.flows[op].flows[f1];
            // and apply flow1 to each flow in flows2
            for(var f2 in other.flows[op].flows) {
                var flow2 = other.flows[op].flows[f2];
                try {
                    if(flow1.eq(flow2)) {
                        matched = true;
                        if(!covered.hasOwnProperty(op))
                            covered[op] = [];
                        (covered[op])[f2] = true;
                    }
                } catch(e) {
                    console.log(e);
                }
            }
            
            if(!matched) {
                return false;
            }
        }
    }

    for(var op in other.flows) {
        for(var f2 in other.flows[op].flows)
            if((covered[op])[f2] !== true)
                return false;
    }

    return true;
};

// TODO: Ensure that write and read are always valid operation types
Policy.prototype.le = function(otherPol, op) {
    var locksToCheck = [];
    var complies = true;

    if(!valid(otherPol))
        return false;

    if(!valid(otherPol.flows))
        return true;
    
    if(!valid(op))
        op = "read";

    var flows1 = this.getFlows(op);
    var flows2 = otherPol.getFlows(op);

    // a policy without any flow allows nothing, i.e.
    // every new flow, weakens the original policy
    if(flows2 === null || flows2.length === 0)
        return true;

    // this policy defines no flow, i.e. it is the
    // top policy, the other policy defines at least
    // one flow, thus, this policy cannot be less restrictive
    if(flows1 === null || flows1.length === 0)
        return false;

    var covered1 = [];
    for(var f1 in flows1) {
        var flow1 = flows1[f1];
        for(var f2 in flows2) {
            var flow2 = flows2[f2];
            if(flow1.le(flow2)) {
                covered1[f1] = true;
            }
        }
    }

    // if all flows of this policy have a less
    // restrictive equivalent in the other policy
    // this policy is in fact less restrictive
    for(f1 in flows1)
        if(covered1[f1] != true) {
            complies = false;
            break;
        }

    return complies;
};

Policy.prototype.glb = function() {
    var newPolicy = new Policy(this);

    for(var i = 0; i < arguments.length; i++) {
        var otherPol = arguments[i];

        if(!(otherPol instanceof Policy))
            throw new Error("Policy: Error: Cannot compute greatest lower bound of object not of type Policy");

        if(newPolicy.entity && otherPol.entity) {
            var newDominatesOther = newPolicy.entity.dominates(otherPol.entity);
            var otherDominatesNew = otherPol.entity.dominates(newPolicy.entity);

            // the entities for this policy are different,
            // thus two completely different policies are compared
            // result is a policy set, i.e. two policies
            if(!(newDominatesOther || otherDominatesNew)) {
                return [ this, otherPol ];
            }

            // other policy is more specific
            if(otherDominatesNew)
                newPolicy.entity = new Entity(otherPol.entity);
        } else
            if(otherPol.entity)
                newPolicy.entity = new Entity(otherPol.entity);

        var toAdd = [];
        for(var op in newPolicy.flows) {
            for(var f1 in newPolicy.getFlows(op)) {
                var flow1 = newPolicy.getFlows(op)[f1];
                for(var f2 in otherPol.getFlows(op)) {
                    var flow2 = otherPol.getFlows(op)[f2];
                    
                    // flows are equal or first flow is
                    // less restrictive => nothing to do
                    if(flow1.eq(flow2) || flow1.le(flow2))
                        continue;
                    else
                        toAdd.push(flow2);
                }
            }
        }

        for(var f in toAdd)
            newPolicy.add(toAdd[f]);
    }

    return newPolicy;
}

Policy.prototype.lub = function() {
    var newPolicy = new Policy(this);

    var i = 0;
    for(i = 0; i < arguments.length; i++) {
        var otherPol = arguments[i];

        // console.log("\nlub(\n\t"+this+",\n\t"+otherPol+")");

        if(!(otherPol instanceof Policy))
            otherPol = new Policy(otherPol);

        if(newPolicy.entity && otherPol.entity) {
            var newDominatesOther = newPolicy.entity.dominates(otherPol.entity);
            var otherDominatesNew = otherPol.entity.dominates(newPolicy.entity);

            if(!(newDominatesOther || otherDominatesNew)) {
                // this or the other policy do not contain specifications for this entity
                // if nothing is specified access is forbidden by default, i.e., the policy for this entity is also empty

                return Policy.top();
            }

            // other policy entity is more specific
            if(newDominatesOther)
                newPolicy.entity = new Entity(otherPol.entity);
        } else {
            newPolicy.entity = null;
        }

        var newFlows = [];
        var f2;
        for(var op in otherPol.flows) {
            var opFlows2 = otherPol.getFlows(op)
            for(f2 in opFlows2) {
                var f1;
                var opFlows1 = newPolicy.getFlows(op);
                if(valid(opFlows1)) {
                    for(f1 in opFlows1) {
                        var res = opFlows1[f1].lub(opFlows2[f2]);
                        if(res)
                            newFlows.push(res);
                    }
                }
            }
        }

        newPolicy = new Policy([], newPolicy.entity);
        var f;
        for(f in newFlows) {
            newPolicy.addFlow(new Flow(newFlows[f]));
        }
    }

    return newPolicy;
}

// TODO: be more flexible in the call (e.g. ommitt context and scope)
Policy.enforce = function(data, context, scope, decision) {
    if(decision.grant) {
        return data;
    } else {
        if(valid(decision.actions)) {
            return Action.applyAll(data, context, scope, decision);
        } else {
            return Promise.reject(null);
        }
    }
}

Policy.prototype.toString = function() {
    var str = "";

    if(!valid(this.entity))
        str += "<Allowed flows: ";
    else
        str += "<Allowed flows for entity: "+this.entity+": ";

    str += "{ ";

    for(var op in this.flows) {
        str += "\n\t" + op + ": [\n";
        for(var f in this.flows[op].flows) {
            var flow = (this.flows[op].flows)[f];
            if(f > 0)
                str += ",\n";
            str += "\t\t" + flow;
        }

        if(valid(this.flows[op].actions) && this.flows[op].actions.length > 0) {
            str += "\n\t\tdo: [\n";
            
            for(var a in this.flows[op].actions) {
                var action = (this.flows[op].actions)[a];
                if(a > 0)
                    str += ",\n";
                str += "\t\t\t" + action;
            }
            
            str += "\n\t\t]";
        }

        str += "\n\t]";
    }

    str += "}>";

    return str;
}

/*****************************************************************************/
/******************************* JSFLOW UTILS ********************************/
/*****************************************************************************/

Policy.createMessageArray = function(msg) {
    if (msg.type == 'normal') {

        // if top level element is array user intended the object to be send to
        // different locations
        if (msg.value.value !== null && msg.value.value.Class === 'Array') {
            var resultArray = [];

            for (var i = 0; i < msg.value.value.properties.length; i++) {
                if (msg.value.value.properties[i] !== null) {

                    // if the array contains a sub array the elements are
                    // intended to be sent sequentially
                    if (msg.value.value.properties[i].Class === 'Array') {
                        var subResultArray = [];
                        for (var j = 0; j < msg.value.value.properties[i].properties.length; j++) {

                            if (msg.value.value.properties[i].properties[j] !== null) {
                                var shell = {};
                                shell.type = "normal";
                                shell.value = {};
                                shell.value.label = {};

                                // When this shell is created in jsFlow the default policy is set
                                shell.value.label.policy = clone(msg.value.label.policy);
                                // console.log("POLICY OF SUBARRAY: %j", msg.value.label.policy);

                                // msg.value.value.properties[i] is the complete msg object
                                shell.value.value = msg.value.value.properties[i].properties[j];
                                // console.log("POLICY OF SUBARRAY: %j", shell.value.value);

                                subResultArray[j] = shell;
                            } else {
                                subResultArray[j] = null;
                            }
                            resultArray[i] = subResultArray;
                        }
                    } else {
                        // console.log("NO SUB ARRAY");

                        // outer object similar to the policyObject
                        var shell = {};
                        shell.type = "normal";
                        shell.value = {};
                        shell.value.label = {};

                        // When this shell is created in jsFlow the default
                        // policy is set
                        shell.value.label.policy = clone(msg.value.label.policy);

                        // console.log("POLICY OF THIS ELEMENT: %j",shell.value.label.policy);

                        // msg.value.value.properties[i] is the complete msg
                        // object
                        shell.value.value = clone(msg.value.value.properties[i]);
                        // console.log("SUB: %j",shell.value.value.labels);

                        resultArray[i] = shell;

                        // console.log("resultArray: "+resultArray[i]);
                    }
                } else {
                    resultArray[i] = null;
                }
            }
        } else {
            var resultArray = [ msg ];
        }
    } else {
        console.log("unsupported type!");
    }
    return resultArray;
};

/* function getDominatingPolicy(obj, min, lub) {
   for (var i in obj) {
   if (typeof obj[i] == 'object') {
   if(i == 'policy') {
   min = lub(min, obj[i]);
   } else {
   min = getDominatingPolicy(obj[i], min, lub);
   }
   }
   }
   return min;
   } */

/* =============================================================================== */

/*
 *create a new object which has the necessary properties
 *in order to support policies.
 */
function policyObject(policy) {
    this.type = 'normal';

    this.value = {};
    this.value.label = {};
    this.value.label.policy = policy;

    this.value.value = {};
    this.value.value.Class = 'Object';
    this.value.value.properties = {};
    this.value.value.labels = {};
}

//Set the given property and name as property in the policy object
policyObject.prototype.setProperty = function(propName, property) {
    this.value.value.properties[propName] = property;
}

//Return the property according to the given key
policyObject.prototype.getProperty = function(propName) {
    return this.value.value.properties[propName];
}

//Return all properties
policyObject.prototype.getProperties = function() {
    return this.value.value.properties;
}

// set the given policy and name as label in the policy object
policyObject.prototype.setPolicy = function(labelName, policy) {
    this.value.value.labels[labelName] = {};
    this.value.value.labels[labelName].value = {};
    this.value.value.labels[labelName].value.policy = policy;
}

//return the policy of the object itself
policyObject.prototype.getPolicy = function(prop) {
    return this.value.value.labels[prop].value.policy ;
}

//Return all policies of the properties
policyObject.prototype.getPolicies = function() {
    return this.value.label.policy;
}

// A property object for the policy object
function policySubObject() {
    this.Class = 'Object';
    this.Extensible = true;
    this.properties = {};
    this.labels = {};
}

//set the given property and name as property in the sub policy object
policySubObject.prototype.getPolicy = function(prop) {
    return this.labels[prop].value.policy;
}

// set the given property and name as property in the sub policy object
policySubObject.prototype.setProperty = function(propName, property) {
    this.properties[propName] = property;
}

//Return the property according to the key from this object
policySubObject.prototype.getProperty = function(propName) {
    return this.properties[propName];
}

//Return all properties from this object
policySubObject.prototype.getProperties = function() {
    return this.properties;
}

// set the given policy and name as label in the sub policy object
policySubObject.prototype.setPolicy = function(labelName, policy) {
    this.labels[labelName] = {};
    this.labels[labelName].value = {};
    this.labels[labelName].value.policy = policy;
}

// A property array object for the policy object
function policySubArray(policy) {
    this.Class = 'Array';
    this.Extensible = true;
    this.properties = [];
    this.labels = {};

    this.labels.length = {};
    this.labels.length.value = {};
    this.labels.length.value.policy = policy;
}

//set the given property and name as property in the sub policy object
policySubArray.prototype.getPolicy = function(prop) {
    return this.labels[prop].value.policy;
}

// set the given property and name as property in the sub policy object
policySubArray.prototype.setProperty = function(propName, property) {
    this.properties[propName] = property;
}

//Return the property according to the key from this object
policySubArray.prototype.getProperty = function(propName) {
    return this.properties[propName];
}

//Return all properties from this object
policySubArray.prototype.getProperties = function() {
    return this.properties;
}

// set the given policy and name as label in the sub policy object
policySubArray.prototype.setPolicy = function(labelName, policy) {
    this.labels[labelName] = {};
    this.labels[labelName].value = {};
    this.labels[labelName].value.policy = policy;
}

/*
 * Iterate through the given object and create a corresponding policy object
 * with the given policy.
 */
function createPolicyObject(obj, policyObj, policy) {

    if (obj instanceof Object || obj instanceof Array) {
        for (var prop in obj) {

            if (!obj.hasOwnProperty(prop)) {
                continue;
            }

            if (obj[prop] instanceof Array) {
                var subArray = new policySubArray(policy);

                policyObj.setProperty(prop, subArray);
                policyObj.setPolicy(prop, policy);
                createPolicyObject(obj[prop], subArray, policy);

            } else if (obj[prop] instanceof Object) {
                var subObj = new policySubObject();

                policyObj.setProperty(prop, subObj);
                policyObj.setPolicy(prop, policy);
                createPolicyObject(obj[prop], subObj, policy);

            } else {
                policyObj.setProperty(prop, obj[prop]);
                policyObj.setPolicy(prop, policy);
            }
        }
    } else {
        policyObj.value.value = obj;
    }
}

/*
 *
 * Create an object with policies from the given object and policy similar to
 * the internal used jsFlow object.
 */
Policy.setPolicy = function(obj, policy) {
    var policyObj = new policyObject(policy);
    createPolicyObject(obj, policyObj, policy)

    return policyObj;
};

Policy.removePolicy = function(obj) {
    var nakedObj = {};
    var properties = obj.properties;

    for (var prop in properties) {
        if(properties[prop] == "Prototype") {
            continue;
        } else if(properties[prop] == null) {
            nakedObj[prop] = properties[prop];
        } else if (properties[prop].Class == 'Array') {
            var nakedSubObj = removeArrayPolicy(properties[prop]);
            nakedObj[prop] = nakedSubObj;
        } else if(properties[prop].Class == 'Object') {
            var nakedSubObj = Policy.removePolicy(properties[prop]);
            nakedObj[prop] = nakedSubObj;
        } else {
            nakedObj[prop] = properties[prop];
        }
    }

    if(obj.Class != undefined && obj.Class == 'Array') {
        var arr = [];
        for(var o in nakedObj) {
            arr.push(nakedObj[o]);
        }
        nakedObj = arr;
    }
    return nakedObj;
}

var removeArrayPolicy = function(obj) {
    var nakedObj = [];
    var properties = obj.properties;

    for(var element in properties) {
        if(properties[element] == null) {
            nakedObj.push(properties[element]);
        } else if(properties[element].Class == 'Array') {
            nakedObj.push(removeArrayPolicy(properties[element]));
        } else if(properties[element].Class == 'Object') {
            nakedObj.push(Policy.removePolicy(properties[element]));
        } else {
            nakedObj.push(properties[element]);
        }
    }
    return nakedObj;
};


//Merge an obj which has policies set with a obj without policies.
//The result is the modified obj with policies.
//Properties present in the obj without policies but not in the policy
//message get set and obtain the policy bottom.
//Properties present in the obj with policies but not in the message without
//policies get deleted.
//The values of properties present in both messages get set to the value
//of the obj without policies.
Policy.mergePolicyObjWithObj = function(objWithPolicy, obj) {

    var objWithPolicyClone = clone(objWithPolicy);
    var objClone = clone(obj);

    //TODO better check with object Constructor
    if(objWithPolicyClone.type == 'normal' && objClone.type != "normal"){
        deletePropertiesFromObjWithPolicy(objWithPolicyClone.value.value, objClone);
        setPolicyObjWithObj(objWithPolicyClone.value.value, objClone);
    } else {
        throw new Error("Error: Can only merge a obj with policies with a obj without policies");
    }

    return objWithPolicyClone;
}


//Remove the properties of the first argument with polcies which are not present
//in the second argument which does not have policies.
function deletePropertiesFromObjWithPolicy(objWithPolicy, obj){

    for (var prop in objWithPolicy.properties) {

        //The property is also present in the object without policies
        if(obj[prop]){
            if(objWithPolicy.properties[prop] == "Prototype") {
                continue;
            }

            if (typeof objWithPolicy.properties[prop] == 'array' || typeof objWithPolicy.properties[prop] == 'object') {
                deletePropertiesFromObjWithPolicy(objWithPolicy.properties[prop], obj[prop]);
            }
        }else{

            //Remove the value;
            delete objWithPolicy.properties[prop];

            //Remove the policy connected to this property
            delete objWithPolicy.labels[prop];

        }
    }
}

function setPolicyObjWithObj(objWithPolicy, obj) {

    for(var prop in obj){
        if(obj[prop] == "Prototype") {
            continue;
        }

        //The policy object has the same prpoerty
        if(objWithPolicy.properties[prop]){
            if((typeof obj[prop] == 'array') || (typeof obj[prop] == 'object')){
                if((typeof objWithPolicy.properties[prop] == 'array') || (typeof objWithPolicy.properties[prop] == 'object')){
                    setPolicyObjWithObj(objWithPolicy.properties[prop], obj[prop]);
                } else {
                    if (typeof obj[prop] == 'array') {
                        var subArray = new policySubArray(Policy.bot());
                        objWithPolicy.properties[prop] = subArray;
                        createPolicyObject(obj[prop], subArray, Policy.bot());

                    } else if (typeof obj[prop] ==  'object') {
                        var subObj = new policySubObject();

                        objWithPolicy.properties[prop] = subObj;
                        createPolicyObject(obj[prop], subObj, Policy.bot());
                    } else {
                        objWithPolicy.properties[prop] = obj[prop];
                    }
                }
            }else{
                objWithPolicy.properties[prop] = obj[prop];
            }

            //The obj with policies is missing properties from the obj without policies
            //set the missing properties with the bot policy.
        }else{
            if (obj instanceof Object || obj instanceof Array) {
                for (var prop in obj) {

                    if (!obj.hasOwnProperty(prop)) {
                        continue;
                    }

                    if (obj[prop] instanceof Array) {
                        var subArray = new policySubArray(Policy.bot());

                        objWithPolicy.properties[prop] = subArray;
                        objWithPolicy.labels[prop] = { value : { policy : Policy.bot()}};
                        createPolicyObject(obj[prop], subArray, Policy.bot());

                    } else if (obj[prop] instanceof Object) {
                        var subObj = new policySubObject();

                        objWithPolicy.properties[prop] = subObj;
                        objWithPolicy.labels[prop] = { value : { policy : Policy.bot()}};
                        createPolicyObject(obj[prop], subObj, Policy.bot());

                    } else {
                        objWithPolicy.properties[prop] = obj[prop];
                        objWithPolicy.labels[prop] = { value : { policy : Policy.bot()}};
                    }
                }
            } else {
                objWithPolicy.value.value = obj;
            }
        }
    }
}

//Adapts the policies of an object based on its own policies and the policies
//in its properties.
Policy.adaptPolicy = function(objWithPolicy){

    if(objWithPolicy.type == "normal"){
        var propertyPolicies = adaptPropertyPolicy(objWithPolicy.value.value);
        objWithPolicy.value.label.policy = objWithPolicy.value.label.policy.lub.apply(objWithPolicy.value.label.policy, propertyPolicies);

    } else {
        throw new Error("Error: Expected an object with policies");
    }
    return objWithPolicy;
}

function adaptPropertyPolicy(obj){
    var policies = [];

    for (var prop in obj.properties){

        if(typeof obj.properties[prop] == 'array' || typeof obj.properties[prop] == 'object'){
            var propPolicies = adaptPropertyPolicy(obj.properties[prop]);
            obj.labels[prop].value.policy = obj.labels[prop].value.policy.lub.apply(obj.labels[prop].value.policy, propPolicies);
            policies.push(obj.labels[prop].value.policy);

        } else {
            policies.push(obj.labels[prop].value.policy);
        }
    }
    return policies;
}

//Iterate over all policies of the object an set the lub of the current policy and the given policy.
//The entity of the policy object is set to null.
Policy.PolicyObjlubWithPolicy = function(objWithPolicy, policy){

    var objWithPolicyClone = clone(objWithPolicy);
    var policyClone = clone(policy);

    if(objWithPolicy.type == "normal"){
        var objPolicy = new Policy(objWithPolicyClone.value.label.policy);

        objPolicy.entity = null;
        policyClone.entity = null;

        objWithPolicyClone.value.label.policy = objPolicy.lub(policyClone);
        policyObjlubWithPolicyHelper(objWithPolicyClone.value.value, policy);
    } else {
        throw new Error("Error: Expected an object with policies");
    }

    return objWithPolicyClone;
}

function policyObjlubWithPolicyHelper(obj, policy){
    for(var prop in obj.properties){
        var objPolicy = new Policy(obj.labels[prop].value.policy);

        objPolicy.entity = null;

        obj.labels[prop].value.policy = objPolicy.lub(policy);

        if((typeof obj.properties[prop] == 'array' || typeof obj.properties[prop] == 'object') && obj.properties[prop] != null){
            policyObjlubWithPolicyHelper(obj.properties[prop], policy);
        }
    }
}

//Returns the lub policy based on all policies in its properties.
Policy.getlubOfPolicyObj = function(obj){
    if(obj.type == "normal"){
        var objWithPolicy = clone(obj);
        var props = objWithPolicy.value.value;
        var policy = new Policy(objWithPolicy.value.label.policy);

        var propertyPolicies = lubOfProperties(props);

        var lubPolicy = policy.lub.apply(policy, propertyPolicies);

    } else {
        throw new Error("Error: Expected an object with policies");
    }
    return lubPolicy;
}

function lubOfProperties(obj){
    var policies = [];


    for (var prop in obj.properties){

        if((typeof obj.properties[prop] == 'array' || typeof obj.properties[prop] == 'object') && obj.properties[prop] != null){

            var propPolicies = lubOfProperties(obj.properties[prop]);
            var policy = new Policy(obj.labels[prop].value.policy);

            obj.labels[prop].value.policy = policy.lub.apply(policy, propPolicies);
            policies.push(new Policy(obj.labels[prop].value.policy));

        } else {
            policies.push(new Policy(obj.labels[prop].value.policy));
        }
    }
    return policies;
}

//Returns the policy for the given path and policy object.
Policy.getPolicyAtPath = function(objWithPolicy, path){

    if(objWithPolicy.type == "normal"){

        var obj = clone(objWithPolicy);
        var policy;
        path = path.replace(/\[(\w+)\]/g, '.$1');
        var pathArray = [];

        if(path != ""){
            pathArray = path.split(".");
        }

        if(pathArray.length < 1){
            policy = obj.value.label.policy;
        }else{
            policy = getPolicyHelper(obj.value.value, pathArray);
        }
    } else {
        throw new Error("Error: Expected an object with policies");
    }

    return policy;
}

function getPolicyHelper(obj, path){
    var len = path.length;
    var policy;

    for(var i = 0; i < len; i++){
        var prop = path[i];
        if(prop in obj.properties){
            if(i == len - 1){
                policy = obj.labels[path[i]].value.policy;
            } else {
                obj = obj.properties[path[i]];
            }

        } else {
            throw new Error("Error: Path not found in given object");
        }
    }
    return policy;
}

//Sets the given policy according to the given path in th egiven policy object
Policy.setPolicyAtPath = function(objWithPolicy, path, policy){

    if(objWithPolicy.type == "normal"){

        var obj = clone(objWithPolicy);
        path = path.replace(/\[(\w+)\]/g, '.$1');
        var pathArray = [];

        if(path != ""){
            pathArray = path.split(".");
        }

        if(pathArray.length < 1){
            obj.value.label.policy = policy;
        }else{
            setPolicyAtPathHelper(obj.value.value, pathArray, policy);
        }
    } else {
        throw new Error("Error: Expected an object with policies");
    }

    return obj;
}

function setPolicyAtPathHelper(obj, path, policy){
    var len = path.length;

    for(var i = 0; i < len; i++){
        var prop = path[i];
        if(prop in obj.properties){
            if(i == len - 1){
                obj.labels[path[i]].value.policy = policy;
            } else {
                obj = obj.properties[path[i]];
            }

        } else {
            throw new Error("Error: Path not found in given object");
        }
    }
    return obj;
}

//Iterate an object with policies. Executes the given function with the
//current property, policy for this property, and the path to this property
Policy.iteratePolicyObj = function(objWithPolicy, func){
    if(objWithPolicy.type == "normal"){
        var obj = clone(objWithPolicy);
        func("", obj.value.label.policy, "");
        iteratePolicyObjHelper(obj.value.value, func, "");

    } else {
        throw new Error("Error: Expected an object with policies");
    }
}

function iteratePolicyObjHelper(obj, func, path){

    for(var prop in obj.properties){

        if((typeof obj.properties[prop] == 'array' || typeof obj.properties[prop] == 'object') && obj.properties[prop] != null){
            func(prop, obj.labels[prop].value.policy, path + prop);
            iteratePolicyObjHelper(obj.properties[prop], func, path + prop + ".");
        }else{
            func(prop, obj.labels[prop].value.policy, path + prop);
        }
    }
}

//Remove the property including its policy at the given path
Policy.removePropertyAtPath = function(objWithPolicy, path){

    if(objWithPolicy.type == "normal"){

        var obj = clone(objWithPolicy);
        path = path.replace(/\[(\w+)\]/g, '.$1');
        var pathArray = [];

        if(path != ""){
            pathArray = path.split(".");
        }

        if(pathArray.length < 1){
            obj = undefined;
        }else{
            removePropertyAtPathHelper(obj.value.value, pathArray);
        }
    } else {
        throw new Error("Error: Expected an object with policies");
    }

    return obj;
}

function removePropertyAtPathHelper(obj, path){
    var len = path.length;

    for(var i = 0; i < len; i++){
        var prop = path[i];
        if(prop in obj.properties){
            if(i == len - 1){
                delete obj.properties[prop];
                delete obj.labels[prop];
            } else {
                obj = obj.properties[prop];
            }

        } else {
            throw new Error("Error: Path not found in given object");
        }
    }
    return obj;
}

//Sets the given property with policy in the given object according to the path.
//If no path is provided create a new policy object with the property and policy.
Policy.setPropertyAtPath = function(objWithPolicy, path, property, policy){

    if(objWithPolicy.type == "normal"){

        var obj = clone(objWithPolicy);
        path = path.replace(/\[(\w+)\]/g, '.$1');
        var pathArray = [];

        if(path != ""){
            pathArray = path.split(".");
        }

        if(pathArray.length < 1){
            obj = Policy.setPolicy(porperty, policy);
        }else{
            setPropertyAtPathHelper(obj.value.value, pathArray, property, policy);
        }
    } else {
        throw new Error("Error: Expected an object with policies");
    }

    return obj;
}

function setPropertyAtPathHelper(obj, path, property, policy){

    var len = path.length;

    for(var i = 0; i < len; i++){
        var prop = path[i];

        if(i == len - 1){
            obj.labels[prop] = { value : { policy : policy}};


            if (property instanceof Array) {
                var subArray = new policySubArray(policy);
                createPolicyObject(property, subArray, policy);

                obj.properties[prop] = subArray;

            } else if (property instanceof Object) {
                var subObj = new policySubObject();
                createPolicyObject(property, subObj, policy);

                obj.properties[prop] = subObj;

            } else {
                obj.properties[prop] = property;
            }

        } else {
            obj = obj.properties[path[i]];
        }
    }
    return obj;
}

module.exports = Policy;
