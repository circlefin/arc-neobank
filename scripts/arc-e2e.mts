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

// End-to-end check of every App Kit flow on Arc Testnet, through the same code the UI calls.
// A throwaway key owns the test account instead of a passkey, since passkeys need a browser.
// Only Arc is signed on. Moving money out of Arc is delivered by Circle on the other chain.
//
//   npm run test:arc                 # run everything
//   npm run test:arc -- swap earn    # run some steps

import { generateKeyPairSync } from "node:crypto";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import {
  createKernelAccount,
  createKernelAccountClient,
  createZeroDevPaymasterClient,
} from "@zerodev/sdk";
import { getEntryPoint, KERNEL_V3_1 } from "@zerodev/sdk/constants";
import { bytesToBigInt, formatUnits, http, isHex, keccak256, toHex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { executeBridge, quoteBridge } from "@/lib/app-kit/bridge";
import {
  executeBorrow,
  executePayOff,
  executeRepay,
  quoteBorrow,
  quotePayOff,
  quoteRepay,
  readCredit,
} from "@/lib/app-kit/borrow";
import { describeOperationError } from "@/lib/app-kit/core";
import { depositToVault, listVaults, readPositions, withdrawAllFromVault } from "@/lib/app-kit/earn";
import { executeSend } from "@/lib/app-kit/send";
import { executeSwap, quoteSwap } from "@/lib/app-kit/swap";
import { readTreasury } from "@/lib/app-kit/treasury";
import {
  depositToUnifiedBalance,
  moveToCash,
  quoteMoveToCash,
} from "@/lib/app-kit/unified-balance";
import { createKernelWallet } from "@/lib/app-kit/wallet";
import {
  getChainClient,
  readOperatorPermissionState,
  toRevokeOperatorCalls,
  type OperatorPermission,
} from "@/lib/business-account";
import { ARC, OTHER_CHAINS, SOLANA } from "@/lib/chains";
import { formatTokenAmount, parseAmount } from "@/lib/format";
import { isSolanaAddress, readSolanaUsdc } from "@/lib/solana";
import { zeroDevRpcUrl } from "@/lib/zerodev";

const STEPS = [
  "send",
  "swap",
  "earn",
  "borrow",
  "unified-balance",
  "move-out",
  "move-out-solana",
  "revoke-expired",
] as const;
type Step = (typeof STEPS)[number];

// Arc cash each step spends, or holds while it runs. A run needs the sum for its steps.
const STEP_USDC: Record<Step, bigint> = {
  send: parseAmount("0.01"),
  swap: parseAmount("1"),
  earn: parseAmount("0.10"),
  // Covers the loan's fees and interest. The borrowed USDC repays the rest.
  borrow: parseAmount("0.10"),
  "unified-balance": parseAmount("0.30"),
  "move-out": parseAmount("0.50"),
  "move-out-solana": parseAmount("0.50"),
  "revoke-expired": BigInt(0),
};
const UNIFIED_BALANCE_WAIT_MILLISECONDS = 5 * 60_000;
const EARN_WAIT_MILLISECONDS = 2 * 60_000;
const BORROW_AMOUNT = parseAmount("1");
const SOLANA_WAIT_MILLISECONDS = 2 * 60_000;
const POLL_MILLISECONDS = 10_000;
const DAY_MILLISECONDS = 24 * 60 * 60_000;

const ownerKey = process.env.ARC_E2E_OWNER_KEY;
if (!ownerKey || !isHex(ownerKey)) {
  console.log(`Add a test key to .env.local, then fund its account:\n\nARC_E2E_OWNER_KEY=${generatePrivateKey()}\n`);
  process.exit(1);
}

// The test key is a plain key, so it also signs for Unified Balance, as the passkey's key does in the app.
const owner = privateKeyToAccount(ownerKey);

const entryPoint = getEntryPoint("0.7");
const arcClient = getChainClient(ARC.viem);
const account = await createKernelAccount(arcClient, {
  plugins: {
    sudo: await signerToEcdsaValidator(arcClient, {
      signer: owner,
      entryPoint,
      kernelVersion: KERNEL_V3_1,
    }),
  },
  entryPoint,
  kernelVersion: KERNEL_V3_1,
});
const zeroDevRpc = http(zeroDevRpcUrl(ARC.viem.id));
const paymaster = createZeroDevPaymasterClient({ chain: ARC.viem, transport: zeroDevRpc });
const accountClient = createKernelAccountClient({
  account,
  chain: ARC.viem,
  client: arcClient,
  bundlerTransport: zeroDevRpc,
  paymaster: {
    getPaymasterData: (userOperation) => paymaster.sponsorUserOperation({ userOperation }),
  },
});

const address = account.address;
const wallet = createKernelWallet(address, async (chain) => {
  if (chain.kitChain !== ARC.kitChain) throw new Error(`This check only signs on Arc, not ${chain.label}.`);
  return accountClient;
});

const usdc = (amount: bigint) => `${formatTokenAmount(amount)} USDC`;

// Unified Balance and Earn show a change a little after it lands, so read until it's there.
async function waitFor<T>(read: () => Promise<T>, isDone: (value: T) => boolean, waitMilliseconds: number) {
  const deadline = Date.now() + waitMilliseconds;
  let value = await read();
  while (!isDone(value) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MILLISECONDS));
    value = await read();
  }
  return value;
}

