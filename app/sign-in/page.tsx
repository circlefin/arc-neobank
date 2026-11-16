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

import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getSignedInUser,
  hasPasskeySession,
  type SignedInUser,
} from "@/lib/auth";
import { hasBackupPasskey } from "@/lib/business-account";
import { getBusinessName } from "@/lib/business-profile";
import { findOperatorInvite, wasOperatorRevoked } from "@/lib/team";
import { APP_NAME } from "../constants";
import { PasskeyStep, type OperatorAccess } from "./passkey-step";
import { SignInForm } from "./sign-in-form";

export default async function SignInPage() {
  const user = await getSignedInUser();
  if (user?.account && (await hasPasskeySession(user.sessionId))) redirect("/");

  return (
    <main className="flex flex-1 flex-col items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-center">
            <h1 className="headline text-2xl">{APP_NAME}</h1>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {user ? (
            <PasskeyStep
              email={user.email}
              account={
                user.account && {
                  address: user.account.address,
                  passkeyId: user.account.passkey.authenticatorId,
                }
              }
              operatorAccess={
                user.account ? null : await readOperatorAccess(user)
              }
              hasBackupPasskey={
                user.account?.role === "owner" &&
                (await hasBackupPasskey(user.account.address))
              }
            />
          ) : (
            <SignInForm />
          )}
        </CardContent>
      </Card>
    </main>
  );
}

// A new invite counts over an old revocation.
async function readOperatorAccess({
  id,
  email,
}: SignedInUser): Promise<OperatorAccess> {
  const invitingAccount = await findOperatorInvite(email);
  if (invitingAccount) {
    return {
      status: "invited",
      businessName: await getBusinessName(invitingAccount),
    };
  }
  if (await wasOperatorRevoked(id)) return { status: "revoked" };
  return null;
}
