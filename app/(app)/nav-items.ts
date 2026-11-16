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

import { HandCash, Home, List, PiggyBank } from "iconoir-react";
import type { Icon } from "@/lib/icon";

export const HOME_PATH = "/";
export const CASH_AND_SAVINGS_PATH = "/cash-and-savings";
export const CREDIT_PATH = "/credit";
export const TRANSACTIONS_PATH = "/transactions";
export const SETTINGS_PATH = "/settings";
export const SECURITY_SETTINGS_PATH = "/settings/security";
export const TEAM_SETTINGS_PATH = "/settings/team";
export const CONTACTS_SETTINGS_PATH = "/settings/contacts";
export const DEVELOPER_SETTINGS_PATH = "/settings/developer";

export type NavItem = { label: string; href: string; icon: Icon };

export const HOME_ITEM: NavItem = {
  label: "Home",
  href: HOME_PATH,
  icon: Home,
};
export const CASH_AND_SAVINGS_ITEM: NavItem = {
  label: "Cash & savings",
  href: CASH_AND_SAVINGS_PATH,
  icon: PiggyBank,
};
export const CREDIT_ITEM: NavItem = {
  label: "Credit",
  href: CREDIT_PATH,
  icon: HandCash,
};
export const TRANSACTIONS_ITEM: NavItem = {
  label: "Transactions",
  href: TRANSACTIONS_PATH,
  icon: List,
};

export const MAIN_NAV_ITEMS = [HOME_ITEM, CASH_AND_SAVINGS_ITEM, CREDIT_ITEM];

export function isActivePath(pathname: string, href: string) {
  return href === HOME_PATH
    ? pathname === HOME_PATH
    : pathname === href || pathname.startsWith(`${href}/`);
}
