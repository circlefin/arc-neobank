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

import { isAddress, isAddressEqual } from "viem";
import type { OnrampSessionRequest } from "@/lib/app-kit/onramp";
import { createOnrampSession } from "@/lib/app-kit/onramp-sessions";
import { getSignedInUser, hasPasskeySession } from "@/lib/auth";

export async function POST(request: Request) {
  const user = await getSignedInUser();
  if (!user?.account || !(await hasPasskeySession(user.sessionId))) {
    return new Response("Unauthorized", { status: 401 });
  }
  // Operators may only pay out, within their limits.
  if (user.account.role !== "owner") {
    return new Response("Forbidden", { status: 403 });
  }

  const buyer: OnrampSessionRequest = { userId: user.id, accountAddress: user.account.address };
  // The money goes to the signed-in user's own account, never to one the request names.
  if (!isOwnRequest(await request.json(), buyer)) {
    return new Response("Not your account", { status: 403 });
  }

  try {
    const session = await createOnrampSession(buyer);
    return Response.json(session, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Failed to create an onramp session", error);
    return new Response("Could not start the purchase", { status: 502 });
  }
}

function isOwnRequest(
  body: unknown,
  { userId, accountAddress }: OnrampSessionRequest,
) {
  return (
    isObject(body) &&
    body.appUserId === userId &&
    typeof body.destinationAddress === "string" &&
    isAddress(body.destinationAddress) &&
    isAddressEqual(body.destinationAddress, accountAddress)
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
