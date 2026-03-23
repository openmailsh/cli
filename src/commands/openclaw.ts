import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { cancel, confirm, isCancel, select, text } from "@clack/prompts";
import type { ParsedArgs } from "../lib/args";
import { getBooleanFlag, getStringFlag } from "../lib/args";
import type { OpenMailHttpClient } from "../lib/http";
import type { CliContext } from "../lib/output";
import { clearScreen, logError, logInfo } from "../lib/output";
import { readCliState, writeCliState } from "../lib/state";
import { resolveInboxCreateParams } from "../lib/inbox-create";

type Inbox = {
  id: string;
  address: string;
  displayName?: string | null;
};

type SetupMode = "websocket" | "webhook";

export async function runOpenClawCommand(params: {
  client?: OpenMailHttpClient;
  parsed: ParsedArgs;
  statePath: string;
  ctx: CliContext;
  apiKey?: string;
}) {
  const action = params.parsed.command[1];
  if (action !== "setup") {
    throw new Error("openclaw command supports only: setup");
  }

  const homeDir = os.homedir();
  const openclawHome =
    getStringFlag(params.parsed.flags, "openclaw-home") ??
    process.env.OPENCLAW_HOME ??
    path.join(homeDir, ".openclaw");
  const hooksToken =
    getStringFlag(params.parsed.flags, "hooks-token") ?? process.env.OPENCLAW_HOOK_TOKEN ?? "";
  const hookPath = getStringFlag(params.parsed.flags, "hook-path") ?? "/hooks/openmail";
  const withSystemd =
    getBooleanFlag(params.parsed.flags, "with-systemd") ||
    process.env.OPENMAIL_SETUP_SYSTEMD === "1";
  const reset = getBooleanFlag(params.parsed.flags, "reset");
  const force = getBooleanFlag(params.parsed.flags, "force");
  if (reset) {
    return await runResetSetup({
      ctx: params.ctx,
      statePath: params.statePath,
      openclawHome,
      force,
    });
  }
  if (!params.client || !params.apiKey) {
    throw new Error("missing API key (set --api-key or OPENMAIL_API_KEY)");
  }
  if (getBooleanFlag(params.parsed.flags, "check")) {
    throw new Error("`openmail setup --check` was removed. Use `openmail status`.");
  }
  const reconfigure = getBooleanFlag(params.parsed.flags, "reconfigure");
  const requestedMode = getStringFlag(params.parsed.flags, "mode") ?? process.env.OPENMAIL_SETUP_MODE;
  const state = await readCliState(params.statePath);
  const defaultMode = state.defaultSetupMode;
  const mode = await resolveSetupMode({
    requestedMode,
    ctx: params.ctx,
    defaultMode,
    allowPrompt: (reconfigure || !defaultMode) && !requestedMode,
  });

  const inbox = await ensureInboxForSetup({
    client: params.client,
    parsed: params.parsed,
    statePath: params.statePath,
    ctx: params.ctx,
  });

  const skillDir = path.join(openclawHome, "skills", "openmail");
  const skillPath = path.join(skillDir, "SKILL.md");
  const skillWrite = await writeFileIfChanged(
    skillPath,
    buildSkillMarkdown(),
  );

  const envFilePath = path.join(openclawHome, "openmail.env");
  const envWrite = await writeFileIfChanged(
    envFilePath,
    [
      `OPENMAIL_API_KEY=${params.apiKey}`,
      `OPENMAIL_INBOX_ID=${inbox?.id ?? ""}`,
      `OPENMAIL_ADDRESS=${inbox?.address ?? ""}`,
      ...(hooksToken ? [`OPENCLAW_HOOK_TOKEN=${hooksToken}`] : []),
    ].join("\n") + "\n",
  );

  const jsonSnippet = {
    skills: {
      entries: {
        openmail: {
          enabled: true,
          env: {
            OPENMAIL_API_KEY: params.apiKey,
            OPENMAIL_INBOX_ID: inbox?.id ?? "",
            OPENMAIL_ADDRESS: inbox?.address ?? "",
          },
        },
      },
    },
  };

  let systemdPath: string | undefined;
  let systemdWrite:
    | {
        changed: boolean;
        existed: boolean;
      }
    | undefined;
  const useSystemd = mode === "websocket" && (withSystemd || canManageSystemdUser());
  if (useSystemd) {
    const serviceDir = path.join(homeDir, ".config", "systemd", "user");
    systemdPath = path.join(serviceDir, "openmail-openclaw-bridge.service");
    systemdWrite = await writeFileIfChanged(
      systemdPath,
      buildSystemdUnit({
        envFilePath,
        hookPath,
      }),
    );
  }
  if (withSystemd && mode === "webhook") {
    logError(
      params.ctx,
      "`--with-systemd` is ignored for webhook mode. Use your HTTP stack for webhook ingestion.",
    );
  }

  let systemdManaged = false;
  if (useSystemd && systemdPath) {
    const enabled = enableSystemdBridge();
    if (enabled) {
      systemdManaged = true;
    } else {
      logError(
        params.ctx,
        "Could not start bridge with systemd automatically. Falling back to manual bridge command.",
      );
    }
  }

  let launchdPath: string | undefined;
  let launchdWrite:
    | {
        changed: boolean;
        existed: boolean;
      }
    | undefined;
  const useLaunchd = mode === "websocket" && !useSystemd && process.platform === "darwin";
  if (useLaunchd) {
    const launchAgentsDir = path.join(homeDir, "Library", "LaunchAgents");
    launchdPath = path.join(launchAgentsDir, "sh.openmail.openclaw-bridge.plist");
    launchdWrite = await writeFileIfChanged(
      launchdPath,
      buildLaunchdPlist({ envFilePath, hookPath }),
    );
  }

  let launchdManaged = false;
  if (useLaunchd && launchdPath) {
    const enabled = enableLaunchdBridge(launchdPath);
    if (enabled) {
      launchdManaged = true;
    } else {
      logError(
        params.ctx,
        "Could not start bridge with launchd automatically. Falling back to manual bridge command.",
      );
    }
  }

  if (params.ctx.output === "json" || params.ctx.verbose) {
    logInfo(params.ctx, `Prepared OpenClaw skill: ${skillPath}`);
    logInfo(params.ctx, `Prepared OpenMail env: ${envFilePath}`);
    if (systemdPath && systemdWrite) {
      logInfo(params.ctx, `Prepared systemd service: ${systemdPath}`);
    }
    if (launchdPath && launchdWrite) {
      logInfo(params.ctx, `Prepared launchd plist: ${launchdPath}`);
    }
  }

  const nextState = await readCliState(params.statePath);
  nextState.defaultSetupMode = mode;
  await writeCliState(params.statePath, nextState);

  const changes = [
    ...(skillWrite.changed ? [skillPath] : []),
    ...(envWrite.changed ? [envFilePath] : []),
    ...(systemdWrite?.changed && systemdPath ? [systemdPath] : []),
    ...(launchdWrite?.changed && launchdPath ? [launchdPath] : []),
  ];

  const alreadyConfigured = changes.length === 0;

  return {
    ok: true,
    status: alreadyConfigured ? "already_configured" : "configured",
    changedFiles: changes,
    openclawHome,
    inbox: {
      id: inbox.id,
      address: inbox.address,
    },
    files: {
      skill: skillPath,
      env: envFilePath,
      systemd: systemdPath ?? null,
      launchd: launchdPath ?? null,
    },
    next: {
      mode,
      mergeConfigSnippet: jsonSnippet,
      ...(mode === "websocket"
        ? {
            ...(systemdManaged
              ? { bridgeStatus: "systemd" }
              : launchdManaged
                ? { bridgeStatus: "launchd" }
                : {
                    bridgeStatus: "manual",
                    runBridge: `OPENCLAW_HOOK_URL=http://127.0.0.1:18789${hookPath} OPENCLAW_HOOK_TOKEN=$OPENCLAW_HOOK_TOKEN OPENMAIL_API_KEY=$OPENMAIL_API_KEY openmail ws bridge`,
                  }),
            ...(useSystemd
              ? {
                  enableSystemd: [
                    "systemctl --user daemon-reload",
                    "systemctl --user enable --now openmail-openclaw-bridge.service",
                  ],
                }
              : {}),
          }
        : {
            bridgeStatus: "webhook",
            webhookGuide: [
              "Configure your webhook receiver URL in OpenMail console.",
              "Verify X-Signature and X-Timestamp before processing events.",
              `Forward verified payloads to OpenClaw hook ${hookPath} with Authorization: Bearer $OPENCLAW_HOOK_TOKEN.`,
            ],
          }),
    },
  };
}

