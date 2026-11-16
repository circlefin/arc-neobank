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

import type {
  BorrowAssetAmount,
  BorrowFee,
  BorrowHealthFactorBand,
  BorrowLoan,
  BorrowLoanInfo,
  BorrowMarketInfo,
} from "@circle-fin/app-kit";
import { cache } from "react";
import { erc20Abi, getAddress, isAddressEqual, type Address } from "viem";
import { getChainClient } from "@/lib/business-account";
import { ARC, explorerTransactionUrl } from "@/lib/chains";
import { BASIS_POINTS_PER_WHOLE } from "@/lib/format";
import { ONE_TOKEN } from "@/lib/tokens";
import {
  appKit,
  fromKitAmount,
  fromKitRatio,
  OperationFailure,
  toKitAmount,
  type OperationReceipt,
} from "./core";
import type { BusinessWallet } from "./wallet";

export type HealthBand = BorrowHealthFactorBand;

type CollateralAsset = {
  symbol: string;
  address: Address;
  decimals: number;
  // USDC for one whole unit, in USDC base units.
  price: bigint;
  // Held in the account, in the asset's base units.
  walletBalance: bigint;
};

export type BorrowMarket = {
  id: string;
  protocol: string;
  collateral: CollateralAsset;
  liquidationThresholdBasisPoints: bigint;
  borrowApyBasisPoints: bigint;
  // USDC the market still has to lend.
  liquidity: bigint;
  // The most the account can borrow here now, counting collateral it could still deposit.
  borrowLimit: bigint;
};

export type LoanHealth = {
  // In basis points: 1.85 is 18,500. Null while nothing is owed.
  healthFactor: bigint | null;
  band: HealthBand;
  // The collateral price at which the loan can be liquidated, in USDC base units.
  liquidationPrice: bigint | null;
};

export type Loan = {
  id: string;
  market: BorrowMarket;
  // In the collateral's base units.
  collateral: bigint;
  debt: bigint;
  health: LoanHealth;
};

export type Credit = { markets: BorrowMarket[]; loans: Loan[] };

// A loan at health factor 1 sits at its liquidation price, which is then the collateral's price.
const LIQUIDATION_HEALTH_FACTOR = 1;

// How often, and how long, to wait for Borrow Kit to record a change to a loan.
const LOAN_POLL_MILLISECONDS = 2_000;
const LOAN_WAIT_MILLISECONDS = 60_000;

// Server reads. Markets and loans come from Borrow Kit, never from app storage.

export const readCredit = cache(async (address: Address): Promise<Credit> => {
  const [marketInfos, loanInfos] = await Promise.all([
    listMarketInfos(),
    listActiveLoans(address),
  ]);
  const markets = await Promise.all(
    marketInfos.map((info) =>
      toMarket(info, address, loanInfos.find((loan) => loan.marketId === info.marketId)),
    ),
  );
  return { markets, loans: loanInfos.map((info) => toLoan(info, markets)) };
});

// USDC loans on Arc. A market Borrow Kit hasn't priced yet can't be shown, so it waits.
async function listMarketInfos() {
  const markets: BorrowMarketInfo[] = [];
  for await (const market of appKit.borrow.exploreMarketsIterator({ chain: ARC.kitChain })) {
    if (
      isAddressEqual(getAddress(market.loanAsset.address), ARC.usdcAddress) &&
      market.lltv !== null &&
      market.borrowApy !== null &&
      market.liquidity !== null
    ) {
      markets.push(market);
    }
  }
  return markets;
}

async function listActiveLoans(address: Address) {
  const loans: BorrowLoan[] = [];
  let pageAfter: string | undefined;
  do {
    const page = await appKit.borrow.getLoans({ walletAddress: address, chain: ARC.kitChain, pageAfter });
    loans.push(...page.loans);
    pageAfter = page.pagination.pageAfter;
  } while (pageAfter);

  const active = await Promise.all(
    loans.map(async (loan) => ((await readStatus(loan)) === "active" ? [loan] : [])),
  );
  return active.flat();
}

// The list may leave a loan's status out. The loan itself always has one.
async function readStatus(loan: BorrowLoan) {
  return loan.status ?? (await appKit.borrow.getPosition({ loanId: loan.loanId })).status;
}

