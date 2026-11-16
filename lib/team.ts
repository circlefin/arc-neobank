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
import { isAddress, isHex, toHex, type Address } from "viem";
import type { OperatorApproval, OperatorPermission } from "./business-account";
import { readStoredPasskey } from "./stored-passkey";
import { supabaseAdmin } from "./supabase/admin";
import { isToken, type Token } from "./tokens";

const OPERATORS_TABLE = "operators";
// The limit is read as text, since a JSON number can't hold every base-unit amount exactly.
const OPERATOR_COLUMNS =
  "id, account_address, email, passkey_id, passkey_public_x, passkey_public_y, payment_limit::text, tokens, expires_at, approval_signature, owner_passkey_id, owner_passkey_public_x, owner_passkey_public_y";
// Postgres reports this when the email already has an invite.
const UNIQUE_VIOLATION_CODE = "23505";

export type Operator = {
  id: string;
  accountAddress: Address;
  email: string;
  // Null until the Operator signs in and creates a passkey.
  passkey: WebAuthnKey | null;
  paymentLimit: bigint;
  tokens: Token[];
  expiresAt: string;
  // Null until the Owner approves these limits.
  approval: OperatorApproval | null;
};

export type OperatorStatus =
  "invited" | "awaiting approval" | "active" | "expired";

type OperatorInvite = {
  email: string;
  paymentLimit: bigint;
  tokens: Token[];
  expiresAt: string;
};

export function getOperatorStatus(operator: Operator): OperatorStatus {
  if (Date.parse(operator.expiresAt) <= Date.now()) return "expired";
  if (!operator.passkey) return "invited";
  if (!operator.approval) return "awaiting approval";
  return "active";
}

// Null until the Operator has a passkey, since the permission is what that passkey may do.
export function toOperatorPermission({
  passkey,
  paymentLimit,
  tokens,
  expiresAt,
}: Operator): OperatorPermission | null {
  return passkey && { passkey, paymentLimit, tokens, expiresAt };
}

export async function listOperators(accountAddress: Address) {
  const { data, error } = await supabaseAdmin
    .from(OPERATORS_TABLE)
    .select(OPERATOR_COLUMNS)
    .eq("account_address", accountAddress)
    .is("revoked_at", null)
    .order("created_at");
  if (error) throw error;
  return data.map(readOperator);
}

export async function findOperator(
  accountAddress: Address,
  operatorId: string,
) {
  const { data, error } = await supabaseAdmin
    .from(OPERATORS_TABLE)
    .select(OPERATOR_COLUMNS)
    .eq("account_address", accountAddress)
    .eq("id", operatorId)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw error;
  return data && readOperator(data);
}

export async function findOperatorForUser(userId: string) {
  const { data, error } = await supabaseAdmin
    .from(OPERATORS_TABLE)
    .select(OPERATOR_COLUMNS)
    .eq("user_id", userId)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw error;
  return data && readOperator(data);
}

// An Owner once took away this user's access as an Operator.
export async function wasOperatorRevoked(userId: string) {
  const { data, error } = await supabaseAdmin
    .from(OPERATORS_TABLE)
    .select("id")
    .eq("user_id", userId)
    .not("revoked_at", "is", null)
    .limit(1);
  if (error) throw error;
  return data.length > 0;
}

// The business that invited this email, or null when there's no open invite.
export async function findOperatorInvite(email: string) {
  const { data, error } = await supabaseAdmin
    .from(OPERATORS_TABLE)
    .select("account_address")
    .eq("email", email)
    .is("user_id", null)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw error;
  if (data === null) return null;
  const { account_address } = data;
  if (typeof account_address !== "string" || !isAddress(account_address)) {
    throw new Error("Unexpected Operator invite row.");
  }
  return account_address;
}

// Returns false when the email already has an invite, here or from another business.
export async function inviteOperator(
  accountAddress: Address,
  { email, paymentLimit, tokens, expiresAt }: OperatorInvite,
) {
  const { error } = await supabaseAdmin.from(OPERATORS_TABLE).insert({
    account_address: accountAddress,
    email,
    payment_limit: paymentLimit.toString(),
    tokens,
    expires_at: expiresAt,
  });
  if (error?.code === UNIQUE_VIOLATION_CODE) return false;
  if (error) throw error;
  return true;
}

// The invited user's passkey becomes the Operator's. Returns false when there's no open invite.
export async function claimOperatorInvite(
  userId: string,
  email: string,
  passkey: WebAuthnKey,
) {
  const { data, error } = await supabaseAdmin
    .from(OPERATORS_TABLE)
    .update({
      user_id: userId,
      passkey_id: passkey.authenticatorId,
      passkey_public_x: toHex(passkey.pubX),
      passkey_public_y: toHex(passkey.pubY),
    })
    .eq("email", email)
    .is("user_id", null)
    .is("revoked_at", null)
    .select("id");
  if (error) throw error;
  return data.length > 0;
}

export async function saveOperatorApproval(
  accountAddress: Address,
  operatorId: string,
  { signature, ownerPasskey }: OperatorApproval,
) {
  const { data, error } = await supabaseAdmin
    .from(OPERATORS_TABLE)
    .update({
      approval_signature: signature,
      owner_passkey_id: ownerPasskey.authenticatorId,
      owner_passkey_public_x: toHex(ownerPasskey.pubX),
      owner_passkey_public_y: toHex(ownerPasskey.pubY),
    })
    .eq("account_address", accountAddress)
    .eq("id", operatorId)
    .not("passkey_id", "is", null)
    .is("revoked_at", null)
    .select("id");
  if (error) throw error;
  if (data.length === 0) throw new Error("No Operator to approve.");
}

export async function markOperatorRevoked(
  accountAddress: Address,
  operatorId: string,
) {
  const { error } = await supabaseAdmin
    .from(OPERATORS_TABLE)
    .update({ revoked_at: new Date().toISOString() })
    .eq("account_address", accountAddress)
    .eq("id", operatorId)
    .is("revoked_at", null);
  if (error) throw error;
}

function readOperator(row: Record<string, unknown>): Operator {
  const {
    id,
    account_address,
    email,
    payment_limit,
    tokens,
    expires_at,
  } = row;
  if (
    typeof id !== "string" ||
    typeof account_address !== "string" ||
    !isAddress(account_address) ||
    typeof email !== "string" ||
    typeof payment_limit !== "string" ||
    !Array.isArray(tokens) ||
    !tokens.every(isToken) ||
    typeof expires_at !== "string"
  ) {
    throw new Error("Unexpected Operator row.");
  }
  return {
    id,
    accountAddress: account_address,
    email,
    passkey: readStoredPasskey(
      row.passkey_id,
      row.passkey_public_x,
      row.passkey_public_y,
    ),
    paymentLimit: BigInt(payment_limit),
    tokens,
    expiresAt: expires_at,
    approval: readApproval(row),
  };
}

function readApproval(row: Record<string, unknown>): OperatorApproval | null {
  const { approval_signature } = row;
  const ownerPasskey = readStoredPasskey(
    row.owner_passkey_id,
    row.owner_passkey_public_x,
    row.owner_passkey_public_y,
  );
  if (approval_signature === null && !ownerPasskey) return null;
  if (!isHex(approval_signature) || !ownerPasskey) {
    throw new Error("Unexpected Operator approval.");
  }
  return { signature: approval_signature, ownerPasskey };
}
