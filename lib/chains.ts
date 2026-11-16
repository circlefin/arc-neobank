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

import { ArcTestnet, BaseSepolia, SolanaDevnet } from "@circle-fin/app-kit/chains";
import type { EVMChainDefinition } from "@circle-fin/app-kit";
import { getAddress, type Address, type Chain } from "viem";
import { arcTestnet, baseSepolia } from "viem/chains";

// A chain the business account works on: the viem chain for ZeroDev, and App Kit's definition.
export type AppChain<Kit extends EVMChainDefinition = EVMChainDefinition> = {
  label: string;
  viem: Chain;
  kit: Kit;
  // App Kit's name for the chain, like "Arc_Testnet".
  kitChain: Kit["chain"];
  usdcAddress: Address;
  // Where Unified Balance deposits go on this chain.
  gatewayWallet: Address;
  // A Blockscout API, which lists an account's transfers. RPCs only return logs a few blocks at a time.
  explorerApiUrl: string;
};

function toAppChain<Kit extends EVMChainDefinition>(
  label: string,
  viem: Chain,
  kit: Kit,
  explorerApiUrl: string,
): AppChain<Kit> {
  const gatewayWallet = kit.gateway?.contracts.v1?.wallet;
  if (!kit.usdcAddress || !gatewayWallet) {
    throw new Error(`${label} has no USDC or Unified Balance in App Kit.`);
  }
  return {
    label,
    viem,
    kit,
    kitChain: kit.chain,
    usdcAddress: getAddress(kit.usdcAddress),
    gatewayWallet: getAddress(gatewayWallet),
    explorerApiUrl,
  };
}

export const ARC = toAppChain(
  "Arc",
  arcTestnet,
  ArcTestnet,
  `${arcTestnet.blockExplorers.default.url}/api/v2`,
);

// Chains money can come from or go to. Each has Kernel v3.1 and the passkey validator deployed.
export const OTHER_CHAINS = [
  toAppChain("Base", baseSepolia, BaseSepolia, "https://base-sepolia.blockscout.com/api/v2"),
];

export const APP_CHAINS = [ARC, ...OTHER_CHAINS];

// A chain USDC can be sent out to, to someone else's address. The account has no wallet there,
// so Circle's forwarder delivers and only Arc signs.
export const SOLANA = {
  label: "Solana",
  kit: SolanaDevnet,
  kitChain: SolanaDevnet.chain,
} as const;

export type PayoutChain = typeof SOLANA;

export function isAppChain(chain: AppChain | PayoutChain): chain is AppChain {
  return chain.kitChain !== SOLANA.kitChain;
}

export function findChainById(chainId: number) {
  return APP_CHAINS.find((chain) => chain.viem.id === chainId);
}

export function requireChainById(chainId: number) {
  const chain = findChainById(chainId);
  if (!chain) throw new Error(`Chain ${chainId} is not supported.`);
  return chain;
}

export function findChainByKitName(kitChain: string) {
  return APP_CHAINS.find((chain) => chain.kitChain === kitChain);
}

// App Kit names a chain like "World_Chain_Sepolia"; people read "World Chain".
export function chainLabel(kitChain: string) {
  return (
    findChainByKitName(kitChain)?.label ??
    kitChain.replace(/_(Sepolia|Testnet|Fuji|Amoy)$/, "").replaceAll("_", " ")
  );
}

export function explorerTransactionUrl(chain: AppChain, hash: string) {
  const explorer = chain.viem.blockExplorers?.default.url;
  return explorer ? `${explorer}/tx/${hash}` : undefined;
}