async function toMarket(
  info: BorrowMarketInfo,
  address: Address,
  loan: BorrowLoan | undefined,
): Promise<BorrowMarket> {
  const { collateralAsset } = info;
  const collateralAddress = getAddress(collateralAsset.address);
  const [price, walletBalance] = await Promise.all([
    readCollateralPrice(info),
    getChainClient(ARC.viem).readContract({
      address: collateralAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    }),
  ]);
  const liquidity = toAmount(requireValue(info.liquidity, "the market's liquidity"));
  return {
    id: info.marketId,
    protocol: toTitleCase(info.protocol),
    collateral: {
      symbol: collateralAsset.symbol,
      address: collateralAddress,
      decimals: collateralAsset.decimals,
      price,
      walletBalance,
    },
    liquidationThresholdBasisPoints: fromKitRatio(requireValue(info.lltv, "the liquidation threshold")),
    borrowApyBasisPoints: fromKitRatio(requireValue(info.borrowApy, "the borrow rate")),
    liquidity,
    borrowLimit: await readBorrowLimit(info, walletBalance, loan, liquidity),
  };
}

// Borrow Kit has no price, so ask what a loan at the liquidation line would look like.
async function readCollateralPrice(info: BorrowMarketInfo) {
  const { liquidationPrice } = await appKit.borrow.getRequiredCollateral({
    chain: ARC.kitChain,
    marketId: info.marketId,
    borrowAmount: toKitAmount(ONE_TOKEN),
    targetHealthFactor: LIQUIDATION_HEALTH_FACTOR,
  });
  return toAmount(requireValue(liquidationPrice, "the collateral's price"));
}

// What Borrow Kit would lend against the loan's collateral and the account's, less what's owed.
async function readBorrowLimit(
  info: BorrowMarketInfo,
  walletBalance: bigint,
  loan: BorrowLoan | undefined,
  liquidity: bigint,
) {
  const collateral = walletBalance + (loan ? toAmount(requireReady(loan).collateral) : BigInt(0));
  if (collateral === BigInt(0)) return BigInt(0);
  const { maxBorrowAmount } = await appKit.borrow.getMaxBorrow({
    chain: ARC.kitChain,
    marketId: info.marketId,
    collateralAmount: toKitAmount(collateral, info.collateralAsset.decimals),
  });
  const headroom = toAmount(maxBorrowAmount) - (loan ? toAmount(requireReady(loan).borrowed) : BigInt(0));
  if (headroom < BigInt(0)) return BigInt(0);
  return headroom < liquidity ? headroom : liquidity;
}

function toLoan(info: BorrowLoan, markets: BorrowMarket[]): Loan {
  const market = markets.find(({ id }) => id === info.marketId);
  if (!market) throw new Error(`Loan ${info.loanId} is in a market Borrow Kit didn't list.`);
  const { collateral, borrowed } = requireReady(info);
  return {
    id: info.loanId,
    market,
    collateral: toAmount(collateral),
    debt: toAmount(borrowed),
    health: toHealth(info.healthFactor, info.healthFactorBand, info.liquidationPrice),
  };
}

// A loan whose last change Borrow Kit hasn't recorded yet has no figures to show.
function requireReady({ loanId, dataStatus, collateral, borrowed }: BorrowLoan | BorrowLoanInfo) {
  if (dataStatus !== "READY" || !collateral || !borrowed) {
    throw new Error(`Borrow Kit is still recording loan ${loanId}.`);
  }
  return { collateral, borrowed };
}

// Browser operations. Quotes are reads, and each write is one batch, so one passkey prompt.

export type BorrowQuote = {
  amount: bigint;
  // Pulled from the account and deposited with the borrow.
  collateralAdded: bigint;
  fee: bigint;
  health: LoanHealth;
};

// Borrow Kit sizes the collateral for the amount, so the quote says how much it takes.
export async function quoteBorrow(
  account: Address,
  market: BorrowMarket,
  loan: Loan | undefined,
  amount: bigint,
): Promise<BorrowQuote> {
  const borrowAmount = toKitAmount(amount);
  const quote = await appKit.borrow.getBorrowQuote(
    loan
      ? { loanId: loan.id, borrowAmount }
      : { chain: ARC.kitChain, marketId: market.id, walletAddress: account, borrowAmount },
  );
  return {
    amount,
    collateralAdded: toAmount(quote.collateralAmount),
    fee: sumFees(quote.fees),
    health: toHealth(quote.resultingHealthFactor, quote.resultingBand, quote.liquidationPrice),
  };
}

