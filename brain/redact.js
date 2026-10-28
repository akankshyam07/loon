// Redaction (DESIGN.md §4.2): runs on every piece of context before it reaches a model or a hand-off.
// Pure regex + checksums, never a model. Patterns follow gitleaks / Presidio-style recognizers.

function luhnValid(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

function ibanValid(iban) {
  const compact = iban.replace(/\s+/g, '').toUpperCase();
  const rearranged = compact.slice(4) + compact.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let remainder = 0;
  for (const digit of numeric) remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder === 1;
}

// Order matters: specific secrets first so a key is never half-eaten by a generic rule.
const RULES = [
  { kind: 'private-key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  { kind: 'api-key', re: /\b(?:sk|pk|rk)-(?:proj-|ant-|live_|test_)?[A-Za-z0-9_-]{20,}\b/g },
  { kind: 'api-key', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { kind: 'api-key', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
  { kind: 'api-key', re: /\bgithub_pat_[A-Za-z0-9_]{50,}\b/g },
  { kind: 'api-key', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g },
  { kind: 'api-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { kind: 'token', re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g },
  { kind: 'token', re: /\bBearer\s+[A-Za-z0-9._~+\/=-]{16,}/g },
  { kind: 'connection-string', re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:[^\s@/]+@[^\s]+/gi },
  {
    kind: 'secret',
    re: /\b([\w.-]*(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|client[_-]?secret|session[_-]?id|sessid)[\w-]*)(\s*[:=]\s*)(["']?)([^\s"',;]{4,})\3/gi,
    replace: (m, name, sep, quote) => `${name}${sep}${quote}[redacted:secret]${quote}`,
  },
  { kind: 'token', re: /\bBasic\s+[A-Za-z0-9+\/]{12,}={0,2}/g },
  {
    kind: 'secret',
    re: /\b(password|passcode|passphrase|pw|pin|cvv|cvc)(\s+is\s*[:=]?\s*|\s*[:=]\s*)(?:(["'])(?!\[redacted)([^"'\n]{3,})\3|(?!\[redacted)([^\s"',;]{3,}))/gi,
    replace: (m, name, sep, quote) => `${name}${sep}${quote || ''}[redacted:secret]${quote || ''}`,
  },
  { kind: 'secret', re: /\b(pin|cvv|cvc)(\s+)\d{3,8}\b/gi, replace: (m, name, sep) => `${name}${sep}[redacted:secret]` },
  { kind: 'iban', re: /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,3})?\b/g, valid: ibanValid },
  { kind: 'card', re: /\b(?:\d[ -]?){12,18}\d\b/g, valid: (m) => luhnValid(m.replace(/\D/g, '')) },
  { kind: 'ssn', re: /\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g },
];

// Returns { text, count, kinds } — count is shown in the bubble footer ("2 redacted").
function redact(input) {
  if (!input) return { text: input || '', count: 0, kinds: [] };
  let text = input;
  let count = 0;
  const kinds = new Set();
  for (const rule of RULES) {
    text = text.replace(rule.re, (...args) => {
      const match = args[0];
      if (rule.valid && !rule.valid(match)) return match;
      count++;
      kinds.add(rule.kind);
      return rule.replace ? rule.replace(...args) : `[redacted:${rule.kind}]`;
    });
  }
  return { text, count, kinds: [...kinds] };
}

module.exports = { redact, luhnValid, ibanValid };
