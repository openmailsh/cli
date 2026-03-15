import type { ParsedArgs } from "./args";
import { getStringFlag } from "./args";
import type { OpenMailHttpClient } from "./http";
import type { CliContext } from "./output";
import { logInfo } from "./output";
import { readCliState, writeCliState } from "./state";

type InboxItem = {
  id: string;
  address: string;
};

export async function resolveInboxIdWithFallback(params: {
  client: OpenMailHttpClient;
  parsed: ParsedArgs;
  statePath: string;
  ctx: CliContext;
}): Promise<string> {
  const fromFlag = getStringFlag(params.parsed.flags, "inbox-id");
  if (fromFlag) {
    return fromFlag;
  }
  const fromEnv = process.env.OPENMAIL_INBOX_ID?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  const state = await readCliState(params.statePath);
  if (state.defaultInboxId) {
    return state.defaultInboxId;
  }

  const listed = (await params.client.get("/v1/inboxes", { limit: 10, offset: 0 })) as {
    data?: InboxItem[];
  };
  const first = listed.data?.[0];
  if (!first?.id) {
    throw new Error(
      "no inbox configured. Run `openmail init` or pass --inbox-id / OPENMAIL_INBOX_ID.",
    );
  }
  await setDefaultInbox(params.statePath, {
    id: first.id,
    address: first.address,
  });
  logInfo(params.ctx, `Using latest inbox as default: ${first.id} (${first.address})`);
  return first.id;
}

export async function setDefaultInbox(
  statePath: string,
  inbox: { id: string; address?: string },
) {
  const state = await readCliState(statePath);
  state.defaultInboxId = inbox.id;
  if (inbox.address !== undefined) {
    state.defaultInboxAddress = inbox.address;
  }
  await writeCliState(statePath, state);
}
