function cleanText(text) {
  return String(text || '')
    .replace(/\u00a0/g, ' ').replace(/\f/g, '\n')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n')
    .trim();
}

function normalizeValue(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  return s || null;
}

function numberValue(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).replace(/₹/g, '').replace(/Rs\.?/gi, '').replace(/,/g, '').trim();
  if (!s || s === '-') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function fieldValue(block, label) {
  const lines = String(block || '').split('\n').map(x => x.trim()).filter(Boolean);
  const target = String(label).toLowerCase();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();
    if (lower === target) return normalizeValue(lines[i + 1]);
    if (lower.startsWith(target)) {
      const remainder = line.slice(label.length).trim();
      if (remainder) return normalizeValue(remainder);
    }
  }
  return null;
}

function amountField(block, label) {
  const raw = fieldValue(block, label);
  return numberValue(raw);
}

function amountFieldWithRaw(block, label) {
  const raw = fieldValue(block, label);
  return { raw: raw === null ? null : String(raw), value: numberValue(raw) };
}

function dateClosedIsAbsent(value) {
  const v = normalizeValue(value);
  return !v || /^[-–—]$/.test(v) || /^not reported$/i.test(v);
}

function parseDpd(block) {
  const payment = block.match(/Payment History[\s\S]*?(?=PAYMENT STATUS|$)/i)?.[0] || '';
  const nums = [];
  for (const line of payment.split('\n')) {
    const m = line.trim().match(/^[A-Za-z]{3}\s+\d{4}\s+(-?\d{1,3})$/);
    if (m) nums.push(Number(m[1]));
  }
  return nums.length ? Math.max(...nums.filter(Number.isFinite), 0) : 0;
}

function parseAccountChunk(chunk, section) {
  const memberMatch = chunk.match(/Member Name\s*\n\s*([^\n]+)[\s\S]*?Account Type\s*\n\s*([^\n]+)[\s\S]*?Account Number\s*\n\s*([^\n]+)/i);
  if (!memberMatch) return null;

  const lender = normalizeValue(memberMatch[1]);
  const loanType = normalizeValue(memberMatch[2]);
  const accountNumber = normalizeValue(memberMatch[3]);
  if (!lender || !loanType || !accountNumber) return null;

  const currentBalanceField = amountFieldWithRaw(chunk, 'Current Balance');
  const emiField = amountFieldWithRaw(chunk, 'EMI Amount');
  const overdueField = amountFieldWithRaw(chunk, 'Amount Overdue');
  const sanctionedField = amountFieldWithRaw(chunk, 'Sanctioned Amount');
  const creditLimitField = amountFieldWithRaw(chunk, 'Credit Limit');
  const currentBalance = currentBalanceField.value;
  const emiAmount = emiField.value;
  const overdue = overdueField.value;
  const creditLimit = creditLimitField.value;
  const isCreditCard = /credit\s*card/i.test(loanType);
  const sanctioned = isCreditCard ? creditLimit : sanctionedField.value;
  const dateClosed = fieldValue(chunk, 'Date Closed');
  const dpd = parseDpd(chunk);

  // CIBIL's OPEN ACCOUNTS / CLOSED ACCOUNTS section is the authoritative account-status source.
  // Current Balance is used only for financial totals and must never decide status.
  // This intentionally preserves open accounts even when Current Balance is zero.
  const status = section === 'OPEN' ? 'ACTIVE' : 'CLOSED';

  return {
    lender,
    loan_type: loanType,
    account_number_masked: accountNumber.length > 4 ? `****${accountNumber.slice(-4)}` : accountNumber,
    sanctioned_amount: sanctioned,
    outstanding_amount: currentBalance,
    emi: emiAmount,
    overdue_amount: overdue ?? 0,
    dpd,
    status,
    section,
    date_closed: dateClosed,
    source_fields: {
      current_balance: currentBalanceField.raw,
      emi_amount: emiField.raw,
      amount_overdue: overdueField.raw,
      sanctioned_amount: isCreditCard ? creditLimitField.raw : sanctionedField.raw,
      credit_limit: creditLimitField.raw,
      emi_source: 'CIBIL EMI Amount',
      emi: emiField.raw
    },
    raw_excerpt: chunk.slice(0, 1800)
  };
}

