export function chooseDefaultReport(reports){
  const list=Array.isArray(reports)?reports:[];
  const approved=list.filter(r=>!!r.accepted_final).sort((a,b)=>new Date(b.accepted_at||b.created_at)-new Date(a.accepted_at||a.created_at));
  if(approved[0]) return approved[0];
  return [...list].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))[0]||null;
}
