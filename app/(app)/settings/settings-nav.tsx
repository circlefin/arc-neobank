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

import { Code, Community, Group, LogOut, Shield, User } from "iconoir-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { TeamRole } from "@/lib/auth";
import { signOut } from "../../actions";
import {
  CONTACTS_SETTINGS_PATH,
  DEVELOPER_SETTINGS_PATH,
  SECURITY_SETTINGS_PATH,
  SETTINGS_PATH,
  TEAM_SETTINGS_PATH,
  type NavItem,
} from "../nav-items";

const SETTINGS_ITEMS: NavItem[] = [
  { label: "Account details", href: SETTINGS_PATH, icon: User },
];
// Technical details for whoever builds on the sample, kept out of the money flows.
const DEVELOPER_ITEM: NavItem = { label: "Developer", href: DEVELOPER_SETTINGS_PATH, icon: Code };
// The account's passkeys, team, and contacts belong to the Owner.
const OWNER_SETTINGS_ITEMS: NavItem[] = [
  { label: "Security", href: SECURITY_SETTINGS_PATH, icon: Shield },
  { label: "Team", href: TEAM_SETTINGS_PATH, icon: Group },
  { label: "Contacts", href: CONTACTS_SETTINGS_PATH, icon: Community },
];

export function SettingsNav({ role }: { role: TeamRole }) {
  const pathname = usePathname();
  const items =
    role === "owner"
      ? [...SETTINGS_ITEMS, ...OWNER_SETTINGS_ITEMS, DEVELOPER_ITEM]
      : [...SETTINGS_ITEMS, DEVELOPER_ITEM];

  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-1">
        <p className="kicker px-2 py-1 text-xs text-muted-foreground">Main settings</p>
        {items.map((item) => (
          <Button
            key={item.href}
            variant={pathname === item.href ? "secondary" : "ghost"}
            size="lg"
            className="justify-start"
            nativeButton={false}
            render={<Link href={item.href} />}
          >
            <item.icon data-icon="inline-start" />
            {item.label}
          </Button>
        ))}
        <p className="kicker mt-3 px-2 py-1 text-xs text-muted-foreground">More</p>
        <Button
          type="button"
          variant="ghost"
          size="lg"
          className="justify-start text-destructive hover:text-destructive"
          onClick={() => signOut()}
        >
          <LogOut data-icon="inline-start" />
          Log out
        </Button>
      </CardContent>
    </Card>
  );
}
