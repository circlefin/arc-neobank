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

import type { Hex } from "viem";

// Browser only. The technical trail of this tab's operations, for Settings > Developer. Terms
// like UserOperation and CCTP stay here, out of the money flows. Nothing is stored or sent.

export type UserOperationRecord = {
  type: "user-operation";
  chainId: number;
  userOperationHash: Hex;
  sentAt: string;
  // Set once the bundler includes it in a transaction.
  transactionHash: Hex | null;
  // Whether the account's own calls succeeded. The bundle transaction succeeds either way.
  success: boolean | null;
  revertReason: string | null;
};

export type BridgeStageRecord = {
  type: "bridge-stage";
  stage: string;
  status: string;
  explorerUrl: string | null;
  at: string;
};

export type FailureRecord = {
  type: "failure";
  area: string;
  message: string;
  detail: string;
  at: string;
};

export type DiagnosticRecord = UserOperationRecord | BridgeStageRecord | FailureRecord;

// Enough to follow the last few operations without growing for the life of the tab.
const MAX_RECORDS = 50;

let records: readonly DiagnosticRecord[] = [];
const listeners = new Set<() => void>();

// The server and scripts share one process between users and runs, so only a browser records.
const isRecording = () => typeof window !== "undefined";

function update(next: readonly DiagnosticRecord[]) {
  records = next.slice(-MAX_RECORDS);
  for (const listener of listeners) listener();
}

export function recordUserOperationSent(chainId: number, userOperationHash: Hex) {
  if (!isRecording()) return;
  update([
    ...records,
    {
      type: "user-operation",
      chainId,
      userOperationHash,
      sentAt: new Date().toISOString(),
      transactionHash: null,
      success: null,
      revertReason: null,
    },
  ]);
}

export function recordUserOperationIncluded(
  userOperationHash: Hex,
  { transactionHash, success, revertReason }: { transactionHash: Hex; success: boolean; revertReason: string | null },
) {
  if (!isRecording()) return;
  update(
    records.map((record) =>
      record.type === "user-operation" && record.userOperationHash === userOperationHash
        ? { ...record, transactionHash, success, revertReason }
        : record,
    ),
  );
}

export function recordBridgeStage(stage: string, status: string, explorerUrl: string | undefined) {
  if (!isRecording()) return;
  update([
    ...records,
    { type: "bridge-stage", stage, status, explorerUrl: explorerUrl ?? null, at: new Date().toISOString() },
  ]);
}

export function recordFailure(area: string, message: string, detail: string) {
  if (!isRecording()) return;
  update([...records, { type: "failure", area, message, detail, at: new Date().toISOString() }]);
}

export function clearDiagnostics() {
  update([]);
}

// For useSyncExternalStore.
export function subscribeToDiagnostics(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function readDiagnostics() {
  return records;
}

const NO_RECORDS: readonly DiagnosticRecord[] = [];

// The server renders no records, so the page hydrates before the tab's own show.
export function readServerDiagnostics() {
  return NO_RECORDS;
}
