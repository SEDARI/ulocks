var clone = require("clone");

function valid(o) {
    return ((o !== undefined) && (o !== null));
}

function Context(subject, object, message, isStatic) {
    this.isStatic = (isStatic == undefined || isStatic == null) ? false : isStatic;
    this.type = Context.types.normal;

    if(!valid(subject))
        throw new Error("Invalid context constructor!");

    // assume cloning of an existing object passed in first argument
    if(valid(subject) && !valid(object) && !valid(message) && !valid(isStatic)) {
        var c = subject;
        this.subject = {
            data : c.subject.data,
            type : c.subject.type
        };
        this.object = {
            data : c.object.data,
            type : c.object.type
        };

        if(valid(c.msg)) 
            this.msg = {
                data : c.msg,
                type : c.types
            };
        
        this.isStatic = c.isStatic;
        this.locks = clone(c.locks);
        
        this.setType(c.state);
    } else if(valid(object)) {
        this.subject = {
            data : subject.data,
            type : subject.type
        };

        this.object = {
            data : object.data,
            type : object.type
        };
        
        if(valid(message)) {
            this.msg = {
                data : clone(message),
                type : 'msg'
            };
        }
    } else {
        throw new Error("Invalid context constructor!");
    }
};

Context.types = {
    receiver : "receiver",
    sender   : "sender",
    msg      : "message",
    normal   : "normal"
};

Context.prototype.setType = function(type) {
    switch(type) {
    case Context.types.receiver:
        setReceiverContext();
        break;
    case Context.types.sender:
        setSenderContext();
        break;
    case Context.types.msg:
        setMsgContext();
        break;
    default:
        throw new Error("Context: Unable to set context type. Unknown type '"+type+"'");
    }
};

Context.prototype.setReceiverContext = function() {
    this.subject = this.receiver;
    this.object = this.msg;
    this.type = Context.types.receiver;
};

Context.prototype.setSenderContext = function() {
    this.subject = this.sender;
    this.object = this.msg;
    this.type = Context.types.sender;
};

Context.prototype.setMsgContext = function() {
    this.subject = this.msg;
    this.object = null;
    this.type = Context.types.msg;
};

Context.prototype.getLockState = function(lock, subject) {
    if(!lock)
        return undefined;

    if(!lock.path) 
        return undefined;

    if(lock.path == "closed")
        return false;

    if(!this.locks)
        return undefined;

    var key = "global";
    if(subject) {
        if(!subject.type)
            throw new Error("Context: Invalid subject format!");
        if(subject.type == "msg")
            key = "msg";
        else {
            if(!subject.data)
                return false;

            key = subject.type + subject.data.id;
        }
    }
    if(!this.locks[key]) 
        return undefined;
    
    var subjectContext = this.locks[key];

    if(subjectContext[lock.path] == undefined || subjectContext[lock.path] == null) {
        return undefined;
    } else {
        if(subjectContext[lock.path] === false || subjectContext[lock.path] === true) {
            return subjectContext[lock.path];
        }
    }
    
    var states = subjectContext[lock.path];
    
    if(!lock.args || lock.args.length == 0) {
        if(states === true || states === false)
            return states;
    }
    
    var strArg = "";
    for(var s in lock.args)
        strArg += lock.args[s] + ",";
    
    if(states[strArg] == undefined || states[strArg] == null)
        return undefined;
    else
        return states[strArg];
};

Context.prototype.addLockState = function(lock, subject, value) {
    if(!lock) 
        return;

    if(subject != undefined && (subject === false || subject === true) ) {
        value = subject;
        subject = null;
    }

    if(value == undefined || value == null)
        value = true;

    if(!this.locks) 
        this.locks = {};

    var key = "global";
    if(subject) {
        if(!subject.type)
            throw new Error("Context: Invalid subject format!");
        
        if(subject.type == "msg")
            key = "msg";
        else {
            if(!subject.data)
                return;

            key = subject.type + subject.data.id;
        }
    }
    if(!this.locks[key])
        this.locks[key] = {};

    var subjectContext = this.locks[key];
    
    if(subjectContext[lock.path] == undefined || subjectContext[lock.path] == null) {
        subjectContext[lock.path] = {};
    } else {
        if(subjectContext[lock.path] === false || subjectContext[lock.path] === true) {
            return;
        }
    }

    // this must be a lock without arguments
    if(!lock.args || lock.args.length == 0) {
        subjectContext[lock.path] = value;
        return;
    }

    var strArg = "";
    for(var s in lock.args)
        strArg += lock.args[s] + ",";

    var states = subjectContext[lock.path];
    if(states[strArg] == undefined || states[strArg] == null)
        states[strArg] = {};
        
    states[strArg] = value;
};

module.exports = Context;
