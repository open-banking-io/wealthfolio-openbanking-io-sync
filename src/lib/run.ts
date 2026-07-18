/**
 * Sync orchestration: open-banking.io → Wealthfolio, over the host API.
 * The pure mapping lives in ./mapping (unit-tested); this wires it to I/O.
 */
import type { AddonContext } from "@wealthfolio/addon-sdk";

import { OpenBankingClient, type CredentialsBundle } from "./openbanking.js";
import { accountLabel, buildAccountCreatePayload, buildActivityImports, selectBalance } from "./mapping.js";

export const CREDENTIALS_SECRET_KEY = "credentials";

export interface SyncOptions {
  /** How many days of transactions to import per account. */
  days: number;
  /** Create a Wealthfolio CASH account for bank accounts that aren't matched yet. */
  createMissing: boolean;
}

export interface AccountResult {
  label: string;
  status: "imported" | "created+imported" | "skipped-unmatched" | "skipped-reconnect" | "error";
  balance?: string;
  currency?: string;
  transactions?: number;
  detail?: string;
}

export interface SyncSummary {
  accounts: AccountResult[];
  imported: number;
}

/** Parse and validate the stored credentials bundle. */
export function parseCredentials(raw: string | null): CredentialsBundle {
  if (!raw) throw new Error("No open-banking.io credentials saved yet — paste your credentials.json first.");
  let bundle: CredentialsBundle;
  try {
    bundle = JSON.parse(raw) as CredentialsBundle;
  } catch {
    throw new Error("Saved credentials are not valid JSON.");
  }
  if (!bundle.apiBaseUrl || !bundle.apiKey || !bundle.encryptionKey?.privateKey) {
    throw new Error("credentials.json is missing apiBaseUrl, apiKey, or the encryption private key.");
  }
  return bundle;
}

export async function runSync(ctx: AddonContext, options: SyncOptions): Promise<SyncSummary> {
  const bundle = parseCredentials(await ctx.api.secrets.get(CREDENTIALS_SECRET_KEY));
  const client = OpenBankingClient.fromBundle(bundle, (req) => ctx.api.network.request(req));

  const [obAccounts, existing] = await Promise.all([client.getAccounts(), ctx.api.accounts.getAll()]);
  const byName = new Map(existing.map((a) => [a.name, a.id] as const));

  const from = isoDaysAgo(options.days);
  const results: AccountResult[] = [];
  let imported = 0;

  for (const account of obAccounts) {
    const label = accountLabel(account);
    const balance = selectBalance(account.balances);
    try {
      if (account.needsReconnect) {
        results.push({ label, status: "skipped-reconnect", detail: "Bank consent expired — reconnect in open-banking.io." });
        continue;
      }

      let wealthfolioId = byName.get(label);
      let created = false;
      if (!wealthfolioId) {
        if (!options.createMissing) {
          results.push({ label, status: "skipped-unmatched", detail: "No matching Wealthfolio account (enable 'create missing')." });
          continue;
        }
        const account_ = await ctx.api.accounts.create(buildAccountCreatePayload(account));
        wealthfolioId = account_.id;
        byName.set(label, wealthfolioId);
        created = true;
      }

      const page = await client.getTransactions(account.id, { from, limit: 500 });
      const rows = buildActivityImports(wealthfolioId, account.currency, page.items);
      if (rows.length > 0) {
        // Preview first (validation/dedup), then commit.
        await ctx.api.activities.checkImport(rows);
        await ctx.api.activities.import(rows);
      }
      imported += rows.length;
      results.push({
        label,
        status: created ? "created+imported" : "imported",
        balance: balance?.amount,
        currency: balance?.currency ?? account.currency,
        transactions: rows.length,
      });
    } catch (err) {
      ctx.api.logger.error(`open-banking.io sync failed for ${label}: ${(err as Error).message}`);
      results.push({ label, status: "error", detail: (err as Error).message });
    }
  }

  return { accounts: results, imported };
}

function isoDaysAgo(days: number): string {
  const ms = Date.now() - days * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}