function buildSkillMarkdown(): string {
  return `---
name: openmail
description: Send and receive email via OpenMail
requires:
  env:
    - OPENMAIL_API_KEY
    - OPENMAIL_INBOX_ID
    - OPENMAIL_ADDRESS
---

# OpenMail

Your email address is $OPENMAIL_ADDRESS.

## List messages

\`\`\`bash
openmail messages list --direction inbound
\`\`\`

## Send an email

\`\`\`bash
openmail send --to "recipient@example.com" --subject "Subject" --body "Message body"
\`\`\`

## List threads

\`\`\`bash
openmail threads list
\`\`\`

## Read a thread

\`\`\`bash
openmail threads get --thread-id "thr_..."
\`\`\`
`;
}

function buildSystemdUnit(params: { envFilePath: string; hookPath: string }): string {
  const scriptPath = process.argv[1] ?? "packages/cli/dist/index.js";
  return `[Unit]
Description=OpenMail to OpenClaw WebSocket bridge
After=network-online.target
StartLimitIntervalSec=300
StartLimitBurst=5

[Service]
Type=simple
EnvironmentFile=${params.envFilePath}
Environment=OPENCLAW_HOOK_URL=http://127.0.0.1:18789${params.hookPath}
ExecStart=${process.execPath} ${scriptPath} ws bridge
Restart=on-failure
RestartSec=5
TimeoutStopSec=10

[Install]
WantedBy=default.target
`;
}

