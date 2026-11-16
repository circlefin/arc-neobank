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

import { Bank } from "iconoir-react";
import Link from "next/link";
import type { TeamRole } from "@/lib/auth";
import { APP_NAME } from "../constants";
import { AccountMenu } from "./account-menu";
import { MainNav } from "./main-nav";
import { MobileAccountDrawer } from "./mobile-account-drawer";
import { HOME_PATH } from "./nav-items";
import { ThemeToggle } from "./theme-toggle";

// Frosted glass pill, copied from Hyperbeat's navbar.
const GLASS_CLASS =
  "border border-background/40 bg-background/60 shadow-[0_8px_32px_rgb(0_0_0/0.08),inset_0_1px_0_rgb(255_255_255/0.8)] backdrop-blur-xl dark:border-foreground/6 dark:shadow-[0_4px_24px_rgb(0_0_0/0.5),inset_0_1px_0_rgb(255_255_255/0.06),inset_0_-1px_0_rgb(0_0_0/0.3),inset_0_0_12px_rgb(255_255_255/0.02)]";

type SiteHeaderProps = {
  email: string;
  role: TeamRole;
  businessName: string | null;
};

export function SiteHeader({ email, role, businessName }: SiteHeaderProps) {
  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-40 mx-auto flex max-w-(--breakpoint-xl) justify-center px-4 pt-4 md:px-8">
      <div
        className={`pointer-events-auto flex h-13 w-full items-center justify-between rounded-full px-1.5 lg:gap-12 ${GLASS_CLASS}`}
      >
        <Link
          href={HOME_PATH}
          className="flex h-9 items-center gap-2 rounded-full px-2 headline text-lg whitespace-nowrap transition-colors hover:bg-foreground/3 sm:text-xl"
        >
          <Bank className="size-6" />
          {APP_NAME}
        </Link>

        <div className="hidden lg:block">
          <MainNav />
        </div>

        <div className="flex items-center">
          <ThemeToggle />
          <div className="hidden lg:block">
            <AccountMenu email={email} businessName={businessName} />
          </div>
          <div className="lg:hidden">
            <MobileAccountDrawer
              email={email}
              role={role}
              businessName={businessName}
            />
          </div>
        </div>
      </div>
    </header>
  );
}
