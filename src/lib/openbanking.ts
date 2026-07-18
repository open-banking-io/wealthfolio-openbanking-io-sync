/**
 * A thin open-banking.io client that runs inside the Wealthfolio addon sandbox.
 *
 * Unlike the Node SDK it does not call `fetch` directly — it routes every request
 * through the host's brokered network API (`ctx.api.network.request`), which the
 * user consents to and which is limited to the hosts declared in manifest.json.
 * Envelopes are still decrypted locally with the user's private key.
 */
import { decryptTo, importPrivateKey } from "./envelope.js";

/** The `{ url, method, headers, body }` → `{ status, headers, body }` broker. */
export type NetworkRequestFn = (req: {
  url: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";
  headers?: Record<string, string>;
  body?: string;
}) => Promise<{ status: number; headers: Record<string, string>; body: string }>;

export interface Balance {
  type: string;
  amount: string;
  currency: string;
  referenceDate: string | null;
}

export interface Account {
  id: string;
  aspspName: string;
  aspspCountry: string;
  currency: string;
  needsReconnect: boolean;
  iban: string | null;
  ownerName: string | null;
  accountName: string | null;
  displayName: string | null;
  balances: Balance[];
}

export interface Transaction {
  id: string;
  currency: string;
  /** "CRDT" (incoming) or "DBIT" (outgoing). */
  creditDebitIndicator: string;
  bookingDate: string | null;
  valueDate: string | null;
  /** Decimal string, magnitude only. */
  amount: string;
  creditorName: string | null;
  debtorName: string | null;
  remittanceInformation: string | null;
}

export interface TransactionPage {
  items: Transaction[];
  total: number;
}

export interface CredentialsBundle {
  apiBaseUrl: string;
  apiKey?: string;
  encryptionKey: { privateKey: string };
}

// ---- Wire DTOs (sensitive fields are ciphertext) ------------------------------------------------

interface AccountWire {
  id: string;
  aspspName: string;
  aspspCountry: string;
  currency: string;
  needsReconnect: boolean;
  balances: { type: string; currency: string; referenceDate?: string | null; enc?: string | null }[];
  enc?: string | null;
  displayNameEnc?: string | null;
}
interface AccountEnc {
  ownerName?: string | null;
  iban?: string | null;
  accountName?: string | null;
}
interface BalanceEnc {
  amount?: string | null;
}
interface DisplayNameEnc {
  displayName?: string | null;
}
interface TransactionWire {
  id: string;
  currency: string;
  creditDebitIndicator: string;
  bookingDate?: string | null;
  valueDate?: string | null;
  enc?: string | null;
}
interface TransactionEnc {
  amount?: string | null;
  creditorName?: string | null;
  debtorName?: string | null;
  remittanceInformation?: string | null;
}
interface TransactionPageWire {
  items: TransactionWire[];
  total: number;
}

export interface OpenBankingClientOptions {
  apiBaseUrl: string;
  apiKey: string;
  privateKeyPkcs8: string;
  request: NetworkRequestFn;
}

export class OpenBankingClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly request: NetworkRequestFn;
  private readonly privateKey: Promise<CryptoKey>;

  constructor(options: OpenBankingClientOptions) {
    if (!options.apiBaseUrl?.trim()) throw new Error("apiBaseUrl is required");
    if (!options.apiKey?.trim()) throw new Error("apiKey is required");
    if (!options.privateKeyPkcs8?.trim()) throw new Error("private key is required");
    this.baseUrl = stripTrailingSlashes(options.apiBaseUrl);
    this.apiKey = options.apiKey;
    this.request = options.request;
    this.privateKey = importPrivateKey(options.privateKeyPkcs8);
  }

  static fromBundle(bundle: CredentialsBundle, request: NetworkRequestFn): OpenBankingClient {
    if (!bundle.apiKey?.trim()) throw new Error("The credentials bundle has no apiKey");
    return new OpenBankingClient({
      apiBaseUrl: bundle.apiBaseUrl,
      apiKey: bundle.apiKey,
      privateKeyPkcs8: bundle.encryptionKey.privateKey,
      request,
    });
  }

  async getAccounts(): Promise<Account[]> {
    const wires = await this.getJson<AccountWire[]>("/api/accounts");
    const key = await this.privateKey;
    return Promise.all(
      wires.map(async (w) => {
        const [acc, name, balances] = await Promise.all([
          decryptTo<AccountEnc>(key, w.enc),
          decryptTo<DisplayNameEnc>(key, w.displayNameEnc),
          Promise.all(
            w.balances.map(async (b) => ({
              type: b.type,
              currency: b.currency,
              referenceDate: b.referenceDate ?? null,
              amount: (await decryptTo<BalanceEnc>(key, b.enc))?.amount ?? "0",
            })),
          ),
        ]);
        return {
          id: w.id,
          aspspName: w.aspspName,
          aspspCountry: w.aspspCountry,
          currency: w.currency,
          needsReconnect: w.needsReconnect,
          iban: acc?.iban ?? null,
          ownerName: acc?.ownerName ?? null,
          accountName: acc?.accountName ?? null,
          displayName: name?.displayName ?? null,
          balances,
        };
      }),
    );
  }

  async getTransactions(
    accountId: string,
    query: { from?: string; to?: string; limit?: number; offset?: number } = {},
  ): Promise<TransactionPage> {
    const qs = new URLSearchParams();
    if (query.from != null) qs.set("from", query.from);
    if (query.to != null) qs.set("to", query.to);
    if (query.limit != null) qs.set("limit", String(query.limit));
    if (query.offset != null) qs.set("offset", String(query.offset));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";

    const page = await this.getJson<TransactionPageWire>(
      `/api/accounts/${encodeURIComponent(accountId)}/transactions${suffix}`,
    );
    const key = await this.privateKey;
    const items = await Promise.all(
      (page.items ?? []).map(async (t) => {
        const dec = await decryptTo<TransactionEnc>(key, t.enc);
        return {
          id: t.id,
          currency: t.currency,
          creditDebitIndicator: t.creditDebitIndicator,
          bookingDate: t.bookingDate ?? null,
          valueDate: t.valueDate ?? null,
          amount: dec?.amount ?? "0",
          creditorName: dec?.creditorName ?? null,
          debtorName: dec?.debtorName ?? null,
          remittanceInformation: dec?.remittanceInformation ?? null,
        };
      }),
    );
    return { items, total: page.total };
  }

  private async getJson<T>(path: string): Promise<T> {
    const res = await this.request({
      url: `${this.baseUrl}${path}`,
      method: "GET",
      headers: { "X-Api-Key": this.apiKey, Accept: "application/json" },
    });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`open-banking.io ${path} failed: HTTP ${res.status} ${res.body.slice(0, 200)}`);
    }
    return JSON.parse(res.body) as T;
  }
}

function stripTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url.charCodeAt(end - 1) === 47) end--;
  return url.slice(0, end);
}
