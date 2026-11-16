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
import {
  getOperatorStatus,
  type Operator,
  type OperatorStatus,
} from "@/lib/team";
import { OperatorLimits } from "./operator-limits";

// A signed-in Operator has a passkey, so they are never still at "invited".
const STATUS_DESCRIPTIONS: Record<OperatorStatus, string> = {
  invited: "The owner still needs to approve your access.",
  "awaiting approval":
    "The owner still needs to approve your access. You can send payments once they do.",
  active:
    "You can send payments from this business account, within these limits.",
  expired: "Your access has ended. Ask the owner to invite you again.",
};

type OperatorAccessCardProps = {
  operator: Operator;
  businessName: string | null;
};

export function OperatorAccessCard({
  operator,
  businessName,
}: OperatorAccessCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="break-words">
          {businessName ? `You're an Operator for ${businessName}` : "Your access"}
        </CardTitle>
        <CardDescription>
          {STATUS_DESCRIPTIONS[getOperatorStatus(operator)]}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <OperatorLimits
          paymentLimit={operator.paymentLimit}
          tokens={operator.tokens}
          expiresAt={operator.expiresAt}
        />
      </CardContent>
    </Card>
  );
}
