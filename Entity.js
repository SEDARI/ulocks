"use strict";

/** 
 * @class Entity
 * @param {object} entity JSON describing a lock
 */
function Entity (entity) {
    /** Identifier specifying the type of this entity 
     * @member {Entity.Type}
     */
    this.type = null;

    if(entity) {
        if(!entity.type) {
            throw new Error("Entity: Call to entity constructor with invalid argument ("+JSON.stringify(entity)+")");
        } else {
            if(Entity.Types[entity.type] !== undefined) {
                this.type = entity.type;
            } else {
                throw new Error("Entity: Unknown entity type '"+entity.type+"'");
            }
        }
    } else {
        // TODO - assign the smallest entity value
        this.type = 0;
    }
    
    if(!this.type) {
        throw new Error("Error: unknown entity type");
    }

    if(entity.hasOwnProperty('id'))
        /** Identifier of the entity
         * @member {String} 
         */
        this.id = entity.id;

    if(entity.hasOwnProperty('name'))
        /** Name of the entity
         * @member {String} 
         */
        this.name = entity.name;

    if(entity.hasOwnProperty('input'))
        /** identifier of an input port
         * @member {String} 
         */
        this.input = entity.input;

    if(entity.hasOwnProperty('output'))
        /** identifier of an output port
         * @member {String} 
         */
        this.output = entity.output;

    if(entity.hasOwnProperty('stream'))
        /** identifier of a stream
         * @member {String} 
         */
        this.stream = entity.stream;

    if(entity.hasOwnProperty('value'))
        /** possible value of this entity
         * e.g. if the entity specifies a variable, API parameter, etc.
         * @member {Number|String|Object} 
         */
        this.value = entity.value;
};

Entity.init = function(settings) {
    if(settings.entityTypes === undefined || settings.entityTypes === null)
        return Promise.reject(new Error("ERROR: Unable to set up Entity types for ULock framework!"));
    
    Entity.Types = settings.entityTypes;
    Entity.MinType = null;
    
    (function setMinType() {
        var min = null
        for(var s in Entity.Types) {
            if(s !== undefined) {
                if(min == null || Entity.Types[s] < min) {
                    min = Entity.Types[s];
                    Entity.MinType = s;
                }
            }
        }
    })();

    if(Entity.MinType !== undefined && Entity.MinType !== null)
        return Promise.resolve();
    else
        return Promise.reject(new Error("ERROR: Unable to compute most general Entity type in ULock framework!"));
};

// TODO: Put into config file and derive most general entity type!

/**
 * Computes a key for this lock
 * 
 * @returns {String} key for this lock.
 */
Entity.prototype.key = function() {
    return this.type +
        (this.id !== undefined && this.id !== null ? "id" + this.id : "") +
        // the name does not change the entity 
        // (this.name !== undefined && this.name !== null ? "n" + this.name : "") +
        (this.input !== undefined && this.input !== null ? "i" + this.input : "") +
        (this.output !== undefined && this.output !== null ? "o" + this.output : "") +
        (this.stream !== undefined && this.stream !== null ? "s" + this.stream : "") +
        (this.value !== undefined &&  this.value !== null ? "v" + this.value : "");
};

/**
 * Determines whether this entity describes an input port.
 * 
 * @returns {boolean} true if this entity describes and input port, false otherwise
 */
Entity.prototype.isInputPort = function() {
    return this.type === 'app' && this.input;
};

/**
 * Determines whether this entity describes an output port.
 * 
 * @returns {boolean} true if this entity describes and output port, false otherwise
 */
Entity.prototype.isOutputPort = function() {
    return this.type === 'app' && this.output;
};

/**
 * Determines whether this entity is equal to e
 * 
 * @param {Entity} e Entity to compare this against
 * @returns {boolean} true if both entity e is equal to this, false otherwise
 */
Entity.prototype.eq = function(e) {
    if(e == null) return false;
    if(e == undefined) return false;
    if(this.id != e.id) return false;
    if(this.type != e.type) return false;
    if(this.input != e.input) return false;
    if(this.output != e.output) return false;
    if(this.stream != e.stream) return false;
    if(this.value != e.value) return false;
    // the name does not change the entity
    // if(this.name != e.name) return false; 
    
    return true;
};

/**
 * Determines whether this entity is not equal to e
 * 
 * @param {Entity} e Entity to compare this against
 */
Entity.prototype.neq = function(e) {
    return !(this.eq(e));
};

/** 
 * Checks whether the type specified for <i>this</i> entity 
 * is less specific than the type of the argument <i>e</i>
 *
 * @param {Entity} e The entity to compare the type with
 *
 * @returns {boolean} true if the type of this is less specific than the 
 * type of <i>e</i>
 */
Entity.prototype.dominatesType = function(e) {
    if(e === undefined || e === null) 
        return false;

    return Entity.Types[this.type] <= Entity.Types[e.type];
};

/**
 * Checks whether this Entity specification is more generic
 * than the entitiy specified in the parameter e. If this 
 * Entity has a larger scope the method returns true, false
 * otherwise.
 *
 * @param {Entity} e The Entity to compare against
 * @returns {boolean} True if <i>this</i> entity is more 
 * generic, i.e. dominates, the argument <i>e</i>
 */
Entity.prototype.dominates = function(e) {
    if(e === undefined || e === null) return false;

    // this entity specifies an id
    // the other one does not
    if(this.id !== undefined &&
       this.id != e.id) {
        return false;
    }

    // this entity specifies a type
    // and the type dominates the other
    if(this.type !== undefined &&
       !this.dominatesType(e)) {
        return false;
    }
    
    if(this.input != undefined &&
       this.input != e.input) {
        return false;
    } else if(this.output != undefined &&
              this.output != e.output) {
        return false;
    } else if(this.stream != undefined &&
              this.stream != e.stream) {
        return false;
    }
    return true;
};

/**
 * Transforms <i>this</i> lock into a JSON representation. 
 * 
 * @returns {String} the string representation of the lock
 */
Entity.prototype.toString = function() {
    var str = "{ ";
    var comma = "";
    
    for(var prop in this) {
        if(this.hasOwnProperty(prop) && this[prop] !== undefined) {
            str += comma;
            str += prop + " : " + this[prop];
            comma = ", ";
        }
    }
    
    str += " }";
    
    return str;
};

/**
 * @ignore
 */
Entity.prototype.compile2PolicyEval = function() {
    switch(this.type) {
    case 'var' : 
        return this.name;
    case 'const' :
        return (typeof(this.value) == "number") ? this.value : '"'+this.value+'"';
    default :
        throw new Error("Entity: Type '"+this.type+"' not supported for compile2PolciyEval");
    }
};

module.exports = Entity;
