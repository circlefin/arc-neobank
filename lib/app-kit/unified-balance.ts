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

import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { UnifiedBalanceChain, type SpendParams } from "@circle-fin/app-kit";
import { parseAbi, type Address, type Hex } from "viem";
import { getChainClient } from "@/lib/business-account";
import { ARC, explorerTransactionUrl, findChainByKitName, type AppChain } from "@/lib/chains";
import {
  appKit,
  createReadOnlyAdapter,
  fromKitAmount,
  OperationFailure,
  sumFeesInToken,
  toKitAmount,
  type OperationReceipt,
} from "./core";
import type { BusinessWallet } from "./wallet";

// Browser only. Unified Balance only accepts transfers signed by a plain key, so the account
// authorizes one when it first deposits on a chain, and that key signs every move to cash.

const GATEWAY_WALLET_ABI = parseAbi([
  "function isAuthorizedForBalance(address token, address depositor, address addr) view returns (bool)",
]);

export type DepositRequest = {
  chain: AppChain;
  amount: bigint;
  // The address of the key that signs moves from Unified Balance into this account on Arc.
  signer: Address;
};

// Approve, deposit, and (the first time on a chain) authorize the signer, in one operation,
// so the user confirms once. Built from App Kit's own actions and sent as one batch.
export async function depositToUnifiedBalance(
  { adapter, address }: BusinessWallet,
  { chain, amount, signer }: DepositRequest,
): Promise<OperationReceipt> {
  const context = { chain: chain.kit };
  const token = chain.usdcAddress;

  const isSigner = await getChainClient(chain.viem).readContract({
    address: chain.gatewayWallet,
    abi: GATEWAY_WALLET_ABI,
    functionName: "isAuthorizedForBalance",
    args: [token, address, signer],
  });

  const requests = await Promise.all([
    adapter.prepareAction(
      "usdc.approve",
      { delegate: chain.gatewayWallet, amount },
      context,
    ),
    adapter.prepareAction("gateway.v1.deposit", { token, value: amount }, context),
    ...(isSigner
      ? []
      : [adapter.prepareAction("gateway.v1.addDelegate", { token, delegate: signer }, context)]),
  ]);

  const calls = requests.flatMap((request) => {
    // App Kit marks a step that isn't needed, like an existing approval, as a no-op.
    if (request.type === "noop") return [];
    // App Kit's prepared EVM request exposes its call so it can join a batch.
    const callData = request.type === "evm" ? request.getCallData?.() : undefined;
    if (!callData) throw new Error("App Kit didn't return call data for a batch.");
    return [callData];
  });
  const result = await adapter.batchExecute(calls, chain.kit);
  const failed = result.receipts.find((receipt) => receipt.status !== "success");
  if (failed || result.error) {
    throw result.error ?? new Error("The deposit was turned down onchain.");
  }

  const transactionHash = result.receipts.at(-1)?.txHash ?? result.batchId;
  return {
    transactionHash,
    explorerUrl: explorerTransactionUrl(chain, transactionHash),
  };
}

// The whole amount reaches cash. Each chain it's drawn from pays its own fee on top.
export type MoveToCashQuote = {
  amount: bigint;
  fee: bigint;
  totalDeducted: bigint;
  // What each chain sends, leaving room on each for its fee.
  allocations: ChainAllocation[];
};

type ChainAllocation = { chain: SpendChain; amount: bigint };
type ChainBalance = { chain: SpendChain; balance: bigint };

// Gateway turns down a move when a chain can't cover what it sends plus its fee. A chain's fee
// only shows once a split is quoted, so split again leaving room for it, a few times at most.
const MAX_SPLIT_ATTEMPTS = 3;

const OVER_BALANCE_WITH_FEES = "With fees, that's more than your Unified Balance. Try a smaller amount.";

