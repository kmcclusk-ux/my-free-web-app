const assert = require("node:assert");
const { caTax2025Mfj } = require("./amplify/backend/function/helloWorld/taxCalcs.js");

console.log("--- Smoke check for CA tax logic ---");

try {
  assert.strictEqual(caTax2025Mfj(0), 0, "CA tax should be zero on zero income");

  const low = caTax2025Mfj(50000);
  const high = caTax2025Mfj(150000);
  assert.ok(low <= high, "CA tax should grow as taxable income increases");

  const progressive = caTax2025Mfj(49000) <= caTax2025Mfj(51000);
  assert.ok(progressive, "CA tax should be monotonic across a bracket boundary");

  console.log("✅ Smoke check passed: CA tax helper behaves as expected.");
} catch (error) {
  console.error("❌ Smoke check failed:", error.message);
  process.exit(1);
}
