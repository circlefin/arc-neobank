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

import type { WebAuthnKey } from "@zerodev/webauthn-key";
import { redirect } from "next/navigation";
import { isAddress, toHex, type Address } from "viem";
import { HOME_PATH } from "@/app/(app)/nav-items";
import {
  ACCOUNT_ADDRESS_CLAIM,
  PASSKEY_ID_CLAIM,
  PASSKEY_PUBLIC_X_CLAIM,
  PASSKEY_PUBLIC_Y_CLAIM,
} from "@/app/constants";
import {
  createBusinessAccount,
  readAccountPasskey,
} from "@/lib/business-account";
import {
  isSamePublicKey,
  readStoredPasskey,
  toStoredPasskey,
  type PasskeyPublicKey,
} from "@/lib/stored-passkey";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  claimOperatorInvite,
  findOperatorForUser,
  wasOperatorRevoked,
  type Operator,
} from "@/lib/team";

const PASSKEY_SESSIONS_TABLE = "passkey_sessions";

export type BusinessAccountRecord = {
  passkey: WebAuthnKey;
  address: Address;
};

// The business account a user acts for, with their own passkey and their role there.
export type AccountAccess = BusinessAccountRecord &
  ({ role: "owner" } | { role: "operator"; operator: Operator });

export type TeamRole = AccountAccess["role"];

export type SignedInUser = {
  id: string;
  sessionId: string;
  email: string;
  account: AccountAccess | null;
};

// Signed in with the email code. The passkey step may still be ahead.
export async function getSignedInUser(): Promise<SignedInUser | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error) throw error;
  if (!data) return null;

  const { sub, session_id, email, app_metadata } = data.claims;
  if (!email) throw new Error("Signed-in user has no email.");
  const ownAccount = readAccountRecord(app_metadata ?? {});
  return {
    id: sub,
    sessionId: session_id,
    email,
    account: ownAccount
      ? { ...ownAccount, role: "owner" }
      : await findOperatorAccess(sub),
  };
}

// Read on every request, so a revoked Operator loses access at once.
async function findOperatorAccess(
  userId: string,
): Promise<AccountAccess | null> {
  const operator = await findOperatorForUser(userId);
  if (!operator?.passkey) return null;
  return {
    passkey: operator.passkey,
    address: operator.accountAddress,
    role: "operator",
    operator,
  };
}

// Signed in with both the email code and the passkey.
export async function requirePasskeyUser() {
  const user = await getSignedInUser();
  if (!user?.account || !(await hasPasskeySession(user.sessionId))) {
    redirect("/sign-in");
  }
  return { ...user, account: user.account };
}

export async function requireOwner() {
  const user = await requirePasskeyUser();
  if (user.account.role !== "owner") redirect(HOME_PATH);
  return user;
}

export async function hasPasskeySession(sessionId: string) {
  const { data, error } = await supabaseAdmin
    .from(PASSKEY_SESSIONS_TABLE)
    .select("session_id")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

async function markPasskeySession(sessionId: string) {
  const { error } = await supabaseAdmin
    .from(PASSKEY_SESSIONS_TABLE)
    .upsert({ session_id: sessionId });
  if (error) throw error;
}

async function hasBusinessAccount(userId: string) {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error) throw error;
  return readAccountRecord(data.user.app_metadata) !== null;
}

export async function saveBusinessAccount(
  userId: string,
  { passkey, address }: BusinessAccountRecord,
) {
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    app_metadata: {
      [PASSKEY_ID_CLAIM]: passkey.authenticatorId,
      [PASSKEY_PUBLIC_X_CLAIM]: toHex(passkey.pubX),
      [PASSKEY_PUBLIC_Y_CLAIM]: toHex(passkey.pubY),
      [ACCOUNT_ADDRESS_CLAIM]: address,
    },
  });
  if (error) throw error;

  // Reissue the session so its claims include the new passkey.
  const supabase = await createSupabaseServerClient();
  const { error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) throw refreshError;
}

// Runs once ZeroDev confirms the browser holds the passkey behind `publicKey`.
export async function signInWithPasskey(
  user: SignedInUser,
  authenticatorId: string,
  publicKey: PasskeyPublicKey,
) {
  const passkey = toStoredPasskey(authenticatorId, publicKey);
  const signedIn = user.account
    ? await confirmAccessPasskey(user.id, user.account, passkey)
    : await joinOrOpenAccount(user, passkey);
  if (!signedIn) return false;

  await markPasskeySession(user.sessionId);
  return true;
}

async function confirmAccessPasskey(
  userId: string,
  access: AccountAccess,
  signedInPasskey: WebAuthnKey,
) {
  // An Operator's passkey signs through a permission, so ours is the only record of it.
  if (access.role === "operator") {
    return isSamePublicKey(access.passkey, signedInPasskey);
  }
  return confirmAccountPasskey(userId, access, signedInPasskey);
}

async function confirmAccountPasskey(
  userId: string,
  { passkey, address }: BusinessAccountRecord,
  signedInPasskey: WebAuthnKey,
) {
  const account = await createBusinessAccount(passkey, address);
  // The chain holds the current passkey, which a recovery changes. Only a deployed account can be recovered.
  const currentPasskey = (await account.isDeployed())
    ? await readAccountPasskey(address)
    : passkey;
  if (!isSamePublicKey(currentPasskey, signedInPasskey)) return false;

  if (!isSamePublicKey(passkey, signedInPasskey)) {
    await saveBusinessAccount(userId, { passkey: signedInPasskey, address });
  }
  return true;
}

// Only a signed login proves the user holds the passkey, so joining or opening an account starts here.
async function joinOrOpenAccount(user: SignedInUser, passkey: WebAuthnKey) {
  if (await claimOperatorInvite(user.id, user.email, passkey)) return true;
  // A revoked Operator can only come back through a new invite.
  if (await wasOperatorRevoked(user.id)) return false;
  return openBusinessAccount(user.id, passkey);
}

async function openBusinessAccount(userId: string, passkey: WebAuthnKey) {
  // Checked fresh, since the session may predate an account opened in another tab.
  if (await hasBusinessAccount(userId)) return false;

  const account = await createBusinessAccount(passkey);
  // A deployed account means this passkey already backs another user's account.
  if (await account.isDeployed()) return false;

  await saveBusinessAccount(userId, { passkey, address: account.address });
  return true;
}

function readAccountRecord(
  appMetadata: Record<string, unknown>,
): BusinessAccountRecord | null {
  const passkey = readStoredPasskey(
    appMetadata[PASSKEY_ID_CLAIM],
    appMetadata[PASSKEY_PUBLIC_X_CLAIM],
    appMetadata[PASSKEY_PUBLIC_Y_CLAIM],
  );
  const address = appMetadata[ACCOUNT_ADDRESS_CLAIM];
  if (!passkey || typeof address !== "string" || !isAddress(address)) {
    return null;
  }
  return { passkey, address };
}
