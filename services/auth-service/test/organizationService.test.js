const test = require('node:test');
const assert = require('node:assert');

const { slugify } = require('../src/services/organizationService');

test('slugify lowercases and hyphenates the base name', () => {
  const slug = slugify("Alice's Organization");
  assert.match(slug, /^alice-s-organization-[a-f0-9]{6}$/);
});

test('slugify strips leading/trailing hyphens from punctuation-heavy input', () => {
  const slug = slugify('---Weird!!!Name---');
  assert.ok(!slug.startsWith('-'));
  assert.match(slug, /^weird-name-[a-f0-9]{6}$/);
});

test('slugify falls back to "org" for input with no alphanumeric characters', () => {
  const slug = slugify('!!!');
  assert.match(slug, /^org-[a-f0-9]{6}$/);
});

test('slugify produces different suffixes across calls (collision-avoidance)', () => {
  const a = slugify('Acme Corp');
  const b = slugify('Acme Corp');
  assert.notStrictEqual(a, b);
});

test('slugify truncates very long base names before appending the suffix', () => {
  const longName = 'a'.repeat(500);
  const slug = slugify(longName);
  // 180 chars of base + '-' + 6 hex chars
  assert.ok(slug.length <= 180 + 1 + 6);
});
