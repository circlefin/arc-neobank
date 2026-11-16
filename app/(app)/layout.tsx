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

import { requirePasskeyUser } from "@/lib/auth";
import { getBusinessName } from "@/lib/business-profile";
import { getOperatorStatus, toOperatorPermission } from "@/lib/team";
import {
  BusinessWalletProvider,
  OperatorWalletProvider,
} from "./business-wallet";
import { MobileTabBar } from "./mobile-tab-bar";
import { SiteHeader } from "./site-header";
import { WagmiReadProvider } from "./wagmi-provider";

export default async function SignedInLayout({ children }: LayoutProps<"/">) {
  const { email, account } = await requirePasskeyUser();
  const businessName = await getBusinessName(account.address);

  const page = (
    <WagmiReadProvider>
      <SiteHeader
        email={email}
        role={account.role}
        businessName={businessName}
      />
      <main className="mx-auto flex w-full max-w-(--breakpoint-xl) flex-1 flex-col px-4 pt-21 pb-25 md:px-8 lg:pb-8">
        {children}
      </main>
      <MobileTabBar />
    </WagmiReadProvider>
  );

  if (account.role === "operator") {
    const { operator } = account;
    const permission = toOperatorPermission(operator);
    // Only an approved, unexpired Operator can pay.
    if (getOperatorStatus(operator) !== "active" || !permission || !operator.approval) {
      return page;
    }
    return (
      <OperatorWalletProvider
        address={account.address}
        permission={permission}
        ownerPasskey={operator.approval.ownerPasskey}
      >
        {page}
      </OperatorWalletProvider>
    );
  }
  return (
    <BusinessWalletProvider passkey={account.passkey} address={account.address}>
      {page}
    </BusinessWalletProvider>
  );
}
