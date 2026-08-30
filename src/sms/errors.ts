/**
 * Thrown by a provider adapter when its transport call itself fails: network
 * error, request timeout, a non-2xx HTTP status, or a response body that
 * cannot be parsed. Distinguished from a soft decline (`SmsSendOutcome`
 * `{ accepted: false }`), which means the provider was reached and answered.
 *
 * A thrown `ProviderTransportError` is ambiguous — the message may already
 * have been sent — so `dispatch()` treats it the same as a soft decline and
 * falls through to the next provider (see dispatch.ts doc comment). Each
 * provider adapter catches this per chunk internally so a transport failure
 * in one chunk never causes chunks that already succeeded to be re-sent.
 */
export class ProviderTransportError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ProviderTransportError";
  }
}
