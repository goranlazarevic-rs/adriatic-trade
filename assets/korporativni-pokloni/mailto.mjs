// Some mobile mail handlers corrupt percent-encoded UTF-8. Keep mailto drafts
// in Serbian Latin without diacritics; the clipboard path keeps the original.
const cyrillic = Object.fromEntries([
  ['а','a'],['б','b'],['в','v'],['г','g'],['д','d'],['ђ','dj'],['е','e'],['ж','z'],['з','z'],['и','i'],['ј','j'],['к','k'],['л','l'],['љ','lj'],['м','m'],['н','n'],['њ','nj'],['о','o'],['п','p'],['р','r'],['с','s'],['т','t'],['ћ','c'],['у','u'],['ф','f'],['х','h'],['ц','c'],['ч','c'],['џ','dz'],['ш','s']
].flatMap(([lower, latin]) => [[lower,latin],[lower.toUpperCase(),latin[0].toUpperCase()+latin.slice(1)]]));
export function mailCompatibleText(value) {
  return String(value).replace(/[\u0400-\u04ff]/g, char => cyrillic[char] ?? char)
    .replace(/đ/g,'dj').replace(/Đ/g,'Dj')
    .normalize('NFKD').replace(/\p{M}/gu,'')
    .replace(/[\u2010-\u2015\u2212]/g,'-').replace(/[\u2018\u2019]/g,"'")
    .replace(/[\u201c\u201d]/g,'"').replace(/\u2026/g,'...')
    .replace(/[\u00a0\u202f]/g,' ').replace(/\u00b7/g,'-');
}
export function buildInquiryMailto(company, body) {
  const subject=mailCompatibleText('Upit za korporativne poklone - '+company).replace(/[\r\n]+/g,' ');
  const compatibleBody=mailCompatibleText(body).replace(/\r\n|\r|\n/g,'\r\n');
  return 'mailto:info@adriatictrade.rs?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(compatibleBody);
}
