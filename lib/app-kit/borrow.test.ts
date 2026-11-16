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

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseAmount } from "@/lib/format";
import { summarizeCredit, toBorrowingPower, type BorrowMarket, type Loan } from "./borrow";

const CIRBTC_DECIMALS = 8;

const MARKET: BorrowMarket = {
  id: "0x01",
  protocol: "Morpho",
  collateral: {
    symbol: "cirBTC",
    address: "0x0000000000000000000000000000000000000001",
    decimals: CIRBTC_DECIMALS,
    price: parseAmount("100000"),
    walletBalance: BigInt(0),
  },
  liquidationThresholdBasisPoints: BigInt(8_600),
  borrowApyBasisPoints: BigInt(500),
  liquidity: BigInt(0),
  borrowLimit: BigInt(0),
};

function loan(collateral: string, debt: string): Loan {
  return {
    id: `loan-${collateral}`,
    market: MARKET,
    collateral: parseAmount(collateral, CIRBTC_DECIMALS),
    debt: parseAmount(debt),
    health: { healthFactor: null, band: "SAFE", liquidationPrice: null },
  };
}

describe("toBorrowingPower", () => {
  test("is the collateral's value at the liquidation threshold, in the collateral's own decimals", () => {
    // 0.002 cirBTC is $200, and 86% of that is $172.
    assert.equal(toBorrowingPower(MARKET, parseAmount("0.002", CIRBTC_DECIMALS)), parseAmount("172"));
  });
});

describe("summarizeCredit", () => {
  test("is all zeros with no loans and nothing to borrow against", () => {
    assert.deepEqual(summarizeCredit({ markets: [MARKET], loans: [] }), {
      debt: BigInt(0),
      collateralValue: BigInt(0),
      borrowLimit: BigInt(0),
      annualCost: BigInt(0),
    });
  });

  test("counts what collateral in the account could borrow before a first loan", () => {
    const market = { ...MARKET, borrowLimit: parseAmount("140") };

    assert.equal(summarizeCredit({ markets: [market], loans: [] }).borrowLimit, parseAmount("140"));
  });

  test("adds up every loan", () => {
    const market = { ...MARKET, borrowLimit: parseAmount("50") };
    const summary = summarizeCredit({
      markets: [market],
      loans: [loan("0.002", "80"), loan("0.001", "20")],
    });

    assert.equal(summary.debt, parseAmount("100"));
    assert.equal(summary.collateralValue, parseAmount("300"));
    // What's owed plus what Borrow Kit would still lend, not the $258 at the liquidation line.
    assert.equal(summary.borrowLimit, parseAmount("150"));
    assert.equal(summary.annualCost, parseAmount("5")); // 5% of 100
  });
});