function parseAccountSection(sectionText, sectionName) {
  const section = String(sectionText || '');
  const memberMatches = [...section.matchAll(/(?:^|\n)\s*Member Name\s*\n/gi)];
  const accounts = [];

  // pdf-parse can place the financial block either before or after the
  // identity block. Reconstruct each account from its identity plus the
  // financial portions that belong to that identity.
  for (let i = 0; i < memberMatches.length; i++) {
    const member = memberMatches[i];
    const memberStart = member.index;
    const nextMember = i + 1 < memberMatches.length ? memberMatches[i + 1].index : section.length;

    const postRaw = section.slice(memberStart, nextMember);
    const firstFinancial = postRaw.match(/(?:^|\n)\s*(?:Credit Limit|Sanctioned Amount)\s*-?/i);
    const firstPayment = postRaw.match(/(?:^|\n)\s*PAYMENT STATUS\s*(?=\n|$)/i);
    let identityAndAfter = postRaw;

    // If another account's pre-identity financial block starts after the
    // current account's payment status, do not absorb it into this account.
    // If financial fields occur before payment status, they belong to the
    // current account and are retained.
    if (firstFinancial && firstPayment && firstFinancial.index > firstPayment.index) {
      identityAndAfter = postRaw.slice(0, firstFinancial.index);
    }

    // If financial fields occur before Member Name, they are the block after
    // the previous account's PAYMENT STATUS and before this Member Name.
    // In the normal layout this slice contains no financial fields.
    const previousPaymentMatches = [
      ...section.slice(0, memberStart).matchAll(/(?:^|\n)\s*PAYMENT STATUS\s*(?=\n|$)/gi)
    ];
    const previousPayment = previousPaymentMatches.length
      ? previousPaymentMatches[previousPaymentMatches.length - 1].index
      : -1;

    const preIdentity = previousPayment >= 0
      ? section.slice(previousPayment, memberStart)
      : '';

    const preHasFinancial = /(?:^|\n)\s*(?:Credit Limit|Sanctioned Amount)\s*-?/i.test(preIdentity);
    const chunk = (preHasFinancial ? preIdentity + '\n' : '') + identityAndAfter;

    const account = parseAccountChunk(chunk, sectionName);
    if (account) accounts.push(account);
  }

  return accounts;
}

function parseAccounts(text) {
  const upper = text.toUpperCase();
  const openStart = upper.indexOf('OPEN ACCOUNTS');
  if (openStart < 0) return [];

  const closedStart = upper.indexOf('CLOSED ACCOUNTS', openStart + 'OPEN ACCOUNTS'.length);
  const enquiryStart = upper.indexOf('ENQUIRY DETAILS', openStart);
  const openEnd = closedStart >= 0 ? closedStart : (enquiryStart >= 0 ? enquiryStart : text.length);
  const closedEnd = enquiryStart >= 0 ? enquiryStart : text.length;

  const openSection = text.slice(openStart, openEnd);
  const closedSection = closedStart >= 0 ? text.slice(closedStart, closedEnd) : '';

  return [
    ...parseAccountSection(openSection, 'OPEN'),
    ...parseAccountSection(closedSection, 'CLOSED')
  ].slice(0, 300);
}

function firstNumber(text, patterns) {
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const n = numberValue(m[1]);
      if (n !== null) return n;
    }
  }
  return null;
}

function isCreditCardAccount(account) {
  return /credit\s*card/i.test(String(account?.loan_type || ''));
}

function accountCategoryCounts(accounts) {
  const openAccounts = accounts.filter(a => a.status === 'ACTIVE');
  const closedAccounts = accounts.filter(a => a.status === 'CLOSED');
  const openCreditCards = openAccounts.filter(isCreditCardAccount).length;
  const closedCreditCards = closedAccounts.filter(isCreditCardAccount).length;
  return {
    open_accounts: openAccounts.length,
    closed_accounts: closedAccounts.length,
    open_credit_cards: openCreditCards,
    open_loans: openAccounts.length - openCreditCards,
    closed_credit_cards: closedCreditCards,
    closed_loans: closedAccounts.length - closedCreditCards,
    total_credit_cards: openCreditCards + closedCreditCards,
    total_loans: accounts.length - openCreditCards - closedCreditCards
  };
}

function buildObligationGroups(activeAccounts) {
  const groups = new Map();
  for (const a of activeAccounts) {
    const key = a.loan_type || 'Other';
    if (!groups.has(key)) {
      groups.set(key, { loan_type: key, active_accounts: 0, count: 0, total_sanctioned: 0, total_outstanding: 0, total_monthly_emi: 0, total_emi: 0, total_overdue: 0, accounts: [] });
    }
    const g = groups.get(key);
    g.active_accounts += 1;
    g.count += 1;
    g.total_sanctioned += a.sanctioned_amount || 0;
    g.total_outstanding += a.outstanding_amount || 0;
    g.total_monthly_emi += a.emi || 0;
    g.total_emi += a.emi || 0;
    g.total_overdue += a.overdue_amount || 0;
    g.accounts.push(a);
  }
  return [...groups.values()].sort((a, b) => b.total_outstanding - a.total_outstanding);
}

