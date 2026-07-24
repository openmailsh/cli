import type { ParsedArgs } from "../lib/args";
import { getStringFlag } from "../lib/args";
import type { OpenMailHttpClient } from "../lib/http";

const FEEDBACK_TYPES = ["bug", "friction", "feature_request"] as const;

export async function runFeedbackCommand(
  client: OpenMailHttpClient,
  parsed: ParsedArgs,
) {
  const type = getStringFlag(parsed.flags, "type");
  const message = getStringFlag(parsed.flags, "message");

  if (!type || !(FEEDBACK_TYPES as readonly string[]).includes(type)) {
    throw new Error(
      `missing or invalid --type (expected one of: ${FEEDBACK_TYPES.join(", ")})`,
    );
  }
  if (!message) {
    throw new Error("missing --message");
  }

  const endpoint = getStringFlag(parsed.flags, "endpoint");
  const errorCode = getStringFlag(parsed.flags, "error-code");
  const requestId = getStringFlag(parsed.flags, "request-id");
  const context =
    endpoint || errorCode || requestId
      ? {
          ...(endpoint ? { endpoint } : {}),
          ...(errorCode ? { errorCode } : {}),
          ...(requestId ? { requestId } : {}),
        }
      : undefined;

  return client.post("/v1/feedback", {
    type,
    message,
    ...(context ? { context } : {}),
  });
}
