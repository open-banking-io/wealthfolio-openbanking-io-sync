import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AddonContext, AddonEnableFunction } from "@wealthfolio/addon-sdk";

import { SyncPage } from "./pages/SyncPage.js";

// The host owns a single React root per addon and mounts the route `component`
// itself with no ctx, so capture it at enable time. (Do NOT call createRoot.)
let addonCtx: AddonContext | undefined;

const AddonRoute = () => (
  <QueryClientProvider client={addonCtx!.api.query.getClient() as QueryClient}>
    <SyncPage ctx={addonCtx!} />
  </QueryClientProvider>
);

const enable: AddonEnableFunction = (ctx) => {
  addonCtx = ctx;

  // The route `id` MUST match `contributes.routes[].id` in manifest.json.
  ctx.router.add({
    id: "openbanking-io-sync",
    path: "/addons/openbanking-io-sync",
    component: AddonRoute,
  });

  ctx.api.logger.info("open-banking.io Bank Sync addon loaded");

  ctx.onDisable(() => {
    addonCtx = undefined;
  });
};

export default enable;
