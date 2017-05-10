var w = require("winston");
w.level = process.env.LOG_LEVEL;

var Policy = require("./Policy.js");
var PolicySet = require("./PolicySet.js");
var Entity = require("./Entity.js");
var Lock = require("./Lock.js");
var Action = require("./Action.js");
var Context = require("./Context");

var Promise=require("bluebird");

var initialized = false;

var init = function(settings) {
    if(initialized) {
        w.info("ULocks have already been initialized. Ignore.");
        return;
    }    

    if(!settings)
        throw new Error("Settings expected to initialize ULocks Framework");
    
    var toInit = [];

    toInit.push(Entity.init(settings));
    toInit.push(Lock.init(settings));
    toInit.push(Action.init(settings));

    return new Promise(function(resolve, reject) {
        Promise.all(toInit).then(function() {
            resolve();
        }, function(e) {
            reject(e);
        });
    });
}

module.exports = {
    Context: Context,
    Entity: Entity,
    Policy: Policy,
    PolicySet: PolicySet,
    init: init
}
