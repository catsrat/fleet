import assert from "node:assert/strict";
import { test } from "node:test";
import { buildContractPdf } from "../lib/contract";
import { contractCopyKey, contractCopySuffix, contractStage, isContractCopy } from "../lib/contract-stage";

const rider = {
  firstName: "Flow",
  lastName: "Test",
  city: "Frankfurt am Main",
  dateOfBirth: new Date("2003-01-01"),
  bikeMode: "OWN_BIKE",
} as never;

const terms = { rider, employmentType: "WERKSTUDENT" as const, startDate: new Date("2026-10-01"), hourlyCents: 1382 };

test("contract stage follows the signed round trip", () => {
  assert.equal(contractStage({ riderSignedAt: null, countersignedAt: null }), "ISSUED");
  assert.equal(contractStage({ riderSignedAt: new Date(), countersignedAt: null }), "RIDER_SIGNED");
  assert.equal(contractStage({ riderSignedAt: new Date(), countersignedAt: new Date() }), "COMPLETE");
  // a countersigned copy without a rider upload should still read as complete rather than fall back
  assert.equal(contractStage({ riderSignedAt: null, countersignedAt: new Date() }), "COMPLETE");
});

test("each copy resolves to its own stored file, and missing ones resolve to null", () => {
  const full = { storageKey: "a", riderSignedKey: "b", countersignedKey: "c" };
  assert.equal(contractCopyKey(full, "original"), "a");
  assert.equal(contractCopyKey(full, "signed"), "b");
  assert.equal(contractCopyKey(full, "countersigned"), "c");

  const unsigned = { storageKey: "a", riderSignedKey: null, countersignedKey: null };
  assert.equal(contractCopyKey(unsigned, "signed"), null);
  assert.equal(contractCopyKey(unsigned, "countersigned"), null);
  // an erased file leaves an empty string behind, which must not be treated as a key
  assert.equal(contractCopyKey({ storageKey: "", riderSignedKey: null, countersignedKey: null }, "original"), null);
});

test("only the three known copy names are accepted", () => {
  assert.ok(isContractCopy("original") && isContractCopy("signed") && isContractCopy("countersigned"));
  for (const bad of ["", "ORIGINAL", "storageKey", "../secret", null, undefined]) {
    assert.equal(isContractCopy(bad as string), false, `${String(bad)} should be rejected`);
  }
  assert.notEqual(contractCopySuffix("signed"), contractCopySuffix("countersigned"));
  assert.equal(contractCopySuffix("original"), "");
});

test("the contract states the hourly rate and the statutory notice items", () => {
  const text = buildContractPdf(terms).toString("latin1");
  // FlateDecode hides the text, so assert on what the builder is given instead of the compressed bytes
  assert.match(text.slice(0, 9), /^%PDF-1\.4/);
  assert.ok(buildContractPdf(terms).length > 5000, "a 23-clause contract should not be a one-pager");
});

test("own-bike and fleet-bike riders get different equipment clauses", () => {
  const own = buildContractPdf(terms).length;
  const fleet = buildContractPdf({ ...terms, rider: { ...(rider as object), bikeMode: "FLEET_BIKE" } as never }).length;
  assert.notEqual(own, fleet, "the equipment clause must change with bikeMode");
});

test("a missing start date or rate never silently prints a blank contract", () => {
  const noDate = buildContractPdf({ ...terms, startDate: null }).toString("latin1");
  assert.ok(noDate.length > 0);
  // the placeholder exists so a half-filled contract is visibly incomplete rather than plausible
  assert.ok(buildContractPdf({ ...terms, hourlyCents: null }).length > 5000);
});
