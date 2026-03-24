#!/usr/bin/env node

import { getBooleanFlag, parseArgs } from "./lib/args";
import { version } from "../package.json";
import { runInboxCommand } from "./commands/inbox";
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
import { runOpenClawCommand } from "./commands/openclaw";
import { resolveApiKeyForSetup } from "./lib/setup-auth";
import { runStatusCommand } from "./commands/status";

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
        "  inbox      Manage inboxes",
        "  send       Send an email",
        "  messages   List messages for an inbox",
        "  threads    List/get threads",
        "  openclaw   OpenClaw setup helpers",
        "  ws         WebSocket utilities (bridge)",
        "  doctor     Run connectivity/config diagnostics",
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
        "  setup [--mode tool|notify|channel]",
        "  setup [--openclaw-home <path>] [--hook-path </hooks/openmail>] [--hooks-token <token>] [--with-systemd] [--reconfigure]",
        "  setup [--inbox-id <id>] [--mailbox-name <name>] [--display-name <sender>]",
        "  setup --reset [--force]",
        "",
        "Modes:",
        "  tool       Agent sends/reads email on demand (default)",
        "  notify     Real-time alerts when new email arrives (WebSocket bridge)",
        "  channel    Inbound emails trigger the agent directly (WebSocket bridge)",
        "",
        "Runs idempotent OpenClaw integration setup. Prompts for inbox and mode selection.",
        "A WebSocket bridge (systemd/launchd) is auto-configured for notify and channel modes.",
        "--reconfigure re-prompts for interactive choices.",
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
        "  create [--mailbox-name <name>] [--display-name <sender name>]",
        "  list [--limit <n>] [--offset <n>]",
        "  get --id <inbox_id>",
        "  delete --id <inbox_id>",
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
        "       [--body-html <html>] [--thread-id <id>] [--idempotency-key <key>]",
        "       [--attach <file>]",
        "",
        "Attachments:",
        "  --attach <file>  Attach a file (repeatable for multiple files)",
        "",
        "Examples:",
        "  openmail send --to user@example.com --subject Hi --body Hello",
        "  openmail send --to user@example.com --subject Hi --body Hello --attach report.pdf",
        "  openmail send --to user@example.com --subject Hi --body Hello --attach a.pdf --attach b.png",
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
        "  list [--inbox-id <id>] [--limit <n>] [--offset <n>]",
        "  get --thread-id <id>",
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
