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
  readDiagnostics,
  recordFailure,
  recordUserOperationIncluded,
  recordUserOperationSent,
} from "./diagnostics";

const USER_OPERATION = `0x${"ab".repeat(32)}` as const;
const TRANSACTION = `0x${"cd".repeat(32)}` as const;

describe("diagnostics", () => {
  test("records nothing outside a browser, where users and runs share one process", () => {
    recordFailure("swap", "Failed.", "Error: boom");
    assert.deepEqual(readDiagnostics(), []);
  });

  test("follows a UserOperation from sent to included, and keeps the latest 50", (context) => {
    // A fake browser: the log only checks that `window` exists.
    Reflect.set(globalThis, "window", globalThis);
    context.after(() => Reflect.deleteProperty(globalThis, "window"));

    recordUserOperationSent(5042002, USER_OPERATION);
    recordUserOperationIncluded(USER_OPERATION, {
      transactionHash: TRANSACTION,
      success: false,
      revertReason: "ERC20: transfer amount exceeds balance",
    });
    assert.deepEqual(
      readDiagnostics().map((record) =>
        record.type === "user-operation"
          ? [record.userOperationHash, record.transactionHash, record.success, record.revertReason]
          : null,
      ),
      [[USER_OPERATION, TRANSACTION, false, "ERC20: transfer amount exceeds balance"]],
    );

    for (let count = 0; count < 60; count += 1) recordFailure("swap", "Failed.", `Error ${count}`);
    const records = readDiagnostics();
    assert.equal(records.length, 50);
    assert.deepEqual(records.at(-1), { ...records.at(-1), type: "failure", detail: "Error 59" });
  });
});
