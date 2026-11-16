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

import type { NextRequest } from "next/server";
import { hexToBigInt, isAddress, isAddressEqual, isHex, type Address } from "viem";
import { getSignedInUser } from "@/lib/auth";
import {
  addOperatorApproval,
  isPermissionEnabling,
} from "@/lib/business-account";
import { ARC, findChainById } from "@/lib/chains";
import { getOperatorStatus, type Operator } from "@/lib/team";
import { zeroDevRpcUrl } from "@/lib/zerodev";


const SPONSOR_METHOD = "zd_sponsorUserOperation";
const SEND_METHOD = "eth_sendUserOperation";

const ZERODEV_RPC_METHODS = new Set([
  "zd_getUserOperationGasPrice",
  SPONSOR_METHOD,
  SEND_METHOD,
  "eth_getUserOperationReceipt",
]);

export async function POST(request: NextRequest) {
  // Recovery runs before the passkey step, so the email sign-in is enough here.
  const user = await getSignedInUser();
  if (!user?.account) return new Response("Unauthorized", { status: 401 });

  const chainId = Number(
    request.nextUrl.searchParams.get("chainId") ?? ARC.viem.id,
  );
  if (!findChainById(chainId)) {
    return new Response("Unsupported chain", { status: 400 });
  }

  const body: unknown = await request.json();
  if (
    !isObject(body) ||
    typeof body.method !== "string" ||
    !ZERODEV_RPC_METHODS.has(body.method)
  ) {
    return new Response("Unsupported request", { status: 400 });
  }

  if (body.method === SPONSOR_METHOD || body.method === SEND_METHOD) {
    const operation = findOperation(body);
    // We only pay gas for the user's own account.
    if (!operation || !isSender(user.account.address, operation)) {
      return new Response("Forbidden", { status: 403 });
    }
    if (
      user.account.role === "operator" &&
      !addApproval(user.account.operator, operation)
    ) {
      return new Response("Forbidden", { status: 403 });
    }
  }

  const response = await fetch(zeroDevRpcUrl(chainId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return Response.json(await response.json(), { status: response.status });
}

function findOperation({ method, params }: Record<string, unknown>) {
  if (!Array.isArray(params) || !isObject(params[0])) return null;
  // The sponsor request wraps the operation. The send request passes it as is.
  const operation = method === SPONSOR_METHOD ? params[0].userOp : params[0];
  return isObject(operation) ? operation : null;
}

function isSender(accountAddress: Address, operation: Record<string, unknown>) {
  return (
    typeof operation.sender === "string" &&
    isAddress(operation.sender) &&
    isAddressEqual(operation.sender, accountAddress)
  );
}

// An Operator's first payment turns their permission on with the Owner's approval, which only we
// hold. Read on every request, so a revoked Operator can't turn it on. Returns false to refuse.
function addApproval(operator: Operator, operation: Record<string, unknown>) {
  const { nonce, signature } = operation;
  if (!isHex(nonce) || !isHex(signature)) return false;
  if (!isPermissionEnabling(hexToBigInt(nonce))) return true;
  if (getOperatorStatus(operator) !== "active" || !operator.approval) {
    return false;
  }
  operation.signature = addOperatorApproval(
    signature,
    operator.approval.signature,
  );
  return true;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
