// Quiz answer grading (DESIGN.md §3.11), shared by brain/quiz.js and the bubble.
// Forgiving: case, punctuation, accents, a trailing plural "s" and one typo in longer words are all fine.
(function (root) {
  function grade(given, answer) {
    const norm = (s) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '').replace(/s$/, '');
    const a = norm(given);
    const b = norm(answer);
    if (!a) return false;
    if (a === b) return true;
    if (b.length < 6 || Math.abs(a.length - b.length) > 1) return false;
    let edits = 0;
    for (let i = 0, j = 0; i < a.length || j < b.length; i++, j++) {
      if (a[i] === b[j]) continue;
      if (++edits > 1) return false;
      if (a.length > b.length) j--;
      else if (b.length > a.length) i--;
    }
    return true;
  }
  root.LoonGrade = { grade };
  if (typeof module !== 'undefined') module.exports = { grade };
})(globalThis);
