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

import Link from "next/link";
import type { Address } from "viem";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { readActivity } from "@/lib/account-activity";
import { ActivityList } from "./activity-list";
import { TRANSACTIONS_PATH } from "./nav-items";

export const TRANSACTIONS_TITLE = "Transactions";

const RECENT_ACTIVITY_COUNT = 5;

export async function TransactionsCard({
  accountAddress,
}: {
  accountAddress: Address;
}) {
  const { activities } = await readActivity(accountAddress);
  const recentActivities = activities.slice(0, RECENT_ACTIVITY_COUNT);

  return (
    <Card className="self-start">
      <CardHeader>
        <CardTitle>{TRANSACTIONS_TITLE}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-start gap-4">
        {recentActivities.length > 0 ? (
          <ActivityList activities={recentActivities} />
        ) : (
          <Empty className="p-2">
            <EmptyDescription>No transactions yet</EmptyDescription>
          </Empty>
        )}
        <Button
          variant="outline"
          size="lg"
          nativeButton={false}
          render={<Link href={TRANSACTIONS_PATH} />}
        >
          View all transactions
        </Button>
      </CardContent>
    </Card>
  );
}
