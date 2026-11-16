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
import { User } from "iconoir-react";
import type { Address } from "viem";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { requireOwner } from "@/lib/auth";
import { readOperatorPermissionState } from "@/lib/business-account";
import {
  getOperatorStatus,
  listOperators,
  toOperatorPermission,
  type Operator,
  type OperatorStatus,
} from "@/lib/team";
import { OperatorLimits } from "../../operator-limits";
import { ApproveOperatorDialog } from "./approve-operator-dialog";
import { InviteOperatorDialog } from "./invite-operator-dialog";
import { RevokeOperatorDialog } from "./revoke-operator-dialog";

const STATUS_BADGES: Record<
  OperatorStatus,
  {
    label: string;
    variant: "secondary" | "outline" | "success" | "destructive";
  }
> = {
  invited: { label: "Invited", variant: "outline" },
  "awaiting approval": { label: "Needs approval", variant: "secondary" },
  active: { label: "Active", variant: "success" },
  expired: { label: "Expired", variant: "destructive" },
};

const STATUS_DESCRIPTIONS: Record<OperatorStatus, string> = {
  invited: "Waiting for them to sign in and create a passkey",
  "awaiting approval": "Joined. Approve them to turn on payments",
  active: "Can send payments within these limits",
  expired: "Access has ended. Revoke to remove them",
};

export default async function TeamPage() {
  const { email, account } = await requireOwner();
  const operators = await listOperators(account.address);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team</CardTitle>
        <CardDescription>
          Operators can send payments from this account, up to the limits you
          set. You keep full control.
        </CardDescription>
        <CardAction>
          <InviteOperatorDialog />
        </CardAction>
      </CardHeader>
      <CardContent>
        <ItemGroup className="gap-4">
          <Item variant="outline">
            <ItemMedia variant="icon" className="size-8 rounded-lg bg-muted">
              <User />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{email}</ItemTitle>
              <ItemDescription>Full control of the account</ItemDescription>
            </ItemContent>
            <ItemActions>
              <Badge variant="secondary">Owner</Badge>
            </ItemActions>
          </Item>
          {operators.map((operator) => (
            <OperatorItem
              key={operator.id}
              operator={operator}
              passkey={account.passkey}
              accountAddress={account.address}
            />
          ))}
        </ItemGroup>
      </CardContent>
    </Card>
  );
}

type OperatorItemProps = {
  operator: Operator;
  passkey: WebAuthnKey;
  accountAddress: Address;
};

async function OperatorItem({
  operator,
  passkey,
  accountAddress,
}: OperatorItemProps) {
  const status = getOperatorStatus(operator);
  const badge = STATUS_BADGES[status];
  const permission = toOperatorPermission(operator);
  const approvedPermission = operator.approval ? permission : null;

  return (
    <Item variant="outline" className="flex-col items-stretch">
      <div className="flex items-start gap-2.5">
        <ItemMedia variant="icon" className="size-8 rounded-lg bg-muted">
          <User />
        </ItemMedia>
        <ItemContent>
          <ItemTitle className="break-all">{operator.email}</ItemTitle>
          <ItemDescription>{STATUS_DESCRIPTIONS[status]}</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </ItemActions>
      </div>
      <OperatorLimits
        paymentLimit={operator.paymentLimit}
        tokens={operator.tokens}
        expiresAt={operator.expiresAt}
      />
      <div className="flex justify-end gap-2">
        {permission && status === "awaiting approval" && (
          <ApproveOperatorDialog
            passkey={passkey}
            accountAddress={accountAddress}
            operatorId={operator.id}
            operatorEmail={operator.email}
            permission={permission}
          />
        )}
        <RevokeOperatorDialog
          passkey={passkey}
          accountAddress={accountAddress}
          operatorId={operator.id}
          operatorEmail={operator.email}
          approvedPermission={approvedPermission}
          needsPasskey={
            approvedPermission !== null &&
            (await readOperatorPermissionState(accountAddress, approvedPermission)) !==
              "removed"
          }
        />
      </div>
    </Item>
  );
}
