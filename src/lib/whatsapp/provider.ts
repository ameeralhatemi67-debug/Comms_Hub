// The sender sits behind one interface (Permissions_Plan.md 8.1, D-8): send a code, send a
// message, say its status. The real one is the pull bridge in bridge/whatsapp/ (WhatsApp Web,
// on the owner's computer), which implements the same three calls; this file holds the
// interface, a fake for tests, and the one loop both use: send each claimed item to its own
// destination, and report.
import type { WaItem } from './rules.ts';

export type SendResult = { ok: true } | { ok: false; error: string };
export type ProviderStatus = { ready: boolean; note: string };
export type Report = { id: string; ok: boolean; error?: string };

export interface WhatsAppProvider {
  sendCode(to: string, text: string): Promise<SendResult>;
  sendMessage(to: string, text: string): Promise<SendResult>;
  status(): Promise<ProviderStatus>;
}

/** Records what it was asked to send, and can be told to fail for a number. */
export class FakeProvider implements WhatsAppProvider {
  sent: { to: string; text: string; code: boolean }[] = [];
  failFor = new Set<string>();
  ready = true;
  async sendCode(to: string, text: string): Promise<SendResult> {
    return this.push(to, text, true);
  }
  async sendMessage(to: string, text: string): Promise<SendResult> {
    return this.push(to, text, false);
  }
  async status(): Promise<ProviderStatus> {
    return { ready: this.ready, note: this.ready ? 'fake: ready' : 'fake: not linked' };
  }
  private push(to: string, text: string, code: boolean): SendResult {
    if (!this.ready) return { ok: false, error: 'not linked' };
    if (this.failFor.has(to)) return { ok: false, error: 'refused by the fake' };
    this.sent.push({ to, text, code });
    return { ok: true };
  }
}

/** Sends every item to its own destination, in order, and reports each one. */
export async function deliver(items: WaItem[], provider: WhatsAppProvider): Promise<Report[]> {
  const out: Report[] = [];
  for (const it of items) {
    let r: SendResult;
    try {
      r = it.kind === 'code' ? await provider.sendCode(it.to, it.text) : await provider.sendMessage(it.to, it.text);
    } catch (e) {
      r = { ok: false, error: e instanceof Error ? e.message.slice(0, 180) : 'send failed' };
    }
    out.push(r.ok ? { id: it.id, ok: true } : { id: it.id, ok: false, error: r.error });
  }
  return out;
}
