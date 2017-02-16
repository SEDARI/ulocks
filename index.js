var Policy = require("./Policy.js");
var PolicySet = require("./PolicySet.js");
var Entity = require("./Entity.js");
var Lock = require("./Lock.js");
var Context = require("./Context");

var init = function(settings) {
    var toInit = [];

    toInit.push(Entity.init(settings));
    toInit.push(Lock.init(settings));

    return Promise.all(toInit);
}

module.exports = {
    Context: Context,
    Entity: Entity,
    Policy: Policy,
    PolicySet: PolicySet,
    init: init
}