async function runResetSetup(params: {
  ctx: CliContext;
  statePath: string;
  openclawHome: string;
  force: boolean;
}) {
  const targets = {
    env: path.join(params.openclawHome, "openmail.env"),
    skillDir: path.join(params.openclawHome, "skills", "openmail"),
    systemd: path.join(os.homedir(), ".config", "systemd", "user", "openmail-openclaw-bridge.service"),
    launchd: path.join(os.homedir(), "Library", "LaunchAgents", "sh.openmail.openclaw-bridge.plist"),
  };

  if (!params.force) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      throw new Error("refusing to reset in non-interactive mode. Re-run with --force.");
    }
    const accepted = await confirm({
      message: "This will remove OpenMail setup files from OpenClaw. Continue?",
      initialValue: false,
    });
    if (isCancel(accepted) || !accepted) {
      cancel("Reset cancelled.");
      throw new Error("setup reset cancelled");
    }
    const typed = await text({
      message: 'Type "RESET" to confirm',
      placeholder: "RESET",
      validate(value: string | undefined) {
        return value === "RESET" ? undefined : 'Type exactly "RESET"';
      },
    });
    if (isCancel(typed)) {
      cancel("Reset cancelled.");
      throw new Error("setup reset cancelled");
    }
  }

  const removed: string[] = [];
  await removeIfExists(targets.env, false, removed);
  await removeIfExists(targets.skillDir, true, removed);
  await removeIfExists(targets.systemd, false, removed);
  disableLaunchdBridge(targets.launchd);
  await removeIfExists(targets.launchd, false, removed);
  await removeIfExists(params.statePath, false, removed);

  return {
    ok: true,
    status: "reset_done",
    openclawHome: params.openclawHome,
    removedFiles: removed,
    next: {
      mode: "websocket" as const,
      reminder:
        "If you previously merged skills.entries.openmail into OpenClaw config, remove that block manually.",
    },
  };
}

async function removeIfExists(
  targetPath: string,
  recursive: boolean,
  removed: string[],
) {
  try {
    await fs.rm(targetPath, { recursive, force: false });
    removed.push(targetPath);
  } catch {
    // Ignore missing/unremovable paths during reset cleanup.
  }
}

function buildLaunchdPlist(params: { envFilePath: string; hookPath: string }): string {
  const scriptPath = process.argv[1] ?? "packages/cli/dist/index.js";
  const hookUrl = `http://127.0.0.1:18789${params.hookPath}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>sh.openmail.openclaw-bridge</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>-c</string>
    <string>. ${params.envFilePath} &amp;&amp; OPENCLAW_HOOK_URL=${hookUrl} exec ${process.execPath} ${scriptPath} ws bridge</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/openmail-bridge.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/openmail-bridge.log</string>
</dict>
</plist>
`;
}

