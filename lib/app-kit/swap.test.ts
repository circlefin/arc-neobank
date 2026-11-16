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
import { sumProviderFees } from "./swap";

describe("sumProviderFees", () => {
  test("is zero with no fees", () => {
    assert.equal(sumProviderFees({ fees: undefined }, "USDC"), BigInt(0));
    assert.equal(sumProviderFees({ fees: [] }, "USDC"), BigInt(0));
  });

  test("adds the provider's fees and leaves out gas, which the paymaster pays", () => {
    const fees = [
      { type: "provider", token: "USDC", amount: "0.01" },
      { type: "developer", token: "USDC", amount: "0.002" },
      { type: "gas", token: "ETH", amount: "0.0001" },
    ] as const;
    assert.equal(sumProviderFees({ fees }, "USDC"), parseAmount("0.012"));
  });

  // What Arc quoted for EURC → USDC: the provider charges the input token, gas comes in USDC.
  test("leaves out gas in another token, as Arc quotes it", () => {
    const fees = [
      { token: "EURC", amount: "0.005", type: "provider" },
      { token: "USDC", amount: "0.02700560625", type: "gas" },
    ] as const;
    assert.equal(sumProviderFees({ fees }, "EURC"), parseAmount("0.005"));
  });

  test("fails on a fee in another token instead of leaving it out", () => {
    const fees = [
      { type: "provider", token: "USDC", amount: "0.01" },
      { type: "swap", token: "EURC", amount: "0.02" },
    ] as const;
    assert.throws(() => sumProviderFees({ fees }, "USDC"), /swap fee in EURC, not USDC/);
  });

  test("fails on a fee with no amount", () => {
    const fees = [{ type: "provider", token: "USDC", amount: null }] as const;
    assert.throws(() => sumProviderFees({ fees }, "USDC"), /the provider fee/);
  });
});
