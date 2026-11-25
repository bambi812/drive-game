// names.js - driver names: a basic profanity filter (English and Hebrew) and no two drivers with the same name.
const BAD = ['fuck', 'shit', 'bitch', 'cunt', 'nigg', 'faggot', 'retard', 'whore', 'slut', 'dick', 'pussy', 'cock', 'penis', 'vagina', 'nazi', 'hitler', 'rape', 'porn', 'asshole', 'bastard',
  '\u05d6\u05d5\u05e0\u05d4', '\u05e9\u05e8\u05de\u05d5\u05d8', '\u05de\u05d6\u05d3\u05d9\u05d9\u05df', '\u05db\u05d5\u05e1\u05d0\u05de', '\u05d1\u05df \u05d6\u05d5\u05e0', '\u05de\u05e0\u05d9\u05d0\u05e7', '\u05d4\u05d5\u05de\u05d5'];
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', '$': 's', '!': 'i' };
export function isRude(name) {
  const plain = String(name).toLowerCase(), squashed = plain.replace(/[013457@$!]/g, c => LEET[c]).replace(/[^a-z\u0590-\u05ff]/g, '');
  return BAD.some(w => plain.includes(w) || squashed.includes(w.replace(/ /g, '')));
}
export const taken = (name, accounts) => { const n = String(name).trim().toLowerCase(); return accounts.some(a => String(a.name).trim().toLowerCase() === n); };
// a free name based on the one asked for
export function uniqueName(base, accounts) { let name = base, k = 2; while (taken(name, accounts)) name = base.slice(0, 13) + ' ' + k++; return name; }