function enableLaunchdBridge(plistPath: string): boolean {
  spawnSync("launchctl", ["unload", plistPath], { stdio: "ignore" });
  const load = spawnSync("launchctl", ["load", "-w", plistPath], { stdio: "ignore" });
  return load.status === 0;
}

function disableLaunchdBridge(plistPath: string): void {
  spawnSync("launchctl", ["unload", "-w", plistPath], { stdio: "ignore" });
}

function canManageSystemdUser(): boolean {
  if (process.platform !== "linux") {
    return false;
  }
  const check = spawnSync("systemctl", ["--user", "--version"], {
    stdio: "ignore",
  });
  return check.status === 0;
}

function enableSystemdBridge(): boolean {
  const reload = spawnSync("systemctl", ["--user", "daemon-reload"], {
    stdio: "ignore",
  });
  if (reload.status !== 0) {
    return false;
  }
  const enable = spawnSync(
    "systemctl",
    ["--user", "enable", "--now", "openmail-openclaw-bridge.service"],
    { stdio: "ignore" },
  );
  return enable.status === 0;
}

async function ensureInboxForSetup(params: {
  client: OpenMailHttpClient;
  parsed: ParsedArgs;
  statePath: string;
  ctx: CliContext;
}): Promise<Inbox> {
  const explicitInboxId = getStringFlag(params.parsed.flags, "inbox-id");
  if (explicitInboxId) {
    const inbox = (await params.client.get(`/v1/inboxes/${encodeURIComponent(explicitInboxId)}`)) as Inbox;
    await persistDefaultInbox(params.statePath, inbox);
    return inbox;
  }

  const mailboxName = getStringFlag(params.parsed.flags, "mailbox-name");
  const displayName = getStringFlag(params.parsed.flags, "display-name");
  const list = (await params.client.get("/v1/inboxes", { limit: 100, offset: 0 })) as {
    data?: Inbox[];
  };
  const inboxes = list.data ?? [];

  const state = await readCliState(params.statePath);
  let selected: Inbox | undefined;
  if (!selected && state.defaultInboxId) {
    selected = inboxes.find((inbox) => inbox.id === state.defaultInboxId);
  }
  if (!selected) {
    selected = inboxes[0];
  }
  if (!selected) {
    const createParams = await resolveInboxCreateParams({
      mailboxName,
      displayName,
      ctx: params.ctx,
      cancelMessage: "Setup cancelled.",
    });
    selected = (await params.client.post("/v1/inboxes", createParams)) as Inbox;
    logInfo(params.ctx, `Created inbox ${selected.id} (${selected.address})`);
  }

  await persistDefaultInbox(params.statePath, selected);
  return selected;
}

async function persistDefaultInbox(statePath: string, inbox: Inbox) {
  const state = await readCliState(statePath);
  state.defaultInboxId = inbox.id;
  state.defaultInboxAddress = inbox.address;
  await writeCliState(statePath, state);
}

async function resolveSetupMode(params: {
  requestedMode?: string;
  ctx: CliContext;
  defaultMode?: SetupMode;
  allowPrompt: boolean;
}): Promise<SetupMode> {
  const normalized = params.requestedMode?.trim().toLowerCase();
  if (normalized === "websocket" || normalized === "ws") {
    return "websocket";
  }
  if (normalized === "webhook" || normalized === "wh") {
    return "webhook";
  }

  if (!params.allowPrompt) {
    return params.defaultMode ?? "websocket";
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    logInfo(params.ctx, "No interactive terminal detected. Defaulting setup mode to websocket.");
    return params.defaultMode ?? "websocket";
  }

  const chosen = await select<SetupMode>({
    message: "Choose OpenClaw integration mode",
    options: [
      {
        value: "websocket",
        label: "WebSocket",
        hint: "recommended",
      },
      {
        value: "webhook",
        label: "Webhook",
      },
    ],
    initialValue: "websocket",
  });
  if (isCancel(chosen)) {
    cancel("Setup cancelled.");
    throw new Error("setup cancelled");
  }
  clearScreen(params.ctx);
  return chosen;
}

async function writeFileIfChanged(
  filePath: string,
  content: string,
): Promise<{ changed: boolean; existed: boolean }> {
  let existing: string | undefined;
  try {
    existing = await fs.readFile(filePath, "utf8");
  } catch {
    existing = undefined;
  }
  const existed = existing !== undefined;
  if (existing === content) {
    return { changed: false, existed };
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
  return { changed: true, existed };
}
