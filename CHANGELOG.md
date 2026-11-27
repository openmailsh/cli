# Changelog

All notable changes to `@openmail/cli` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). This project uses [semantic versioning](https://semver.org/).

---

## [0.13.1]

### Fixed

- `openmail send` rejects an empty, malformed, or repeated `--send-at` before submitting the email.

## [0.13.0]

### Added

- Schedule a reviewed draft with `openmail drafts send --send-at <iso-8601>`.

## [0.12.0]

### Added

- `openmail folders list` lists an inbox's standard and custom folders. Use its folder IDs with `openmail folders messages` to page through messages and drafts.

## [0.11.0]

### Added

- Repeat `--to` for each primary recipient in sends, replies, scheduled sends and drafts.

## [0.10.0]

### Added

- `openmail send --send-at <iso-8601>` holds an email until that time (30 seconds to 30 days ahead) instead of sending it now.
- `openmail scheduled list`, `reschedule`, and `cancel` manage a held send. Reschedule changes the time only.

## [0.9.2]

### Fixed

- Use `attachments[].id` from `threads get` or `messages list` with `attachments get` and `attachments text` to select files that share a filename. ID-based downloads use the original filename by default and preserve an existing local file unless you specify `--out`.

## [0.9.1]

### Added

- `openmail drafts edit` revises saved recipients, subject or HTML using the exact `updatedAt` from `drafts get`. Omitted fields are preserved; explicit clears are supported.
- `openmail drafts delete` permanently discards a saved draft and its attachments using its exact `updatedAt`. Stale versions and pending or accepted sends block deletion; the command never fetches a newer version or retries automatically.

### Changed

- Draft creation and editing accept only `--body-html` for body content. Replace draft `--body` arguments with HTML; the API generates the plain-text fallback. This changes the draft creation interface from 0.9.0.

## [0.9.0]

### Added

- Add inbox-owned drafts with reply and forward context, file and inline image uploads, combined inbox and pod filters, and reviewed-version sending.

## [0.8.1]

### Added

- `openmail domain update --domain-id <id> --pod-id <pod_id>` scopes a verified domain to one pod; `--all-pods` makes it account-wide again. DNS records are untouched. Needs an account-wide key. Until now the only way to change scope from the CLI was delete and re-add.

### Changed

- Every request now identifies itself with `X-OpenMail-Client: cli` and `User-Agent: openmail-cli/<version>`, so the console can show which client last used a key.

## [0.8.0]

### Added

- `openmail threads delete --thread-id <id>` moves a thread to Trash in the console and out of the API.
- `openmail messages delete --message-id <id>` deletes a single message.
- Both need an account-wide or pod-scoped key. Inbox-scoped keys get a 403.
- `openmail send --bcc <email>` (repeatable) blind-copies an address, hidden from To and Cc. For CRM logging addresses such as HubSpot or Salesforce. Checked against outbound sender rules like every other recipient.

## [0.7.2]

### Added

- Proxy support. The CLI honours `HTTPS_PROXY` / `HTTP_PROXY` / `NO_PROXY` (via undici's `EnvHttpProxyAgent`), so it works inside sandboxes and CI without `NODE_USE_ENV_PROXY=1`.

### Fixed

- A proxy or gateway rejecting the request is no longer reported as an "OpenMail API error". Only JSON `{ error, message }` bodies get that label; anything else names the host and proxy and points at egress rules.
- `openmail setup` now points at `openmail init` first, with the OpenClaw plugin as a secondary pointer instead of the only one.
- `inbox --help` and the README said inbox-scoped keys "can only read and send"; they can also look up their parent pod. Wording now matches behaviour.

## [0.7.1]

### Changed

- `openmail init` saves the API key to `~/.openmail-cli/state.json`, so later commands need neither `OPENMAIL_API_KEY` nor `--api-key`.

### Removed

- The bundled `skills/openmail/SKILL.md`. The agent skill lives in [openmailsh/skills](https://github.com/openmailsh/skills) (`npx skills add openmailsh/skills`).

## [0.7.0]

### Removed

- `openmail setup`, `openmail openclaw`, `openmail status`, `openmail doctor` and the `ws bridge` WebSocket bridge — the OpenClaw integration now lives in [`@openmail/openclaw`](https://github.com/openmailsh/openclaw-plugin) (`openclaw plugins install clawhub:@openmail/openclaw`). `openmail update` no longer refreshes skill files or restarts a bridge service. The removed commands still print a pointer to the plugin and exit 1, and `openmail update` warns if the old bridge service (launchd plist / systemd unit) is still installed.

### Added

- `skills/openmail/SKILL.md` — agent-facing skill for using the CLI directly (Claude Code, Cursor, Codex).

## [0.1.6]

Initial public release on [openmailsh/cli](https://github.com/openmailsh/cli).

### Commands

- `openmail setup` — one-command setup with OpenClaw integration (WebSocket / webhook mode)
- `openmail init` — create and configure a new inbox interactively
- `openmail inbox list|create|get|delete` — manage inboxes
- `openmail send` — send email from the default or specified inbox
- `openmail messages list` — list inbound/outbound messages
- `openmail threads list|get` — list and inspect threads
- `openmail ws bridge` — WebSocket bridge forwarding events to an OpenClaw hook
- `openmail status` — show OpenClaw runtime status
- `openmail doctor` — diagnose configuration issues

### Global flags

`--api-key`, `--base-url`, `--json`, `--verbose`, `--help`
