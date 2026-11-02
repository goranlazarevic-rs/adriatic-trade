// Synthetic, deterministic pilot orders. Reruns never reset a transfer journal.
const prices={'10086':600,'10012':800,'10306':299,'10307':299,'10240':550};
const packages={'PKT-PROBA':{'10086':1,'10306':1,'10307':1},'PKT-KOMPLET':{'10086':1,'10012':1,'10240':1}};
function line(sku,qty,unitPrice){return {sku,name:sku,detail:'API proba',qty,unitPrice,lineTotal:qty*unitPrice,
  ...(packages[sku]?{packageVersion:'v1',bundleComponents:Object.entries(packages[sku]).map(([sku,units])=>({sku,units,referenceUnitPrice:prices[sku]}))}:{})};}
export function fixtures(){return [
  ['STANDARD',Object.entries(prices).map(([sku,p])=>line(sku,1,p)),420],
  ['PAKET',[line('PKT-PROBA',2,1150),line('10240',1,499)],420],
  ['BESPLATNA',[line('PKT-KOMPLET',2,1800)],0]
].map(([id,items,shipping])=>{const goodsTotal=items.reduce((s,r)=>s+r.lineTotal,0);return {
  id:'AT-MMTEST-'+id,submissionId:'AT-MMTEST-'+id,createdAt:'2026-11-02T12:00:00Z',status:'confirmed',
  customer:{firstName:'API proba',lastName:id,email:'minimax-test@example.invalid',phone:'0600000000'},
  delivery:{method:'Dostava na adresu',address:'Test 1',postalCode:'21208',city:'Sremska Kamenica',note:'Sintetička proba; ne slati.'},
  payment:'TEST_BANK_TRANSFER',items,goodsTotal,shipping,total:goodsTotal+shipping};});}
