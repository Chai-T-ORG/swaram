import { runAllTests } from "./comprehensive-test-suite";

console.log("Starting SWARAM Comprehensive Test Suite...");
const start = Date.now();
const result = runAllTests();
const duration = Date.now() - start;

console.log("\n========================================");
console.log(`Execution Completed in ${duration}ms`);
console.log(`Total Tests Run : ${result.total}`);
console.log(`Passed Tests    : ${result.passed}`);
console.log(`Failed Tests    : ${result.failed}`);
console.log("========================================\n");

if (result.failures.length > 0) {
  console.error("Test Failures Encountered:");
  result.failures.forEach((f) => {
    console.error(`  [✗] ${f.name}\n      Reason: ${f.error}`);
  });
  process.exit(1);
} else {
  console.log("✓ All comprehensive tests passed successfully!");
  process.exit(0);
}
