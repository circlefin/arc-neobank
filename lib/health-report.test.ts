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
import { redactSecrets, toPublicHealth } from "./health-report";

describe("toPublicHealth", () => {
  test("says only up or down per service, and degraded when any is down", () => {
    const statuses = [
      { name: "Arc network", isUp: true, latencyMilliseconds: 120, detail: null },
      { name: "Earn", isUp: false, latencyMilliseconds: 8000, detail: "Timed out" },
    ];
    assert.deepEqual(toPublicHealth(statuses), {
      status: "degraded",
      services: { "Arc network": "up", Earn: "down" },
    });
    assert.equal(toPublicHealth([statuses[0]]).status, "ok");
  });
});

describe("redactSecrets", () => {
  test("removes every secret, and leaves text alone when one isn't set", () => {
    const projectId = "3f8a-project";
    const text = `fetch failed: https://rpc.zerodev.app/api/v3/${projectId}/chain/5042002 (${projectId})`;
    assert.equal(
      redactSecrets(text, [projectId, undefined, ""]),
      "fetch failed: https://rpc.zerodev.app/api/v3/[redacted]/chain/5042002 ([redacted])",
    );
  });
});
