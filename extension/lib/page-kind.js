// Page-kind detection (DESIGN.md §2.4): local heuristics in the page. Only the resulting *kind* is sent to Loon,
// never the page's content. "sensitive" wins over everything: Loon then reads nothing unless asked.
(function (root) {
  const SENSITIVE_DOMAINS = [
    'chase.com', 'bankofamerica.com', 'wellsfargo.com', 'citi.com', 'capitalone.com', 'usbank.com', 'pnc.com',
    'americanexpress.com', 'discover.com', 'schwab.com', 'fidelity.com', 'vanguard.com', 'robinhood.com', 'etrade.com',
    'paypal.com', 'venmo.com', 'wise.com', 'revolut.com', 'coinbase.com', 'kraken.com', 'binance.com',
    '1password.com', 'lastpass.com', 'bitwarden.com', 'dashlane.com', 'keepersecurity.com',
    'accounts.google.com', 'login.microsoftonline.com', 'login.live.com', 'appleid.apple.com', 'id.apple.com',
    'mychart.com', 'healthcare.gov', 'irs.gov', 'ssa.gov', 'login.gov', 'hsbc.com', 'tdbank.com', 'ally.com',
    'sofi.com', 'okta.com', 'anthem.com', 'kp.org', 'myuhc.com',
    'citibank.com', 'chime.com', 'monzo.com', 'barclays.co.uk', 'lloydsbank.com', 'natwest.com',
    'medicare.gov', 'commbank.com.au', 'rabobank.nl', 'hdfcbank.com', 'icicibank.com', 'login.gov.uk',
    'myaccount.google.com', 'signin.aws.amazon.com',
    'tiaa.org', 'ameriprise.com', 'merrilledge.com', 'edwardjones.com', 'login.yahoo.com', 'account.proton.me',
    'accounts.intuit.com', 'turbotax.intuit.com', 'dashboard.stripe.com', 'cash.app',
    'td.com', 'rbc.com', 'santander.co.uk', 'sbi.co.in', 'sparkasse.de', 'axisbank.com', 'web.whatsapp.com', 'web.telegram.org', 'app.signal.org', 'onlinesbi.sbi', 'zerodha.com', 'hmrc.gov.uk', 'tax.service.gov.uk',
    'usaa.com', 'navyfederal.org', 'creditkarma.com', 'mint.intuit.com', 'zellepay.com', 'cigna.com', 'aetna.com', 'bcbs.com', 'healthequity.com',
  ];
  // Country sites of the same banks (wellsfargo.com.au, hsbc.co.uk, chase.co.uk); a look-alike such as
  // bankofamerica.com.evil.com does not match because only a two or three letter suffix may follow.
  const SENSITIVE_BRANDS = /(^|\.)(wellsfargo|chase|barclays|hsbc|paypal|citibank|bankofamerica|capitalone|americanexpress|revolut|coinbase)\.(com?\.)?[a-z]{2,3}$/;
  const SENSITIVE_LABELS = /(^|\.)(mychart|myhealth|patientportal)[\w-]*\./;
  const CODE_DOMAINS = ['github.com', 'gitlab.com', 'bitbucket.org', 'stackoverflow.com', 'stackexchange.com', 'developer.mozilla.org'];
  const EMAIL_HOSTS = ['mail.google.com', 'outlook.live.com', 'outlook.office.com', 'outlook.office365.com', 'mail.yahoo.com',
    'mail.proton.me', 'mail.protonmail.com', 'app.hey.com', 'mail.aol.com', 'mail.zoho.com',
    'outlook.com', 'mail.live.com', 'mail.yandex.com'];
  const PRICE = /(?:[$€£¥₹]\s?\d[\d,]*(?:\.\d{2})?|\d[\d,.]*(?:[.,]\d{2})?\s?(?:USD|EUR|GBP|[€£])(?!\w))/g;
  const FOOD_WORDS = /\b(entr[ée]es?|appetizers?|starters?|sides|desserts?|grilled|fried|roasted|sauce|salad|burger|sandwich|pasta|pizza|tacos?|soup|vegan|vegetarian|gluten|aioli|chicken|beef|tofu|dressing)\b/gi;

  const hostMatches = (host, list) => list.some((d) => host === d || host.endsWith(`.${d}`));

  function jsonLdTypes(doc) {
    const types = new Set();
    for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
      const visit = (node) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) return node.forEach(visit);
        const t = node['@type'];
        (Array.isArray(t) ? t : [t]).filter(Boolean).forEach((x) => types.add(String(x)));
        Object.values(node).forEach(visit);
      };
      try {
        visit(JSON.parse(script.textContent));
      } catch {
        // malformed JSON-LD is common; ignore it
      }
    }
    return types;
  }

  function syllables(word) {
    const w = word.toLowerCase().replace(/[^a-z]/g, '');
    if (w.length <= 3) return 1;
    const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g);
    return Math.max(1, groups ? groups.length : 1);
  }

  // Flesch-Kincaid grade level; dense text is a reason to offer help (§3.14).
  function readability(text) {
    const words = text.match(/[A-Za-z][A-Za-z'-]*/g) || [];
    const sentences = Math.max(1, (text.match(/[.!?]+(\s|$)/g) || []).length);
    if (words.length < 50) return { words: words.length, grade: 0, avgSentence: 0 };
    const syl = words.reduce((sum, w) => sum + syllables(w), 0);
    const avgSentence = words.length / sentences;
    return { words: words.length, grade: 0.39 * avgSentence + 11.8 * (syl / words.length) - 15.59, avgSentence };
  }

  function mainText(doc) {
    const main = doc.querySelector('article, main, [role="main"]') || doc.body;
    return main ? main.innerText ?? main.textContent ?? '' : '';
  }

  function detectPage(doc, location) {
    const host = location.hostname.replace(/^www\./, '');
    const passwordField = doc.querySelector('input[type="password" i], input[autocomplete="current-password"], input[autocomplete="one-time-code"]');
    const cardField = doc.querySelector('input[autocomplete^="cc-"], input[name*="card" i][inputmode="numeric"], input[name*="cardnumber" i], input[name*="card-number" i], input[name*="card_number" i], input[name*="cvv" i], input[name*="cvc" i], input[name*="security_code" i], input[name*="security-code" i], input[name*="securitycode" i], input[id*="security-code" i]');
    // Exact names for short ones: a substring "ssn" would also match "classname".
    // A show-password toggle turns type="password" into type="text", so the field name has to count too.
    // A field marked autocomplete="new-password" belongs to a sign-up form, which is not a private page.
    const nameField = doc.querySelector('input:not([type="hidden" i], [type="checkbox" i], [type="radio" i], [type="button" i], [type="submit" i], [autocomplete="new-password" i]):is([name*="password" i], [id*="password" i], [name="passwd" i], [id="passwd" i])');
    const idField = doc.querySelector('input:is([name^="ssn" i], [id^="ssn" i], [name="iban" i], [id="iban" i], [name="pin" i], [id="pin" i], [name="pwd" i], [id="pwd" i], [name*="passcode" i], [id*="passcode" i], [name*="social_security" i], [name*="social-security" i], [name*="socialsecurity" i], [name*="routing_number" i], [name*="routing-number" i], [name*="routingnumber" i], [name*="account_number" i], [name*="account-number" i], [name*="accountnumber" i])');
    if (hostMatches(host, SENSITIVE_DOMAINS) || SENSITIVE_BRANDS.test(host) || SENSITIVE_LABELS.test(host) || passwordField || nameField || cardField || idField) {
      return { kind: 'sensitive', sensitive: true, reason: passwordField || nameField ? 'password field' : cardField ? 'card field' : idField ? 'identity or bank field' : 'sensitive site' };
    }

    const text = mainText(doc);
    const body = doc.body ? doc.body.innerText ?? doc.body.textContent ?? '' : '';
    const types = jsonLdTypes(doc);
    const prices = body.match(PRICE) || [];
    // No leading \b: sites often render "$9.99Add to cart" with no space between price and button.
    const buyText = /(add to (cart|bag|basket)|buy now|checkout|in den warenkorb|ajouter au panier|a[ñn]adir al carrito|aggiungi al carrello)\b/i.test(body);
    const foodWords = new Set((body.match(FOOD_WORDS) || []).map((w) => w.toLowerCase()));
    const { grade, avgSentence, words } = readability(text);
    const dense = words > 300 && (grade > 12 || avgSentence > 25);

    let kind = 'other';
    if (host === 'leetcode.com' && /^\/problems\//.test(location.pathname)) kind = 'leetcode';
    else if (hostMatches(host, EMAIL_HOSTS) || (host === 'icloud.com' && location.pathname.startsWith('/mail'))) kind = 'email';
    else if (types.has('Menu') || types.has('Restaurant') || (prices.length >= 5 && foodWords.size >= 3)) kind = 'menu';
    else if (types.has('Product') || types.has('ProductGroup') || types.has('Offer') || types.has('ItemList') || (prices.length >= 3 && buyText)) kind = 'shopping';
    else if (hostMatches(host, CODE_DOMAINS) || doc.querySelectorAll('pre code, pre').length >= 2) kind = 'code';
    else if (doc.querySelector('article') || words > 600) kind = 'article';
    else if (doc.querySelectorAll('form input:not([type="hidden"])').length >= 4) kind = 'form';

    return { kind, sensitive: false, dense, grade: Math.round(grade * 10) / 10 };
  }

  const api = { detectPage, readability };
  root.LoonPageKind = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
