const assert=require('assert');
const fs=require('fs');
const serverSource=fs.readFileSync(require.resolve('../src/server.js'),'utf8');
const {financialTotals,reconcileAccounts,cibilAccountKey,tupleEqual}=require('../src/cibilFinancialSync');
const parsed=require('./fixtures/cibil_Oct_26_parsed_v14.json');
const getRoute=serverSource.split("app.get('/api/cibil-reports/:id'")[1].split("app.get('/api/cibil-reports/:id/parsed-json'")[0];
assert.ok(!getRoute.includes('reconcileAccounts('),'GET CIBIL route must only return stored database account records');
assert.ok(getRoute.includes('SELECT * FROM cibil_accounts WHERE report_id=$1'),'GET CIBIL route must load stored database account records');
assert.ok(serverSource.includes("app.post('/api/cibil-reports/:id/reanalyze',auth,requireSuperAdmin"),'Re-analysis endpoint must be Super Admin only');
assert.ok(serverSource.includes("app.post('/api/cibil-reports/:id/financial-sync',auth,requireSuperAdmin"),'Financial sync endpoint must be Super Admin only');
assert.ok(serverSource.includes('persistParsedCibilAccounts(client,r.rows[0].id,analysis)'), 'Upload endpoint must persist parsed accounts transactionally and verify stored rows');
assert.ok(serverSource.includes('source_data'), 'Stored CIBIL account must retain parsed source data');

function clone(v){return JSON.parse(JSON.stringify(v));}
function fakePool(initialRows){
  const state=clone(initialRows);
  return {
    state,
    async connect(){
      const client={
        async query(sql,params){
          if(/^BEGIN/.test(sql)||/^COMMIT/.test(sql)||/^ROLLBACK/.test(sql)) return {rows:[]};
          if(sql.includes('UPDATE cibil_accounts')){
            const [san,out,emi,overdue,dpd,id]=params;
            const row=state.find(x=>x.id===id); Object.assign(row,{sanctioned_amount:san,outstanding_amount:out,emi,overdue_amount:overdue,dpd}); return {rows:[row]};
          }
          if(sql.includes('SELECT * FROM cibil_accounts')) return {rows:state};
          if(sql.includes('UPDATE cibil_reports')) return {rows:[]};
          throw new Error('Unexpected SQL: '+sql);
        },
        release(){}
      };
      return client;
    },
    async query(sql,params){
      if(sql.includes('UPDATE cibil_reports')) return {rows:[]};
      if(sql.includes('SELECT * FROM cibil_accounts')) return {rows:state};
      throw new Error('Unexpected pool SQL: '+sql);
    }
  };
}

(async()=>{
  assert.equal(parsed.accounts.length,157,'parser JSON should contain 157 accounts');
  const open=parsed.accounts.filter(a=>a.status==='ACTIVE');
  assert.equal(open.length,27);
  assert.equal(financialTotals(open).outstanding,29080407);
  assert.equal(financialTotals(open).emi,306160);
  assert.equal(financialTotals(open).max_dpd,12);

  // Simulate exactly the broken UI state: DB has matching accounts but financial fields are empty.
  const db=open.map((a,i)=>({id:'db-'+i,lender:a.lender,loan_type:a.loan_type,account_number_masked:a.account_number_masked,status:'ACTIVE',sanctioned_amount:null,outstanding_amount:null,emi:null,overdue_amount:0,dpd:0}));
  const pool=fakePool(db);
  const report={id:'r1',accepted_final:false,review_started_at:null,summary:{report_version:parsed.parser_version,accounts:parsed.accounts}};
  const result=await reconcileAccounts(report,db,{pool});
  assert.equal(result.synced,true);
  assert.equal(result.updated,25);
  assert.equal(result.totals.outstanding,29080407);
  assert.equal(result.totals.emi,306160);
  const navi=pool.state.find(a=>a.lender==='NAVI');
  assert.equal(navi.sanctioned_amount,1200000);
  assert.equal(navi.outstanding_amount,1200000);
  assert.equal(navi.emi,37100);
  const boi=pool.state.find(a=>a.lender==='BOI');
  assert.equal(boi.outstanding_amount,2472452);
  assert.equal(boi.emi,38470);

  // Reviewed non-empty values must never be silently overwritten.
  const reviewed=clone(db); reviewed[0].outstanding_amount=999999;
  const blocked=await reconcileAccounts({...report,review_started_at:new Date().toISOString()},reviewed,{allowReviewedEmptySync:true,pool:fakePool(reviewed)});
  assert.equal(blocked.synced,false);
  assert.equal(blocked.reason,'reviewed_values_present');

  // Accepted reports are immutable.
  const accepted=await reconcileAccounts({...report,accepted_final:true},db,{pool});
  assert.equal(accepted.synced,false);
  assert.equal(accepted.reason,'accepted');

  // Keys are unique and stable.
  assert.equal(new Set(open.map(cibilAccountKey)).size,27);
  assert.equal(tupleEqual(open[0],open[0]),true);

  console.log('PASS: CIBIL parser totals and financial DB reconciliation');
  console.log('PASS: Empty DB financial fields -> parsed sanctioned/outstanding/EMI values');
  console.log('PASS: Reviewed values are protected');
  console.log('PASS: Accepted reports are protected');
  console.log(JSON.stringify({open_accounts:27,total_outstanding:29080407,total_emi:306160,max_dpd:12,navi_emi:37100,boi_emi:38470},null,2));
})().catch(e=>{console.error('FAIL:',e);process.exit(1)});
