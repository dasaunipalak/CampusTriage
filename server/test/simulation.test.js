const { test } = require('node:test');
const assert = require('node:assert/strict');
const { simulate } = require('../scripts/simulate');
test('fictional FIFO comparison and exact 48-hour promotion are reproducible', async () => {
  const results = await simulate();
  assert.deepEqual(results.fifo, [1, 2, 3]);
  assert.deepEqual(results.rankedBefore, [3, 2, 1]);
  assert.deepEqual(results.rankedAt48Hours, [3, 1, 2]);
  assert.equal(results.positions[0].rankedBeforePosition, 3);
  assert.equal(results.positions[0].rankedAt48HoursPosition, 2);
  assert.equal(results.positions[2].evidence, 'washroom ke socket mein paani ja raha hai');
});
