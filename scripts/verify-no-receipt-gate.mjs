// Build-time guard for the owner-directed removal; runtime coverage lives in verify-effect-isolation.mjs.
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';

const root = new URL('../', import.meta.url);
function checkDirectory(path) {
  for (const entry of readdirSync(new URL(path, root), {withFileTypes: true})) {
    const file = path + '/' + entry.name;
    if (entry.isDirectory()) checkDirectory(file);
    else if (/\.(ts|tsx)$/.test(file) && !/\.(test|spec)\./.test(file)) {
      assert.doesNotMatch(readFileSync(new URL(file, root), 'utf8'), /receipt_conflict|blockingReceiptId|owner_inspection|conflictDetails|inspectReceipt|receipts\.(?:blocker|blocked|inspectionEpoch|inspect|unknownWork|unknownChat)\b|\/approvals\/:id\/inspection|Record target inspection/, file + ': removed receipt gate/workflow returned');
    }
  }
}
checkDirectory('apps/daemon/src');
checkDirectory('apps/desk/src');
const help = readFileSync(new URL('docs/help/approvals.md', root), 'utf8');
assert.ok(help.includes('There is no owner receipt-inspection workflow'));
assert.doesNotMatch(help, /Owner receipt inspection is required|Unknown blocks overlapping/);
console.log('PASS: receipt-conflict gate, inspection API/form and required-inspection guidance stay removed.');
