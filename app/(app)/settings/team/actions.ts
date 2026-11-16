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

"use server";

import { refresh } from "next/cache";
import { isHex } from "viem";
import { OPERATOR_ACCESS_DAYS } from "@/app/constants";
import { requireOwner } from "@/lib/auth";
import { readOperatorPermissionState } from "@/lib/business-account";
import { AMOUNT_PATTERN, parseAmount } from "@/lib/format";
import {
  findOperator,
  getOperatorStatus,
  inviteOperator,
  markOperatorRevoked,
  saveOperatorApproval,
  toOperatorPermission,
} from "@/lib/team";
import { isToken } from "@/lib/tokens";

const MILLISECONDS_PER_DAY = 86_400_000;
const MILLISECONDS_PER_SECOND = 1_000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/;

// Returns a message for the form when the invite can't be saved.
export async function sendOperatorInvite(invite: unknown) {
  const { email: ownerEmail, account } = await requireOwner();
  if (!isObject(invite)) throw new Error("Invalid invite.");
  const { email, paymentLimit, tokens, accessDays } = invite;

  if (typeof email !== "string" || !EMAIL_PATTERN.test(email.trim())) {
    return "Enter a valid email.";
  }
  const operatorEmail = email.trim().toLowerCase();
  if (operatorEmail === ownerEmail) return "You can't invite yourself.";
  if (
    typeof paymentLimit !== "string" ||
    !AMOUNT_PATTERN.test(paymentLimit) ||
    parseAmount(paymentLimit) === BigInt(0)
  ) {
    return "Enter a limit above zero.";
  }
  if (!Array.isArray(tokens) || !tokens.every(isToken) || tokens.length === 0) {
    return "Pick at least one currency.";
  }
  const days = OPERATOR_ACCESS_DAYS.find((option) => option === accessDays);
  if (!days) throw new Error("Invalid access length.");

  const invited = await inviteOperator(account.address, {
    email: operatorEmail,
    paymentLimit: parseAmount(paymentLimit),
    tokens: [...new Set(tokens)],
    expiresAt: toWholeSecondTime(Date.now() + days * MILLISECONDS_PER_DAY),
  });
  if (!invited) return "That email already has an invite.";

  refresh();
  return null;
}

export async function saveApproval(
  operatorId: unknown,
  approvalSignature: unknown,
) {
  const { account } = await requireOwner();
  if (typeof operatorId !== "string" || !isHex(approvalSignature)) {
    throw new Error("Invalid approval.");
  }
  const operator = await findOperator(account.address, operatorId);
  if (!operator || getOperatorStatus(operator) !== "awaiting approval") {
    throw new Error("This Operator isn't waiting for approval.");
  }

  // The Owner's own passkey, from the session, never from the browser.
  await saveOperatorApproval(account.address, operatorId, {
    signature: approvalSignature,
    ownerPasskey: account.passkey,
  });
  refresh();
}

export async function removeOperator(operatorId: unknown) {
  const { account } = await requireOwner();
  if (typeof operatorId !== "string") throw new Error("Invalid Operator.");
  const operator = await findOperator(account.address, operatorId);
  if (!operator) throw new Error("No such Operator.");

  // Until the permission is removed onchain, the Owner's approval can still turn it on.
  const permission = toOperatorPermission(operator);
  if (
    operator.approval &&
    permission &&
    (await readOperatorPermissionState(account.address, permission)) !== "removed"
  ) {
    throw new Error("The Operator's permission isn't removed onchain yet.");
  }

  await markOperatorRevoked(account.address, operatorId);
  refresh();
}

// The expiry becomes an onchain timestamp in seconds, so it must survive the round trip exactly.
function toWholeSecondTime(milliseconds: number) {
  const seconds = Math.floor(milliseconds / MILLISECONDS_PER_SECOND);
  return new Date(seconds * MILLISECONDS_PER_SECOND).toISOString();
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
