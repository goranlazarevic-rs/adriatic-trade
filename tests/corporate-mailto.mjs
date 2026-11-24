import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInquiryMailto, mailCompatibleText } from '../assets/korporativni-pokloni/mailto.mjs';

test('mobile draft avoids multibyte escapes from the reported Serbian inquiry',()=>{
  const body='Poštovani,\nP01 — Zlatna radost\nP06 — Ukus Mediterana\nKoličina: 1 · 5.910 RSD po komadu bez PDV-a\nOkvirno ukupno: 9.140 RSD bez PDV-a (10.968 RSD sa PDV-om).\nNapomena: —\nraspoloživost i konačne uslove\nSrdačan pozdrav,\nPrimer Čačić';
  const uri=buildInquiryMailto('Preduzeće Đukić',body);
  const params=new URL(uri).searchParams;
  assert.equal(params.get('subject'),'Upit za korporativne poklone - Preduzece Djukic');
  const decoded=params.get('body');
  assert.match(decoded,/Postovani,\r\nP01 - Zlatna radost/);
  assert.match(decoded,/Kolicina: 1 - 5\.910 RSD/);
  assert.match(decoded,/9\.140 RSD bez PDV-a \(10\.968 RSD sa PDV-om\)/);
  assert.match(decoded,/raspolozivost i konacne uslove/);
  assert.match(decoded,/Srdacan pozdrav/);
  assert.ok(/^[\x00-\x7f]*$/.test(decoded));
  assert.doesNotMatch(uri,/%(?:C[0-9A-F]|D[0-9A-F]|E[0-9A-F]|F[0-9A-F]|25(?:C|D|E|F))/i);
  assert.ok(body.includes('Poštovani')); // Original clipboard text is unchanged.
});
test('reserved characters remain literal inquiry content, with one encoding pass',()=>{
  const params=new URL(buildInquiryMailto('A&B + 20% #1','Napomena: A&B + 20% #1\nMejl: primer+pokloni@example.com')).searchParams;
  assert.equal(params.get('subject'),'Upit za korporativne poklone - A&B + 20% #1');
  assert.equal(params.get('body'),'Napomena: A&B + 20% #1\r\nMejl: primer+pokloni@example.com');
  assert.equal([...params.keys()].length,2);
});
test('Serbian Cyrillic and all Latin diacritics have readable equivalents',()=>{
  assert.equal(mailCompatibleText('Чоколада, шоља и календар — Ђорђе Љубић; ČĆŠŽĐ čćšžđ'),'Cokolada, solja i kalendar - Djordje Ljubic; CCSZDj ccszdj');
});
