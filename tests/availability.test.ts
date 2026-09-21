import assert from "node:assert/strict";
import { test } from "node:test";
import {
  berlinNow,
  endingSoon,
  goOnlineStatus,
  mergeSlots,
  parseTime,
  slotAt,
  startingSoon,
  validateSlot,
  validateWeek,
  type Slot,
} from "../lib/availability";

const slot = (weekday: number, from: string, to: string): Slot => ({ weekday, startMinute: parseTime(from)!, endMinute: parseTime(to)! });

test("parses times", () => {
  assert.equal(parseTime("17:00"), 1020);
  assert.equal(parseTime("24:00"), 1440);
  assert.equal(parseTime("9:30"), 570);
  assert.equal(parseTime("25:00"), null);
  assert.equal(parseTime("12:75"), null);
  assert.equal(parseTime("noon"), null);
});

test("merges overlapping and touching slots, never across days", () => {
  const merged = mergeSlots([slot(1, "17:00", "20:00"), slot(1, "20:00", "22:00"), slot(1, "10:00", "12:00"), slot(2, "17:00", "19:00"), slot(1, "18:00", "21:00")]);
  assert.deepEqual(merged, [slot(1, "10:00", "12:00"), slot(1, "17:00", "22:00"), slot(2, "17:00", "19:00")]);
});

test("a single slot must be inside the daytime window and at least an hour", () => {
  assert.equal(validateSlot(slot(3, "17:00", "22:00")), null);
  assert.ok(validateSlot(slot(3, "05:00", "09:00")), "before 06:00");
  assert.ok(validateSlot(slot(3, "20:00", "20:30")), "under an hour");
  assert.ok(validateSlot({ weekday: 8, startMinute: 600, endMinute: 900 }), "no such weekday");
});

test("rejects more than 10 hours in one day", () => {
  assert.equal(validateWeek([slot(1, "08:00", "18:00")]), null, "exactly 10 h is allowed");
  assert.equal(validateWeek([slot(1, "08:00", "12:00"), slot(1, "13:00", "19:00")]), null, "4 h + 6 h = 10 h");
  assert.match(validateWeek([slot(1, "08:00", "12:00"), slot(1, "13:00", "19:30")])!, /at most 10 hours/);
});

test("enforces 11 hours of rest between days, including Sunday to Monday", () => {
  assert.equal(validateWeek([slot(1, "17:00", "22:00"), slot(2, "09:00", "12:00")]), null, "exactly 11 h is fine");
  assert.match(validateWeek([slot(1, "17:00", "23:00"), slot(2, "08:00", "12:00")])!, /Only 9 h rest between Monday/);
  assert.match(validateWeek([slot(7, "18:00", "24:00"), slot(1, "06:00", "10:00")])!, /Sunday .* Monday/);
  assert.match(validateWeek([slot(1, "17:00", "23:00"), slot(2, "08:00", "12:00")], "de")!, /Ruhezeit/);
});

test("finds the slot a moment falls in (end is exclusive)", () => {
  const slots = [slot(5, "17:00", "22:00")];
  assert.ok(slotAt(slots, 5, parseTime("17:00")!));
  assert.ok(slotAt(slots, 5, parseTime("21:59")!));
  assert.equal(slotAt(slots, 5, parseTime("22:00")!), undefined);
  assert.equal(slotAt(slots, 4, parseTime("18:00")!), undefined);
});

test("starting and ending soon windows", () => {
  const slots = [slot(5, "17:00", "22:00")];
  assert.equal(startingSoon(slots, { weekday: 5, minute: parseTime("16:30")! }, 60).length, 1);
  assert.equal(startingSoon(slots, { weekday: 5, minute: parseTime("15:00")! }, 60).length, 0);
  assert.equal(endingSoon(slots, { weekday: 5, minute: parseTime("21:40")! }, 30).length, 1);
  assert.equal(endingSoon(slots, { weekday: 5, minute: parseTime("18:00")! }, 30).length, 0);
});

test("Berlin time is used regardless of the server clock, across daylight saving", () => {
  // Friday 2026-07-10 20:30 UTC = 22:30 CEST (summer, UTC+2)
  assert.deepEqual(berlinNow(new Date("2026-07-10T20:30:00Z")), { weekday: 5, minute: 22 * 60 + 30 });
  // Friday 2026-01-09 20:30 UTC = 21:30 CET (winter, UTC+1)
  assert.deepEqual(berlinNow(new Date("2026-01-09T20:30:00Z")), { weekday: 5, minute: 21 * 60 + 30 });
  // late Sunday UTC is already Monday in Berlin
  assert.deepEqual(berlinNow(new Date("2026-07-12T22:30:00Z")), { weekday: 1, minute: 30 });
});

test("go-online needs an active, cleared rider inside their own slot", () => {
  const base = { active: true, clearedToRide: true, notClearedReasons: [], slots: [slot(5, "17:00", "22:00")] };
  const inside = { weekday: 5, minute: 18 * 60 };
  assert.deepEqual(goOnlineStatus(base, inside), { allowed: true, reasons: [] });
  assert.deepEqual(goOnlineStatus(base, { weekday: 5, minute: 23 * 60 }).reasons, ["Outside their availability"]);
  assert.deepEqual(goOnlineStatus({ ...base, slots: [] }, inside).reasons, ["No availability set"]);
  const blocked = goOnlineStatus({ ...base, clearedToRide: false, notClearedReasons: ["Residence permit expired"] }, inside);
  assert.equal(blocked.allowed, false);
  assert.deepEqual(blocked.reasons, ["Residence permit expired"]);
  assert.equal(goOnlineStatus({ ...base, active: false }, inside).allowed, false);
});
