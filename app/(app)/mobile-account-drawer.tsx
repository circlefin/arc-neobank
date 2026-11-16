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

"use client";

import { LogOut, Settings, User } from "iconoir-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import type { TeamRole } from "@/lib/auth";
import { signOut } from "../actions";
import { SETTINGS_PATH } from "./nav-items";

const ROLE_LABELS: Record<TeamRole, string> = {
  owner: "Owner",
  operator: "Operator",
};

type MobileAccountDrawerProps = {
  email: string;
  role: TeamRole;
  businessName: string | null;
};

export function MobileAccountDrawer({
  email,
  role,
  businessName,
}: MobileAccountDrawerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Drawer open={open} onOpenChange={setOpen} showSwipeHandle>
      <DrawerTrigger
        render={
          <Button
            variant="ghost"
            size="icon-lg"
            className="rounded-full"
            aria-label="Account"
          />
        }
      >
        <User />
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="group-data-[swipe-axis=y]/drawer-popup:text-left">
          {/* Plain utilities, not kicker, so cn can replace DrawerTitle's heading font. */}
          <DrawerTitle className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
            Account
          </DrawerTitle>
        </DrawerHeader>
        <div className="flex flex-col gap-2 p-4">
          <Item variant="outline">
            <ItemContent>
              {businessName && (
                <ItemDescription className="break-all">
                  {businessName}
                </ItemDescription>
              )}
              <ItemTitle>{email}</ItemTitle>
            </ItemContent>
            <ItemActions>
              <Badge variant="secondary">{ROLE_LABELS[role]}</Badge>
            </ItemActions>
          </Item>
          <Button
            variant="outline"
            size="lg"
            className="justify-start"
            nativeButton={false}
            render={
              <Link href={SETTINGS_PATH} onClick={() => setOpen(false)} />
            }
          >
            <Settings data-icon="inline-start" />
            Settings
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="lg"
            className="justify-start"
            onClick={() => signOut()}
          >
            <LogOut data-icon="inline-start" />
            Log out
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