// Opens a loan in the market, or adds to the loan already there.
export async function executeBorrow(
  { adapter, address }: BusinessWallet,
  market: BorrowMarket,
  loan: Loan | undefined,
  amount: bigint,
): Promise<OperationReceipt> {
  const from = { adapter, chain: ARC.kitChain };
  const borrowAmount = toKitAmount(amount);
  const result = await appKit.borrow.borrow(
    loan
      ? { from, loanId: loan.id, borrowAmount }
      : { from, marketId: market.id, borrowAmount },
  );
  const receipt = toReceipt(result);
  await waitForLoan(result.loanId, (recorded) => !loan || recorded.debt > loan.debt);
  if (!loan) await waitForListedLoan(address, result.loanId);
  return receipt;
}

export type ChangeQuote = { fee: bigint; health: LoanHealth };

export async function quoteRepay(loan: Loan, amount: bigint): Promise<ChangeQuote> {
  const quote = await appKit.borrow.getRepayQuote({
    chain: ARC.kitChain,
    loanId: loan.id,
    repayAmount: toKitAmount(amount),
  });
  return {
    fee: sumFees(quote.fees),
    health: toHealth(quote.resultingHealthFactor, quote.resultingBand, quote.liquidationPrice),
  };
}

export async function executeRepay(
  { adapter }: BusinessWallet,
  loan: Loan,
  amount: bigint,
): Promise<OperationReceipt> {
  const receipt = toReceipt(
    await appKit.borrow.repay({
      from: { adapter, chain: ARC.kitChain },
      loanId: loan.id,
      repayAmount: toKitAmount(amount),
    }),
  );
  await waitForLoan(loan.id, (recorded) => recorded.debt < loan.debt);
  return receipt;
}

export type PayOffQuote = {
  // Interest accrues until the payment lands, so this is the most it takes. The rest comes back.
  maxRepayment: bigint;
  collateralBack: bigint;
  fee: bigint;
};

export async function quotePayOff(loan: Loan): Promise<PayOffQuote> {
  const quote = await appKit.borrow.getCloseLoanQuote({ chain: ARC.kitChain, loanId: loan.id });
  return {
    maxRepayment: toAmount(quote.bundledRepayment),
    collateralBack: toAmount(quote.collateralAmount),
    fee: sumFees(quote.fees),
  };
}

// Repays everything and returns all the collateral.
export async function executePayOff(
  { adapter }: BusinessWallet,
  loan: Loan,
): Promise<OperationReceipt> {
  const receipt = toReceipt(
    await appKit.borrow.closeLoan({ from: { adapter, chain: ARC.kitChain }, loanId: loan.id }),
  );
  await waitForLoan(loan.id, (recorded) => recorded.closed);
  return receipt;
}

export async function quoteAddCollateral(loan: Loan, amount: bigint): Promise<ChangeQuote> {
  const quote = await appKit.borrow.getAddCollateralQuote({
    chain: ARC.kitChain,
    loanId: loan.id,
    collateralAmount: toKitAmount(amount, loan.market.collateral.decimals),
  });
  return {
    fee: sumFees(quote.fees),
    health: toHealth(quote.resultingHealthFactor, quote.resultingBand, quote.liquidationPrice),
  };
}

export async function executeAddCollateral(
  { adapter }: BusinessWallet,
  loan: Loan,
  amount: bigint,
): Promise<OperationReceipt> {
  const receipt = toReceipt(
    await appKit.borrow.addCollateral({
      from: { adapter, chain: ARC.kitChain },
      loanId: loan.id,
      collateralAmount: toKitAmount(amount, loan.market.collateral.decimals),
    }),
  );
  await waitForLoan(loan.id, (recorded) => recorded.collateral > loan.collateral);
  return receipt;
}

type RecordedLoan = { collateral: bigint; debt: bigint; closed: boolean };

// Borrow Kit records a change a little after it lands. Waits until it shows, so the page reads it.
async function waitForLoan(loanId: string, hasChange: (loan: RecordedLoan) => boolean) {
  const deadline = Date.now() + LOAN_WAIT_MILLISECONDS;
  for (;;) {
    const loan = await appKit.borrow.getPosition({ loanId });
    if (loan.dataStatus === "READY") {
      const { collateral, borrowed } = requireReady(loan);
      const recorded = {
        collateral: toAmount(collateral),
        debt: toAmount(borrowed),
        closed: loan.status === "closed",
      };
      if (hasChange(recorded)) return;
    }
    if (Date.now() > deadline) {
      throw new OperationFailure({
        message: "It went through, but your loan hasn't updated yet. Check it again in a minute.",
        detail: `Borrow Kit didn't show the change to loan ${loanId} within ${LOAN_WAIT_MILLISECONDS} ms.`,
        canRetry: false,
      });
    }
    await new Promise((resolve) => setTimeout(resolve, LOAN_POLL_MILLISECONDS));
  }
}

