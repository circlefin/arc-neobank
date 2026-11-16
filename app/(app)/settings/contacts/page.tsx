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

import { Community } from "iconoir-react";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Empty, EmptyDescription } from "@/components/ui/empty";
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
import { listContacts } from "@/lib/contacts";
import { AddContactDialog } from "./add-contact-dialog";
import { DeleteContactDialog } from "./delete-contact-dialog";

export default async function ContactsPage() {
  const { account } = await requireOwner();
  const contacts = await listContacts(account.address);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contacts</CardTitle>
        <CardDescription>
          Save the wallets you pay often, then pick them by name when you send.
        </CardDescription>
        <CardAction>
          <AddContactDialog />
        </CardAction>
      </CardHeader>
      <CardContent>
        {contacts.length === 0 ? (
          <Empty className="p-2">
            <EmptyDescription>No contacts yet</EmptyDescription>
          </Empty>
        ) : (
          <ItemGroup className="gap-4">
            {contacts.map((contact) => (
              <Item key={contact.id} variant="outline">
                <ItemMedia
                  variant="icon"
                  className="size-8 rounded-lg bg-muted"
                >
                  <Community />
                </ItemMedia>
                <ItemContent className="min-w-0">
                  <ItemTitle className="break-all">{contact.name}</ItemTitle>
                  <ItemDescription className="font-mono break-all">
                    {contact.address}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <DeleteContactDialog
                    contactId={contact.id}
                    contactName={contact.name}
                  />
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        )}
      </CardContent>
    </Card>
  );
}
