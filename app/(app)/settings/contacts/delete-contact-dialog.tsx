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

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { removeContact } from "./actions";

type DeleteContactDialogProps = { contactId: string; contactName: string };

export function DeleteContactDialog({
  contactId,
  contactName,
}: DeleteContactDialogProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function remove() {
    setPending(true);
    setError(undefined);
    try {
      await removeContact(contactId);
      toast.success("Contact deleted", {
        description: `${contactName} is no longer in your contacts.`,
      });
      setOpen(false);
    } catch (caught) {
      console.error(caught);
      setError("We couldn't delete this contact. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button type="button" variant="destructive" size="sm" />}
      >
        Delete
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete contact</DialogTitle>
          <DialogDescription>
            <span className="break-all">{contactName}</span> will no longer
            show up when you send.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <Button
          type="button"
          variant="destructive"
          size="lg"
          className="w-full"
          onClick={remove}
          disabled={pending}
        >
          {pending ? "Deleting…" : "Delete contact"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
