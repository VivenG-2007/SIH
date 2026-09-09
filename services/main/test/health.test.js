const test = require('node:test');
const assert = require('node:assert');

test('app module loads without throwing', async () => {
  const app = require('../src/app');
  assert.ok(app);

  // src/app.js transitively requires config/redis.js and config/queue.js,
  // each of which opens its own live ioredis connection at require-time
  // (config/queue.js's own comment explains why BullMQ needs a separate
  // connection per queue rather than sharing config/redis.js's). None of
  // that is closed on its own, so — smoke test or not — this file leaves
  // the event loop with open handles once it's the only thing requiring
  // `../src/app` in the process. `node --test` waits for a natural exit
  // rather than force-exiting (no --test-force-exit on Node 18), so
  // without this the whole suite hangs instead of finishing, in CI same as
  // locally. Close every connection this require pulled in so the process
  // can exit cleanly once tests are done.
  const redis = require('../src/config/redis');
  const queue = require('../src/config/queue');
  await Promise.all([redis.quit(), queue.closeAll()]);
});
