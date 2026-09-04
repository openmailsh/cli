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
openmail inbox list [--pod-id pod_xxx] --limit 10
openmail inbox create [--mailbox-name <name>] [--display-name <sender name>] [--domain <domain>] [--pod-id <pod_id>]
openmail inbox get --inbox-id inb_xxx
openmail inbox update --inbox-id inb_xxx --display-name "New name"
openmail inbox delete --inbox-id inb_xxx

# Inbox-scoped API keys: can only read and send from that one inbox.
# Needs an account-wide or pod-scoped key. Token is shown once.
openmail inbox keys create --inbox-id inb_xxx [--name <name>] --json
openmail inbox keys list --inbox-id inb_xxx
openmail inbox keys revoke --inbox-id inb_xxx --key-id key_xxx

# Inbox webhook (real-time events). Set after creating the inbox, if needed.
openmail inbox webhook set --inbox-id inb_xxx --url https://example.com/hooks/openmail
openmail inbox webhook test --inbox-id inb_xxx
openmail inbox webhook rotate-secret --inbox-id inb_xxx
openmail inbox webhook clear --inbox-id inb_xxx

# Send email (uses default inbox from setup/init, or pass --inbox-id)
openmail send --to hello@example.com --subject "Hi" --body "Hello"

# Send to multiple recipients (--to is one address; repeat --cc for the rest)
openmail send --to a@example.com --cc b@example.com --cc c@example.com \
  --subject "Hi" --body "Hello"

# Send with a custom Reply-To
# (free plan: must be an inbox you own; Pro+: any address)
openmail send --to hello@example.com --subject "Hi" --body "Hello" \
  --reply-to support@yourdomain.com

# List messages and threads
openmail messages list [--direction inbound|outbound]
openmail threads list
openmail threads get --thread-id thr_xxx

# Attachments: extract text (PDF, DOCX, XLSX, PPTX, images via OCR) or download
openmail attachments text --message-id msg_xxx --filename report.pdf
openmail attachments get --message-id msg_xxx --filename report.pdf [--out ./report.pdf]
```

### Pods and scoped keys

A pod groups inboxes and domains. Give each agent (or tenant) its own pod and a
pod-scoped key: it can create and use inboxes in that pod and nothing outside it.
Pod management needs an account-wide key.

```bash
openmail pod create [--name research] [--client-id <your id>] --json
openmail pod list
openmail pod get --pod-id pod_xxx
openmail pod update --pod-id pod_xxx [--name <label>] [--client-id <your id>]
openmail pod delete --pod-id pod_xxx

# Pod-scoped API keys. Token is shown once.
openmail pod keys create --pod-id pod_xxx [--name <name>] --json
openmail pod keys list --pod-id pod_xxx
openmail pod keys revoke --pod-id pod_xxx --key-id key_xxx
```

### Custom domains

```bash
openmail domain add --domain mail.example.com [--pod-id pod_xxx]   # returns DNS records
openmail domain list
openmail domain get --domain-id dom_xxx
openmail domain verify --domain-id dom_xxx
openmail domain delete --domain-id dom_xxx
```

### Correspondent policy

Who may email an inbox (inbound) and who it may email (outbound). Scope defaults
to the account; `--pod-id` or `--inbox-id` targets one pod or inbox.

```bash
openmail policy get [--pod-id pod_xxx | --inbox-id inb_xxx]
openmail policy mode --direction inbound --mode allowlist --inbox-id inb_xxx
openmail policy allow --direction inbound --value marc@example.com --inbox-id inb_xxx
openmail policy block --direction outbound --value "*.competitor.com"
openmail policy rules remove --rule-id rule_xxx [--pod-id | --inbox-id]
openmail policy audit [--direction inbound|outbound] [--since <iso>] [--until <iso>]
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
