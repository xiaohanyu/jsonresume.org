---
'@jsonresume/jobs': minor
---

API keys are now issued only to a signed-in GitHub session, so the CLI no longer
mints one on first run. It instead points you at
https://jsonresume.org/api-keys, where you sign in and create a key, then asks
you to paste it.

**Breaking:** existing `jr_{username}_{hmac}` keys are no longer accepted and
must be replaced with a key created from that page. Those legacy keys could be
minted by anyone for any username and could never be revoked; new keys are
random, stored hashed, and revocable.