function analyzeCibilText(rawText) {
  const text = cleanText(rawText);
  const score = firstNumber(text, [
    /Your CIBIL Score is\s*(\d{3})/i,
    /CIBIL Score\s*[:\-]?\s*(\d{3})/i,
    /credit score\s*[:\-]?\s*(\d{3})/i
  ]);

  const accounts = parseAccounts(text);
  const activeAccounts = accounts.filter(a => a.status === 'ACTIVE');
  const closedAccounts = accounts.filter(a => a.status !== 'ACTIVE');

  // Summary obligations intentionally use ACTIVE accounts only.
  // EMI is read only from the CIBIL "EMI Amount" field; no inferred EMI is used.
  const totalSanctioned = activeAccounts.reduce((s, a) => s + (a.sanctioned_amount || 0), 0);
  const totalOutstanding = activeAccounts.reduce((s, a) => s + (a.outstanding_amount || 0), 0);
  const totalEmi = activeAccounts.reduce((s, a) => s + (a.emi || 0), 0);
  const totalOverdue = activeAccounts.reduce((s, a) => s + (a.overdue_amount || 0), 0);
  const maxDpd = activeAccounts.reduce((m, a) => Math.max(m, a.dpd || 0), 0);

  const obligationGroups = buildObligationGroups(activeAccounts);
  const enquiriesSection = text.match(/ENQUIRY DETAILS[\s\S]*?(?:End of report|$)/i)?.[0] || '';
  const recentEnquiries = (enquiriesSection.match(/\bDate Of Enquiry\b/gi) || []).length || null;
  const categoryCounts = accountCategoryCounts(accounts);
  const cardAccounts = activeAccounts.filter(isCreditCardAccount);
  const cardOutstanding = cardAccounts.reduce((s, a) => s + (a.outstanding_amount || 0), 0);
  const totalCreditCardLimit = cardAccounts.reduce((s, a) => s + (a.sanctioned_amount || 0), 0);

  const redFlags = [];
  if (totalOverdue > 0) redFlags.push({severity:'HIGH', code:'OVERDUE', message:'Overdue amount is reported on active accounts.'});
  if (maxDpd > 0) redFlags.push({severity:'HIGH', code:'DPD', message:`DPD detected on active accounts; maximum observed is ${maxDpd} days.`});
  if (totalOverdue === 0 && maxDpd === 0) redFlags.push({severity:'LOW', code:'CLEAN_REPAYMENT', message:'No current overdue or DPD indicators were detected on active accounts.'});

  let assessment = 'REVIEW';
  if (score !== null && score >= 750 && totalOverdue === 0 && maxDpd === 0) assessment = 'LOWER_OBSERVED_RISK';
  else if (totalOverdue > 0 || maxDpd > 30) assessment = 'HIGHER_OBSERVED_RISK';

  const fieldCount = [score, totalOutstanding, totalEmi, totalOverdue, accounts.length, recentEnquiries].filter(v => v !== null).length;

  return {
    report_version: 'parser-v15-cibil-account-anchor-reconstruction',
    score,
    active_loans: categoryCounts.open_loans || null,
    closed_loans: categoryCounts.closed_loans || null,
    total_accounts: accounts.length || null,
    open_accounts: categoryCounts.open_accounts,
    closed_accounts: categoryCounts.closed_accounts,
    open_credit_cards: categoryCounts.open_credit_cards,
    open_loans: categoryCounts.open_loans,
    closed_credit_cards: categoryCounts.closed_credit_cards,
    closed_loans_count: categoryCounts.closed_loans,
    total_credit_cards: categoryCounts.total_credit_cards,
    total_loans: categoryCounts.total_loans,
    total_sanctioned_amount: totalSanctioned || null,
    total_outstanding: totalOutstanding || null,
    total_outstanding_amount: totalOutstanding || null,
    total_monthly_emi: totalEmi || null,
    total_overdue: totalOverdue,
    max_dpd: maxDpd,
    current_dpd: maxDpd,
    active_credit_cards: cardAccounts.length || null,
    card_outstanding: cardOutstanding || null,
    total_credit_card_limit: totalCreditCardLimit || null,
    recent_enquiries: recentEnquiries,
    settled_accounts: null,
    written_off_accounts: null,
    accounts,
    active_accounts: activeAccounts,
    obligation_groups: obligationGroups,
    active_obligation_totals: {
      active_accounts: activeAccounts.length,
      sanctioned: totalSanctioned,
      outstanding: totalOutstanding,
      emi: totalEmi,
      overdue: totalOverdue,
      total_sanctioned_amount: totalSanctioned,
      total_outstanding: totalOutstanding,
      total_outstanding_amount: totalOutstanding,
      total_monthly_emi: totalEmi,
      total_overdue: totalOverdue,
      max_dpd: maxDpd
    },
    account_counts: categoryCounts,
    red_flags: redFlags,
    assessment,
    extraction_confidence: Math.round((fieldCount / 6) * 100),
    extraction_note: text.length < 500 ? 'Very little text was extracted. The PDF may be scanned/image-only and should be reviewed or processed with OCR.' : null
  };
}

module.exports = { analyzeCibilText };