export async function quoteMoveToCash(
  account: Address,
  amount: bigint,
): Promise<MoveToCashQuote> {
  const balances = await readSpendBalances(account);
  const reserves = new Map<SpendChain, bigint>();
  for (let attempt = 0; attempt < MAX_SPLIT_ATTEMPTS; attempt += 1) {
    const allocations = splitAcrossChains(balances, amount, reserves);
    const { fee, feeByChain } = await estimateFees(account, amount, allocations);
    if (!findOverdrawnChain(balances, allocations, feeByChain)) {
      return { amount, fee, totalDeducted: amount + fee, allocations };
    }
    for (const [chain, chainFee] of feeByChain) {
      if (chainFee > (reserves.get(chain) ?? BigInt(0))) reserves.set(chain, chainFee);
    }
  }
  throw new OperationFailure({
    message: OVER_BALANCE_WITH_FEES,
    detail: `No split of ${toKitAmount(amount)} USDC left room for each chain's fee in ${MAX_SPLIT_ATTEMPTS} tries.`,
    canRetry: false,
  });
}

// The most that can reach cash once each chain keeps back its fee. A chain too small to pay its
// fee is left out, which can move the forwarder fee, so quote again without it.
export async function quoteMaxMoveToCash(account: Address) {
  let balances = await readSpendBalances(account);
  for (let attempt = 0; attempt < MAX_SPLIT_ATTEMPTS; attempt += 1) {
    if (balances.length === 0) return BigInt(0);
    const allocations = balances.map(({ chain, balance }) => ({ chain, amount: balance }));
    const total = allocations.reduce((sum, { amount }) => sum + amount, BigInt(0));
    const { feeByChain } = await estimateFees(account, total, allocations);
    const rooms = balances.map(({ chain, balance }) => ({
      chain,
      balance: balance - (feeByChain.get(chain) ?? BigInt(0)),
    }));
    const usable = rooms.filter(({ balance }) => balance > BigInt(0));
    if (usable.length === rooms.length) {
      return rooms.reduce((sum, { balance }) => sum + balance, BigInt(0));
    }
    balances = balances.filter(({ chain }) => usable.some((room) => room.chain === chain));
  }
  throw new Error(`Unified Balance fees kept changing which chains can pay in ${MAX_SPLIT_ATTEMPTS} tries.`);
}

async function estimateFees(account: Address, amount: bigint, allocations: ChainAllocation[]) {
  // Fees don't depend on who signs, so a quote needs no key.
  const estimate = await appKit.unifiedBalance.estimateSpend({
    from: {
      adapter: createReadOnlyAdapter(),
      address: account,
      sourceAccount: account,
      allocations: toKitAllocations(allocations),
    },
    ...toCash(account, amount),
  });
  // Gateway already counts the forwarder fee in the first chain's gas fee. App Kit lists it again.
  const charged = estimate.fees.filter((entry) => entry.type !== "forwarder");
  const fee = sumFeesInToken(
    charged.map((entry) => ({ name: `the ${entry.type} fee`, token: entry.token, amount: entry.amount })),
    "USDC",
    "Unified Balance",
  );
  return { fee, feeByChain: sumFeesByChain(charged) };
}

// A fee as Unified Balance quotes it, with each source chain's share.
type ChainFee = { type: string; allocations?: readonly { chain: string; amount: string }[] };

export function sumFeesByChain(fees: readonly ChainFee[]) {
  const feeByChain = new Map<SpendChain, bigint>();
  for (const fee of fees) {
    if (!fee.allocations) throw new Error(`Unified Balance didn't say which chain pays the ${fee.type} fee.`);
    for (const allocation of fee.allocations) {
      const chain = toSpendChain(allocation.chain);
      feeByChain.set(chain, (feeByChain.get(chain) ?? BigInt(0)) + fromKitAmount(allocation.amount));
    }
  }
  return feeByChain;
}

export function findOverdrawnChain(
  balances: readonly ChainBalance[],
  allocations: readonly ChainAllocation[],
  feeByChain: ReadonlyMap<SpendChain, bigint>,
) {
  return allocations.find(({ chain, amount }) => {
    const balance = balances.find((entry) => entry.chain === chain)?.balance ?? BigInt(0);
    return amount + (feeByChain.get(chain) ?? BigInt(0)) > balance;
  });
}

