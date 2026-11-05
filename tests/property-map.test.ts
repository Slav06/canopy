import test from 'node:test';
import assert from 'node:assert/strict';
import { googleEmbed } from '../lib/property-map';
test('Google share iframe is normalized and unsafe embed sources are rejected', () => {
  assert.equal(googleEmbed('<iframe src="https://www.google.com/maps/embed?pb=panorama" width="600"></iframe>'), 'https://www.google.com/maps/embed?pb=panorama');
  for (const src of ['javascript:alert(1)', 'https://www.google.com.evil.test/maps/embed?pb=x', 'http://www.google.com/maps/embed?pb=x', 'https://example.com/maps/embed?pb=x', 'https://www.google.com/search?q=x']) assert.throws(() => googleEmbed(src));
  assert.equal(googleEmbed(''), '');
});
