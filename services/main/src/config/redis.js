const env = require('./env');
const logger = require('./logger');

// USE_REDIS_MOCK is set only by test/setup-env.js (via `node --require`,
// before this module is first required) — never in dev/prod. Swaps in
// ioredis-mock (in-memory, same API surface) so the test suite never opens
// a real socket to 127.0.0.1:6379. See test/setup-env.js for the full
// rationale and why this isn't gated on NODE_ENV instead.
const Redis = process.env.USE_REDIS_MOCK === 'true' ? require('ioredis-mock') : require('ioredis');

const redis = new Redis(env.redisUrl, {
  maxRetriesPerRequest: null,
  // enableOfflineQueue defaults to true — commands issued before the
  // connection is ready (e.g. redis.ping() in server.js, which fires before
  // the lazyConnect socket opens) are queued and flushed once connected.
  // Setting it to false caused an immediate rejection and a startup crash.
  lazyConnect: true,
  retryStrategy: (times) => Math.min(times * 1000, 10000),
});

redis.on('connect', () => logger.info('Redis connected (main-service)'));
redis.on('error', (err) => logger.warn({ err: err.message }, 'Redis offline — continuing without cache'));

// ioredis-mock implements individual command methods (redis.incr(),
// redis.pexpire(), ...) but not ioredis's generic `.call(command, ...args)`
// dispatcher — src/middleware/rateLimiter.js's rate-limit-redis integration
// calls redis.call(...) directly (see that file's comment on why it can't
// use a null-guarded sendCommand). Shim it here, once, only for the mock,
// so rate limiting can be exercised in tests without special-casing it in
// every test file that touches a rate-limited route.
//
// rate-limit-redis specifically drives this via SCRIPT LOAD + EVALSHA (for
// an atomic increment-and-expire) — ioredis-mock has no SCRIPT command at
// all, but it DOES support EVAL. So SCRIPT LOAD is emulated here by hashing
// the script text and remembering it locally, and EVALSHA is redirected to
// EVAL with the remembered script — same effect, without needing Redis's
// real script cache.
if (process.env.USE_REDIS_MOCK === 'true' && typeof redis.call !== 'function') {
  const crypto = require('crypto');
  const scriptCache = new Map(); // sha1 -> script source

  redis.call = (...args) => {
    const [command, ...rest] = args;
    const cmd = String(command).toLowerCase();

    if (cmd === 'script') {
      const [subcommand, scriptSource] = rest;
      if (String(subcommand).toLowerCase() === 'load') {
        const sha = crypto.createHash('sha1').update(scriptSource).digest('hex');
        scriptCache.set(sha, scriptSource);
        return Promise.resolve(sha);
      }
      return Promise.resolve(null);
    }

    if (cmd === 'evalsha') {
      const [sha, ...evalArgs] = rest;
      const scriptSource = scriptCache.get(sha);
      if (!scriptSource) {
        return Promise.reject(new Error('NOSCRIPT No matching script. Please use EVAL.'));
      }
      return redis.eval(scriptSource, ...evalArgs);
    }

    return redis[cmd](...rest);
  };
}

module.exports = redis;
