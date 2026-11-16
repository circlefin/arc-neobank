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
import type { Token } from "@/lib/tokens";
import { summarizeSavings, type Position } from "./earn";

// 1 EURC = 1.10 USDC.
const EURC_RATE = parseAmount("1.1");

function position(asset: Token, currentValue: string, apyBasisPoints: number, earned: string | null): Position {
  return {
    vault: {
      address: "0x0000000000000000000000000000000000000001",
      name: `${asset} vault`,
      protocol: "Test",
      curator: null,
      asset,
      apyBasisPoints: BigInt(apyBasisPoints),
      liquidity: BigInt(0),
      risk: "Low",
      riskNotes: [],
    },
    currentValue: parseAmount(currentValue),
    principal: null,
    earned: earned === null ? null : parseAmount(earned),
  };
}

describe("summarizeSavings", () => {
  test("is all zeros with no positions", () => {
    const none = { USDC: BigInt(0), EURC: BigInt(0) };
    assert.deepEqual(summarizeSavings([], EURC_RATE), {
      total: none,
      earned: none,
      annualYield: none,
      averageApyBasisPoints: BigInt(0),
    });
  });

  const positions = [
    position("USDC", "100", 500, "1"), // 100 USDC at 5%
    position("EURC", "100", 1_000, null), // 110 USDC at 10%, earnings not known yet
  ];

  test("keeps each currency apart and weights the APY by value at the rate", () => {
    const summary = summarizeSavings(positions, EURC_RATE);

    assert.deepEqual(summary.total, { USDC: parseAmount("100"), EURC: parseAmount("100") });
    assert.deepEqual(summary.earned, { USDC: parseAmount("1"), EURC: BigInt(0) });
    assert.deepEqual(summary.annualYield, { USDC: parseAmount("5"), EURC: parseAmount("10") });
    assert.equal(summary.averageApyBasisPoints, BigInt(761)); // (5 + 11) / 210, rounded down
  });

  test("has no average APY when there's EURC and no rate", () => {
    assert.equal(summarizeSavings(positions, null).averageApyBasisPoints, null);
    assert.equal(summarizeSavings(positions.slice(0, 1), null).averageApyBasisPoints, BigInt(500));
  });
});
