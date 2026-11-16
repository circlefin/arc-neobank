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
"use client";

import { useSyncExternalStore } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { explorerTransactionUrl, findChainById } from "@/lib/chains";
import {
  readDiagnostics,
  readServerDiagnostics,
  subscribeToDiagnostics,
  type DiagnosticRecord,
} from "@/lib/diagnostics";
import { formatDateTime } from "@/lib/format";

// This tab's UserOperations, bridge stages, and failures, newest first.
export function OperationLog() {
  const records = useSyncExternalStore(
    subscribeToDiagnostics,
    readDiagnostics,
    readServerDiagnostics,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent operations</CardTitle>
        <CardDescription>
          What this browser tab sent since it opened: each UserOperation, each
          CCTP stage of a move, and each failure with its raw error. Reloading
          the page or logging out clears it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {records.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing yet. Make a payment, swap, or move, then come back.
          </p>
        ) : (
          <ol className="flex flex-col gap-3 text-sm">
            {[...records].reverse().map((record, index) => (
              <li key={`${records.length - index}`} className="flex flex-col gap-0.5">
                <RecordEntry record={record} />
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function RecordEntry({ record }: { record: DiagnosticRecord }) {
  switch (record.type) {
    case "user-operation": {
      const chain = findChainById(record.chainId);
      const transactionUrl =
        chain && record.transactionHash
          ? explorerTransactionUrl(chain, record.transactionHash)
          : undefined;
      return (
        <>
          <span>
            UserOperation on {chain?.label ?? `chain ${record.chainId}`} ·{" "}
            {record.success === null ? "Pending" : record.success ? "Succeeded" : "Reverted"}
          </span>
          <code className="break-all text-xs text-muted-foreground">
            {record.userOperationHash}
          </code>
          {record.revertReason && (
            <span className="text-xs text-destructive">{record.revertReason}</span>
          )}
          {transactionUrl && (
            <a className="text-xs underline" href={transactionUrl} target="_blank" rel="noreferrer">
              Bundle transaction
            </a>
          )}
          <Time iso={record.sentAt} />
        </>
      );
    }
    case "bridge-stage":
      return (
        <>
          <span>
            CCTP {record.stage} · {record.status}
          </span>
          {record.explorerUrl && (
            <a className="text-xs underline" href={record.explorerUrl} target="_blank" rel="noreferrer">
              Stage transaction
            </a>
          )}
          <Time iso={record.at} />
        </>
      );
    case "failure":
      return (
        <>
          <span className="text-destructive">
            {record.area} failed · {record.message}
          </span>
          <pre className="whitespace-pre-wrap break-all text-xs text-muted-foreground">
            {record.detail}
          </pre>
          <Time iso={record.at} />
        </>
      );
  }
}

function Time({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} className="text-xs text-muted-foreground">
      {formatDateTime(iso)}
    </time>
  );
}
