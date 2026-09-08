---
name: openmail
description: Send, read, and manage email through the OpenMail CLI (`openmail`).
---

# OpenMail CLI

`openmail` is a CLI for the OpenMail API: agent inboxes, sending, reading
threads, attachments, and correspondent policy. Add `--json` to any command for
machine-readable output. `openmail help <command>` prints the full flag list.

## Auth

Set `OPENMAIL_API_KEY` in the environment, or pass `--api-key <key>`. If no key
is set, the CLI falls back to the one saved in `~/.openmail-cli/state.json`.

```bash
openmail init --mailbox-name research --display-name "Research agent"
```

`init` creates an inbox and saves it as the default, so `send`, `messages`, and
`threads list` work without `--inbox-id`.

## Inboxes

```bash
openmail inbox list --json
openmail inbox create --mailbox-name research --display-name "Research agent" --json
openmail inbox get --inbox-id inb_xxx
openmail inbox delete --inbox-id inb_xxx
```

## Read mail

```bash
openmail threads list --is-read false --json          # unread threads in the default inbox
openmail threads get --thread-id thr_xxx --json       # all messages in a thread
openmail threads read --thread-id thr_xxx             # mark as read
openmail messages list --direction inbound --limit 20 --json
```

## Send and reply

```bash
openmail send --to user@example.com --subject "Hi" --body "Hello"
openmail send --to a@example.com --cc b@example.com --subject "Hi" --body "Hello"
openmail send --to user@example.com --subject "Report" --body "Attached." --attach report.pdf
openmail send --thread-id thr_xxx --to user@example.com --body "Reply text"   # reply; quotes history unless --no-quote
```

`--body` accepts plain text or HTML. `--subject` is optional when replying with
`--thread-id`.

## Attachments

```bash
openmail attachments text --message-id msg_xxx --filename report.pdf   # extract text (PDF, DOCX, XLSX, PPTX, images via OCR)
openmail attachments get --message-id msg_xxx --filename report.pdf --out ./report.pdf
```

## Policy

Controls who may email an inbox (inbound) and who it may email (outbound).

```bash
openmail policy get --inbox-id inb_xxx
openmail policy mode --inbox-id inb_xxx --direction inbound --mode allowlist
openmail policy allow --inbox-id inb_xxx --direction inbound --value marc@example.com
openmail policy block --direction outbound --value "*.competitor.com"
```

## Pods

A pod groups inboxes; a pod-scoped key can only act inside its pod.

```bash
openmail pod create --name research --json
openmail pod keys create --pod-id pod_xxx --name research --json   # token shown once
```
