const moneyNumber=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
const cibilAccountKey=a=>[String(a?.lender||'').trim().toUpperCase(),String(a?.loan_type||'').trim().toUpperCase(),String(a?.account_number_masked||'').trim().toUpperCase()].join('|');
function financialTotals(accounts){
  const open=(accounts||[]).filter(a=>String(a?.status||'').toUpperCase()==='ACTIVE');
  return {sanctioned:open.reduce((n,a)=>n+moneyNumber(a.sanctioned_amount),0),outstanding:open.reduce((n,a)=>n+moneyNumber(a.outstanding_amount),0),emi:open.reduce((n,a)=>n+moneyNumber(a.emi),0),overdue:open.reduce((n,a)=>n+moneyNumber(a.overdue_amount),0),max_dpd:open.reduce((n,a)=>Math.max(n,moneyNumber(a.dpd)),0)};
}
function totalsDiffer(a,b){return ['sanctioned','outstanding','emi','overdue','max_dpd'].some(k=>moneyNumber(a?.[k])!==moneyNumber(b?.[k]));}
function financialTuple(a){return ['sanctioned_amount','outstanding_amount','emi','overdue_amount','dpd'].map(k=>moneyNumber(a?.[k]));}
function tupleEqual(a,b){const x=financialTuple(a),y=financialTuple(b);return x.every((v,i)=>v===y[i]);}
function isEmptyFinancial(a){return financialTuple(a).every(v=>v===0);}
function hasSourceFinancial(a){return financialTuple(a).some(v=>v!==0);}
function sourceAccounts(report){const s=report?.summary||{};const all=Array.isArray(s.accounts)?s.accounts:Array.isArray(s.active_accounts)?s.active_accounts:[];return all.filter(a=>String(a?.status||'').toUpperCase()==='ACTIVE');}
function sourceValue(v,zeroForNull=false){return v===''||v==null?(zeroForNull?0:null):moneyNumber(v);}
async function reconcileAccounts(report,dbAccounts,{allowReviewedEmptySync=false,pool}={}){
  if(report.accepted_final)return {synced:false,reason:'accepted'};
  const sourceOpen=sourceAccounts(report);
  const dbOpen=(dbAccounts||[]).filter(a=>String(a?.status||'').toUpperCase()==='ACTIVE');
  if(!sourceOpen.length||!dbOpen.length)return {synced:false,reason:'no_source_or_accounts'};
  if(sourceOpen.length!==dbOpen.length)return {synced:false,reason:'account_count_mismatch',needs_reanalysis:true};
  const byKey=new Map(sourceOpen.map(a=>[cibilAccountKey(a),a]));
  const mappings=dbOpen.map(db=>({db,src:byKey.get(cibilAccountKey(db))}));
  if(mappings.some(x=>!x.src))return {synced:false,reason:'account_key_mismatch',needs_reanalysis:true};
  const mismatches=mappings.filter(x=>!tupleEqual(x.db,x.src));
  if(!mismatches.length)return {synced:false,reason:'already_synced',totals:financialTotals(dbAccounts)};
  if(report.review_started_at&&!allowReviewedEmptySync)return {synced:false,reason:'review_started'};
  if(report.review_started_at&&allowReviewedEmptySync){
    const unsafe=mismatches.filter(x=>!isEmptyFinancial(x.db));
    if(unsafe.length)return {synced:false,reason:'reviewed_values_present',unsafe_count:unsafe.length};
  }
  if(!pool) throw new Error('Database pool is required for financial reconciliation');
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    for(const {db,src} of mismatches){
      await client.query('UPDATE cibil_accounts SET sanctioned_amount=$1,outstanding_amount=$2,emi=$3,overdue_amount=$4,dpd=$5 WHERE id=$6',[sourceValue(src.sanctioned_amount),sourceValue(src.outstanding_amount,true),sourceValue(src.emi),sourceValue(src.overdue_amount,true),sourceValue(src.dpd,true),db.id]);
    }
    const fresh=await client.query('SELECT * FROM cibil_accounts WHERE report_id=$1 ORDER BY created_at ASC',[report.id]);
    const totals=financialTotals(fresh.rows);
    const nextSummary={...(report.summary||{}),report_version:report.summary?.report_version||'parser-v14-cibil-sanctioned-balance-emi',total_sanctioned_amount:totals.sanctioned,total_outstanding:totals.outstanding,total_outstanding_amount:totals.outstanding,total_monthly_emi:totals.emi,total_overdue:totals.overdue,max_dpd:totals.max_dpd,current_dpd:totals.max_dpd,active_obligation_totals:totals,financial_data_sync:'SYNCHRONIZED_FROM_PARSED_SUMMARY'};
    await client.query('UPDATE cibil_reports SET total_outstanding=$1,total_monthly_emi=$2,total_overdue=$3,max_dpd=$4,summary=$5 WHERE id=$6',[totals.outstanding,totals.emi,totals.overdue,totals.max_dpd,JSON.stringify(nextSummary),report.id]);
    await client.query('COMMIT');
    return {synced:true,reason:'financial_values_reconciled',totals,updated:mismatches.length};
  }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}
module.exports={moneyNumber,cibilAccountKey,financialTotals,totalsDiffer,financialTuple,tupleEqual,isEmptyFinancial,hasSourceFinancial,sourceAccounts,reconcileAccounts};