const steps: Record<Step, () => Promise<string>> = {
  async send() {
    // Paid to the test key's own address, so the money stays with the test.
    const request = { token: "USDC", amount: STEP_USDC.send, recipient: owner.address } as const;
    const idempotencyKey = crypto.randomUUID();
    const before = (await readTreasury(address)).cash.USDC;
    const receipt = await wallet.runOnce(idempotencyKey, (keyed) => executeSend(keyed, request));
    // A retry with the same key must return the first payment, not pay again.
    const retried = await wallet.runOnce(idempotencyKey, (keyed) => executeSend(keyed, request));
    const after = (await readTreasury(address)).cash.USDC;
    if (retried.transactionHash !== receipt.transactionHash) throw new Error("The retry paid again.");
    if (before - after !== request.amount) {
      throw new Error(`Cash fell by ${usdc(before - after)}, not ${usdc(request.amount)} (${receipt.explorerUrl}).`);
    }
    return `paid ${usdc(request.amount)}, retry returned the same payment ${receipt.explorerUrl}`;
  },

  async swap() {
    const before = (await readTreasury(address)).cash;
    // Smaller swaps can quote but find no route when sent.
    const request = { from: "USDC", to: "EURC", amountIn: STEP_USDC.swap, slippageBasisPoints: BigInt(100) } as const;
    const quote = await quoteSwap(wallet, request);
    const receipt = await executeSwap(wallet, request);
    const after = (await readTreasury(address)).cash;
    if (after.EURC <= before.EURC) throw new Error("EURC didn't increase.");
    return `1 USDC → ${formatTokenAmount(after.EURC - before.EURC)} EURC (quoted ${formatTokenAmount(quote.expectedOut)}, impact ${quote.priceImpactBasisPoints} bps) ${receipt.explorerUrl}`;
  },

  async earn() {
    const [vault] = await listVaults();
    if (!vault) throw new Error("No Earn vaults on Arc.");
    const deposit = await depositToVault(wallet, vault, STEP_USDC.earn);
    const readVaultPositions = () => readPositions(address, [vault]);
    const [position] = await waitFor(readVaultPositions, (positions) => positions.length > 0, EARN_WAIT_MILLISECONDS);
    if (!position) throw new Error(`No position 2 minutes after depositing (${deposit.explorerUrl}).`);
    const withdrawal = await withdrawAllFromVault(wallet, position);
    const [remaining] = await waitFor(readVaultPositions, (positions) => positions.length === 0, EARN_WAIT_MILLISECONDS);
    if (remaining) throw new Error(`${formatTokenAmount(remaining.currentValue)} left after withdrawing all (${withdrawal.explorerUrl}).`);
    return `deposited ${usdc(STEP_USDC.earn)} into ${vault.name} (${deposit.explorerUrl}), position ${formatTokenAmount(position.currentValue)}, withdrew all (${withdrawal.explorerUrl}), nothing left`;
  },

  async borrow() {
    const { markets, loans } = await readCredit(address);
    const [market] = markets;
    if (!market) throw new Error("No Borrow markets on Arc.");
    // An earlier run that stopped partway leaves a loan, and paying it off needs its whole debt.
    const earlier = loans.find((loan) => loan.market.id === market.id);
    const quote = await quoteBorrow(address, market, earlier, BORROW_AMOUNT);
    const { symbol, address: collateralAddress, decimals, walletBalance } = market.collateral;
    if (walletBalance < quote.collateralAdded) {
      throw new Error(
        `Borrowing ${usdc(BORROW_AMOUNT)} takes ${formatUnits(quote.collateralAdded, decimals)} ${symbol} (${collateralAddress}), and ${address} holds ${formatUnits(walletBalance, decimals)}. Send it some ${symbol} on Arc Testnet.`,
      );
    }
    const borrowed = await executeBorrow(wallet, market, earlier, BORROW_AMOUNT);

    const requireLoan = async () => {
      const loan = (await readCredit(address)).loans.find((candidate) => candidate.market.id === market.id);
      if (!loan) throw new Error(`No loan in ${market.protocol} after borrowing (${borrowed.explorerUrl}).`);
      return loan;
    };
    const loan = await requireLoan();
    const repayment = BORROW_AMOUNT / BigInt(2);
    const repayQuote = await quoteRepay(loan, repayment);
    const repaid = await executeRepay(wallet, loan, repayment);

    const remaining = await requireLoan();
    const payOff = await quotePayOff(remaining);
    const closed = await executePayOff(wallet, remaining);
    const left = (await readCredit(address)).loans.find((candidate) => candidate.market.id === market.id);
    if (left) throw new Error(`${usdc(left.debt)} still owed after paying off (${closed.explorerUrl}).`);
    return `borrowed ${usdc(BORROW_AMOUNT)} against ${formatUnits(quote.collateralAdded, decimals)} ${symbol}, fee ${usdc(quote.fee)} (${borrowed.explorerUrl}); repaid ${usdc(repayment)}, fee ${usdc(repayQuote.fee)} (${repaid.explorerUrl}); paid off at most ${usdc(payOff.maxRepayment)}, ${formatUnits(payOff.collateralBack, decimals)} ${symbol} back (${closed.explorerUrl})`;
  },

  async "unified-balance"() {
    const amount = STEP_USDC["unified-balance"];
    const start = (await readTreasury(address)).unifiedBalance;
    const deposit = await depositToUnifiedBalance(wallet, { chain: ARC, amount, signer: owner.address });
    const unified = await waitFor(
      async () => (await readTreasury(address)).unifiedBalance,
      (balance) => balance >= start + amount,
      UNIFIED_BALANCE_WAIT_MILLISECONDS,
    );
    if (unified < start + amount) throw new Error(`Deposit (${deposit.explorerUrl}) not in Unified Balance after 5 minutes.`);

    const cashBefore = (await readTreasury(address)).cash.USDC;
    const quote = await quoteMoveToCash(address, parseAmount("0.20"));
    const moved = await moveToCash(
      { account: address, quote, idempotencyKey: crypto.randomUUID() },
      async () => ownerKey,
    );
    const cashAfter = (await readTreasury(address)).cash.USDC;
    if (cashAfter - cashBefore !== quote.amount) {
      throw new Error(`Cash changed by ${usdc(cashAfter - cashBefore)}, not the quoted ${usdc(quote.amount)} (${moved.explorerUrl}).`);
    }
    return `deposited ${usdc(amount)} (${deposit.explorerUrl}); moved 0.20 to cash, fee ${usdc(quote.fee)}, quoted ${usdc(quote.amount)}, cash +${usdc(cashAfter - cashBefore)} (${moved.explorerUrl})`;
  },

  async "move-out"() {
    const route = { from: ARC, to: OTHER_CHAINS[0], amount: STEP_USDC["move-out"] };
    const quote = await quoteBridge(wallet, route);
    const stages: string[] = [];
    const outcome = await executeBridge(wallet, route, ({ stage, status }) => {
      if (status === "done" || status === "failed") stages.push(`${stage}:${status}`);
    });
    if (outcome.status !== "done") throw new Error(`Stopped at ${outcome.failedStage} (${stages.join(" ")}).`);
    return `${usdc(route.amount)} Arc → ${route.to.label}, fee ${usdc(quote.fee)}, stages ${stages.join(" ")} ${outcome.explorerUrl ?? ""}`;
  },

  async "move-out-solana"() {
    const recipient = process.env.ARC_E2E_SOLANA_RECIPIENT;
    if (!recipient || !isSolanaAddress(recipient)) {
      throw new Error("Add a Solana Devnet wallet address to .env.local as ARC_E2E_SOLANA_RECIPIENT.");
    }
    const route = { from: ARC, to: SOLANA, recipient, amount: STEP_USDC["move-out-solana"] };
    const before = await readSolanaUsdc(recipient);
    const quote = await quoteBridge(wallet, route);
    const stages: string[] = [];
    const outcome = await executeBridge(wallet, route, ({ stage, status }) => {
      if (status === "done" || status === "failed") stages.push(`${stage}:${status}`);
    });
    if (outcome.status !== "done") throw new Error(`Stopped at ${outcome.failedStage} (${stages.join(" ")}).`);
    // The forwarder confirms before Solana's RPC shows the balance, so read until it's there.
    const after = await waitFor(() => readSolanaUsdc(recipient), (balance) => balance > before, SOLANA_WAIT_MILLISECONDS);
    if (after - before !== quote.received) {
      throw new Error(`${recipient} got ${usdc(after - before)}, not the quoted ${usdc(quote.received)} (${stages.join(" ")}).`);
    }
    return `${usdc(route.amount)} Arc → ${recipient} on Solana, fee ${usdc(quote.fee)}, received ${usdc(after - before)}, stages ${stages.join(" ")} ${outcome.explorerUrl ?? ""}`;
  },

  async "revoke-expired"() {
    // A new Operator passkey each run, so its permission has never been onchain. Only its public key is used.
    const { x, y } = generateKeyPairSync("ec", { namedCurve: "P-256" }).publicKey.export({ format: "jwk" });
    if (!x || !y) throw new Error("No P-256 public key.");
    const authenticatorId = crypto.randomUUID();
    const operator: OperatorPermission = {
      passkey: {
        pubX: bytesToBigInt(Buffer.from(x, "base64url")),
        pubY: bytesToBigInt(Buffer.from(y, "base64url")),
        authenticatorId, authenticatorIdHash: keccak256(toHex(authenticatorId)), rpID: "localhost" },
      paymentLimit: parseAmount("1"),
      tokens: ["USDC"],
      expiresAt: new Date(Date.now() - DAY_MILLISECONDS).toISOString(),
    };
    const before = await readOperatorPermissionState(address, operator);
    if (before !== "never installed") throw new Error(`Started ${before}, not never installed.`);
    const userOperationHash = await accountClient.sendUserOperation({ calls: await toRevokeOperatorCalls(address, operator) });
    const receipt = await accountClient.waitForUserOperationReceipt({ hash: userOperationHash });
    const explorerUrl = `${ARC.viem.blockExplorers?.default.url}/tx/${receipt.receipt.transactionHash}`;
    if (!receipt.success) throw new Error(`Revoke failed onchain (${explorerUrl}).`);
    const after = await readOperatorPermissionState(address, operator);
    if (after !== "removed") throw new Error(`Ended ${after}, not removed (${explorerUrl}).`);
    const again = await toRevokeOperatorCalls(address, operator);
    if (again.length > 0) throw new Error("Revoking again would send another operation.");
    return `permission expired ${operator.expiresAt} went never installed → removed, revoking again sends nothing ${explorerUrl}`;
  },
};

