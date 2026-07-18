# open-banking.io Bank Sync — a Wealthfolio addon

Import your **real EU/UK bank balances and transactions** into
[Wealthfolio](https://wealthfolio.app) via [open-banking.io](https://open-banking.io).

Wealthfolio is a beautiful local-first portfolio tracker, but bank/cash accounts
are manual. This addon connects the two: it reads your accounts from
open-banking.io (2,600+ EU/UK banks, no PSD2/eIDAS certificate needed) and writes
them into Wealthfolio — creating a cash account per bank account and importing
transactions as deposits/withdrawals.

Built in response to
[wealthfolio#1251](https://github.com/wealthfolio/wealthfolio/issues/1251)
(native PSD2/Open Banking support for European banks).

## Zero-knowledge by design

open-banking.io is end-to-end encrypted: the service stores only ciphertext it
cannot read. This addon decrypts your data **locally, inside the Wealthfolio
addon sandbox**, with the private key from your exported credentials — using the
same ECDH-P256 → HKDF-SHA256 → AES-256-GCM scheme as the official
[`@open-banking-io/client`](https://www.npmjs.com/package/@open-banking-io/client)
SDK. Your key and plaintext never leave the sandbox, and never reach open-banking.io.

Network calls go through Wealthfolio's **brokered network API** (declared hosts
only, with your consent) — the addon has no unrestricted network access.

## Permissions it asks for

| Permission | Why |
| --- | --- |
| `network` (open-banking.io hosts) | Fetch your encrypted balances/transactions |
| `secrets` | Store your credentials in Wealthfolio's encrypted secret store |
| `accounts` | List accounts and optionally create a cash account per bank account |
| `activities` | Import transactions as deposit/withdrawal activities |

## Install

**From a release zip** (recommended):

1. Download `wealthfolio-openbanking-io-sync-addon-<version>.zip` from
   [Releases](https://github.com/john-frandsen/wealthfolio-openbanking-io-sync/releases).
2. In Wealthfolio: Settings → Addons → *Install from file* → pick the zip.

**From source:**

```bash
git clone https://github.com/john-frandsen/wealthfolio-openbanking-io-sync
cd wealthfolio-openbanking-io-sync
pnpm install
pnpm bundle        # produces dist/…-addon-<version>.zip
```

## Use

1. In open-banking.io, connect your bank(s) and export your `credentials.json`.
2. Open **Bank Sync** in the Wealthfolio sidebar.
3. Paste the `credentials.json` and save — it is kept in Wealthfolio's encrypted
   addon secrets.
4. Pick how many days of history to import, leave *Create missing accounts* on
   for the first run, and click **Sync now**.

Incoming transactions become **deposits**, outgoing become **withdrawals**;
booked balances are preferred over available so your net worth reflects settled
money. Each imported activity keeps the source id in its comment (`[obio:…]`) for
traceability.

## Self-hosting open-banking.io

If you run open-banking.io on your own domain, add that host to
`network.allowedHosts` in `manifest.json` and rebuild — the sandbox only allows
the hosts declared there.

## Develop

```bash
pnpm install
pnpm type-check     # tsc --noEmit
pnpm test           # vitest (pure mapping logic)
pnpm build          # one-shot production build
pnpm dev            # rebuild on change (vite build --watch)
```

Status: the open-banking.io side (API + local decryption) is ported from the
official SDK and unit-tested; the addon type-checks and bundles against the real
`@wealthfolio/addon-sdk`. Feedback from a live Wealthfolio run is very welcome —
open an issue.

## Disclosure

I'm **John, maintainer of [open-banking.io](https://open-banking.io)**. I built
this addon so Wealthfolio users can auto-sync EU/UK bank data. open-banking.io is
a paid service (pricing starts around €3/mo); this addon is free and MIT-licensed
and talks to Wealthfolio only through its public addon API. Wealthfolio is an
independent project and is not affiliated with open-banking.io. Issues and PRs welcome.

## License

[MIT](./LICENSE)
