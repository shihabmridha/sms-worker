import type { ISmsProvider, SmsDynamicMessage, SmsSendOutcome } from "../shared/types";
import { maskPhone } from "./phone";

const summarize = (message: string): string => {
  const head = message.slice(0, 8);
  return `"${head}${message.length > 8 ? "..." : ""}" (${message.length} chars)`;
};

/**
 * Accepts every recipient unconditionally — no network call. For local dev
 * and tests where a real gateway send is undesirable. Ported from acadion's
 * FakeSms.ts, adapted to log one structured JSON line per call (never per
 * recipient — a large broadcast under FakeSms would otherwise bury the log)
 * and never a raw phone number or full message body.
 */
export class FakeSms implements ISmsProvider {
  readonly name = "fake" as const;

  async send(recipients: string[], message: string): Promise<SmsSendOutcome[]> {
    if (recipients.length === 0) return [];
    console.log(
      JSON.stringify({
        provider: "fake",
        op: "send",
        recipientCount: recipients.length,
        first: maskPhone(recipients[0]),
        message: summarize(message),
      }),
    );
    return recipients.map(() => ({ accepted: true, trackingId: crypto.randomUUID() }));
  }

  async sendDynamic(messages: SmsDynamicMessage[]): Promise<SmsSendOutcome[]> {
    if (messages.length === 0) return [];
    const first = messages[0];
    console.log(
      JSON.stringify({
        provider: "fake",
        op: "sendDynamic",
        recipientCount: messages.length,
        first: maskPhone(first?.to),
        message: summarize(first?.message ?? ""),
      }),
    );
    return messages.map(() => ({ accepted: true, trackingId: crypto.randomUUID() }));
  }
}
