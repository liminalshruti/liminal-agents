# Liminal Agents — security model

**Scope:** the substrate shipped in PR #4 (vault + daemon). Not a customer-facing security policy.

## Threat model

**In scope:**
- A roommate / family member with file-system access to the user's Mac (the "8-year-old brother with your password" case)
- Casual disk forensics — someone copies `~/Library/Application Support/Liminal/vault.db` and tries to read it
- Driver upgrades that could silently downgrade the cipher profile

**Out of scope:**
- Nation-state adversary with raw block-device access on a copy-on-write or wear-leveled filesystem (acknowledged in `lib/vault/secure-erase.js`)
- Compromised running process — anything that can read the daemon's memory while the key is unwrapped sees the key
- Compromised macOS user account with full keychain access (defeats Secure Enclave wrap by design)
- Network adversary — Liminal Agents is local-only; there is no network surface

## What's encrypted

- **`vault.db`** — SQLCipher v4: AES-256-CBC, 4096-byte pages, HMAC-SHA512 page authentication, PBKDF2-HMAC-SHA512 with 256k iterations. Profile pinned in `lib/vault/crypto.js` and asserted on every open.

## What's NOT encrypted

- `daemon.log` — needed for debugging
- `integrations.json` — config; should not contain secrets, but currently no enforcement of this
- `schemas/*.json` — public JSON Schemas, copied for self-description
- `keyguard.mode` — records which key-release mode is in use (`env` / `sep` / `keychain`)
- Per-source ingest caches under `integrations/<source>/` — cursor state, no payload data

If FileVault is enabled, all of the above benefit from full-disk encryption at rest. Liminal does not require FileVault but recommends it.

## Key handling

Three modes for releasing the 32-byte vault key:

1. **`env` (LIMINAL_VAULT_KEY)** — 64 hex chars in env. Used by tests, CI, and the demo. **Lowest security; convenience mode.** Anyone with read access to the user's shell environment or process listing can read the key.
2. **`sep` (Secure Enclave)** — Apple Silicon only. Key is wrapped by an SEP-generated keypair; unwrap requires Touch ID or passcode. *Implementation note: `bin/liminal-keyguard` binary is referenced but not yet shipped as of PR #4. Post-hackathon work.*
3. **`keychain`** — Intel Mac fallback. Keychain ACL gates access; less strong than SEP. Same `bin/liminal-keyguard` dependency.

The key is held in a Node.js Buffer that callers `zeroize()` after handing to SQLCipher. This is best-effort — V8 can copy the buffer, GC timing is not deterministic, and the kernel may have paged the memory.

## Wrong-key behavior

`PRAGMA user_version` is called immediately after applying cipher pragmas. A wrong key throws `SQLITE_NOTADB` synchronously. No partial reads, no silent failure.

## Cipher profile regression guard

`assertProfile()` reads back every cipher pragma after open and throws if any value differs from the pinned profile. A future driver upgrade that changes defaults cannot silently weaken the cipher.

## Legacy plaintext erase

When the substrate detects `~/.liminal-agents-vault.db` (the old plaintext DB from Day 1 of the hackathon), it imports the data and runs `secureErase()`: three passes of cryptographic random over the file size, fsync after each pass, then unlink. As noted in the source, this is best-effort on modern filesystems.

## What this protects, beyond data theft

**Vault contents may be substantially more sensitive than the operational signal use case implies.** Meeting transcripts ingested from Granola can include personal, financial, medical, or relational material commingled with work content. The encryption-at-rest model is sized for that case, not just the work-data case. (See SPEC §4.2 for the source-filtering implications and the production filter design as post-hackathon work.)

The vault's contents are **non-reproducible by design**, and the encryption-at-rest model is load-bearing for that property — not just a privacy nicety.

The corrections in `corrections` (the table that stores the user's pushback against agent reads) are first-party data with three properties no other source can reconstruct:

1. **Generative process is unrecoverable.** Each correction is the output of one user, in one moment, pushing back on one agent read. If the vault is destroyed, no other system holds the input that produced it — the agent reads are stateless and not logged elsewhere, and the user's pushback was a real-time judgment that cannot be re-elicited.
2. **No external mirror.** Liminal Agents has no server, no telemetry, no cloud sync. The corrections exist in exactly one place. This is a deliberate design choice, not an oversight — see THESIS.md "Mirror, not Companion" and PPA #5 (Correction Stream).
3. **Cumulative, not snapshot.** What makes the correction history valuable is its longitudinal shape — months or years of disagreement across the same dimensions. A single correction is a row; a year of corrections is a record of how the user's self-understanding diverges from how AI reads them.

**Implication:** protecting `vault.db` is not just about preventing a data leak in the conventional sense. It is about protecting an artifact that, once lost, cannot be regenerated from any other source — and which becomes the user's irreplaceable practice record over time. The security model treats this as a higher bar than e.g. a cache file or a session token, both of which can be recreated.

## What this is and isn't

This is a hackathon-week security model that takes the local-trust threat model seriously and documents what it cannot defend against. It is not:
- A compliance artifact (no SOC2, no FIPS validation claim despite using FIPS-validated primitives)
- A guarantee against compromised hardware or compromised root
- A substitute for the user's own threat hygiene (FileVault, password strength, account lock-out)

## Post-hackathon work

- Build `bin/liminal-keyguard` (Swift, signed, notarized) to actually deliver the SEP and Keychain modes
- Add `CHECK` and `FOREIGN KEY` constraints to vault DDL (see VAULT_AUDIT)
- Validate writes against JSON Schemas via `ajv` at the source-ingest layer
- Document FileVault / iCloud-sync interactions explicitly
- Threat-model the `liminal://` URL handler (any other macOS app can fire it)
