import type { ParsedArgs } from "../lib/args";
import { getNumberFlag, getStringFlag } from "../lib/args";
import type { OpenMailHttpClient } from "../lib/http";

export async function runPodCommand(client: OpenMailHttpClient, parsed: ParsedArgs) {
  const action = parsed.command[1];
  if (!action) {
    throw new Error("missing pod action (create|list|get|update|delete)");
  }

  if (action === "create") {
    const clientId = getStringFlag(parsed.flags, "client-id");
    const name = getStringFlag(parsed.flags, "name");
    return client.post("/v1/pods", {
      ...(clientId !== undefined ? { clientId } : {}),
      ...(name !== undefined ? { name } : {}),
    });
  }

  if (action === "list") {
    const limit = getNumberFlag(parsed.flags, "limit");
    const offset = getNumberFlag(parsed.flags, "offset");
    return client.get("/v1/pods", { limit, offset });
  }

  if (action === "get") {
    const id = getStringFlag(parsed.flags, "id");
    if (!id) {
      throw new Error("missing --id");
    }
    return client.get(`/v1/pods/${encodeURIComponent(id)}`);
  }

  if (action === "update") {
    const id = getStringFlag(parsed.flags, "id");
    if (!id) {
      throw new Error("missing --id");
    }
    const clientId = getStringFlag(parsed.flags, "client-id");
    const name = getStringFlag(parsed.flags, "name");
    const body: Record<string, string | null> = {};
    if (clientId !== undefined) body.clientId = clientId;
    if (name !== undefined) body.name = name;
    if (Object.keys(body).length === 0) {
      throw new Error("pass at least one of --client-id or --name to update");
    }
    return client.patch(`/v1/pods/${encodeURIComponent(id)}`, body);
  }

  if (action === "delete") {
    const id = getStringFlag(parsed.flags, "id");
    if (!id) {
      throw new Error("missing --id");
    }
    return client.delete(`/v1/pods/${encodeURIComponent(id)}`);
  }

  throw new Error(`unknown pod action: ${action}`);
}
