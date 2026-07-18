import { describe, expect, it } from "vitest";

import type { Account, Transaction } from "../src/lib/openbanking.js";
import {
  accountLabel,
  buildAccountCreatePayload,
  maskIban,
  selectBalance,
  toActivityImport,
} from "../src/lib/mapping.js";

function account(p: Partial<Account> & { id: string }): Account {
  return {
    id: p.id,
    aspspName: "Test Bank",
    aspspCountry: "DK",
    currency: "EUR",
    needsReconnect: false,
    iban: null,
    ownerName: "Owner",
    accountName: null,
    displayName: null,
    balances: [],
    ...p,
  };
}

function tx(p: Partial<Transaction> & { id: string }): Transaction {
  return {
    id: p.id,
    currency: "EUR",
    creditDebitIndicator: "DBIT",
    bookingDate: "2026-07-10",
    valueDate: null,
    amount: "10.00",
    creditorName: null,
    debtorName: null,
    remittanceInformation: null,
    ...p,
  };
}

describe("selectBalance", () => {
  it("prefers booked (CLBD/ITBD) over available (ITAV)", () => {
    const b = selectBalance([
      { type: "ITAV", amount: "5", currency: "EUR", referenceDate: null },
      { type: "ITBD", amount: "20", currency: "EUR", referenceDate: null },
    ]);
    expect(b?.type).toBe("ITBD");
  });
  it("returns null when there are no balances", () => {
    expect(selectBalance([])).toBeNull();
  });
});

describe("maskIban", () => {
  it("shows only the last four", () => {
    expect(maskIban("DK6466952001724927")).toBe("…4927");
  });
});

describe("accountLabel", () => {
  it("uses displayName + masked IBAN", () => {
    expect(accountLabel(account({ id: "a", displayName: "Drift", iban: "DK6466952001724927" }))).toBe(
      "Drift (…4927)",
    );
  });
});

describe("buildAccountCreatePayload", () => {
  it("creates a CASH account in the bank group", () => {
    const p = buildAccountCreatePayload(account({ id: "a", currency: "GBP", ownerName: "Jane" }));
    expect(p.accountType).toBe("CASH");
    expect(p.currency).toBe("GBP");
    expect(p.group).toContain("open-banking.io");
  });
});

describe("toActivityImport", () => {
  it("maps an incoming (CRDT) transaction to a DEPOSIT", () => {
    const a = toActivityImport("wf-1", "EUR", tx({ id: "t1", creditDebitIndicator: "CRDT", creditorName: "One.com" }));
    expect(a.activityType).toBe("DEPOSIT");
    expect(a.accountId).toBe("wf-1");
    expect(a.amount).toBe("10.00");
    expect(a.comment).toContain("One.com");
    expect(a.comment).toContain("[obio:t1]");
    expect(a.isDraft).toBe(false);
    expect(a.isValid).toBe(true);
  });
  it("maps an outgoing (DBIT) transaction to a WITHDRAWAL with the booking date", () => {
    const a = toActivityImport("wf-1", "EUR", tx({ id: "t2", creditDebitIndicator: "DBIT", debtorName: "Rent" }));
    expect(a.activityType).toBe("WITHDRAWAL");
    expect(a.date).toBe("2026-07-10");
    expect(a.comment).toContain("Rent");
  });
});
