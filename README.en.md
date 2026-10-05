# Hyperclick

A local browser extension coordinating native HyperCore multisig operations initiated on the Hyperliquid web app. Wallet connection and signing confirmations remain in OKX Wallet or OneKey. Hyperclick does not request seed phrases or import private keys.

**Status:** v0.7.3 development preview. Independent project, not endorsed by or affiliated with Hyperliquid, OKX or OneKey. No independent security audit has been completed for this version. Project-owned code is distributed under the MIT License; third-party notices are preserved.

## Workflow

1. Choose Hyperclick in the Hyperliquid wallet selector, then connect the multisig account M using OKX or OneKey.
2. Initiate an operation on the original page. After its initial wallet confirmation, review the captured operation in the side panel.
3. Choose a submitter (leader), collect the threshold number of member signatures, then request the submitter's final outer signature.
4. Submit directly to the official HyperCore API and return the actual result to the original page. Unknown submission outcomes are not retried automatically.

Members can use different supported wallets. The page-facing provider keeps the account M while the actual wallet switches between members. After completion, the original wallet may need to be switched back to M before the next initial signature; the home screen displays this requirement. This does not force a wallet to select an account or bypass its approval UI.

## Scope and evidence

There are 47 explicitly validated action adapters covering agent approval, transfers, withdrawals, staking, vaults, subaccounts, orders and account configuration. Encoding and signing have automated SDK comparisons and simulated integration tests. This is **not** a claim that every action is accepted by current nodes or every official web UI entry point has passed live-wallet acceptance.

Ordinary EVM deposit transactions, HyperEVM contract calls and special deployer/validator operations are outside this release. Unknown actions are rejected in the Hyperclick connection flow. See [coverage](COVERAGE.md), [validation](VALIDATION.md) and [manual acceptance](ACCEPTANCE.md).

## Build and install

From the repository root, use Node.js 20 or newer:

```sh
npm ci
npm run typecheck
npm test
npm run build
```

Load `dist/` as an unpacked Chromium extension. For a prebuilt installation, download `Hyperclick-v0.7.3-extension.zip` from [Releases](https://github.com/dbefb/hyperclick/releases), extract it and load the directory containing `manifest.json`. GitHub source archives require a build. Reload the extension and refresh the Hyperliquid page after updating. Do not keep two copies enabled.

## Data and security

Proposal data, addresses, collected signatures and workflow state are held in extension session storage. Production code queries and submits to the official Hyperliquid API; it has no maintainer-operated backend, analytics or payment integration. The wallet and original web page have their own data policies. The extension processes security-sensitive authorization material even though it does not hold private keys.

Read [architecture](docs/ARCHITECTURE.md), [privacy](PRIVACY.md), [security](SECURITY.md) and [third-party notices](THIRD_PARTY_NOTICES.txt).

Coordination currently requires one computer and one browser; remote signature synchronization is not supported.

## License

Project-owned code is available under the [MIT License](LICENSE).