const isStep = (name: string): name is Step => STEPS.some((step) => step === name);
const names = process.argv.slice(2);
const requested = names.filter(isStep);
if (requested.length < names.length) {
  console.log(`Unknown step in "${names.join(" ")}". Steps are: ${STEPS.join(", ")}`);
  process.exit(1);
}
const treasury = await readTreasury(address);
console.log(`Test account ${address}`);
console.log(`Cash: ${usdc(treasury.cash.USDC)}, ${formatTokenAmount(treasury.cash.EURC)} EURC. Unified Balance: ${usdc(treasury.unifiedBalance)}\n`);
const toRun: readonly Step[] = requested.length > 0 ? requested : STEPS;
const needed = toRun.reduce<bigint>((total, step) => total + STEP_USDC[step], BigInt(0));
if (treasury.cash.USDC < needed) {
  console.log(`${toRun.join(", ")} need at least ${usdc(needed)} on Arc Testnet. Send some to ${address} from https://faucet.circle.com`);
  process.exit(1);
}

let failed = false;
for (const step of toRun) {
  const started = Date.now();
  try {
    console.log(`PASS ${step} — ${await steps[step]()} (${Date.now() - started} ms)`);
  } catch (caught) {
    failed = true;
    const { detail } = describeOperationError(caught, "Failed.");
    console.log(`FAIL ${step} — ${detail.replaceAll("\n", " ← ")} (${Date.now() - started} ms)`);
  }
}
process.exit(failed ? 1 : 0);
