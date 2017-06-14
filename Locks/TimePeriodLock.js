var w = require('winston');
w.level = process.env.LOG_LEVEL;

module.exports = function(Lock) {
    "use strict";

    var TimePeriodLock = function(lock) {
        // call the super class constructor
        Lock.call(this, lock);
    };

    Lock.registerLock("inTimePeriod", TimePeriodLock);

    TimePeriodLock.prototype = Object.create(Lock.prototype);

    TimePeriodLock.prototype.copy = function() {
        var c = Lock.createLock(this);
        return c;
    };

    TimePeriodLock.prototype.le = function(other) {
        if(!(other instanceof TimePeriodLock))
            return false;

        if(this.eq(other))
            return true;

        var split = this.args[0].split(":");
        var tFrom = split[0] * 60 + split[1] * 1;
        split = this.args[1].split(":");
        var tTo = split[0] * 60 + split[1] * 1;
        split = other.args[0].split(":");
        var oFrom = split[0] * 60 + split[1] * 1;
        split = other.args[1].split(":");
        var oTo = split[0] * 60 + split[1] * 1;

        var thisNot = this.not;
        var otherNot = other.not;

        if(tTo < tFrom) {
            thisNot = !thisNot;
            var tmp = tTo;
            tTo = tFrom;
            tFrom = tmp;
        }

        if(oTo < oFrom) {
            otherNot = !otherNot
            var tmp = oTo;
            oTo = oFrom;
            oFrom = tmp;
        }

        /* console.log("this from: " + (tFrom/60)+":"+(tFrom%60));
        console.log("this to: "+(tTo/60)+":"+(tTo%60));
        console.log("other from: " + oFrom);
        console.log("other to: " + oTo);*/

        if(thisNot === true)
            if(otherNot === true) {
                if(tFrom >= oFrom && tTo <= oTo)
                    return true;
                else
                    return false;
            } else {
                if(tTo < oFrom || tFrom > oTo)
                    return true;
                else
                    return false;
            }
        else
            if(otherNot === true) {
                return false;
            } else {
                // this can only be smaller if it contains the other
                if(tFrom <= oFrom && tTo >= oTo)
                    return true;
                else
                    return false;
            }
    };

    TimePeriodLock.prototype.isOpen = function(context, scope) {
        var self = this;
        return new Promise(function(resolve, reject) {
            if(context === undefined || context === null)
                reject(new Error("No valid context available during evaluation of '"+self.lock+"' lock"));

            if(!context.isStatic) {
                    var currentDate = new Date();
                    var hours = currentDate.getHours();
                    var mins = currentDate.getMinutes();

                    var currentTime = hours < 10 ? '0' + hours : '' + hours;
                    currentTime += ":" + (mins < 10 ? '0' + mins : '' + mins);

                    // TODO: self.args[0] should contain the time provider
                    // we ignore it for now and take the local one
                    if((self.args[0] <= currentTime &&
                        self.args[1] >= currentTime && !self.not) ||
                       ((self.args[0] > currentTime ||
                         self.args[1] < currentTime) && self.not)) {
                        resolve({ open: true, cond: false });
                    } else {
                        resolve({ open: false, cond: false, lock: self });
		    }
                } else {
                    resolve({ open: true, cond: true, lock: self });
                }
        });
    }

    TimePeriodLock.prototype.lub = function(lock) {
        if(!(lock instanceof TimePeriodLock))
            return null;
        // throw new Error("TimerPeriodLock: Error: Cannot generate LUB between different lock types");

        var sstart1 = this.args[0]+"", send1 = this.args[1]+"";
        var sstart2 = lock.args[0]+"", send2 = lock.args[1]+"";
        var newStart = 0;
        var newEnd = 0;

        var splitStart1 = sstart1.split(":");
        var start1 = splitStart1[0] * 100 + splitStart1[1]*1;
        var splitStart2 = sstart2.split(":");
        var start2 = splitStart2[0] * 100 + splitStart2[1]*1;
        var splitEnd1 = send1.split(":");
        var end1 = splitEnd1[0] * 100 + splitEnd1[1]*1;
        var splitEnd2 = send2.split(":");
        var end2 = splitEnd2[0] * 100 + splitEnd2[1]*1;

        // console.log("s1: %j, e1: %j, s2: %j, s3: %j", start1, end1, start2, end2);

        if(start1 > end1)
            start1 = start1 - 2400;

        if(start2 > end2)
            start2 = start2 - 2400;

        // check whether intervals overlap
        if(start2 >= end1) {
            return Lock.closedLock();
        } else {
            if(start1 < start2) {
                newStart = start2;
            } else {
                newStart = start1;
            }

            if(end1 > end2) {
                newEnd = end2;
            } else {
                newEnd = end1;
            }
        }

        // console.log("ns: %j, ne: %j", newStart, newEnd);

        if(newStart >= newEnd)
            return Lock.closedLock();

        if(newStart < 0)
            newStart = newStart + 2400;

        if(newEnd < 0)
            newEnd = newEnd + 2400;

        var hours = Math.floor(newStart / 100);
        hours = (hours < 10 ? "0" + hours : hours);
        var minutes = newStart % 100;
        minutes = (minutes < 10) ? "0" + minutes : minutes;
        // console.log("hours: "+hours);
        var snewStart = hours + ":" + minutes;

        hours = Math.floor(newEnd / 100);
        hours = (hours < 10 ? "0" + hours : hours);
        minutes = newEnd % 100;
        minutes = (minutes < 10) ? "0" + minutes : minutes;
        var snewEnd = hours + ":" + minutes;

        // console.log("snewStart: %j, snewEnd: %j", snewStart, snewEnd);

        var newl = new TimePeriodLock({ path : 'inTimePeriod', args : [ snewStart, snewEnd] });
        // console.log("newl: ", newl);
        return newl;
    };

    TimePeriodLock.prototype.conflictDescription = function(isStatic) {
        var str = "";
        str = "only allowed in the time from "+this.args[0]+" to "+this.args[1];
        return str;
    };
};

