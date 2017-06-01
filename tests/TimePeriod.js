var chai = require('chai');
var expect = chai.expect;

var ULocks = require("../index.js");
var Lock = ULocks.Lock;

var settings = require("./settings.js");

describe("TimePeriodLock", function() {    
    describe("le comparison", function() {
	it("l2 contained in l1", function() {
	    var l1 = Lock.createLock({ lock : "inTimePeriod", args : [ "08:00", "11:00" ] });
	    var l2 = Lock.createLock({ lock : "inTimePeriod", args : [ "09:00", "10:00" ] });

	    expect(l1.le(l2)).to.equal(true);
	    expect(l2.le(l1)).to.equal(false);
	});
	
	it("l1 not contained in l2 and not overlapping", function() {
	    var l1 = Lock.createLock({ lock : "inTimePeriod", args : [ "08:00", "11:00" ] });
	    var l2 = Lock.createLock({ lock : "inTimePeriod", args : [ "12:00", "13:00" ] });

	    expect(l1.le(l2)).to.equal(false);
	    expect(l2.le(l1)).to.equal(false);
	});

	it("l2 overlapping on right with l1", function() {
	    var l1 = Lock.createLock({ lock : "inTimePeriod", args : [ "08:00", "11:00" ] });
	    var l2 = Lock.createLock({ lock : "inTimePeriod", args : [ "10:00", "13:00" ] });

	    expect(l1.le(l2)).to.equal(false);
	    expect(l2.le(l1)).to.equal(false);
	});

	it("l2 overlapping on left with l1", function() {
	    var l1 = Lock.createLock({ lock : "inTimePeriod", args : [ "08:00", "11:00" ] });
	    var l2 = Lock.createLock({ lock : "inTimePeriod", args : [ "06:00", "09:00" ] });

	    expect(l1.le(l2)).to.equal(false);
	    expect(l2.le(l1)).to.equal(false);
	});

	it("not l1 not containing l2", function() {
	    var l1 = Lock.createLock({ lock : "inTimePeriod", args : [ "08:00", "11:00" ], not: true });
	    var l2 = Lock.createLock({ lock : "inTimePeriod", args : [ "09:00", "10:00" ] });

	    expect(l1.le(l2)).to.equal(false);
	    expect(l2.le(l1)).to.equal(false);
	});
	
	it("not l1 containing l2", function() {
	    var l1 = Lock.createLock({ lock : "inTimePeriod", args : [ "08:00", "11:00" ], not: true });
	    var l2 = Lock.createLock({ lock : "inTimePeriod", args : [ "12:00", "13:00" ] });

	    expect(l1.le(l2)).to.be.equal(true);
	    expect(l2.le(l1)).to.be.equal(false);
	});

	it("not l1 overlapping with l2 on right of l1", function() {
	    var l1 = Lock.createLock({ lock : "inTimePeriod", args : [ "08:00", "11:00" ], not: true });
	    var l2 = Lock.createLock({ lock : "inTimePeriod", args : [ "10:00", "13:00" ] });

	    expect(l1.le(l2)).to.be.equal(false);
	    expect(l2.le(l1)).to.be.equal(false);
	});

	it("not l1 overlapping with l2 on left with l1", function() {
	    var l1 = Lock.createLock({ lock : "inTimePeriod", args : [ "08:00", "11:00" ], not: true });
	    var l2 = Lock.createLock({ lock : "inTimePeriod", args : [ "06:00", "09:00" ] });

	    expect(l1.le(l2)).to.be.equal(false);
	    expect(l2.le(l1)).to.be.equal(false);
	});

	it("not l1 containing not l2", function() {
	    var l1 = Lock.createLock({ lock : "inTimePeriod", args : [ "08:00", "11:00" ], not: true });
	    var l2 = Lock.createLock({ lock : "inTimePeriod", args : [ "07:00", "12:00" ], not: true });

	    expect(l1.le(l2)).to.be.equal(true);
	    expect(l2.le(l1)).to.be.equal(false);
	});

	it("l2 contained in wrapped l1", function() {
	    var l1 = Lock.createLock({ lock : "inTimePeriod", args : [ "18:00", "11:00" ] });
	    var l2 = Lock.createLock({ lock : "inTimePeriod", args : [ "09:00", "10:00" ] });

	    expect(l1.le(l2)).to.equal(true);
	    expect(l2.le(l1)).to.equal(false);
	});
	
	it("l1 not contained in wrapped l2 and not overlapping", function() {
	    var l1 = Lock.createLock({ lock : "inTimePeriod", args : [ "08:00", "11:00" ] });
	    var l2 = Lock.createLock({ lock : "inTimePeriod", args : [ "13:00", "07:00" ] });

	    expect(l1.le(l2)).to.equal(false);
	    expect(l2.le(l1)).to.equal(false);
	});

	it("wrapped l2 overlapping on right with l1", function() {
	    var l1 = Lock.createLock({ lock : "inTimePeriod", args : [ "08:00", "11:00" ] });
	    var l2 = Lock.createLock({ lock : "inTimePeriod", args : [ "10:00", "07:00" ] });

	    expect(l1.le(l2)).to.equal(false);
	    expect(l2.le(l1)).to.equal(false);
	});

	it("wrapped l2 overlapping on left with l1", function() {
	    var l1 = Lock.createLock({ lock : "inTimePeriod", args : [ "08:00", "11:00" ] });
	    var l2 = Lock.createLock({ lock : "inTimePeriod", args : [ "06:00", "09:00" ] });

	    expect(l1.le(l2)).to.equal(false);
	    expect(l2.le(l1)).to.equal(false);
	});
    });
});
	    
