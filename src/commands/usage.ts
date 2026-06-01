import type { ParsedArgs } from "../lib/args";
import { getStringFlag } from "../lib/args";
import type { OpenMailHttpClient } from "../lib/http";

export async function runUsageCommand(client: OpenMailHttpClient, parsed: ParsedArgs) {
  const from = getStringFlag(parsed.flags, "from");
  const to = getStringFlag(parsed.flags, "to");
  const groupBy = getStringFlag(parsed.flags, "group-by");

  return client.get("/v1/usage", {
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(groupBy ? { group_by: groupBy } : {}),
  });
}
