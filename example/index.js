var ulocks = require("../index.js");
var settings = require("./settings.js");

var Policy = ulocks.Policy;
var Context = ulocks.Context;

ulocks.init(settings)
    .then(function() {
        var admin = {
            id : "0",
            type : "/user",
            role : "admin"
        }

        var user = {
            id : "1",
            type : "/user",
            role : "student"
        }

        var object = {
            id : "100",
            type : "/sensor",
            owner : "0"
        }

        var userInfo = {
            type : user.type,
            data : user
        }

        var adminInfo = {
            type : admin.type,
            data : admin
        }

        var objectInfo = {
            type : object.type,
            data : object
        }

        var attrPolicy1 = new Policy([ { target : { type : "/any" } },
                                       { source : { type : "/user" }, locks : {
                                           "hasId": [ { lock : "hasId", args : [ "0" ] } ]
                                       }, actions: [ { name: "delete" } ] } ]);
        
        var attrPolicy2 = new Policy([ { target : { type : "/any" } },
                                       { source : { type : "/user" }, locks : {
                                           "hasId": [ { lock : "hasId", args : [ "1" ] } ]
                                       }}]);
        
        var userPolicy = new Policy([ { target : { type : "/any" } },
                                      { source : { type : "/any" } } ]);

        var adminPolicy = new Policy([ { target : { type : "/any" } },
                                      { source : { type : "/any" } } ]);

        var context = new Context(userInfo, objectInfo);
        var r = attrPolicy1.checkWrite(userPolicy, context);
        console.log("Write not allowed: " + !r.result);

        context = new Context(userInfo, objectInfo);
        r = attrPolicy2.checkWrite(userPolicy, context);
        console.log("Write allowed: " + r.result);

        context = new Context(adminInfo, objectInfo);
        r = attrPolicy1.checkWrite(adminPolicy, context);
        console.log("Write allowed: " + r.result);

        context = new Context(adminInfo, objectInfo);
        r = attrPolicy2.checkWrite(adminPolicy, context);
        console.log("Write not allowed: " + !r.result);
    })
    .catch(function(reason) {
        console.log(reason);
    });
