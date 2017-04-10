"use strict";

var fs = require("fs");
var path = require("path");

var PolicyConfig = require("./PolicyConfig");
var Entity = require("./Entity.js");

var actionConstructors = {};

function Action(action) {
    if(this.constructor === Object &&
       action && action.name && actionConstructors[action.name]) {
        throw new Error("Action: Use Action.createAction to generate Action of type '"+action.name+"'");
    } else {
        if(action === undefined) {
            this.name = "";
            this.args = [];
        } else {
            if(action.name === undefined)
                throw new Error("Error: Action does not specify a name.");
            
            this.name = action.name;
            
            if(action.args !== undefined) {
                var l = action.args.length;
                this.args = []

                for(var i = 0; i < l; i++) {
                    if(action.args[i] && action.args[i].type) {
                        this.args[i] = new Entity(action.args[i]);
                    } else
                        this.args[i] = action.args[i];
                }
            }
        }
    }
};

function readActions(dir) {
    var actionFiles = [];
    var actions = [];
    var loads = [];

    try {
        actionFiles = fs.readdirSync(dir);
    } catch(err) {
        return Promise.reject(err);
    }
    
    actionFiles.forEach(function(actionFile) {
        loads.push(new Promise( function(resolve, reject) {
            var filePath = path.join(dir, actionFile);
            var stats = fs.statSync(filePath);
            if (stats.isFile()) {
                if (/\.js$/.test(filePath)) {
                    try {
                        var newAction = require(filePath);
                        newAction(Action);
                        console.log("Success: Action '"+filePath+"' registered.");
                        resolve();
                    } catch(err) {
                        console.log("ERROR: Unable to load action in '"+filePath+"'!");
                        reject(err);
                    }
                }
            }
        }));
    });

    return Promise.all(loads);
};

Action.init = function(settings) {
    var baseDir = process.cwd();

    if(!settings.actions) {
        throw new Error("Unable to initialize Actions. Invalid 'settings.actions' property!");
        return;
    }
    
    if(settings.actions[0] !== path.sep)
        settings.actions = baseDir + path.sep + settings.actions;
    
    return readActions(settings.actions);
};

Action.createAction = function(action) {
    if(!actionConstructors[action.name]) {
        Action.init();
    }
    
    if(!(action instanceof Action) && !action.name) {
        throw new Error("Action: Cannot create an action from other than an Action!");
        return null;
    }
        
    if(!actionConstructors[action.name]) {
        throw new Error("Action '"+action.name+"' does not exist!");
        return null;
    }

    return new (actionConstructors[action.name])(action);
};

Action.register = function (type, constructor) {
    if(!actionConstructors)
        actionConstructors = {};

    if(actionConstructors[type]) {
        throw new Error("'"+type+"' is already a registered action.");
        return;
    }

    if(!constructor)
        throw new Error("Constructor for action '"+type+"' is invalid.");

    actionConstructors[type] = constructor;
};

Action.prototype.eq = function(action) {
    if(!action)
        return false;
    
    if(!(this.name === undefined && action.name === undefined)) {
        if(this.name === undefined || action.name === undefined)
            return false;
        else
            if(this.name != action.name)
                return false;
    }

    if(!(this.args === undefined && action.args === undefined)) {
        if(this.args === undefined || action.args === undefined)
            return false;
        else {
            for(var i in this.args) {
                if(this.args[i] && this.args[i].type) {
                    if(JSON.stringify(this.args[i]) !== JSON.stringify(action.args[i]))
                        return false;
                } else {
                    if(this.args[i] != action.args[i])
                        return false;
                }
            }
        }
    }

    return true;
};

// returns true if this action is less invasive than the other
Action.prototype.le = function (action) {
    throw new Error("Action: le is required to be overwritten");
};

module.exports = Action;
