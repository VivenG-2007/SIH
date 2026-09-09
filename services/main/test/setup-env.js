// Loaded via `node --require ./test/setup-env.js --test ...` (see the
// "test" script in package.json) — runs before any test file, and before
// any src module gets a chance to `require('ioredis')`.
//
// Why this exists: src/config/redis.js and src/config/queue.js both open
// live ioredis connections at require-time. Without a real Redis reachable
// in CI/offline, those connections retry forever (retryStrategy never gives
// up) — see test/health.test.js's comment for how that used to hang the
// whole suite. Setting USE_REDIS_MOCK here (read by both of those config
// modules) swaps the real `ioredis` client for `ioredis-mock`, an in-memory
// stand-in with the same API, so `node --test` runs fully offline, finishes
// in milliseconds instead of retrying against 127.0.0.1:6379, and produces
// deterministic results regardless of what's running on the host.
//
// A dedicated env var (not NODE_ENV) is used deliberately: test/corsGuard.test.js
// flips process.env.NODE_ENV between 'development' and 'production' *within*
// the test run to exercise CORS behavior in each mode, so NODE_ENV is not a
// safe signal to gate the Redis client choice on.
process.env.USE_REDIS_MOCK = 'true';
