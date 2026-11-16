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

"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SignInState =
  | { step: "email"; error?: string }
  | { step: "code"; email: string; error?: string };

export async function signIn(
  state: SignInState,
  formData: FormData,
): Promise<SignInState> {
  if (state.step === "email") return sendCode(formData);
  return verifyCode(state.email, formData);
}

async function sendCode(formData: FormData): Promise<SignInState> {
  const email = readField(formData, "email");
  if (!email) return { step: "email", error: "Enter your email." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({ email });
  if (error) {
    console.error(error);
    return { step: "email", error: "We couldn't send your code. Try again." };
  }

  return { step: "code", email };
}

async function verifyCode(
  email: string,
  formData: FormData,
): Promise<SignInState> {
  const code = readField(formData, "code");
  if (!code) {
    return { step: "code", email, error: "Enter the code from your email." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({
    email,
    token: code,
    type: "email",
  });
  if (error) {
    console.error(error);
    return {
      step: "code",
      email,
      error: "That code didn't work. Check it and try again.",
    };
  }

  // The passkey step comes next, on the same page.
  redirect("/sign-in");
}

function readField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}
