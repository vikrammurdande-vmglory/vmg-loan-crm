import assert from 'node:assert/strict';
import {chooseDefaultReport} from './src/cibilUiData.js';

const approvedOld={id:'approved-old',accepted_final:true,accepted_at:'2026-10-01T10:00:00Z',created_at:'2026-10-01T09:00:00Z'};
const approvedNew={id:'approved-new',accepted_final:true,accepted_at:'2026-10-05T10:00:00Z',created_at:'2026-10-05T09:00:00Z'};
const latestPending={id:'pending-new',accepted_final:false,created_at:'2026-10-06T08:00:00Z'};
assert.equal(chooseDefaultReport([latestPending,approvedOld,approvedNew]).id,'approved-new');
assert.equal(chooseDefaultReport([latestPending,{id:'pending-old',accepted_final:false,created_at:'2026-10-05T08:00:00Z'}]).id,'pending-new');
assert.equal(chooseDefaultReport([]),null);

console.log('PASS: Approved report takes priority over all pending uploads');
console.log('PASS: Without an approved report, latest uploaded report is selected');
console.log('PASS: UI selection helper returns stored report identity without financial fallback');
