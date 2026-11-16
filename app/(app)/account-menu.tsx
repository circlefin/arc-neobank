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

import { LogOut, NavArrowDown, Settings } from "iconoir-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "../actions";
import { SETTINGS_PATH, TRANSACTIONS_ITEM } from "./nav-items";

type AccountMenuProps = { email: string; businessName: string | null };

export function AccountMenu({ email, businessName }: AccountMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="lg"
            className="rounded-full px-4 text-foreground/70 hover:bg-foreground/3 aria-expanded:bg-foreground/3 dark:hover:bg-foreground/3"
          />
        }
      >
        {email}
        <NavArrowDown
          data-icon="inline-end"
          className="text-foreground/40"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {businessName && (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel className="break-all">
                {businessName}
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem render={<Link href={TRANSACTIONS_ITEM.href} />}>
          <TRANSACTIONS_ITEM.icon />
          {TRANSACTIONS_ITEM.label}
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href={SETTINGS_PATH} />}>
          <Settings />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={() => signOut()}>
          <LogOut />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
