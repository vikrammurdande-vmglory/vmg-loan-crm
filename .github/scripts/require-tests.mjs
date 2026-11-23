import { execFileSync } from 'node:child_process';

const base = process.env.BASE_SHA;
const head = process.env.HEAD_SHA;
if (!/^[0-9a-f]{40}$/.test(base || '') || !/^[0-9a-f]{40}$/.test(head || '')) {
  console.error('Missing trusted PR base/head commits. Fail closed.');
  process.exit(1);
}
const changed = execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMR', base, head], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
const logic = new RegExp("^(backend/src/.*\\.(js|mjs|ts)|frontend/src/.*\\.(js|jsx|mjs|ts|tsx)|database/.*\\.sql)$");
const tests = new RegExp("^(backend/test/.*\\.(js|mjs)|frontend/.*(test|spec).*(js|mjs|jsx|ts|tsx))$");
const changedLogic = changed.filter(path => logic.test(path) && !tests.test(path));
const changedTests = changed.filter(path => tests.test(path));
if (changedLogic.length && !changedTests.length) {
  console.error('Application logic changed without adding/updating an automated test.');
  console.error('Changed logic:\n' + changedLogic.join('\n'));
  console.error('Add meaningful test coverage before merging into main.');
  process.exit(1);
}
console.log('Test-change policy passed:', changedLogic.length, 'logic files,', changedTests.length, 'test files.');
