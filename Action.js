"use strict";

var fs = require("fs");
var path = require("path");
var w = require("winston");
w.level = process.env.LOG_LEVEL;

var Entity = require("./Entity.js");

/** 
 * Constructs a new action.
 * @class
 * @param {Object} action JSON describing an action
 */
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

/** 
 * Stores constructors of all actions registered with this module
 * using the static method [register]{@link Action#register} 
 * (mostly called from within an action implementation)
 * @static
 * @access private
 */
var actionConstructors = {};

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
                        w.log('info', "Success: Action in '"+filePath+"' is now registered.");
                        resolve();
                    } catch(err) {
                        w.log('error', "Unable to load action in '"+filePath+"'!");
                        reject(err);
                    }
                }
            }
        }));
    });

    return Promise.all(loads);
};

/**
 * Initializes the action system, reading all actions from the directory specified in
 * settings.
 * @arg {Object} settings Checks whether <code>settings.actions</code> is an absolute path. If it is
 * the actions are loaded from this path. If not, actions are loaded from this path relative to the path
 * the application was started from
 * @return {Promise} The returned promise resolves if all actions were loaded successfully, rejects otherwise.
 * @static
 */ 
Action.init = function(settings) {
    var baseDir = process.cwd();

    if(!settings.actions) {
        w.log('error', "Unable to initialize Actions. Invalid 'settings.actions' property!");
        return Promise.reject(new Error("Unable to initialize Actions. Invalid 'settings.actions' property!"));
    }

    // if settings.actions starts with path separator, it contains the absolute 
    // path to the directory from which the actions should be loaded
    if(settings.actions[0] !== path.sep)
        settings.actions = baseDir + path.sep + settings.actions;

    w.log('info', "Searching for actions at '"+settings.actions+"'"); 
    
    return readActions(settings.actions);
};

// TODO: check whether createAction is required at all!
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

/**
 * Registers a new action, indicating the "type" of the action (could also 
 * be called the name of the action) and its constructor, called when a new 
 * action of this type should be constructed, e.g. if it is contained in a 
 * policy.
 *
 * @arg {string} type A unique name for the action type to be registered
 * @arg {function} constructor The constructor to be called when a new action 
 * of this type is constructed
 * @throws Throws an error if type or constructor are invalid or if the action
 * type has already been registered.
 * @static
 */
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

/**
 * Checks whether two actions are equal.
 * @arg {Action} action Action to compare with <code>this</code> action.
 * @returns {Boolean} <code>true</code> if both actions are equal, i.e., 
 * type and arguments, are identical, <code>false</code> otherwise.
 */
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

// TODO: Promises in operators lub and le does not really make sense
/**
 * Must be implemented by the corresponding action class. Computes the least upper bound of 
 * <code>this</code> action and the action provided as the argument
 * @arg {Action} action Action against which the least upper bound is computed
 * @returns {Promise.<Action>} Promise resolves with the <code>lub</code> if the computation was
 * successful, rejects otherwise.
 * @abstract
 */
Action.prototype.lub = function(action) {
    w.error("Action '"+this.action+"' is required to overwrite method Action.prototype.lub!");
    return Promise.reject(new Error("Action '"+this.action+"' is required to overwrite method Action.prototype.lub!"));
};

/**
 * Must be implemented by the corresponding action class. Checks whether <code>this</code> 
 * action is less or equally intrusive than the action provided as an argument.
 * @arg {Action} action Action to compare with <code>this</code> action.
 * @returns {Boolean} <code>true</code> if <code>this</code> is less or equally intrusive, <code>false</code> otherwise.
 * @abstract
 */
Action.prototype.le = function (action) {
    w.error("Action '"+this.action+"' is required to overwrite method Action.prototype.le!");
    return Promise.reject(new Error("Action '"+this.action+"' is required to overwrite method Action.prototype.le!"));
};

module.exports = Action;
