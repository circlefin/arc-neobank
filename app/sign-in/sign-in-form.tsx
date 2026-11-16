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

import { REGEXP_ONLY_DIGITS } from "input-otp";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { signIn, type SignInState } from "./actions";

const INITIAL_STATE: SignInState = { step: "email" };

// Matches otp_length in supabase/config.toml.
const EMAIL_CODE_LENGTH = 6;

export function SignInForm() {
  // A new key remounts the form, which is the only way to reset its action state.
  const [formKey, setFormKey] = useState(0);
  return (
    <SignInSteps
      key={formKey}
      onChangeEmail={() => setFormKey(formKey + 1)}
    />
  );
}

function SignInSteps({ onChangeEmail }: { onChangeEmail: () => void }) {
  const [state, formAction, pending] = useActionState(signIn, INITIAL_STATE);

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      {state.step === "email" ? (
        <div key="email" className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
          />
        </div>
      ) : (
        <div key="code" className="flex flex-col gap-2">
          <Label htmlFor="code" className="flex-col gap-1">
            Enter the code we sent to
            <span>{state.email}</span>
          </Label>
          <InputOTP
            id="code"
            name="code"
            required
            maxLength={EMAIL_CODE_LENGTH}
            pattern={REGEXP_ONLY_DIGITS}
            autoComplete="one-time-code"
            containerClassName="justify-center"
          >
            <InputOTPGroup>
              {[...Array(EMAIL_CODE_LENGTH).keys()].map((index) => (
                <InputOTPSlot key={index} index={index} />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>
      )}

      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      <div className="flex flex-col">
        <Button type="submit" disabled={pending} size="lg">
          {state.step === "email" ? "Continue" : "Sign in"}
        </Button>

        {state.step === "code" && (
          <Button
            type="button"
            onClick={onChangeEmail}
            disabled={pending}
            variant="link"
          >
            Use a different email
          </Button>
        )}
      </div>
    </form>
  );
}
