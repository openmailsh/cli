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

Get your API key from the [Dashboard](https://console.openmail.sh). Or pass it once to `openmail init --api-key om_xxx`, which saves it to `~/.openmail-cli/state.json` so later commands need no env var.

Behind a proxy (sandboxes, CI)? The CLI honours `HTTPS_PROXY` / `HTTP_PROXY` / `NO_PROXY` — no extra flags needed.

## Usage

```bash
openmail <command> [subcommand] [flags]
openmail help <command>
```

### Get started

```bash
# Create a new inbox and set it as the default (interactive prompts, or pass flags)
openmail init [--mailbox-name john] [--display-name "John Smith"]
```

### Core commands

```bash
# Manage inboxes
openmail inbox list [--pod-id pod_xxx] --limit 10
openmail inbox create [--mailbox-name <name>] [--display-name <sender name>] [--domain <domain>] [--pod-id <pod_id>]
openmail inbox get --inbox-id inb_xxx
openmail inbox update --inbox-id inb_xxx --display-name "New name"
openmail inbox delete --inbox-id inb_xxx

# Inbox-scoped API keys: confined to that one inbox (read, send, look up its pod).
# Needs an account-wide or pod-scoped key. Token is shown once.
openmail inbox keys create --inbox-id inb_xxx [--name <name>] --json
openmail inbox keys list --inbox-id inb_xxx
openmail inbox keys revoke --inbox-id inb_xxx --key-id key_xxx

# Inbox webhook (real-time events). Set after creating the inbox, if needed.
openmail inbox webhook set --inbox-id inb_xxx --url https://example.com/hooks/openmail
openmail inbox webhook test --inbox-id inb_xxx
openmail inbox webhook rotate-secret --inbox-id inb_xxx
openmail inbox webhook clear --inbox-id inb_xxx

# Send email (uses default inbox from init, or pass --inbox-id)
openmail send --to hello@example.com --subject "Hi" --body "Hello"

# Repeat --to for each primary recipient
openmail send --to a@example.com --to b@example.com --cc c@example.com \
  --subject "Hi" --body "Hello"

# Blind-copy a CRM logging address (hidden from To/Cc; repeatable)
openmail send --to hello@example.com --bcc crm@hubspot.example \
  --subject "Hi" --body "Hello"

# Send with a custom Reply-To
# (free plan: must be an inbox you own; Pro+: any address)
openmail send --to hello@example.com --subject "Hi" --body "Hello" \
  --reply-to support@yourdomain.com

# Hold a send until a time (ISO-8601, 30 seconds to 30 days ahead)
openmail send --to hello@example.com --subject "Hi" --body "Hello" \
  --send-at 2026-11-24T06:00:00Z
openmail scheduled list
openmail scheduled reschedule --send-id 9f3a1b2c-0000-4000-8000-000000000001 \
  --send-at 2026-11-25T06:00:00Z
openmail scheduled cancel --send-id 9f3a1b2c-0000-4000-8000-000000000001

# List messages and threads
openmail messages list [--direction inbound|outbound]
openmail threads list
openmail threads get --thread-id thr_xxx

# Browse standard and custom folders (uses the default inbox if --inbox-id is omitted)
openmail folders list --inbox-id inb_xxx --json
# Pass the numeric ID of a folder returned for that inbox
openmail folders messages --inbox-id inb_xxx --folder-id 42 --limit 20 --offset 0 --json

# Delete. A thread lands in Trash in the console, where it can be restored.
# Both need an account-wide or pod-scoped key.
openmail threads delete --thread-id thr_xxx
openmail messages delete --message-id msg_xxx

# Attachments: extract text (PDF, DOCX, XLSX, PPTX, images via OCR) or download
openmail attachments text --message-id msg_xxx --attachment-id "$ATTACHMENT_ID"
openmail attachments get --message-id msg_xxx --attachment-id "$ATTACHMENT_ID" --out ./second-report.pdf
```

Use `threads get --thread-id <id> --json` or `messages list --json` to find the
message's `id` and the selected file's `attachments[].id`. Pass them as `--message-id`
and `--attachment-id`. For an older message without IDs, `--filename` selects
the first matching name. Downloading by ID uses
the stored filename by default. If that file already exists, choose a path with `--out`.

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
openmail domain update --domain-id dom_xxx --pod-id pod_xxx   # or --all-pods
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

### Use with an agent

- **OpenClaw**: use the [`@openmail/openclaw` plugin](https://github.com/openmailsh/openclaw-plugin):
  `openclaw plugins install clawhub:@openmail/openclaw`
- **Hermes**: use the [`hermes-plugin`](https://github.com/openmailsh/hermes-plugin):
  `hermes plugins install openmailsh/hermes-plugin --enable`, then `hermes openmail setup`
- **Claude Code, Cursor, Codex**: install the agent skill from
  [openmailsh/skills](https://github.com/openmailsh/skills): `npx skills add openmailsh/skills`.

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

## Email drafts

To discard a draft when requested, read it first and delete that exact version:

```bash
openmail drafts get --draft-id "<draft-id>" --json
openmail drafts delete --draft-id "<draft-id>" --updated-at "<reviewed-updatedAt>" --json
```

Deletion permanently removes the unsent draft and its attachments without sending. Optional `--inbox-id` checks ownership. Stale versions return `draft_changed`; review the current draft and verify it is still the one to discard before another attempt. Never automatically fetch a new version and delete it. Pending or accepted sends return `draft_sending`; deletion cannot cancel sending. Missing or already removed drafts return 404. The deployed API must support `DELETE /v1/drafts/{draftId}`.

```bash
openmail drafts create --inbox-id "<inbox-id>" --to reader@example.com --subject "Proposal" --body-html "<p>Please review.</p>" --attach proposal.pdf --json
openmail drafts list --pod-id "<pod-id>" --inbox-id "<inbox-id>" --query Proposal --limit 20 --offset 0 --json
openmail drafts get --draft-id "<draft-id>" --json
openmail drafts edit --draft-id "<draft-id>" --updated-at "<current-updatedAt>" --body-html "<p>Revised proposal.</p>" --json
openmail drafts get --draft-id "<draft-id>" --json
openmail drafts send --draft-id "<draft-id>" --updated-at "<reviewed-updatedAt>" --json
```

Choose the sending inbox when creating the draft. All content fields are optional. Body input is HTML only (`--body-html`); the API generates the plain-text fallback. Pass one `--to` flag per primary recipient. Use `--cc` for copies and `--bcc` for blind copies. Both flags are repeatable. Attach files with repeatable `--attach`. HTML can contain supported embedded or public remote images. For a local inline image, pass `--inline-image 'inline-<UUID>@openmail=./photo.png'` and reference the same ID with `cid:` in the HTML. Files and inline images share a 25 MiB limit.

Use `--thread-id` to save a reply in a thread in the owning inbox. The API derives its reply subject. To associate a forward or new conversation with an existing thread, supply `--source-thread-id` alone with the message you want to send. Both appear on the source thread. List all accessible drafts or combine `--inbox-id`, `--pod-id`, `--source-thread-id`, and `--query`. Sending always uses the owning inbox. An optional `--inbox-id` on send must match it.

Review the sending inbox, recipients, subject, full body, attachments and reply thread before sending. `drafts send` requires the exact `updatedAt` returned by `drafts get`, sends stored content, and removes the draft only on success. A stale version returns 409 and must be reviewed again; failed or pending sends retain it. The command does not fetch a newer version or retry a changed draft automatically.

Use `drafts edit` with the exact `updatedAt` from `drafts get` to change recipients, subject or body without sending. Omitted fields are preserved. Each of `--to`, `--cc` and `--bcc` replaces its entire list. Repeat the flag to include multiple recipients. Use `--clear-to`, `--clear-cc` or `--clear-bcc` to clear recipients, and `--subject ""` or `--body-html ""` to clear content. Both create and edit accept only `--body-html` for body content. The server generates the plain-text fallback; `--body` is rejected. Attachments remain saved, except inline images removed from the replacement HTML. Editing cannot change the sending inbox or reply context. An optional `--inbox-id` checks ownership. Stale edits return 409 without retrying; get the current draft and reconcile the requested changes before another edit. Edits are blocked while a send is pending or accepted.

Requires the public draft editing and deletion endpoints and HTML-only draft creation. Deploy the combined API changes before releasing this CLI change.