// Largest balances first, leaving each chain's reserve untouched.
export function splitAcrossChains(
  balances: readonly ChainBalance[],
  amount: bigint,
  reserves: ReadonlyMap<SpendChain, bigint>,
) {
  const allocations: ChainAllocation[] = [];
  let remaining = amount;
  for (const { chain, balance } of balances) {
    if (remaining === BigInt(0)) break;
    const room = balance - (reserves.get(chain) ?? BigInt(0));
    if (room <= BigInt(0)) continue;
    const take = room < remaining ? room : remaining;
    allocations.push({ chain, amount: take });
    remaining -= take;
  }
  if (remaining > BigInt(0)) {
    throw new OperationFailure({
      message: OVER_BALANCE_WITH_FEES,
      detail: `Short by ${toKitAmount(remaining)} USDC across ${balances.length} chains.`,
      canRetry: false,
    });
  }
  return allocations;
}

export type MoveToCashRequest = {
  account: Address;
  quote: MoveToCashQuote;
  idempotencyKey: string;
};

// Idempotency keys whose move was sent. A failed send can't say whether money moved, so a key
// is never sent twice.
const sentMoves = new Set<string>();

// `unlockKey` asks for the passkey, so it runs only once the move is ready to send.
export async function moveToCash(
  { account, quote, idempotencyKey }: MoveToCashRequest,
  unlockKey: () => Promise<Hex>,
): Promise<OperationReceipt> {
  if (sentMoves.has(idempotencyKey)) {
    throw new OperationFailure({
      message: "An earlier try may have gone through. Check your balance before moving money again.",
      detail: `Idempotency key ${idempotencyKey} was already sent.`,
      canRetry: false,
    });
  }
  const adapter = createViemAdapterFromPrivateKey({ privateKey: await unlockKey() });

  sentMoves.add(idempotencyKey);
  const result = await appKit.unifiedBalance.spend({
    // The key signs for the business account's Unified Balance.
    from: { adapter, sourceAccount: account, allocations: toKitAllocations(quote.allocations) },
    ...toCash(account, quote.amount),
  });
  return {
    transactionHash: result.txHash,
    explorerUrl: result.explorerUrl ?? explorerTransactionUrl(ARC, result.txHash),
  };
}

// Always into the business account itself. Circle's forwarder mints it, so nothing else signs.
function toCash(account: Address, amount: bigint): Omit<SpendParams, "from"> {
  return {
    to: { chain: ARC.kitChain, recipientAddress: account, useForwarder: true },
    token: "USDC",
    amount: toKitAmount(amount),
  };
}

function toKitAllocations(allocations: readonly ChainAllocation[]) {
  return allocations.map(({ chain, amount }) => ({ chain, amount: toKitAmount(amount) }));
}

const UNIFIED_BALANCE_CHAINS: readonly string[] = Object.values(UnifiedBalanceChain);

// The chains Unified Balance can spend from.
type SpendChain = `${UnifiedBalanceChain}`;

// Left to itself, App Kit draws from the signer's own (empty) balance rather than the account
// it signs for, so name the chains to draw from: supported ones only, the largest balances first.
async function readSpendBalances(account: Address): Promise<ChainBalance[]> {
  const { breakdown } = await appKit.unifiedBalance.getBalances({
    token: "USDC",
    sources: { address: account },
    networkType: "testnet",
  });
  return breakdown
    .flatMap((depositor) => depositor.breakdown)
    .filter((entry) => findChainByKitName(entry.chain))
    .map((entry) => ({
      chain: toSpendChain(entry.chain),
      balance: fromKitAmount(entry.confirmedBalance),
    }))
    .filter(({ balance }) => balance > BigInt(0))
    .sort((first, second) => (second.balance > first.balance ? 1 : -1));
}

function toSpendChain(chain: string) {
  if (!isSpendChain(chain)) throw new Error(`Unified Balance can't spend from ${chain}.`);
  return chain;
}

function isSpendChain(chain: string): chain is SpendChain {
  return UNIFIED_BALANCE_CHAINS.includes(chain);
}
