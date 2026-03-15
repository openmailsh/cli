import type { ParsedArgs } from "../lib/args";
import { getStringFlag } from "../lib/args";
import type { OpenMailHttpClient } from "../lib/http";
import type { CliContext } from "../lib/output";
import { logInfo } from "../lib/output";
import { setDefaultInbox } from "../lib/inbox-default";
import { resolveInboxCreateParams } from "../lib/inbox-create";

type Inbox = {
  id: string;
  address: string;
  displayName?: string | null;
};

export async function runInitCommand(params: {
  client: OpenMailHttpClient;
  parsed: ParsedArgs;
  statePath: string;
  ctx: CliContext;
}) {
  const mailboxName = getStringFlag(params.parsed.flags, "mailbox-name");
  const displayName = getStringFlag(params.parsed.flags, "display-name");

  const createParams = await resolveInboxCreateParams({
    mailboxName,
    displayName,
    ctx: params.ctx,
    cancelMessage: "Init cancelled.",
  });

  const inbox = (await params.client.post("/v1/inboxes", createParams)) as Inbox;
  await setDefaultInbox(params.statePath, {
    id: inbox.id,
    address: inbox.address,
  });

  logInfo(params.ctx, `Created inbox ${inbox.id} (${inbox.address})`);
  return { inbox, created: true };
}
