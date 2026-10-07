const assert=require('assert');
const {parsedFinancialValues,financialFieldsEqual,persistParsedCibilAccounts}=require('../src/cibilPersistence');
const sample={lender:'NAVI',loan_type:'Personal Loan',account_number_masked:'****1234',sanctioned_amount:1200000,outstanding_amount:1200000,emi:37100,overdue_amount:0,dpd:0,status:'ACTIVE',source_fields:{emi_amount:'37100'}};
const v=parsedFinancialValues(sample);
assert.deepStrictEqual(v,{sanctioned_amount:1200000,outstanding_amount:1200000,emi:37100,overdue_amount:0,dpd:0});
assert.strictEqual(v.emi,37100);
assert.ok(financialFieldsEqual(sample,v));
assert.ok(!financialFieldsEqual(sample,{...v,emi:0}));
(async()=>{
  const inserted=[];
  const client={async query(sql,params){
    if(sql.startsWith('DELETE')){inserted.length=0;return {rows:[]};}
    if(sql.startsWith('INSERT')){inserted.push({lender:params[1],loan_type:params[2],account_number_masked:params[3],sanctioned_amount:params[4],outstanding_amount:params[5],emi:params[6],overdue_amount:params[7],dpd:params[8],status:params[9],source_data:params[10]});return {rows:[]};}
    if(sql.startsWith('SELECT'))return {rowCount:inserted.length,rows:inserted.map((x,i)=>({...x,id:String(i),created_at:new Date() }))};
    throw new Error('Unexpected SQL '+sql);
  }};
  const rows=await persistParsedCibilAccounts(client,'r1',{accounts:[sample]});
  assert.equal(rows.length,1);
  assert.equal(rows[0].emi,37100);
  assert.equal(JSON.parse(rows[0].source_data).source_fields.emi_amount,'37100');
  console.log('PASS: Parsed CIBIL financial values are preserved exactly in database persistence');
})().catch(e=>{console.error(e);process.exit(1)});
