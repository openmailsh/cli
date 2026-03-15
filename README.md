# OpenMail CLI

The official CLI for the [OpenMail API](https://docs.openmail.sh).

## Installation

```bash
npm install -g @openmail/cli
```

Requires Node.js 20+.

## Setup

```bash
export OPENMAIL_API_KEY=om_xxx
```

Get your API key from the [Dashboard](https://console.openmail.sh).

## Usage

```bash
openmail <command> [subcommand] [flags]
openmail help <command>
```

### Get started

```bash
# One-command setup (OpenClaw integration: skill, env files, systemd on Linux by default)
openmail setup [--mode websocket|webhook]
```

### Core commands

```bash
# Create a new inbox (interactive prompts, or pass flags)
openmail init [--mailbox-name john] [--display-name "John Smith"]

# Manage inboxes
openmail inbox list --limit 10
openmail inbox create [--mailbox-name <name>] [--display-name <sender name>]
openmail inbox get --id inb_xxx
openmail inbox delete --id inb_xxx

# Send email (uses default inbox from setup/init, or pass --inbox-id)
openmail send --to hello@example.com --subject "Hi" --body "Hello"

# List messages and threads
openmail messages list [--direction inbound|outbound]
openmail threads list
openmail threads get --thread-id thr_xxx
```

### OpenClaw integration

```bash
# Runtime status
openmail status

# WebSocket bridge (forwards events to OpenClaw hook)
openmail ws bridge [--hook-url <url>] [--hook-token <token>]
```

### Diagnostics

```bash
openmail doctor
```

## Global flags

| Flag | Description |
| --- | --- |
| `--api-key <key>` | Override `OPENMAIL_API_KEY` |
| `--base-url <url>` | Override API base URL (default: https://api.openmail.sh) |
| `--json` | JSON output |
| `--verbose` | Verbose logging |
| `--help` | Show help |

## Documentation

[docs.openmail.sh](https://docs.openmail.sh)

## Contributing

Bug reports, feature requests, and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) to get started.
