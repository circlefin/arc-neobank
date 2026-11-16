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

import { Suspense } from "react";
import type { Address } from "viem";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { readActivity } from "@/lib/account-activity";
import { requirePasskeyUser } from "@/lib/auth";
import { ActivityErrorBoundary } from "../activity-error-boundary";
import { LoadingCard } from "../loading-card";
import { TRANSACTIONS_TITLE } from "../transactions-card";
import { ActivityFeed } from "./activity-feed";

export default async function TransactionsPage() {
  const { account } = await requirePasskeyUser();

  return (
    <ActivityErrorBoundary title={TRANSACTIONS_TITLE}>
      <Suspense fallback={<LoadingCard title={TRANSACTIONS_TITLE} />}>
        <TransactionsCard accountAddress={account.address} />
      </Suspense>
    </ActivityErrorBoundary>
  );
}

async function TransactionsCard({
  accountAddress,
}: {
  accountAddress: Address;
}) {
  const firstPage = await readActivity(accountAddress);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{TRANSACTIONS_TITLE}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ActivityFeed firstPage={firstPage} />
      </CardContent>
    </Card>
  );
}
