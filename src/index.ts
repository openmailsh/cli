#!/usr/bin/env node

import { getBooleanFlag, parseArgs } from "./lib/args";
import { version } from "../package.json";
import { runInboxCommand } from "./commands/inbox";
import { runPodCommand } from "./commands/pod";
import { runDomainCommand } from "./commands/domain";
import { runPolicyCommand } from "./commands/policy";
import { runAttachmentsCommand } from "./commands/attachments";
import { runMessagesCommand } from "./commands/messages";
import { runThreadsCommand } from "./commands/threads";
import { runSendCommand } from "./commands/send";
import { runInitCommand } from "./commands/init";
import {
  BridgeConfigError,
  ctxFromConfig,
  resolveBridgeConfig,
  resolveGlobalConfig,
} from "./lib/config";
import { readCliState } from "./lib/state";
import { ApiError, OpenMailHttpClient } from "./lib/http";
import { colorize, printData, logError, logInfo } from "./lib/output";
import { runWsBridge } from "./lib/ws-bridge";
import { runDoctor } from "./lib/doctor";
import { resolveInboxIdWithFallback } from "./lib/inbox-default";
import { runOpenClawCommand, refreshSkillFiles } from "./commands/openclaw";
import { resolveApiKeyForSetup } from "./lib/setup-auth";
import { runStatusCommand } from "./commands/status";
import { runFeedbackCommand } from "./commands/feedback";
import { runUpdateCommand } from "./commands/update";
import { notifyIfUpdateAvailable } from "./lib/update-check";

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const globalConfig = resolveGlobalConfig(parsed);
  const ctx = ctxFromConfig(globalConfig);

  const command = parsed.command[0];
  if (
    command === "version" ||
    command === "-v" ||
    parsed.flags.version === true ||
    parsed.flags.v === true
  ) {
    process.stdout.write(`${version}\n`);
    return;
  }
  if (!command) {
    printHelp();
    return;
  }

  if (command === "help" || command === "--help") {
    printHelp(parsed.command[1]);
    return;
  }

  if (parsed.flags.help === true || parsed.flags.h === true) {
    printHelp(command);
    return;
  }

  if (command === "ws" && parsed.command[1] === "bridge") {
    const apiKey =
      globalConfig.apiKey ??
      (await readCliState(globalConfig.statePath)).savedApiKey;
    if (!apiKey) {
      logError(ctx, "missing API key (set --api-key or OPENMAIL_API_KEY)");
      process.exit(0);
    }
    let bridge;
    try {
      bridge = resolveBridgeConfig(parsed, globalConfig.statePath);
    } catch (err) {
      if (err instanceof BridgeConfigError) {
        logError(ctx, err.message);
        process.exit(0);
      }
      throw err;
    }
    await runWsBridge(ctx, {
      baseUrl: globalConfig.baseUrl,
      apiKey,
      hookUrl: bridge.hookUrl,
      hookToken: bridge.hookToken,
      statePath: bridge.statePath,
      inboxIds: bridge.inboxIds,
      eventTypes: bridge.eventTypes,
    });
    return;
  }

  if (command === "update" || command === "upgrade") {
    const output = await runUpdateCommand({
      ctx,
      currentVersion: version,
    });
    if (ctx.output === "human") {
      if (output.status === "up_to_date") {
        process.stdout.write(`Already up to date (${output.to}).\n`);
      } else {
        const extras = [
          output.skillRefresh === "done" ? "Skill files refreshed." : "",
          output.bridge === "restarted" ? "Notification bridge restarted." : "",
        ]
          .filter(Boolean)
          .join(" ");
        process.stdout.write(
          `Updated to ${output.to}.${extras ? ` ${extras}` : ""}\n`,
        );
      }
      return;
    }
    printData(ctx, output);
    return;
  }

  if (command === "doctor") {
    await runDoctor(ctx, {
      baseUrl: globalConfig.baseUrl,
      apiKey: globalConfig.apiKey,
      hookUrl: process.env.OPENCLAW_HOOK_URL,
      hookToken: process.env.OPENCLAW_HOOK_TOKEN,
    });
    return;
  }
  if (command === "status") {
    const output = await runStatusCommand({
      parsed,
      ctx,
      baseUrl: globalConfig.baseUrl,
      apiKey: globalConfig.apiKey,
      statePath: globalConfig.statePath,
      clientFactory(apiKey) {
        return new OpenMailHttpClient({
          baseUrl: globalConfig.baseUrl,
          apiKey,
        });
      },
    });
    if (ctx.output === "human") {
      printStatusSummary(ctx, output);
      return;
    }
    printData(ctx, output);
    return;
  }

  let output: unknown;
  if (command === "setup" && getBooleanFlag(parsed.flags, "refresh-skill")) {
    // Prompt-free, network-free: rewrites already-installed skill files from
    // this binary's embedded template. Needs no API key.
    const result = await refreshSkillFiles();
    if (ctx.output === "human") {
      process.stdout.write(
        result.status === "refreshed"
          ? `Skill files refreshed (${result.refreshed.length}).\n`
          : result.status === "unchanged"
            ? "Skill files already up to date.\n"
            : "No installed skill files found — run `openmail setup` first.\n",
      );
      return;
    }
    printData(ctx, result);
    return;
  }
  if (command === "setup") {
    const reset = getBooleanFlag(parsed.flags, "reset");
    if (reset) {
      output = await runOpenClawCommand({
        parsed: { ...parsed, command: ["openclaw", "setup", ...parsed.command.slice(1)] },
        statePath: globalConfig.statePath,
        ctx,
      });
    } else {
      const apiKey = await resolveApiKeyForSetup({
        ctx,
        baseUrl: globalConfig.baseUrl,
        statePath: globalConfig.statePath,
        initialApiKey: globalConfig.apiKey,
      });
      const client = new OpenMailHttpClient({
        baseUrl: globalConfig.baseUrl,
        apiKey,
      });
      output = await runOpenClawCommand({
        client,
        parsed: { ...parsed, command: ["openclaw", "setup", ...parsed.command.slice(1)] },
        statePath: globalConfig.statePath,
        ctx,
        apiKey,
      });
    }
  } else {
    const apiKey =
      globalConfig.apiKey ??
      (await readCliState(globalConfig.statePath)).savedApiKey;
    if (!apiKey) {
      throw new Error("missing API key (set --api-key or OPENMAIL_API_KEY)");
    }
    const client = new OpenMailHttpClient({
      baseUrl: globalConfig.baseUrl,
      apiKey,
    });
    if (command === "init") {
    output = await runInitCommand({
      client,
      parsed,
      statePath: globalConfig.statePath,
      ctx,
    });
  } else if (command === "inbox") {
    output = await runInboxCommand(client, parsed);
  } else if (command === "pod") {
    output = await runPodCommand(client, parsed);
  } else if (command === "domain") {
    output = await runDomainCommand(client, parsed);
  } else if (command === "policy") {
    output = await runPolicyCommand(client, parsed);
  } else if (command === "attachments") {
    output = await runAttachmentsCommand(client, parsed);
  } else if (command === "send") {
    const inboxId = await resolveInboxIdWithFallback({
      client,
      parsed,
      statePath: globalConfig.statePath,
      ctx,
    });
    output = await runSendCommand(client, parsed, inboxId);
  } else if (command === "messages") {
    const inboxId = await resolveInboxIdWithFallback({
      client,
      parsed,
      statePath: globalConfig.statePath,
      ctx,
    });
    output = await runMessagesCommand(client, parsed, inboxId);
  } else if (command === "threads") {
    const action = parsed.command[1];
    const inboxId =
      action === "list"
        ? await resolveInboxIdWithFallback({
            client,
            parsed,
            statePath: globalConfig.statePath,
            ctx,
          })
        : undefined;
    output = await runThreadsCommand(client, parsed, inboxId);
  } else if (command === "feedback") {
    output = await runFeedbackCommand(client, parsed);
  } else if (command === "openclaw") {
    logInfo(
      ctx,
      "Deprecated: use `openmail setup` (alias kept for compatibility).",
    );
    output = await runOpenClawCommand({
      client,
      parsed,
      statePath: globalConfig.statePath,
      ctx,
      apiKey,
    });
  } else {
    throw new Error(`unknown command: ${command}`);
  }
  }

  if (
    ctx.output === "human" &&
    output &&
    typeof output === "object" &&
    "ok" in output &&
    command === "setup"
  ) {
    printSetupSuccess(ctx, output as SetupResult);
    return;
  }
  printData(ctx, output);

  // After the command's own output: a one-line nudge when a newer CLI is
  // published (cached, once-a-day registry hit, never in --json mode).
  await notifyIfUpdateAvailable(ctx, globalConfig.statePath, version);
}

