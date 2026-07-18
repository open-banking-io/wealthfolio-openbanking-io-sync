import type { AddonContext } from "@wealthfolio/addon-sdk";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Textarea,
} from "@wealthfolio/ui";
import { useEffect, useState } from "react";

import { CREDENTIALS_SECRET_KEY, parseCredentials, runSync, type SyncSummary } from "../lib/run.js";

export function SyncPage({ ctx }: { ctx: AddonContext }) {
  const [hasCreds, setHasCreds] = useState(false);
  const [credsInput, setCredsInput] = useState("");
  const [days, setDays] = useState(90);
  const [createMissing, setCreateMissing] = useState(true);
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<SyncSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ctx.api.secrets
      .get(CREDENTIALS_SECRET_KEY)
      .then((v) => setHasCreds(Boolean(v)))
      .catch(() => setHasCreds(false));
  }, [ctx]);

  async function saveCredentials() {
    setError(null);
    try {
      parseCredentials(credsInput); // validate before storing
      await ctx.api.secrets.set(CREDENTIALS_SECRET_KEY, credsInput.trim());
      setHasCreds(true);
      setCredsInput("");
      ctx.api.toast.success("open-banking.io credentials saved.");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function clearCredentials() {
    await ctx.api.secrets.delete(CREDENTIALS_SECRET_KEY);
    setHasCreds(false);
    setSummary(null);
    ctx.api.toast.info("Credentials removed.");
  }

  async function sync() {
    setRunning(true);
    setError(null);
    setSummary(null);
    try {
      const result = await runSync(ctx, { days, createMissing });
      setSummary(result);
      ctx.api.toast.success(`Synced ${result.imported} transaction(s) across ${result.accounts.length} account(s).`);
    } catch (err) {
      setError((err as Error).message);
      ctx.api.toast.error(`Sync failed: ${(err as Error).message}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">open-banking.io Bank Sync</h1>
        <p className="text-muted-foreground">
          Import your EU/UK bank balances and transactions into Wealthfolio. Data is decrypted
          locally with your own key — the service only ever holds ciphertext.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Credentials</CardTitle>
          <CardDescription>
            Paste the <code>credentials.json</code> you exported from open-banking.io. It is stored
            in Wealthfolio&apos;s encrypted addon secrets, never in plain settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {hasCreds ? (
            <div className="flex items-center gap-3">
              <Badge>Credentials saved</Badge>
              <Button variant="outline" onClick={clearCredentials}>
                Remove
              </Button>
            </div>
          ) : (
            <>
              <Textarea
                rows={6}
                placeholder='{ "apiBaseUrl": "...", "apiKey": "...", "encryptionKey": { "privateKey": "..." } }'
                value={credsInput}
                onChange={(e) => setCredsInput(e.target.value)}
              />
              <Button onClick={saveCredentials} disabled={!credsInput.trim()}>
                Save credentials
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sync</CardTitle>
          <CardDescription>
            Booked balances are preferred; incoming transactions map to deposits, outgoing to
            withdrawals.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label htmlFor="days">Days of history</Label>
              <Input
                id="days"
                type="number"
                min={1}
                max={730}
                value={days}
                onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))}
                className="w-32"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={createMissing}
                onChange={(e) => setCreateMissing(e.target.checked)}
              />
              Create missing accounts
            </label>
            <Button onClick={sync} disabled={!hasCreds || running}>
              {running ? "Syncing…" : "Sync now"}
            </Button>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertTitle>Sync error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {summary && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {summary.imported} transaction(s) imported across {summary.accounts.length} account(s).
              </p>
              <ul className="divide-y rounded-md border">
                {summary.accounts.map((a, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 p-3 text-sm">
                    <span className="font-medium">{a.label}</span>
                    <span className="flex items-center gap-2">
                      {a.balance != null && (
                        <span className="text-muted-foreground">
                          {a.balance} {a.currency}
                        </span>
                      )}
                      {a.transactions != null && <Badge>{a.transactions} tx</Badge>}
                      <Badge variant="outline">{a.status}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
