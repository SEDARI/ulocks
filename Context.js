"use strict";

var clone = require('clone');

function valid(o) {
    return ((o !== undefined) && (o !== null));
}

/**
 * Constructs or copies a context, required for the evaluation of policies, in particular of locks.
 * <b>NOTE:</b> All arguments below which are of type Object, are required to have the following format
 * <pre>
 *   { data: "The meta data describing the entity. This data
 *            will be used during lock evaluation.",
 *     type: "The type of the entity specified in the
 *            entity settings passed to the initialization
 *            of the ulocks module"
 *   }
 * </pre>
 *
 * @param {Object|Context} context If only <code>context</code> is defined during the constructor call, the constructor
 * has the semantics of a copy constructor and copies the Context provided in this argument into a newly
 * constructed Context instance. In all other cases, it is the actual sender or subject of an access operation or of
 * a flow considered in the policy evaluation.
 * @param {Object} [receiver] Is the object of an access operation or the target where data should flow.
 * @param {Object} [message] The <code>message</code> or data flowing from sender to the object. Can only be specified if object is
 * also specified correctly.
 * @param {isStatic} [isStatic] Specifies whether evaluation should take place during static analysis
 * (<code>false</code>) or during dynamic analysis. Default is <code>false</code>
 * @class
 * @classdesc To evaluate them, locks in the Usage Locks framework may require attributes of any entity. Thus, a
 * lock must be put into a context when it is evaluated describing which view is taken in the evaluation. In general,
 * we assume that a <i>message</i> (or data) flows from a <i>sender</i> to a <i>receiver</i>. In this scenario, a lock
 * may evaluate attributes of the sender, the receiver, or the message itself to compute control flow decisions. In this
 * class we store the entity to be evaluated into <i>entity</i>. It is filled according to the view the context is in (changed
 * with the appropriate <code>set*Context</code> methods. In case, the lock requires more information, it can still use the
 * <code>sender</code>, <code>receiver</code>, <code>msg</code> members of this class.
 */
function Context(context, receiver, message, isStatic) {
    /**
     * Indicates whether this context is used for static analysis or in
     * a regular runtime environment.
     * @default false
     */
    this.isStatic = valid(isStatic) ? isStatic : false;
    /**
     * Specifies the type of context. Changed by using the methods <code>set*Context</code>.
     * @default Context.Types.normal
     */
    this.type = Context.Types.normal;
    /**
     * Object used during lock evaluation. Must have the general format <pre>
     * {
     *   data: "The JSON description of the object",
     *   type: "The type of the entity specified in the configuration"
     * }
     * </pre>
     */
    this.entity = undefined;
    /**
     * Contains the message object description of a message/data
     * (similar to the entity opject) if the context is a message context
     */
    this.msg = undefined;
    /**
     * Stores the current state of all locks in this context.
     */
    this.locks = undefined;

    // if(!valid(context))
    //    throw new Error("Invalid number or type of arguments passed to Context constructor!");

    if(!valid(context) && !valid(receiver) && !valid(message) && !valid(isStatic))
        return;

    // assume cloning of an existing object passed in first argument
    if(!valid(receiver) && !valid(message) && !valid(isStatic)) {
        var c = context;
        this.sender = {
            data : c.sender.data,
            type : c.sender.type
        };
        this.receiver = {
            data : c.receiver.data,
            type : c.receiver.type
        };

        this.entity = context.entity ? ((context.entity == context.receiver) ? this.receiver : this.sender) : undefined;

        if(valid(c.msg))
            this.msg = {
                data : c.msg,
                type : c.types
            };

        if(valid(c.isStatic))
            this.isStatic = c.isStatic;

        if(valid(c.locks))
            this.locks = clone(c.locks);

        if(valid(c.type))
            this.setType(c.type);
        else
            this.setType(Context.Types.normal);

    } else if(valid(receiver)) {
        this.sender = {
            data : context.data,
            type : context.type
        };

        this.receiver = {
            data : receiver.data,
            type : receiver.type
        };

        if(valid(message)) {
            this.msg = {
                data : clone(message),
                type : 'msg'
            };
        }

        this.setType(Context.Types.normal);
    } else
        throw new Error("Invalid number or type of arguments passed to Context constructor!");
};

// TODO: Can be changed from the outside. Must be protected!
/**
 * A context can have the following four types: <code>receiver</code>, <code>sender</code>, <code>message</code>, and <code>normal</code>.
 * Through the <code>set*Context</code> these contexts are mapped to the classical subject and object entities.
 * These mapping are enumerated below. They use the term <code>message</code> for data flowing.
 *
 * <ul>
 *   <li>In <b>receiver</b> context the receiver is the subject and the message is the object. </li>
 *   <li>In <b>sender</b> context the sender is the subject and the message is the object. </li>
 *   <li>In <b>message</b> context the message is the subject and object itself. This context is for evaluating
 *   locks specifically specified on the data itself</li>
 *   <li>In <b>normal</b> context the
 * </ul>
 * @static
 * @constant
 */
Context.Types = Object.freeze({
    receiver : "receiver",
    sender   : "sender",
    msg      : "message",
    normal   : "normal"
});

// TODO: check whether this can be removed
Context.prototype.setType = function(type) {
    switch(type) {
    case Context.Types.receiver:
        this.setReceiverContext();
        break;
    case Context.Types.sender:
        this.setSenderContext();
        break;
    case Context.Types.msg:
        this.setMsgContext();
        break;
    case Context.Types.normal:
        this.setNormalContext();
        break;
    default:
        throw new Error("Context: Unable to set context type. Unknown type '"+type+"'");
    }
};

Context.prototype.getOtherEntity = function() {
    switch(this.type) {
    case Context.Types.normal:
    case Context.Types.sender:
        return this.receiver;
    case Context.Types.receiver:
        return this.sender;
    case Context.Types.msg:
        return null;
    }
}

/** Puts the context into normal view  */
Context.prototype.setNormalContext = function() {
    this.entity = this.sender;
    this.type = Context.Types.normal;
};

/** Puts the context into receiver view  */
Context.prototype.setReceiverContext = function() {
    this.entity = this.receiver;
    this.type = Context.Types.receiver;
};

/** Puts the context into sender view  */
Context.prototype.setSenderContext = function() {
    this.entity = this.sender;
    this.type = Context.Types.sender;
};

/** Puts the context into message view  */
Context.prototype.setMsgContext = function() {
    this.entity = this.msg;
    this.type = Context.Types.msg;
};

// TODO: review chaching functionality
Context.prototype.getLockState = function(lock, subject) {
    if(!valid(lock) || !valid(lock.lock) || !valid(this.locks))
        return undefined;

    if(lock.lock == "closed")
        return false;

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

// TODO: review chaching functionality
Context.prototype.addLockState = function(lock, subject, value) {
    if(!valid(lock))
        return;

    if(subject != undefined && (subject === false || subject === true) ) {
        value = subject;
        subject = null;
    }

    if(!valid(value))
        value = true;

    if(!valid(this.locks))
        this.locks = {};

    var key = "global";
    if(subject) {
        if(!valid(subject.type))
            throw new Error("Context: Invalid subject format!");

        if(subject.type == "msg")
            key = "msg";
        else {
            if(!valid(subject.data))
                return;

            key = subject.type + subject.data.id;
        }
    }
    if(!valid(this.locks[key]))
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
    if(!valid(lock.args) || lock.args.length == 0) {
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
