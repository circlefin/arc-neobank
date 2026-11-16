/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { isAddressEqual, isAddress, zeroAddress } from "viem";
import { arcTestnet } from "viem/chains";
import { appKit } from "./app-kit/core";
import { ENTRY_POINT, getChainClient } from "./business-account";
import { APP_CHAINS, ARC, type AppChain } from "./chains";
import { redactSecrets, type ServiceStatus } from "./health-report";
import { supabaseAdmin } from "./supabase/admin";
import { zeroDevRpcUrl } from "./zerodev";

// Server only. Checks each service the app needs, as a developer would by hand.

const CHECK_TIMEOUT_MILLISECONDS = 8_000;
// Uptime monitors can ask often. Each check calls ZeroDev, Circle, and Supabase, so answers are reused briefly.
const CACHE_MILLISECONDS = 30_000;
const EXPLORER_STATS_URL = `${arcTestnet.blockExplorers.default.url}/api/v2/stats`;

const SECRETS = [
  process.env.ZERODEV_PROJECT_ID,
  process.env.SUPABASE_SECRET_KEY,
  process.env.CIRCLE_API_KEY,
];

let cached: { checkedAt: number; statuses: Promise<ServiceStatus[]> } | undefined;

export function checkServices(): Promise<ServiceStatus[]> {
  if (!cached || Date.now() - cached.checkedAt > CACHE_MILLISECONDS) {
    cached = { checkedAt: Date.now(), statuses: runChecks() };
  }
  return cached.statuses;
}

function runChecks() {
  return Promise.all([
    ...APP_CHAINS.map((chain) => check(`${chain.label} network`, () => checkNetwork(chain))),
    ...APP_CHAINS.map((chain) => check(`ZeroDev bundler on ${chain.label}`, () => checkBundler(chain))),
    check("Arc explorer", checkExplorer),
    check("Unified Balance", checkUnifiedBalance),
    check("Earn", checkEarn),
    check("Borrow", checkBorrow),
    check("Supabase", checkSupabase),
  ]);
}

async function check(name: string, run: () => Promise<string | null>): Promise<ServiceStatus> {
  const startedAt = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`No answer within ${CHECK_TIMEOUT_MILLISECONDS / 1000} seconds.`)),
      CHECK_TIMEOUT_MILLISECONDS,
    );
  });
  try {
    const detail = await Promise.race([run(), timeout]);
    return { name, isUp: true, latencyMilliseconds: Date.now() - startedAt, detail };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    return {
      name,
      isUp: false,
      latencyMilliseconds: Date.now() - startedAt,
      detail: redactSecrets(message, SECRETS),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function checkNetwork(chain: AppChain) {
  const block = await getChainClient(chain.viem).getBlockNumber();
  return `Block ${block}`;
}

// The bundler must take operations for the EntryPoint the accounts are built on.
async function checkBundler(chain: AppChain) {
  const response = await fetch(zeroDevRpcUrl(chain.viem.id), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_supportedEntryPoints", params: [] }),
  });
  if (!response.ok) throw new Error(`ZeroDev answered ${response.status}.`);
  const body: unknown = await response.json();
  const entryPoints =
    typeof body === "object" && body !== null && "result" in body && Array.isArray(body.result)
      ? body.result
      : [];
  const supported = entryPoints.some(
    (entryPoint: unknown) =>
      typeof entryPoint === "string" &&
      isAddress(entryPoint) &&
      isAddressEqual(entryPoint, ENTRY_POINT.address),
  );
  if (!supported) throw new Error(`The bundler doesn't take EntryPoint ${ENTRY_POINT.version} operations.`);
  return `Takes EntryPoint ${ENTRY_POINT.version}`;
}

async function checkExplorer() {
  const response = await fetch(EXPLORER_STATS_URL);
  if (!response.ok) throw new Error(`Explorer answered ${response.status}.`);
  return null;
}

async function checkUnifiedBalance() {
  await appKit.unifiedBalance.getBalances({
    token: "USDC",
    sources: { address: zeroAddress },
    networkType: "testnet",
  });
  return null;
}

async function checkEarn() {
  const { vaults } = await appKit.earn.exploreVaults({ chain: ARC.kitChain });
  return `${vaults.length} USDC vaults`;
}

async function checkBorrow() {
  for await (const market of appKit.borrow.exploreMarketsIterator({ chain: ARC.kitChain })) {
    return `Lists markets, like ${market.collateralAsset.symbol}`;
  }
  return "No markets listed";
}

async function checkSupabase() {
  const { error } = await supabaseAdmin
    .from("business_profiles")
    .select("*", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return null;
}
