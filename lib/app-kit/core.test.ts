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
import { BalanceError, InputError, KitError, NetworkError } from "@circle-fin/app-kit";
import {
  describeOperationError,
  failOperation,
  fromKitAmount,
  fromKitRatio,
  OperationFailure,
  requireKitAmount,
  sumFeesInToken,
  toKitAmount,
} from "./core";

const OTHERWISE = "Something went wrong.";

describe("App Kit amounts", () => {
  test("go out as decimal strings", () => {
    assert.equal(toKitAmount(BigInt(1_500_000)), "1.5");
  });

  test("come back as base units, with extra fee decimals cut off", () => {
    assert.equal(fromKitAmount("2"), BigInt(2_000_000));
    assert.equal(fromKitAmount("1.5"), BigInt(1_500_000));
    assert.equal(fromKitAmount("0.0375709999"), BigInt(37_570));
  });

  test("can carry another token's decimals", () => {
    assert.equal(toKitAmount(BigInt(250_000), 8), "0.0025");
    assert.equal(fromKitAmount("0.002500001", 8), BigInt(250_000));
  });

  test("fail when App Kit leaves one out, rather than reading it as zero", () => {
    assert.throws(() => requireKitAmount(null, "the fee"), /didn't return the fee/);
    assert.equal(requireKitAmount("2", "the fee"), BigInt(2_000_000));
  });
});

describe("sumFeesInToken", () => {
  test("adds fees in the token, and is zero with none", () => {
    const fees = [
      { name: "a fee", token: "USDC", amount: "0.01" },
      { name: "a fee", token: "USDC", amount: "0.002" },
    ];
    assert.equal(sumFeesInToken(fees, "USDC", "Earn"), BigInt(12_000));
    assert.equal(sumFeesInToken([], "USDC", "Earn"), BigInt(0));
  });

  test("fails on a fee in another token instead of leaving it out", () => {
    const fees = [{ name: "a fee", token: "EURC", amount: "0.01" }];
    assert.throws(() => sumFeesInToken(fees, "USDC", "Earn"), /^Error: Earn quoted a fee in EURC, not USDC\.$/);
  });

  test("fails on a fee with no amount", () => {
    const fees = [{ name: "the provider fee", token: "USDC", amount: null }];
    assert.throws(() => sumFeesInToken(fees, "USDC", "The swap"), /didn't return the provider fee/);
  });
});

describe("App Kit ratios", () => {
  test("come back as basis points, rounded", () => {
    assert.equal(fromKitRatio(0.042), BigInt(420));
    assert.equal(fromKitRatio(1.23600000815), BigInt(12_360));
  });
});

describe("describeOperationError", () => {
  test("passes an already described failure through", () => {
    const failure = { message: "Already said.", detail: "", canRetry: false };
    assert.equal(describeOperationError(new OperationFailure(failure), OTHERWISE), failure);
  });

  test("reads a dismissed passkey as rejected, even a few causes down", () => {
    const dismissed = Object.assign(new Error("The operation was aborted."), { name: "NotAllowedError" });
    const wrapped = new Error("Swap failed", { cause: new Error("Wallet failed", { cause: dismissed }) });

    const described = describeOperationError(wrapped, OTHERWISE);
    assert.equal(described.message, "Passkey wasn't confirmed. Nothing was sent.");
    assert.equal(described.canRetry, true);
    assert.match(described.detail, /NotAllowedError/);
  });

  test("tells the user to try a larger amount when there's no route", () => {
    const noRoute = new KitError({
      ...InputError.UNSUPPORTED_ROUTE,
      recoverability: "FATAL",
      message: "Stablecoin Service createSwap failed: Route or resource not found. Details: No route available",
    });

    const described = describeOperationError(noRoute, OTHERWISE);
    assert.equal(described.message, "There's no route for this amount right now. Try a larger amount.");
    assert.equal(described.canRetry, false);
  });

  test("words App Kit errors by type", () => {
    const balance = new KitError({
      ...BalanceError.INSUFFICIENT_TOKEN,
      recoverability: "FATAL",
      message: "Insufficient balance",
    });
    const network = new KitError({
      ...NetworkError.CONNECTION_FAILED,
      recoverability: "RETRYABLE",
      message: "Connection failed",
    });

    const short = describeOperationError(balance, OTHERWISE);
    assert.equal(short.message, "There isn't enough money available for this.");
    assert.equal(short.canRetry, false);

    const offline = describeOperationError(network, OTHERWISE);
    assert.equal(offline.message, "We couldn't reach the network. Try again in a moment.");
    assert.equal(offline.canRetry, true);
  });

  test("falls back to the caller's message for anything else", () => {
    const described = describeOperationError(new Error("boom"), OTHERWISE);
    assert.equal(described.message, OTHERWISE);
    assert.equal(described.detail, "Error: boom");
  });
});

describe("failOperation", () => {
  test("reports a failure, but not a passkey prompt the user dismissed", (context) => {
    const logged = context.mock.method(console, "error", () => {});
    const failed = failOperation("swap", new Error("boom"), OTHERWISE);
    assert.equal(failed.message, OTHERWISE);
    assert.equal(logged.mock.callCount(), 1);
    assert.equal(logged.mock.calls[0].arguments[0], "[swap]");

    const dismissed = new Error("The operation either timed out or was not allowed.");
    dismissed.name = "NotAllowedError";
    assert.match(failOperation("swap", dismissed, OTHERWISE).message, /wasn't confirmed/);
    assert.equal(logged.mock.callCount(), 1);
  });
  test("doesn't report an amount the balance or market can't cover, but reports the network", (context) => {
    const logged = context.mock.method(console, "error", () => {});
    const refusals = [
      new KitError({ ...BalanceError.INSUFFICIENT_TOKEN, recoverability: "FATAL", message: "Insufficient balance" }),
      new KitError({ ...InputError.UNSUPPORTED_ROUTE, recoverability: "FATAL", message: "No route available" }),
    ];
    for (const refusal of refusals) failOperation("quote", refusal, OTHERWISE);
    assert.equal(logged.mock.callCount(), 0);

    const network = new KitError({
      ...NetworkError.CONNECTION_FAILED,
      recoverability: "RETRYABLE",
      message: "Connection failed",
    });
    failOperation("quote", network, OTHERWISE);
    assert.equal(logged.mock.callCount(), 1);
  });
});
