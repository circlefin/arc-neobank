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
import {
  AMOUNT_PATTERN,
  formatPercent,
  formatTokenAmount,
  formatTotal,
  formatUsd,
  formatUsdParts,
  parseAmount,
  toAmountText,
} from "./format";

describe("parseAmount", () => {
  test("reads an empty field or a lone point as nothing", () => {
    assert.equal(parseAmount(""), BigInt(0));
    assert.equal(parseAmount("."), BigInt(0));
  });

  test("turns text into 6-decimal base units", () => {
    assert.equal(parseAmount("1.5"), BigInt(1_500_000));
    assert.equal(parseAmount("0.000001"), BigInt(1));
    assert.equal(parseAmount("12."), BigInt(12_000_000));
  });

  test("round-trips through toAmountText", () => {
    assert.equal(toAmountText(parseAmount("12.5")), "12.5");
  });
});

describe("AMOUNT_PATTERN", () => {
  test("accepts up to 6 decimals", () => {
    for (const text of ["", "0", "12.", ".5", "12.345678"]) {
      assert.match(text, AMOUNT_PATTERN);
    }
  });

  test("rejects more decimals, a second point, or letters", () => {
    for (const text of ["1.2345678", "1.2.3", "abc", "-1"]) {
      assert.doesNotMatch(text, AMOUNT_PATTERN);
    }
  });
});

describe("display formatting", () => {
  test("shows token amounts with at least cents and at most 6 decimals", () => {
    assert.equal(formatTokenAmount(BigInt(1_500_000)), "1.50");
    assert.equal(formatTokenAmount(BigInt(1_234_567)), "1.234567");
  });

  test("shows dollars, and splits the cents off", () => {
    assert.equal(formatUsd(BigInt(1_234_560_000)), "$1,234.56");
    assert.deepEqual(formatUsdParts(BigInt(1_234_560_000)), {
      whole: "$1,234",
      fraction: ".56",
    });
  });

  test("adds EURC into dollars at the rate, or shows it on its own without one", () => {
    const amounts = { USDC: parseAmount("100"), EURC: parseAmount("50") };
    assert.equal(formatTotal(amounts, parseAmount("1.1")), "$155.00");
    assert.equal(formatTotal(amounts, null), "$100.00 + 50.00 EURC");
    assert.equal(formatTotal({ USDC: parseAmount("100"), EURC: BigInt(0) }, null), "$100.00");
  });

  test("shows basis points as a percent", () => {
    assert.equal(formatPercent(BigInt(525)), "5.25%");
  });
});