// A new loan reaches the account's list of loans after the loan itself, and the page reads the list.
async function waitForListedLoan(address: Address, loanId: string) {
  const deadline = Date.now() + LOAN_WAIT_MILLISECONDS;
  for (;;) {
    const loans = await listActiveLoans(address);
    if (loans.some((listed) => listed.loanId === loanId && listed.dataStatus === "READY")) return;
    if (Date.now() > deadline) {
      throw new OperationFailure({
        message: "It went through, but your loan hasn't shown up yet. Check it again in a minute.",
        detail: `Borrow Kit didn't list loan ${loanId} within ${LOAN_WAIT_MILLISECONDS} ms.`,
        canRetry: false,
      });
    }
    await new Promise((resolve) => setTimeout(resolve, LOAN_POLL_MILLISECONDS));
  }
}

export type CreditSummary = {
  debt: bigint;
  collateralValue: bigint;
  // The most the account can owe in all: what it owes plus what Borrow Kit would still lend.
  // Borrow Kit keeps it short of the liquidation line, and counts collateral not yet deposited.
  borrowLimit: bigint;
  // Interest a year at today's rates.
  annualCost: bigint;
};

export function summarizeCredit({ markets, loans }: Credit): CreditSummary {
  let debt = BigInt(0);
  let collateralValue = BigInt(0);
  let annualCost = BigInt(0);
  for (const { market, collateral, debt: loanDebt } of loans) {
    debt += loanDebt;
    collateralValue += toCollateralValue(market, collateral);
    annualCost += (loanDebt * market.borrowApyBasisPoints) / BASIS_POINTS_PER_WHOLE;
  }
  const borrowLimit = markets.reduce((total, market) => total + market.borrowLimit, debt);
  return { debt, collateralValue, borrowLimit, annualCost };
}

// What the loan would be worth if sold, in USDC base units.
export function toCollateralValue(market: BorrowMarket, collateral: bigint) {
  return (collateral * market.collateral.price) / BigInt(10) ** BigInt(market.collateral.decimals);
}

// The most a collateral amount can back. Owing all of it puts the loan at the liquidation line.
export function toBorrowingPower(market: BorrowMarket, collateral: bigint) {
  return (
    (toCollateralValue(market, collateral) * market.liquidationThresholdBasisPoints) /
    BASIS_POINTS_PER_WHOLE
  );
}

function toHealth(
  healthFactor: number | null,
  band: HealthBand | null,
  liquidationPrice: BorrowAssetAmount | null,
): LoanHealth {
  return {
    healthFactor: healthFactor === null ? null : fromKitRatio(healthFactor),
    // Borrow Kit leaves the band out when nothing is owed, so nothing can be liquidated.
    band: band ?? "SAFE",
    liquidationPrice: liquidationPrice === null ? null : toAmount(liquidationPrice),
  };
}

// The write landed but the wallet couldn't say where, so a retry checks before sending again.
function toReceipt(
  result: { status: "submitted"; error?: Error } | { status: "confirmed" | "confirmed-details-unavailable"; txHash: string },
): OperationReceipt {
  if (result.status === "submitted") {
    throw result.error ?? new Error("The wallet took the operation but didn't say where it landed.");
  }
  return {
    transactionHash: result.txHash,
    explorerUrl: explorerTransactionUrl(ARC, result.txHash),
  };
}

// Fees come in USDC, the loan's currency.
function sumFees(fees: readonly BorrowFee[]) {
  return fees.reduce((total, { amount }) => {
    if (!isAddressEqual(getAddress(amount.tokenAddress), ARC.usdcAddress)) {
      throw new Error(`Borrow Kit charged a fee in ${amount.token}, not USDC.`);
    }
    return total + toAmount(amount);
  }, BigInt(0));
}

function toAmount({ amount, decimals }: BorrowAssetAmount) {
  return fromKitAmount(amount, decimals);
}

function requireValue<T>(value: T | null, what: string): T {
  if (value === null) throw new Error(`Borrow Kit didn't return ${what}.`);
  return value;
}

function toTitleCase(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}
