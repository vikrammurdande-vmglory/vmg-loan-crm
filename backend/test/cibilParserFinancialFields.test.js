const assert = require('assert');
const { analyzeCibilText } = require('../src/cibilParser');

const text = `
CIBIL Score is 749
ALL ACCOUNTS
OPEN ACCOUNTS
Member Name
NAVI
Account Type
Personal Loan
Account Number
010014930226
ACCOUNT DETAILS
Sanctioned Amount₹12,00,000
Current Balance₹12,00,000
Amount Overdue₹0
EMI Amount₹37,100
Payment FrequencyMonthly
Date Closed-
PAYMENT STATUS
Payment History
Aug 20260
Member Name
BOI
Account Type
Auto Loan Personal
Account Number
091560510000795
ACCOUNT DETAILS
Sanctioned Amount₹25,00,000
Current Balance₹24,72,452
Amount Overdue₹0
EMI Amount₹38,470
Date Closed-
PAYMENT STATUS
Payment History
Sep 20260
CLOSED ACCOUNTS
Member Name
OLD BANK
Account Type
Personal Loan
Account Number
12345678
ACCOUNT DETAILS
Sanctioned Amount₹5,00,000
Current Balance₹0
Amount Overdue₹0
EMI Amount₹0
Date Closed01/01/2025
PAYMENT STATUS
Payment History
Jan 20250
ENQUIRY DETAILS
`;

const a = analyzeCibilText(text);
assert.strictEqual(a.report_version, 'parser-v15-cibil-rupee-attached-financial-fields');
assert.strictEqual(a.accounts.length, 3);
assert.strictEqual(a.open_accounts, 2);
assert.strictEqual(a.closed_accounts, 1);
assert.strictEqual(a.accounts[0].sanctioned_amount, 1200000);
assert.strictEqual(a.accounts[0].outstanding_amount, 1200000);
assert.strictEqual(a.accounts[0].emi, 37100);
assert.strictEqual(a.accounts[0].overdue_amount, 0);
assert.strictEqual(a.accounts[1].sanctioned_amount, 2500000);
assert.strictEqual(a.accounts[1].outstanding_amount, 2472452);
assert.strictEqual(a.accounts[1].emi, 38470);
assert.strictEqual(a.total_sanctioned_amount, 3700000);
assert.strictEqual(a.total_outstanding, 3672452);
assert.strictEqual(a.total_monthly_emi, 75570);
console.log('CIBIL parser financial-field regression test: PASS');