main().catch((err: unknown) => {
  const parsed = parseArgs(process.argv.slice(2));
  const ctx = ctxFromConfig(resolveGlobalConfig(parsed));
  if (err instanceof ApiError) {
    logError(ctx, err.message, { status: err.status, body: err.body });
    process.exitCode = 1;
    return;
  }
  logError(ctx, err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});

function printHelp(topic?: string) {
  const usage = topic ? topic.trim().toLowerCase() : "";
  const globalFlags = [
    "Global flags:",
    "  --api-key <key>    Override OPENMAIL_API_KEY",
    "  --base-url <url>   Override OPENMAIL_BASE_URL (default: https://api.openmail.sh)",
    "  --state-path <p>   Override OPENMAIL_STATE_PATH (default: ~/.openmail-cli/state.json)",
    "  --json             JSON logs/output",
    "  --verbose          Verbose logging",
    "  --help             Show help for a command",
    "",
  ];

  if (!usage) {
    process.stdout.write(
      [
        ...getAsciiLogo(),
        "",
        "openmail.sh CLI",
        "",
        "Usage:",
        "  openmail <command> [subcommand] [flags]",
        "  openmail help <command>",
        "",
        "Commands:",
        "  setup      OpenClaw setup (current default integration)",
        "  status     Show current OpenMail/OpenClaw runtime status",
        "  init       Create a new inbox and set as default",
        "  inbox      Manage inboxes, inbox API keys, and webhooks",
        "  pod        Manage pods and pod API keys",
        "  domain     Manage custom sending domains",
        "  policy     Correspondent policy: who may email an inbox, who it may email",
        "  send       Send an email",
        "  messages   List messages for an inbox",
        "  threads    List/get threads",
        "  attachments  Download or extract text from an attachment",
        "  feedback   Report a bug, friction, or feature request to the OpenMail team",
        "  openclaw   OpenClaw setup helpers",
        "  ws         WebSocket utilities (bridge)",
        "  doctor     Run connectivity/config diagnostics",
        "  update     Update the CLI to the latest version and refresh skill files",
        "",
        ...globalFlags,
      ].join("\n"),
    );
    return;
  }

  if (usage === "init") {
    process.stdout.write(
      [
        "openmail init",
        "",
        "Usage:",
        "  init [--mailbox-name <name>] [--display-name <sender name>]",
        "",
        "Creates a new inbox and sets it as the default. Prompts interactively for mailbox name and display name when run without flags.",
        "",
        ...globalFlags,
      ].join("\n"),
    );
    return;
  }

  if (usage === "setup") {
    process.stdout.write(
      [
        "openmail setup",
        "",
        "Usage:",
        "  setup [--agent openclaw|claude-code]",
        "  setup [--mode tool|notify|channel]",
        "  setup [--openclaw-home <path>] [--hook-path </hooks/openmail>] [--hooks-token <token>] [--with-systemd] [--reconfigure]",
        "  setup [--inbox-id <id>] [--mailbox-name <name>] [--display-name <sender>]",
        "  setup --refresh-skill",
        "  setup --reset [--force]",
        "",
        "Agents:",
        "  openclaw    OpenClaw integration — skill + env + WebSocket bridge (default)",
        "  claude-code Claude Code integration — skill to ~/.claude/skills/, env to ~/.claude/openmail.env",
        "",
        "Modes (openclaw only):",
        "  tool       Agent sends/reads email on demand (default)",
        "  notify     Real-time alerts when new email arrives (WebSocket bridge)",
        "  channel    Inbound emails trigger the agent directly (WebSocket bridge)",
        "",
        "Runs idempotent setup. Prompts for inbox and mode selection.",
        "A WebSocket bridge (systemd/launchd) is auto-configured for notify and channel modes.",
        "--reconfigure re-prompts for interactive choices.",
        "--refresh-skill only rewrites already-installed skill files from this",
        "version's template — no prompts, no API calls, no config changes.",
        "--reset removes OpenMail setup files (requires double confirmation unless --force).",
        "",
        ...globalFlags,
      ].join("\n"),
    );
    return;
  }

  if (usage === "status") {
    process.stdout.write(
      [
        "openmail status",
        "",
        "Usage:",
        "  status [--openclaw-home <path>]",
        "",
        "Shows live status for API/auth, setup files, and bridge runtime.",
        "",
        ...globalFlags,
      ].join("\n"),
    );
    return;
  }

  if (usage === "inbox") {
    process.stdout.write(
      [
        "openmail inbox",
        "",
        "Subcommands:",
        "  create [--mailbox-name <name>] [--display-name <sender name>] [--domain <domain>] [--pod-id <pod_id>]",
        "  list [--pod-id <pod_id>] [--limit <n>] [--offset <n>]",
        "  get --inbox-id <inbox_id>",
        "  update --inbox-id <inbox_id> --display-name <sender name>",
        "  delete --inbox-id <inbox_id>",
        "  keys create --inbox-id <inbox_id> [--name <name>]",
        "  keys list --inbox-id <inbox_id>",
        "  keys revoke --inbox-id <inbox_id> --key-id <key_id>",
        "  webhook set --inbox-id <inbox_id> --url <url>",
        "  webhook clear --inbox-id <inbox_id>",
        "  webhook rotate-secret --inbox-id <inbox_id>",
        "  webhook test --inbox-id <inbox_id>",
        "",
        "create: --domain picks a verified custom domain for the address; --pod-id",
        "places the inbox in a pod (a pod-scoped key always creates in its own pod).",
        "",
        "keys: inbox-scoped API keys can only read and send from that one inbox.",
        "Needs an account-wide or pod-scoped key; inbox-scoped keys cannot mint",
        "keys. The token is shown once at creation and never retrievable again.",
        "",
        "webhook: where the inbox POSTs events (new message, delivery, bounce).",
        "Set it only if you want to react in real time; otherwise poll with",
        "`threads list --is-read false`. Account-wide key only.",
        "",
        "Examples:",
        "  openmail inbox create --display-name \"Research agent\" --json",
        "  openmail inbox keys create --inbox-id inb_xxx --name research --json",
        "  openmail inbox webhook set --inbox-id inb_xxx --url https://example.com/hooks/openmail",
        "",
        ...globalFlags,
      ].join("\n"),
    );
    return;
  }

  if (usage === "pod") {
    process.stdout.write(
      [
        "openmail pod",
        "",
        "Subcommands:",
        "  create [--name <label>] [--client-id <your id>]",
        "  list [--limit <n>] [--offset <n>]",
        "  get --pod-id <pod_id>",
        "  update --pod-id <pod_id> [--name <label>] [--client-id <your id>]",
        "  delete --pod-id <pod_id>",
        "  keys create --pod-id <pod_id> [--name <name>]",
        "  keys list --pod-id <pod_id>",
        "  keys revoke --pod-id <pod_id> --key-id <key_id>",
        "",
        "A pod groups inboxes and domains. Use one pod per agent (or per tenant)",
        "and give that agent a pod-scoped key: it can create and use inboxes in",
        "its pod and nothing outside it. --client-id is your own stable id for the",
        "pod and can be used in place of the pod id everywhere. Pod management",
        "needs an account-wide key. Key tokens are shown once at creation.",
        "",
        "Examples:",
        "  openmail pod create --name research --json",
        "  openmail pod keys create --pod-id pod_xxx --name research --json",
        "",
        ...globalFlags,
      ].join("\n"),
    );
    return;
  }

  if (usage === "domain") {
    process.stdout.write(
      [
        "openmail domain",
        "",
        "Subcommands:",
        "  add --domain <mail.example.com> [--pod-id <pod_id>]",
        "  list [--limit <n>] [--offset <n>]",
        "  get --domain-id <domain_id>",
        "  verify --domain-id <domain_id>",
        "  delete --domain-id <domain_id>",
        "",
        "add returns the DNS records to publish; verify re-checks them. Once",
        "verified, create inboxes on it with `inbox create --domain`. --pod-id",
        "restricts the domain to one pod; omit it for an account-wide domain.",
        "",
        ...globalFlags,
      ].join("\n"),
    );
    return;
  }

  if (usage === "policy") {
    process.stdout.write(
      [
        "openmail policy",
        "",
        "Subcommands:",
        "  get [--pod-id <id> | --inbox-id <id>]",
        "  mode --direction inbound|outbound --mode none|allowlist|inherit [--pod-id | --inbox-id]",
        "  allow --value <addr|domain|*.domain> --direction inbound|outbound [--pod-id | --inbox-id]",
        "  block --value <addr|domain|*.domain> --direction inbound|outbound [--pod-id | --inbox-id]",
        "  rules remove --rule-id <rule_id> [--pod-id | --inbox-id]",
        "  audit [--action <a>] [--direction inbound|outbound] [--since <iso>] [--until <iso>] [--limit <n>] [--offset <n>]",
        "",
        "Correspondent policy controls who may email an inbox (inbound) and who",
        "it may email (outbound, enforced on To/Cc/Reply-To). Scope defaults to",
        "the account; --pod-id or --inbox-id targets one pod or inbox. Modes:",
        "  none       no filtering",
        "  allowlist  only allowed correspondents (an empty allowlist denies all)",
        "  inherit    defer to the parent scope (pod, then account)",
        "A pod-scoped key may only change its own pod and its inboxes, and cannot",
        "set `none` or add allows beyond a parent allowlist. Inbox keys cannot",
        "read or change policy.",
        "",
        "Examples:",
        "  openmail policy mode --inbox-id inb_xxx --direction inbound --mode allowlist",
        "  openmail policy allow --inbox-id inb_xxx --direction inbound --value marc@example.com",
        "  openmail policy block --direction outbound --value *.competitor.com",
        "",
        ...globalFlags,
      ].join("\n"),
    );
    return;
  }

  if (usage === "attachments") {
    process.stdout.write(
      [
        "openmail attachments",
        "",
        "Subcommands:",
        "  text --message-id <id> --filename <name>",
        "  get --message-id <id> --filename <name> [--out <path>]",
        "",
        "text extracts plain text from PDF, DOCX, XLSX, PPTX and images (OCR) —",
        "use this to read an attachment without parsing the file yourself.",
        "get downloads the raw file (default: the attachment's filename in cwd).",
        "Message ids and filenames come from `threads get` / `messages list`.",
        "",
        ...globalFlags,
      ].join("\n"),
    );
    return;
  }

  if (usage === "send") {
    process.stdout.write(
      [
        "openmail send",
        "",
        "Usage:",
        "  send --to <email> --subject <text> --body <text> [--inbox-id <id>]",
        "       [--cc <email>] [--thread-id <id>] [--no-quote]",
        "       [--idempotency-key <key>] [--reply-to <email>] [--attach <file>]",
        "",
        "Options:",
        "  --to <email>        Single primary recipient (may only be given once)",
        "  --cc <email>        Additional recipient (repeatable for multiple people)",
        "  --body <text>       Plain text or HTML (HTML is auto-detected and rendered)",
        "  --thread-id <id>    Reply in a thread; quotes the previous message by default",
        "  --no-quote          Send only your reply text (skip auto-quoted history)",
        "  --reply-to <email>  Address replies should go to. Free plan: must be the",
        "                      address of an inbox you own. Pro+: any address.",
        "  --attach <file>     Attach a file (repeatable for multiple files)",
        "",
        "Examples:",
        "  openmail send --to user@example.com --subject Hi --body Hello",
        "  openmail send --to a@example.com --cc b@example.com --cc c@example.com --subject Hi --body Hello",
        "  openmail send --to user@example.com --subject Hi --body \"<p>Hello</p>\"",
        "  openmail send --to user@example.com --subject Hi --body Hello --attach report.pdf",
        "  openmail send --to user@example.com --subject Hi --body Hello --attach a.pdf --attach b.png",
        "  openmail send --to user@example.com --subject Hi --body Hello --reply-to support@yourdomain.com",
        "",
        ...globalFlags,
      ].join("\n"),
    );
    return;
  }

  if (usage === "messages") {
    process.stdout.write(
      [
        "openmail messages",
        "",
        "Subcommands:",
        "  list [--inbox-id <id>] [--direction inbound|outbound] [--limit <n>] [--offset <n>]",
        "",
        ...globalFlags,
      ].join("\n"),
    );
    return;
  }

  if (usage === "threads") {
    process.stdout.write(
      [
        "openmail threads",
        "",
        "Subcommands:",
        "  list [--inbox-id <id>] [--is-read true|false] [--limit <n>] [--offset <n>]",
        "  get --thread-id <id>",
        "  read --thread-id <id>        Mark a thread as read",
        "  unread --thread-id <id>      Mark a thread as unread",
        "",
        ...globalFlags,
      ].join("\n"),
    );
    return;
  }

  if (usage === "feedback") {
    process.stdout.write(
      [
        "openmail feedback",
        "",
        "Usage:",
        "  feedback --type bug|friction|feature_request --message <text>",
        "           [--endpoint <api path>] [--error-code <code>] [--request-id <id>]",
        "",
        "Reports a problem or suggestion about OpenMail itself directly to the",
        "OpenMail team. Use it when an API call fails unexpectedly, a response",
        "looks wrong, or something would make the service work better for you.",
        "",
        "Types:",
        "  bug              Something broken or a response that looks wrong",
        "  friction         Works, but confusing or harder than it should be",
        "  feature_request  A capability OpenMail lacks",
        "",
        "Examples:",
        "  openmail feedback --type bug --message \"send returned 500 for a plain text email\" --endpoint /v1/inboxes/{id}/send --error-code internal_error",
        "  openmail feedback --type feature_request --message \"let me search messages by subject\"",
        "",
        ...globalFlags,
      ].join("\n"),
    );
    return;
  }

  if (usage === "openclaw") {
    process.stdout.write(
      [
        "openmail openclaw (deprecated — use `openmail setup`)",
        "",
        "Subcommands:",
        "  setup [--mode tool|notify|channel]",
        "        [--openclaw-home <path>] [--hook-path </hooks/openmail>] [--hooks-token <token>] [--with-systemd]",
        "",
        "Creates OpenClaw skill + env files and optionally a WebSocket bridge service.",
        "",
        ...globalFlags,
      ].join("\n"),
    );
    return;
  }

  if (usage === "ws" || usage === "bridge") {
    process.stdout.write(
      [
        "openmail ws bridge",
        "",
        "Usage:",
        "  ws bridge [--hook-url <url>] [--hook-token <token>]",
        "            [--inbox-ids <a,b>] [--event-types <a,b>] [--state-path <path>]",
        "",
        "Environment:",
        "  OPENMAIL_API_KEY, OPENCLAW_HOOK_URL, OPENCLAW_HOOK_TOKEN",
        "",
        ...globalFlags,
      ].join("\n"),
    );
    return;
  }

  if (usage === "update" || usage === "upgrade") {
    process.stdout.write(
      [
        "openmail update",
        "",
        "Usage:",
        "  update",
        "",
        "Updates the globally installed @openmail/cli to the latest published",
        "version (npm install -g), refreshes installed skill files via",
        "`setup --refresh-skill` (no prompts, no API calls, no config changes),",
        "and restarts the notification bridge service if one is running so it",
        "picks up the new code. `upgrade` is an alias.",
        "",
        "A one-line notice is printed after any command when a newer version",
        "is available (checked against the npm registry at most once per day).",
        "",
        ...globalFlags,
      ].join("\n"),
    );
    return;
  }

  if (usage === "doctor") {
    process.stdout.write(
      [
        "openmail doctor",
        "",
        "Usage:",
        "  doctor",
        "",
        "Checks OpenMail health/auth and validates bridge config.",
        "",
        ...globalFlags,
      ].join("\n"),
    );
    return;
  }

  process.stdout.write(`Unknown help topic: ${usage}\n`);
  process.stdout.write("Run `openmail help` to list available commands.\n");
}

function getAsciiLogo(): string[] {
  return [
    " ██████╗ ██████╗ ███████╗███╗   ██╗███╗   ███╗ █████╗ ██╗██╗     ",
    "██╔═══██╗██╔══██╗██╔════╝████╗  ██║████╗ ████║██╔══██╗██║██║     ",
    "██║   ██║██████╔╝█████╗  ██╔██╗ ██║██╔████╔██║███████║██║██║     ",
    "██║   ██║██╔═══╝ ██╔══╝  ██║╚██╗██║██║╚██╔╝██║██╔══██║██║██║     ",
    "╚██████╔╝██║     ███████╗██║ ╚████║██║ ╚═╝ ██║██║  ██║██║███████╗",
    " ╚═════╝ ╚═╝     ╚══════╝╚═╝  ╚═══╝╚═╝     ╚═╝╚═╝  ╚═╝╚═╝╚══════╝",
  ];
}

type SetupResult = {
  ok: boolean;
  status?: "configured" | "already_configured" | "reset_done";
  changedFiles?: string[];
  removedFiles?: string[];
  openclawHome: string;
  inbox?: { id: string | null; address: string | null };
  files?: { skill: string; env: string; systemd: string | null };
  next?: {
    usageMode: "tool" | "notify" | "channel";
    runBridge?: string;
    reminder?: string;
    bridgeStatus?: "systemd" | "launchd" | "process" | "manual" | "none";
    bridgePid?: number;
    persistHint?: string;
  };
};

function printSetupSuccess(ctx: ReturnType<typeof ctxFromConfig>, data: SetupResult) {
  const titleText =
    data.status === "reset_done"
      ? "✓ Setup reset complete"
      : data.status === "already_configured"
        ? "✓ Already configured"
        : "✓ Setup complete";
  const title = colorize(ctx, "green", titleText);
  const label = (text: string) => colorize(ctx, "cyan", text);
  process.stdout.write(`${title}\n\n`);
  if (data.status === "reset_done") {
    process.stdout.write(`${label("Removed files:")} ${data.removedFiles?.length ?? 0}\n`);
    if (data.next?.reminder) {
      process.stdout.write(`${label("Reminder:")} ${data.next.reminder}\n`);
    }
    return;
  }

  const usageMode = data.next?.usageMode ?? "tool";
  const usageModeLabel =
    usageMode === "tool"
      ? "Tool (on demand)"
      : usageMode === "notify"
        ? "Tool + Notifications"
        : "Full Channel";

  const bridgeStatus = data.next?.bridgeStatus ?? "none";
  const bridgeStatusText =
    bridgeStatus === "none"
      ? "not needed (tool mode)"
      : bridgeStatus === "systemd"
        ? "managed by systemd (WebSocket)"
        : bridgeStatus === "launchd"
          ? "managed by launchd (WebSocket)"
          : bridgeStatus === "process"
            ? `running (pid ${data.next?.bridgePid ?? "?"})`
            : "not running (manual start required)";

  process.stdout.write(`${label("Mode:")} ${usageModeLabel}\n`);
  if (data.inbox?.address) {
    process.stdout.write(`${label("Inbox:")} ${data.inbox.address}\n`);
  }
  if (bridgeStatus !== "none") {
    process.stdout.write(`${label("Bridge:")} ${bridgeStatusText}\n`);
  }
  if (ctx.verbose) {
    process.stdout.write(`${label("Updated files:")} ${data.changedFiles?.length ?? 0}\n`);
  }

  if (bridgeStatus === "process") {
    process.stdout.write(`\n${label("Note:")} Bridge started but will not survive a reboot.\n`);
    if (data.next?.persistHint) {
      process.stdout.write(`${label("Make permanent:")} ${data.next.persistHint}\n`);
    }
    process.stdout.write(`${label("Log:")} /tmp/openmail-bridge.log\n`);
    process.stdout.write(`${label("Tip:")} Run 'openmail status' anytime\n`);
  } else if (bridgeStatus === "manual" && data.next?.runBridge) {
    process.stdout.write("\n");
    process.stdout.write(`${label("Run:")}\n  ${data.next.runBridge}\n`);
    process.stdout.write(`\n${label("Tip:")} Run 'openmail status' anytime\n`);
  } else {
    process.stdout.write(`\n${label("Tip:")} Run 'openmail status' anytime\n`);
  }
}

function printStatusSummary(
  ctx: ReturnType<typeof ctxFromConfig>,
  data: Awaited<ReturnType<typeof runStatusCommand>>,
) {
  const label = (text: string) => colorize(ctx, "cyan", text);
  const ok = (text: string) => colorize(ctx, "green", text);
  const warn = (text: string) => colorize(ctx, "yellow", text);
  const bad = (text: string) => colorize(ctx, "red", text);

  process.stdout.write(`${ok("✓ OpenMail status")}\n\n`);
  process.stdout.write(
    `${label("API:")} ${data.api.health === "ok" ? ok("reachable") : bad("unreachable")} (${data.api.baseUrl})\n`,
  );
  process.stdout.write(
    `${label("Auth:")} ${
      data.api.auth === "ok"
        ? ok("valid")
        : data.api.auth === "skipped"
          ? warn("not checked (no API key)")
          : bad("invalid")
    } [source: ${data.api.apiKeySource}]\n`,
  );
  const usageModeLabel =
    data.setup.usageMode === "tool"
      ? "Tool (on demand)"
      : data.setup.usageMode === "notify"
        ? "Tool + Notifications"
        : data.setup.usageMode === "channel"
          ? "Full Channel"
          : "unknown";
  process.stdout.write(`${label("Mode:")} ${usageModeLabel}\n`);
  process.stdout.write(
    `${label("Setup files:")} env=${data.setup.files.env ? "yes" : "no"}, skill=${data.setup.files.skill ? "yes" : "no"}, systemd=${data.setup.files.systemdUnit ? "yes" : "no"}\n`,
  );
  process.stdout.write(
    `${label("Bridge:")} ${
      data.bridge.status === "active"
        ? ok("active")
        : data.bridge.status === "activating"
          ? warn("activating")
          : data.bridge.status === "deactivating"
            ? warn("deactivating")
        : data.bridge.status === "inactive"
          ? warn("inactive")
          : data.bridge.status === "failed"
            ? bad("failed")
            : warn(data.bridge.status)
    } (${data.bridge.type})\n`,
  );
}
