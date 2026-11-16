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
import { OperationFailure } from "./core";
import { parseAmount } from "@/lib/format";
import { findOverdrawnChain, splitAcrossChains, sumFeesByChain } from "./unified-balance";

const balances = [
  { chain: "Arc_Testnet", balance: parseAmount("1") },
  { chain: "Base_Sepolia", balance: parseAmount("0.5") },
] as const;

describe("splitAcrossChains", () => {
  test("draws from the largest balance first", () => {
    assert.deepEqual(splitAcrossChains(balances, parseAmount("1.2"), new Map()), [
      { chain: "Arc_Testnet", amount: parseAmount("1") },
      { chain: "Base_Sepolia", amount: parseAmount("0.2") },
    ]);
  });

  test("leaves each chain's reserve for its fee", () => {
    const reserves = new Map([["Arc_Testnet", parseAmount("0.03")]] as const);
    assert.deepEqual(splitAcrossChains(balances, parseAmount("1"), reserves), [
      { chain: "Arc_Testnet", amount: parseAmount("0.97") },
      { chain: "Base_Sepolia", amount: parseAmount("0.03") },
    ]);
  });

  test("fails when the reserves leave too little", () => {
    const reserves = new Map([["Arc_Testnet", parseAmount("0.03")], ["Base_Sepolia", parseAmount("0.02")]] as const);
    assert.throws(() => splitAcrossChains(balances, parseAmount("1.5"), reserves), OperationFailure);
  });
});

describe("findOverdrawnChain", () => {
  test("finds a chain that can't cover what it sends plus its fee", () => {
    const allocations = [{ chain: "Arc_Testnet", amount: parseAmount("1") }] as const;
    const feeByChain = new Map([["Arc_Testnet", parseAmount("0.02")]] as const);
    assert.equal(findOverdrawnChain(balances, allocations, feeByChain)?.chain, "Arc_Testnet");
  });

  test("passes when every chain has room for its fee", () => {
    const allocations = [
      { chain: "Arc_Testnet", amount: parseAmount("0.98") },
      { chain: "Base_Sepolia", amount: parseAmount("0.02") },
    ] as const;
    const feeByChain = new Map([["Arc_Testnet", parseAmount("0.02")], ["Base_Sepolia", parseAmount("0.01")]] as const);
    assert.equal(findOverdrawnChain(balances, allocations, feeByChain), undefined);
  });
});

describe("sumFeesByChain", () => {
  // As Gateway quoted 0.6 from Arc and 0.4 from Base.
  test("adds each chain's share across fees", () => {
    const fees = [
      { type: "provider", token: "USDC", amount: "0.00002", allocations: [{ chain: "Base_Sepolia", amount: "0.00002" }] },
      {
        type: "gasFee",
        token: "USDC",
        amount: "0.032226",
        allocations: [
          { chain: "Arc_Testnet", amount: "0.021246" },
          { chain: "Base_Sepolia", amount: "0.01098" },
        ],
      },
    ] as const;
    assert.deepEqual(
      sumFeesByChain(fees),
      new Map([["Base_Sepolia", parseAmount("0.011")], ["Arc_Testnet", parseAmount("0.021246")]]),
    );
  });

  test("fails on a fee with no chain", () => {
    assert.throws(() => sumFeesByChain([{ type: "kit" }]), /which chain pays the kit fee/);
  });
});
