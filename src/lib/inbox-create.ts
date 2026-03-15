import { cancel, isCancel, text } from "@clack/prompts";
import type { CliContext } from "./output";

export const MAILBOX_NAME_REGEX = /^[a-z0-9][a-z0-9.\-]{1,28}[a-z0-9]$/;

export async function resolveInboxCreateParams(params: {
  mailboxName?: string;
  displayName?: string;
  ctx: CliContext;
  cancelMessage?: string;
}): Promise<{ mailboxName?: string; displayName?: string }> {
  if (params.mailboxName || params.displayName) {
    return {
      ...(params.mailboxName ? { mailboxName: params.mailboxName } : {}),
      ...(params.displayName ? { displayName: params.displayName } : {}),
    };
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return {};
  }

  const cancelMsg = params.cancelMessage ?? "Cancelled.";

  const mailboxName = await text({
    message: "Mailbox name (local part of address, e.g. 'john' → john@yourco.openmail.sh)",
    placeholder: "john",
    validate(value: string | undefined) {
      const v = (value ?? "").trim().toLowerCase();
      if (!v) return undefined;
      if (v.length < 3) return "At least 3 characters";
      if (v.length > 30) return "At most 30 characters";
      if (!MAILBOX_NAME_REGEX.test(v)) {
        return "Use lowercase letters, numbers, dots, hyphens. Must start and end with alphanumeric.";
      }
      return undefined;
    },
  });
  if (isCancel(mailboxName)) {
    cancel(cancelMsg);
    throw new Error(cancelMsg);
  }

  const displayName = await text({
    message: "Display name (optional, shown as sender name in recipients' inbox)",
    placeholder: "John Smith",
  });
  if (isCancel(displayName)) {
    cancel(cancelMsg);
    throw new Error(cancelMsg);
  }

  return {
    ...(String(mailboxName).trim() ? { mailboxName: String(mailboxName).trim().toLowerCase() } : {}),
    ...(String(displayName).trim() ? { displayName: String(displayName).trim() } : {}),
  };
}
