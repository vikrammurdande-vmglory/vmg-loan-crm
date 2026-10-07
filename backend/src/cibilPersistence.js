function parsedFinancialValues(a){
  const num=(v)=>v===null||v===undefined||v===''?null:Number(v);
  return {sanctioned_amount:num(a?.sanctioned_amount),outstanding_amount:num(a?.outstanding_amount),emi:num(a?.emi),overdue_amount:num(a?.overdue_amount),dpd:num(a?.dpd)};
}
function financialFieldsEqual(src,db){
  const f=parsedFinancialValues(src);
  return ['sanctioned_amount','outstanding_amount','emi','overdue_amount','dpd'].every(k=>{
    const a=f[k]===null?null:Number(f[k]); const b=db?.[k]===null||db?.[k]===undefined?null:Number(db[k]); return a===b;
  });
}
function cibilAccountKey(a){return [String(a?.lender??'').trim().toUpperCase(),String(a?.loan_type??'').trim().toUpperCase(),String(a?.account_number_masked??'').trim().toUpperCase()].join('|');}
async function persistParsedCibilAccounts(client,reportId,analysis){
  const sourceAccounts=Array.isArray(analysis?.accounts)?analysis.accounts:[];
  await client.query('DELETE FROM cibil_accounts WHERE report_id=$1',[reportId]);
  for(const [accountIndex, a] of sourceAccounts.entries()){
    const f=parsedFinancialValues(a);
    console.log(`[CIBIL-MAP] report=${reportId} idx=${accountIndex} lender=${a.lender || ''} type=${a.loan_type || ''} sanctioned=${f.sanctioned_amount} outstanding=${f.outstanding_amount} emi=${f.emi} overdue=${f.overdue_amount} dpd=${f.dpd}`);
    await client.query('INSERT INTO cibil_accounts(report_id,lender,loan_type,account_number_masked,sanctioned_amount,outstanding_amount,emi,overdue_amount,dpd,status,source_data) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[
      reportId,a.lender??null,a.loan_type??null,a.account_number_masked??null,
      f.sanctioned_amount,f.outstanding_amount,f.emi,f.overdue_amount,f.dpd,a.status??null,JSON.stringify(a)
    ]);
  }
  const stored=await client.query('SELECT * FROM cibil_accounts WHERE report_id=$1 ORDER BY created_at ASC',[reportId]);
  if(stored.rowCount!==sourceAccounts.length) throw new Error(`CIBIL account persistence verification failed: parser=${sourceAccounts.length}, database=${stored.rowCount}`);
  const dbMap=new Map(stored.rows.map(a=>[cibilAccountKey(a),a]));
  for(const src of sourceAccounts){
    const db=dbMap.get(cibilAccountKey(src));
    if(!db) throw new Error(`CIBIL account persistence verification failed: account not found for ${src.lender||'unknown lender'}`);
    if(!financialFieldsEqual(src,db)){
      const f=parsedFinancialValues(src);
      throw new Error(`CIBIL financial persistence verification failed for ${src.lender||'unknown lender'}: parser=${JSON.stringify(f)} database=${JSON.stringify({sanctioned_amount:db.sanctioned_amount,outstanding_amount:db.outstanding_amount,emi:db.emi,overdue_amount:db.overdue_amount,dpd:db.dpd})}`);
    }
  }
  return stored.rows;
}
module.exports={parsedFinancialValues,financialFieldsEqual,cibilAccountKey,persistParsedCibilAccounts};
