const { copyFileSync } = require("fs");
const { join } = require("path");

const compiledFiles = [
  "assistantActionPrompt.js",
  "index.js",
  "localTaxProfiles2025.js",
  "payrollTax2025.js",
  "taxCalcs.js",
  "taxProfiles2025.js",
  "workbookStore.js",
];

for (const file of compiledFiles) {
  copyFileSync(join(__dirname, file), join(__dirname, "src", file));
}
