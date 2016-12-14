var lockArgTypes = {
    user      : "user",
    group     : "group",
    time      : "time",
    value     : "value",
    id        : "id",
    encAlg    : "encryption algorithm",
    intAlg    : "integrity algorithm",
    filterAlg : "filter algorithm",
    domain    : "domain",
    type      : "type",
    role      : "role in group",
    attr      : "attribute in group",
    entity    : "entity",
    msg       : "message",
    context   : "context"
};

var PolicyConfig = {
    rootDir : "",

    lockArgTypes : lockArgTypes,

    idmUserRoles : {
        admin           : "Admin",
        developer       : "Developer",
        serviceProvider : "Service Provider",
        objectProvider  : "Object Provider"
    },

    encAlg : {
        any        : "any",
        aes128     : "AES-128",
        aes192     : "AES-192",
        aes256     : "AES-256",
        tripledes  : "3DES",
        rsa        : "RSA",
        ecc        : "ECC"
    },

    filterAlg : {
        nojs     : "esacape JS",
        nohtml   : "escape HTML",
        nosql    : "no SQL",
        nobinary : "no binary data"
    },

    intAlg : {
        any          : "any",
        dsa_sha128   : "DSA SHA-128",
        dsa_sha256   : "DSA SHA-256",
        dsa_sha512   : "DSA SHA-512",
        ecdsa_sha128 : "ECDSA SHA-128",
        ecdsa_sha256 : "ECDSA SHA-256",
        ecdsa_sha512 : "ECDSA SHA-512",
        rsa_sha128   : "RSA SHA-128",
        rsa_sha256   : "RSA SHA-256",
        rsa_sha512   : "RSA SHA-512"
    },

    locks : {
        "actsFor" : {
            scopes : [ "node", "app", "so" ],
            arity : 1, 
            file : "ActsForLock.js",
            description : "This lock is open iff the user defined in this lock is acting for the entity to which the lock is applied",
            name : "acts for",
            args : [
                lockArgTypes.user
            ]
        },
        "isAuthenticated" : {
            scopes : [ "user" ],
            arity : 0,
            file : "IsAuthenticated.js",
            description : "This lock is open iff the user using the workflow has been authenticated before the lock is applied.",
            name : "is authenticated",
        },
        "hasId" : {
            scopes : [ "node", "app", "so", "user" ],
            arity : 1,
            file : "HasIDLock.js",
            description : "This lock is open iff the entity to which this lock is applied to has the specified ID.",
            name : "has ID",
            args : [
                lockArgTypes.id
            ]
        },
        "isInGroup" : {
            scopes : [ "node", "app", "so", "user" ],
            arity : 1,
            file : "IsInGroupLock.js",
            description : "This lock is open iff the entity to which this lock is applied to is an approved member of the specified group.",
            name : "is in group",
            args : [
                lockArgTypes.group
            ]
        },
        "hasRole" : {
            scopes : [ "user" ],
            arity : 1,
            file : "HasRoleLock.js",
            description : "This lock is open iff the user to which this lock is applied to has the specified role in the specified group.",
            name : "has role",
            args : [
                lockArgTypes.group,
                lockArgTypes.role
            ]
        },
        "isOwner" : {
            scopes : [ "user" ],
            arity : 1,
            file : "IsOwnerLock.js",
            description : "This lock is open iff the user to which this lock is applied to is the owner of the entity with the specified ID.",
            name : "owns",
            args : [
                lockArgTypes.id
            ]
        },
        "isOwnedBy" : {
            scopes : [ "node", "app", "so", "msg" ],
            arity : 1,
            file : "IsOwnedByLock.js",
            description : "This lock is open iff the entity to which this lock is applied to is owned by the specified user.",
            name : "is owned by",
            args : [
                lockArgTypes.user
            ]
        },
        "hasAttr" : {
            scopes : [ "node", "app", "so", "user" ],
            arity : 2,
            file : "HasAttributeLock.js",
            description : "This lock is open iff the entity to which this lock is applied to is tagged with the specified attibute which was defined in the specified group.",
            name : "has attr",
            args : [
                lockArgTypes.group,
                lockArgTypes.attr
            ]
        },
        "attrIsLt": {
            scopes : [ "node", "app", "so", "user" ],
            arity : 3,
            file : "AttributeIsLtLock.js",
            description : "This lock is open iff the entity to which this lock is applied to is tagged with the specified attibute which was defined in the specified group and whose value is lower than the specified value.",
            name : "attr is lt",
            args : [
                lockArgTypes.group,
                lockArgTypes.attr,
                lockArgTypes.value
            ]
        },
        "attrIsGt": {
            scopes : [ "node", "app", "so", "user" ],
            arity : 3,
            file : "AttrIsGtLock.js",
            description : "This lock is open iff the entity to which this lock is applied to is tagged with the specified attibute which was defined in the specified group and whose value is greater than the specified value.",
            name : "attr is gt",
            args : [
                lockArgTypes.group,
                lockArgTypes.attr,
                lockArgTypes.value
            ]
        },
        "attrIsEq": {
            scopes : [ "node", "app", "so", "user" ],
            arity : 3,
            file : "AttrIsEqLock.js",
            description : "This lock is open iff the entity to which this lock is applied to is tagged with the specified attibute which was defined in the specified group and whose value is equal to the specified value.",
            name : "attr is eq",
            args : [
                lockArgTypes.group,
                lockArgTypes.attr,
                lockArgTypes.value
            ]
        },
        "repIsLt": {
            scopes : [ "node", "app", "so", "user" ],
            arity : 1,
            file : "RepIsLtLock.js",
            description : "This lock is open iff the entity to which this lock is applied to has a system reputation value lower than the specified value.",
            name : "reputation is lt",
            args : [
                lockArgTypes.value
            ]
        },
        "repIsGt": {
            scopes : [ "node", "app", "so", "user" ],
            arity : 1,
            file : "RepIsGtLock.js",
            description : "This lock is open iff the entity to which this lock is applied to has a system reputation value greater than the specified value.",
            name : "reputation is gt",
            args : [
                lockArgTypes.value
            ]
        },
        "processedByEntity" : {
            scopes : [ "msg" ],
            arity : 1,
            file : "ProcessedByEntityLocks.js",
            description : "This lock is open iff the message to which this lock is applied to has been processed by an entity with the specified ID.",
            name : "was processed by entity",
            args : [
                lockArgTypes.id
            ]
        },
        "processedByType" : {
            scopes : [ "msg" ],
            arity : 1,
            file : "ProcessedByTypeLocks.js",
            description : "This lock is open iff the message to which this lock is applied to has been processed by an entity with the specified type.",
            name : "was processed by entity of type",
            args : [
                lockArgTypes.type
            ]
        },
        "modifiedByEntity" : {
            scopes : [ "msg" ],
            arity : 1,
            file : "ModifiedByEntityLock.js",
            description : "This lock is open iff the message to which this lock is applied to has been modified by an entity with the specified ID.",
            name : "was modified by entity",
            args : [
                lockArgTypes.id
            ]
        },
        "modifiedByType" : {
            scopes : [ "msg" ],
            arity : 1,
            file : "ModifiedByTypeLock.js",
            description : "This lock is open iff the message to which this lock is applied to has been modified by an entity with the specified type.",
            name : "was modified by entity of type",
            args : [
                lockArgTypes.type
            ]
        },
        "originatesFrom" : {
            scopes : [ "msg" ],
            arity : 1,
            file : "OriginatesFromLock.js",
            description : "This lock is open iff the message to which this lock is applied to has been generated by an entity with the specified ID.",
            name : "originates from",
            args : [
                lockArgTypes.id
            ]
        },
        "isEncrypted" : {
            scopes : [ "msg" ],
            arity : 2,
            file : "IsEncrypted.js",
            description : "This lock is open iff the message to which this lock is applied to has been encrypted for the specified user using the specified algorithm.",
            name : "encrypted for",
            args : [
                lockArgTypes.user,
                lockArgTypes.encAlg
            ]
        },
        "hasIntegrity" : {
            scopes : [ "msg" ],
            arity : 2,
            file : "HasIntegrity.js",
            description : "This lock is open iff the integrity of the message to which this lock is applied to has been protected by the specified user with the specified algorithm.",
            name : "has integrity of",
            args : [
                lockArgTypes.user,
                lockArgTypes.intAlg
            ]
        },
        "isFiltered" : {
            scopes : [ "msg" ],
            arity : 1,
            file : "IsFiltered.js",
            description : "This lock is open iff the message to which this lock is applied to has been filtered by the specified filter algorithm.",
            name : "was filtered by",
            args : [
                lockArgTypes.filterAlg
            ]
        },
        "srcRepIsLt": {
            scopes : [ "msg" ],
            arity : 1,
            file : "SrcRepIsLtLock.js",
            description : "This lock is open iff all origins generating the message to which this lock is applied to have a reputation which is lower than the specified reputation.",
            name : "source has reputation lt",
            args : [
                lockArgTypes.value
            ]
        },
        "srcRepIsGt": {
            scopes : [ "msg" ],
            arity : 1,
            file : "SrcRepIsGtLock.js",
            description : "This lock is open iff all origins generating the message to which this lock is applied to have a reputation which is greater than the specified reputation.",
            name : "source has reputation gt",
            args : [
                lockArgTypes.value
            ]
        },
        "inTimePeriod" : {
            scopes : [ "msg", "user", "so", "app", "node" ],
            arity : 2,
            file : "InTimePeriodLock.js",
            description : "This lock is open iff the current time of the system is within the specified time interval.",
            name : "time is in interval",
            args : [
                lockArgTypes.time,
                lockArgTypes.time
            ]
        },
        "inLegalDomain" : {
            scopes : [ "msg", "user", "so", "app", "node" ],
            arity : 1,
            file : "InLegalDomain.js",
            description : "This lock is open iff the entity to which this lock is applied to is stored in a device which is physically located in the specified legal domain.",
            name : "execution takes place in",
            args : [
                lockArgTypes.domain
            ]
        }
    }
}

module.exports = PolicyConfig;
