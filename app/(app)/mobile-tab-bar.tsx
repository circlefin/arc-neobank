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

import { MoreHoriz } from "iconoir-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  CASH_AND_SAVINGS_ITEM,
  CREDIT_ITEM,
  HOME_ITEM,
  isActivePath,
  TRANSACTIONS_ITEM,
  type NavItem,
} from "./nav-items";

// Hyperbeat names the cash and savings tab "Account" on phones.
const TAB_ITEMS: NavItem[] = [
  HOME_ITEM,
  { ...CASH_AND_SAVINGS_ITEM, label: "Account" },
];
const MORE_ITEMS = [CREDIT_ITEM, TRANSACTIONS_ITEM];

// Frosted glass pill, copied from Hyperbeat's navbar.
const GLASS_CLASS =
  "border border-background/40 bg-background/60 shadow-[0_8px_32px_rgb(0_0_0/0.08),inset_0_1px_0_rgb(255_255_255/0.8)] backdrop-blur-xl dark:border-foreground/6 dark:shadow-[0_4px_24px_rgb(0_0_0/0.5),inset_0_1px_0_rgb(255_255_255/0.06),inset_0_-1px_0_rgb(0_0_0/0.3),inset_0_0_12px_rgb(255_255_255/0.02)]";
const TAB_CLASS =
  "flex flex-1 flex-col items-center justify-center gap-0.5 rounded-3xl p-2 text-xs transition-colors outline-none hover:bg-foreground/5 focus-visible:ring-3 focus-visible:ring-ring/50 data-active:bg-foreground/10";

export function MobileTabBar() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const isMoreActive = MORE_ITEMS.some((item) =>
    isActivePath(pathname, item.href),
  );

  return (
    <nav
      className={`fixed inset-x-4 bottom-4 z-40 flex rounded-full p-1 lg:hidden ${GLASS_CLASS}`}
    >
      {TAB_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={TAB_CLASS}
          data-active={isActivePath(pathname, item.href) || undefined}
        >
          <item.icon className="size-6" />
          {item.label}
        </Link>
      ))}
      <Drawer open={moreOpen} onOpenChange={setMoreOpen} showSwipeHandle>
        <DrawerTrigger
          className={TAB_CLASS}
          data-active={isMoreActive || undefined}
        >
          <MoreHoriz className="size-6" />
          More
        </DrawerTrigger>
        <DrawerContent>
          <DrawerHeader className="sr-only">
            <DrawerTitle>More</DrawerTitle>
          </DrawerHeader>
          <div className="flex flex-col gap-2 p-4">
            {MORE_ITEMS.map((item) => (
              <Button
                key={item.href}
                variant={
                  isActivePath(pathname, item.href) ? "default" : "outline"
                }
                size="lg"
                className="justify-start"
                nativeButton={false}
                render={
                  <Link href={item.href} onClick={() => setMoreOpen(false)} />
                }
              >
                <item.icon data-icon="inline-start" />
                {item.label}
              </Button>
            ))}
          </div>
        </DrawerContent>
      </Drawer>
    </nav>
  );
}
