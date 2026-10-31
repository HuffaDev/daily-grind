// Preloaded by `bun test` (see bunfig.toml). Session signing needs a secret;
// the tests never touch real Discord or Redis, so a fixed one is fine.
process.env.SESSION_SECRET ??= "test-secret";
