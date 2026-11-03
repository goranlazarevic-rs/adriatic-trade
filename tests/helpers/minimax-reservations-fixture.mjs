// Synthetic local admissions and read-only provider invoices. Never calls real services.
export async function seedReservations(h,scenarios=['STANDARD','PAKET','BESPLATNA','GURMAN']){
  await h.ctx.mmEnsureSchema(h.db);
  const entries=[];
  for(const [index,scenario] of scenarios.entries()){
    const order=h.ctx.mmProbeOrder(scenario),invoiceId=45000001+index;
    await h.ctx.insert(order);h.sql.prepare("UPDATE orders SET status='confirmed' WHERE id=?").run(order.id);
    const requirements=JSON.stringify(h.ctx.stockRequirements(order.items));
    h.sql.prepare('INSERT INTO checkout_admissions VALUES(?,?,?,1)').run(order.id,requirements,order.createdAt);
    const plan=h.ctx.mmBuildPlan({...order,status:'confirmed',operations:{paymentStatus:'unpaid'},events:[]}),payload=JSON.stringify(plan);
    h.sql.prepare("INSERT INTO minimax_drafts VALUES(?,?,'verified',?,?,?,NULL,?,?)").run(order.id,'synthetic:'+order.id,payload,await h.ctx.mmHash(payload),invoiceId,order.createdAt,order.createdAt);
    h.mm.invoices.set(invoiceId,{...plan.payload,IssuedInvoiceId:invoiceId,InvoiceNumber:0});entries.push({order,invoiceId,plan});
  }
  return entries;
}
