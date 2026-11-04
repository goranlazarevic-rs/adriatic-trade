// Synthetic operator statements only. No real signature, invoice, bank or portal calls.
export function reviewFields(kind='sale',local=false){return {
  verificationUrl:'https://suf.purs.gov.rs/v/?vl='+encodeURIComponent(Buffer.from('SYNTHETIC-NOT-A-SIGNED-FISCAL-INVOICE-'.repeat(8)).toString('base64')),
  verifiedTaxId:'115051176',documentType:'normal-'+kind,
  portalChecked:'yes',itemsChecked:'yes',originalUnchanged:'yes',paymentChecked:'yes',...(local?{advanceResolved:'yes'}:{})
};}
