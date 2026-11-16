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

import { cache } from "react";
import { erc20Abi, type Address } from "viem";
import { getCashBalances, getChainClient } from "@/lib/business-account";
import { ARC, OTHER_CHAINS, findChainByKitName, type AppChain } from "@/lib/chains";
import { reportError } from "@/lib/monitoring";
import type { Amounts } from "@/lib/tokens";
import { appKit, createReadOnlyAdapter, fromKitAmount, requireKitAmount } from "./core";

// Server only. Every figure comes from the chain or App Kit, never from app storage.

export type ChainHoldings = {
  chainId: number;
  label: string;
  // USDC in Unified Balance that was deposited on this chain.
  unified: bigint;
  // Deposited, but waiting for the chain to finalize before it can be spent.
  unifiedPending: bigint;
  // USDC in the account on this chain, ready to add to Unified Balance.
  wallet: bigint;
};

export type Treasury = {
  // Arc's native USDC and its ERC-20 are one balance, so only the ERC-20 is read.
  cash: Amounts;
  // USDC for one EURC, in base units. Null when no quote could be fetched, so EURC can't be added
  // to USDC and totals show each currency on its own.
  eurcRate: bigint | null;
  unifiedBalance: bigint;
  unifiedPending: bigint;
  chains: ChainHoldings[];
  // Cash plus Unified Balance. Each dollar sits in only one of the two.
  spendable: Amounts;
  // Names what couldn't be read this time, like "Unified Balance". Those count as zero.
  unavailable: string[];
};

const RATE_CACHE_MILLISECONDS = 60_000;

let cachedRate: { value: bigint; fetchedAt: number } | undefined;

export const readTreasury = cache(async (address: Address): Promise<Treasury> => {
  const unavailable: string[] = [];
  // Cash on Arc must be read. The rest can be down without hiding it.
  function orZero<T>(read: Promise<T>, what: string, zero: T) {
    return read.catch((caught: unknown) => {
      reportError({ area: "treasury read", error: caught, context: { read: what } });
      unavailable.push(what);
      return zero;
    });
  }

  const [cash, eurcRate, unified, wallets] = await Promise.all([
    getCashBalances(address),
    // Without a rate EURC isn't added to USDC, but it isn't counted as zero either.
    readEurcRate(address).catch((caught: unknown) => {
      reportError({ area: "treasury read", error: caught, context: { read: "EURC rate" } });
      return null;
    }),
    orZero(readUnifiedBalance(address), "Unified Balance", {
      confirmed: BigInt(0),
      pending: BigInt(0),
      byChain: new Map<string, { confirmed: bigint; pending: bigint }>(),
    }),
    Promise.all(
      OTHER_CHAINS.map((chain) =>
        orZero(readUsdc(chain, address), `${chain.label} balance`, BigInt(0)),
      ),
    ),
  ]);

  const chains = [ARC, ...OTHER_CHAINS].map((chain, index) => {
    const entry = unified.byChain.get(chain.kitChain);
    return {
      chainId: chain.viem.id,
      label: chain.label,
      unified: entry?.confirmed ?? BigInt(0),
      unifiedPending: entry?.pending ?? BigInt(0),
      // Arc's USDC is cash, shown on its own.
      wallet: index === 0 ? BigInt(0) : wallets[index - 1],
    };
  });

  return {
    cash,
    eurcRate,
    unifiedBalance: unified.confirmed,
    unifiedPending: unified.pending,
    chains,
    spendable: { USDC: cash.USDC + unified.confirmed, EURC: cash.EURC },
    unavailable,
  };
});

async function readUsdc(chain: AppChain, address: Address) {
  return getChainClient(chain.viem).readContract({
    address: chain.usdcAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address],
  });
}

async function readUnifiedBalance(address: Address) {
  const result = await appKit.unifiedBalance.getBalances({
    token: "USDC",
    sources: { address },
    includePending: true,
    networkType: "testnet",
  });

  // Funds left on chains the app doesn't support aren't counted.
  const byChain = new Map<string, { confirmed: bigint; pending: bigint }>();
  for (const depositor of result.breakdown) {
    for (const entry of depositor.breakdown) {
      if (!findChainByKitName(entry.chain)) continue;
      const current = byChain.get(entry.chain) ?? {
        confirmed: BigInt(0),
        pending: BigInt(0),
      };
      byChain.set(entry.chain, {
        confirmed: current.confirmed + fromKitAmount(entry.confirmedBalance),
        pending: current.pending + requireKitAmount(entry.pendingBalance, "a pending balance"),
      });
    }
  }
  let confirmed = BigInt(0);
  let pending = BigInt(0);
  for (const entry of byChain.values()) {
    confirmed += entry.confirmed;
    pending += entry.pending;
  }
  return { confirmed, pending, byChain };
}

// What one EURC swaps for, quoted for this account. Cached briefly, since every page reads it.
async function readEurcRate(address: Address) {
  if (cachedRate && Date.now() - cachedRate.fetchedAt < RATE_CACHE_MILLISECONDS) {
    return cachedRate.value;
  }
  const quote = await appKit.estimateSwap({
    from: { adapter: createReadOnlyAdapter(), chain: ARC.kitChain, address },
    tokenIn: "EURC",
    tokenOut: "USDC",
    amountIn: "1",
  });
  cachedRate = {
    value: fromKitAmount(quote.estimatedOutput.amount),
    fetchedAt: Date.now(),
  };
  return cachedRate.value;
}
