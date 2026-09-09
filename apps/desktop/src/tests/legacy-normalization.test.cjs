const test = require("node:test");
const assert = require("node:assert/strict");
const { createLegacyNormalization } = require("../main/media/legacy-normalization.cjs");

test("successful retry normalization delegates through the injected job lifecycle boundary", () => {
  const jobs = [{ id: "retry", status: "review_required", resultAssetIds: ["video"] }];
  const calls = [];
  const normalization = createLegacyNormalization({
    getState: () => ({ jobs }),
    supersedeRetriedSourceJob: (job) => {
      calls.push(job.id);
      return true;
    }
  });

  assert.equal(normalization.normalizeSuccessfulRetryJobs(), 1);
  assert.deepEqual(calls, ["retry"]);
});
