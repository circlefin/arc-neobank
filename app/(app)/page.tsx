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
import { readPortfolio } from "@/lib/app-kit/portfolio";
import { requirePasskeyUser, type AccountAccess } from "@/lib/auth";
import { hasBackupPasskey } from "@/lib/business-account";
import { getBusinessName } from "@/lib/business-profile";
import { getOperatorStatus } from "@/lib/team";
import { AccountCard } from "./account-card";
import { ActivityErrorBoundary } from "./activity-error-boundary";
import { ASSETS_TITLE, AssetsCard } from "./assets-card";
import { LoadingCard } from "./loading-card";
import { OperatorAccessCard } from "./operator-access-card";
import type { SendLimits } from "./send-dialog";
import {
  TOTAL_BALANCE_TITLE,
  TotalBalanceCard,
  type QuickActions,
} from "./total-balance-card";
import {
  TRANSACTIONS_TITLE,
  TransactionsCard,
} from "./transactions-card";
import { UnavailableNotice } from "./unavailable-notice";

export default async function Home() {
  const { id, email, account } = await requirePasskeyUser();

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Suspense fallback={null}>
        <PortfolioNotice accountAddress={account.address} />
      </Suspense>
      {/* Two independent columns so each card keeps its own height. Below lg
          the columns dissolve and order puts the account card second. */}
      <div className="flex flex-col gap-4 max-lg:contents">
        <Suspense fallback={<LoadingCard title={TOTAL_BALANCE_TITLE} />}>
          <TotalBalanceCard
            userId={id}
            passkeyId={account.passkey.authenticatorId}
            accountAddress={account.address}
            quickActions={toQuickActions(account)}
            sendLimits={toSendLimits(account)}
          />
        </Suspense>
        <div className="max-lg:order-1">
          <Suspense fallback={<LoadingCard title={ASSETS_TITLE} />}>
            <AssetsCard accountAddress={account.address} />
          </Suspense>
        </div>
      </div>
      <div className="flex flex-col gap-4 max-lg:contents">
        {account.role === "operator" ? (
          <OperatorAccessCard
            operator={account.operator}
            businessName={await getBusinessName(account.address)}
          />
        ) : (
          <AccountCard
            email={email}
            passkey={account.passkey}
            accountAddress={account.address}
            hasBackupPasskey={await hasBackupPasskey(account.address)}
          />
        )}
        <div className="max-lg:order-1">
          <ActivityErrorBoundary title={TRANSACTIONS_TITLE}>
            <Suspense fallback={<LoadingCard title={TRANSACTIONS_TITLE} />}>
              <TransactionsCard accountAddress={account.address} />
            </Suspense>
          </ActivityErrorBoundary>
        </div>
      </div>
    </div>
  );
}

// Shares the cards' read, so it only says what they couldn't show.
async function PortfolioNotice({ accountAddress }: { accountAddress: Address }) {
  const { unavailable, eurcUnconverted } = await readPortfolio(accountAddress);
  if (unavailable.length === 0 && !eurcUnconverted) return null;
  return (
    <div className="lg:col-span-2">
      <UnavailableNotice unavailable={unavailable} eurcUnconverted={eurcUnconverted} />
    </div>
  );
}

function toQuickActions(account: AccountAccess): QuickActions {
  if (account.role === "owner") return "all";
  return getOperatorStatus(account.operator) === "active" ? "send" : "none";
}

function toSendLimits(account: AccountAccess): SendLimits | null {
  if (account.role === "owner") return null;
  const { paymentLimit, tokens } = account.operator;
  return { paymentLimit, tokens };
}
