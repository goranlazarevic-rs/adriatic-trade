const toggle = document.querySelector('.nav-toggle');
const links = document.querySelector('.nav-links');
if(toggle && links){
  toggle.addEventListener('click', () => {
    links.classList.toggle('open');
    toggle.setAttribute('aria-expanded', links.classList.contains('open'));
  });
  links.querySelectorAll('a').forEach(a => a.addEventListener('click', () => links.classList.remove('open')));
}

const year = document.querySelector('[data-year]');
if(year) year.textContent = new Date().getFullYear();

const form = document.querySelector('[data-contact-form]');
if(form){
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const subject = `Upit sa sajta — ${data.get('company') || data.get('name') || 'Adriatic Trade'}`;
    const body = [
      `Ime i prezime: ${data.get('name') || ''}`,
      `Kompanija: ${data.get('company') || ''}`,
      `Email: ${data.get('email') || ''}`,
      `Telefon: ${data.get('phone') || ''}`,
      `Tip upita: ${data.get('type') || ''}`,
      '',
      `${data.get('message') || ''}`
    ].join('\n');
    window.location.href = `mailto:info@adriatictrade.rs?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  });
}
