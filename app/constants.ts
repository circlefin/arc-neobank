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

export const APP_NAME = "Arcbeat Neobank";

// Where the user's passkey and business account address live in their Supabase app_metadata.
export const PASSKEY_ID_CLAIM = "passkey_id";
export const PASSKEY_PUBLIC_X_CLAIM = "passkey_public_x";
export const PASSKEY_PUBLIC_Y_CLAIM = "passkey_public_y";
export const ACCOUNT_ADDRESS_CLAIM = "account_address";

// Marks a passkey request that reads the backup passkey for a recovery, which must not sign in.
export const BACKUP_PASSKEY_HEADER = "X-Backup-Passkey";

// Names the only passkey the browser may offer, so the user confirms the one they just created.
export const PASSKEY_ID_HEADER = "X-Passkey-Id";

// Circle's sandbox. Arc is testnet only, and only the sandbox widget can be embedded from any site.
export const ONRAMP_API_BASE_URL = "https://api-test.circle.com";
export const ONRAMP_WIDGET_BASE_URL = "https://onramp-sandbox.arc.io";
export const ONRAMP_SESSION_PATH = "/api/onramp/session";

// How long an Operator's access can last before it ends on its own.
export const OPERATOR_ACCESS_DAYS = [7, 30, 90] as const;

// Matches the check on the contacts table.
export const CONTACT_NAME_MAX_LENGTH = 64;

// Matches the check on the business_profiles table.
export const BUSINESS_NAME_MAX_LENGTH = 64;

// Matches the check on the payment_memos table.
export const PAYMENT_MEMO_MAX_LENGTH = 140;

export const DARK_THEME = "dark";
export const LIGHT_THEME = "light";
