# Changelog

All notable changes to `@openmail/cli` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). This project uses [semantic versioning](https://semver.org/).

---

## [0.1.6] — current

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
