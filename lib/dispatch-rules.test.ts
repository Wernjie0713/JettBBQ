import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clockLabel, describeRules, EMPTY_RULES, rulesSchema, toConstraints } from "./dispatch-rules.ts";

const ids = new Map([
  ["W1", "id-1"],
  ["W2", "id-2"],
  ["W3", "id-3"],
]);

describe("rulesSchema", () => {
  it("normalises order codes and accepts empty rules", () => {
    assert.deepEqual(rulesSchema.parse(EMPTY_RULES), EMPTY_RULES);
    const parsed = rulesSchema.parse({ ...EMPTY_RULES, firstStop: [" w1 "] });
    assert.deepEqual(parsed.firstStop, ["W1"]);
  });

  it("rejects bad times, tiny groups and silly numbers", () => {
    assert.equal(rulesSchema.safeParse({ ...EMPTY_RULES, deadlines: [{ order: "W1", by: "25:00" }] }).success, false);
    assert.equal(rulesSchema.safeParse({ ...EMPTY_RULES, sameRun: [["W1"]] }).success, false);
    assert.equal(rulesSchema.safeParse({ ...EMPTY_RULES, maxRuns: 0 }).success, false);
    assert.equal(rulesSchema.safeParse({ ...EMPTY_RULES, capacityOverride: 1000 }).success, false);
  });
});

describe("toConstraints", () => {
  it("maps codes to ids and Singapore wall-clock deadlines to UTC", () => {
    const { constraints, unknownCodes } = toConstraints(
      { ...EMPTY_RULES, deadlines: [{ order: "W1", by: "17:30" }], sameRun: [["W2", "W3"]], maxRuns: 12 },
      ids,
      "2025-12-24",
    );
    assert.deepEqual(unknownCodes, []);
    assert.deepEqual(constraints.deadlines, [{ orderId: "id-1", by: Date.UTC(2025, 11, 24, 9, 30) }]);
    assert.deepEqual(constraints.sameRun, [["id-2", "id-3"]]);
    assert.equal(constraints.maxRuns, 12);
    assert.equal(constraints.capacityOverride, undefined);
  });

  it("drops and reports orders that aren't in the slot", () => {
    const { constraints, unknownCodes } = toConstraints(
      { ...EMPTY_RULES, firstStop: ["W1", "X9"], separateRuns: [["W2", "X9"]] },
      ids,
      "2025-12-24",
    );
    assert.deepEqual(constraints.firstStop, ["id-1"]);
    assert.deepEqual(constraints.separateRuns, []); // one known order left: no longer a group
    assert.deepEqual(unknownCodes, ["X9"]);
  });
});

describe("labels", () => {
  it("formats 24h times and describes each rule", () => {
    assert.equal(clockLabel("00:05"), "12:05 AM");
    assert.equal(clockLabel("12:00"), "12:00 PM");
    assert.equal(clockLabel("17:30"), "5:30 PM");
    assert.deepEqual(describeRules({ ...EMPTY_RULES, lastStop: ["W2"], capacityOverride: 12 }), [
      "W2 last stop",
      "12 boxes per car",
    ]);
  });
});
