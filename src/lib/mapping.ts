/**
 * Pure mapping between open-banking.io data and Wealthfolio's model.
 * No I/O here so it can be unit-tested without a running host.
 */
import type { AccountType, ActivityImport, ActivityType } from "@wealthfolio/addon-sdk";

import type { Account, Balance, Transaction } from "./openbanking.js";

/**
 * Booked balances first (CLBD/ITBD) so a synced account reflects settled money;
 * available balances only as a fallback.
 */
export const DEFAULT_BALANCE_PREFERENCE = ["CLBD", "ITBD", "PRCD", "XPCD", "CLAV", "ITAV"] as const;

export function selectBalance(
  balances: readonly Balance[],
  order: readonly string[] = DEFAULT_BALANCE_PREFERENCE,
): Balance | null {
  if (balances.length === 0) return null;
  for (const type of order) {
    const match = balances.find((b) => b.type === type);
    if (match) return match;
  }
  return balances[0] ?? null;
}

export function maskIban(iban: string): string {
  const trimmed = iban.replace(/\s+/g, "");
  return trimmed.length <= 4 ? trimmed : `…${trimmed.slice(-4)}`;
}

/** A stable, human-friendly name for the Wealthfolio account. */
export function accountLabel(account: Account): string {
  const name = account.displayName ?? account.accountName ?? account.ownerName ?? account.aspspName;
  return account.iban ? `${name} (${maskIban(account.iban)})` : name;
}

/** The payload for `ctx.api.accounts.create` — a CASH account tracked by transactions. */
export function buildAccountCreatePayload(account: Account): {
  name: string;
  accountType: AccountType;
  currency: string;
  group: string;
  isActive: boolean;
} {
  return {
    name: accountLabel(account),
    accountType: "CASH",
    currency: account.currency,
    group: "Bank (open-banking.io)",
    isActive: true,
  };
}

/**
 * Convert one open-banking.io transaction into a Wealthfolio import row.
 * Incoming (CRDT) → DEPOSIT, outgoing (DBIT) → WITHDRAWAL. Amounts are magnitudes;
 * the activity type carries the direction, matching how Wealthfolio models cash.
 */
export function toActivityImport(
  wealthfolioAccountId: string,
  currency: string,
  tx: Transaction,
): ActivityImport {
  const isCredit = tx.creditDebitIndicator?.toUpperCase() === "CRDT";
  const counterparty = isCredit ? tx.creditorName : tx.debtorName;
  const commentParts = [counterparty, tx.remittanceInformation].filter(Boolean);
  // Keep the source id in the comment so re-syncs are traceable/idempotent-checkable.
  commentParts.push(`[obio:${tx.id}]`);

  return {
    accountId: wealthfolioAccountId,
    activityType: (isCredit ? "DEPOSIT" : "WITHDRAWAL") as ActivityType,
    date: tx.bookingDate ?? tx.valueDate ?? undefined,
    amount: tx.amount,
    currency: tx.currency || currency,
    comment: commentParts.join(" — "),
    isDraft: false,
    isValid: true,
  };
}

/** Map an account list into { openBankingId → wealthfolioAccountId } by matched name/iban. */
export function buildActivityImports(
  wealthfolioAccountId: string,
  currency: string,
  transactions: readonly Transaction[],
): ActivityImport[] {
  return transactions.map((t) => toActivityImport(wealthfolioAccountId, currency, t));
}
