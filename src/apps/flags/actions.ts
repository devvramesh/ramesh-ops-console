"use server";

import { redirect } from "next/navigation";
import { getSession } from "@/platform/auth";
import { createFlag, decideFlagApproval, disableFlag, enableFlag } from "./service";

function text(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

function message(err: unknown) {
  if (err instanceof Error && err.name === "ZodError") {
    const issue = (err as Error & { issues?: { message: string }[] }).issues?.[0];
    return issue ? `Check the form: ${issue.message}.` : "Check the form.";
  }
  return err instanceof Error ? err.message : "Something went wrong.";
}

function flagUrl(id: string, error?: string) {
  const base = `/flags/${encodeURIComponent(id)}`;
  return error ? `${base}?error=${encodeURIComponent(error)}` : base;
}

export async function createFlagAction(formData: FormData) {
  const user = await getSession();
  let target: string;
  try {
    const flag = createFlag(user, {
      key: text(formData, "key"),
      description: text(formData, "description"),
      risk: text(formData, "risk") as "low" | "high",
      ownerNote: text(formData, "ownerNote"),
    });
    target = flagUrl(flag.id);
  } catch (err) {
    target = `/flags/new?error=${encodeURIComponent(message(err))}`;
  }
  redirect(target);
}

export async function enableFlagAction(formData: FormData) {
  const id = text(formData, "id");
  const user = await getSession();
  let error: string | undefined;
  try {
    enableFlag(user, id);
  } catch (err) {
    error = message(err);
  }
  redirect(flagUrl(id, error));
}

export async function disableFlagAction(formData: FormData) {
  const id = text(formData, "id");
  const user = await getSession();
  let error: string | undefined;
  try {
    disableFlag(user, id);
  } catch (err) {
    error = message(err);
  }
  redirect(flagUrl(id, error));
}

export async function decideFlagApprovalAction(formData: FormData) {
  const id = text(formData, "id");
  const approvalId = Number(formData.get("approvalId"));
  const decision = formData.get("decision");
  const user = await getSession();
  let error: string | undefined;
  try {
    if (decision !== "approved" && decision !== "rejected") throw new Error("Invalid decision");
    decideFlagApproval(user, approvalId, decision, text(formData, "note"));
  } catch (err) {
    error = message(err);
  }
  redirect(flagUrl(id, error));
}
