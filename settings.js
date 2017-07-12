module.exports = {
    entityTypes: {
        "/any"    :  0,
        "/group"  :  1,
        "/user"   :  2,
        "/sensor" :  3,
        "/client" :  4,
        "/msg"    :  5,
        "/api"    :  5,
        "/const"  :  6,
        "/attr"   :  6,
        "/prop"   :  6,
        "/var"    :  6,
    },
    opTypes: {
        flowFrom: 0,
        flowTo: 1,
        write: 0,
        read: 1,
        execute: 0,
        create: 0,
        delete: 0
    },
    locks: "./Locks/",
    actions: "./Actions/"
};
