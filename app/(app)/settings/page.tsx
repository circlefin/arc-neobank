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

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requirePasskeyUser } from "@/lib/auth";
import { getBusinessName } from "@/lib/business-profile";
import { AccountAddress } from "./account-address";
import { BusinessNameForm } from "./business-name-form";

export default async function AccountDetailsPage() {
  const { email, account } = await requirePasskeyUser();
  const businessName = await getBusinessName(account.address);
  const isOwner = account.role === "owner";

  return (
    <>
      {/* An Operator only sees a name the Owner has set. */}
      {(isOwner || businessName) && (
        <Card>
          <CardHeader>
            <CardTitle>Business name</CardTitle>
            <CardDescription>
              {isOwner
                ? "Your team sees this name when they sign in and pay."
                : "Only the owner can change this."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isOwner ? (
              <BusinessNameForm savedName={businessName} />
            ) : (
              <p>{businessName}</p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Account details</CardTitle>
          <CardDescription>
            Your business account on Arc. Money sent to this address lands in
            your balance.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AccountAddress address={account.address} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email address</CardTitle>
          <CardDescription>The email you use to sign in.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">Login email</p>
          <p>{email}</p>
        </CardContent>
      </Card>
    </>
  );
}
