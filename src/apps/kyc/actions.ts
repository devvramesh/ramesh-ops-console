"use server";

import { redirect } from "next/navigation";
import { getSession } from "@/platform/auth";
import { claimCase, decideApproval, decideCase } from "./service";

function message(err: unknown) {
  return err instanceof Error ? err.message : "something went wrong";
}

function caseUrl(id: string, error?: string) {
  return error ? `/kyc/${encodeURIComponent(id)}?error=${encodeURIComponent(error)}` : `/kyc/${encodeURIComponent(id)}`;
}

export async function claimAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const user = await getSession();
  let error: string | undefined;
  try {
    claimCase(user, id);
  } catch (err) {
    error = message(err);
  }
  redirect(caseUrl(id, error));
}

export async function decideCaseAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const decision = formData.get("decision");
  const note = String(formData.get("note") ?? "");
  const user = await getSession();
  let error: string | undefined;
  try {
    if (decision !== "approved" && decision !== "rejected") throw new Error("Invalid decision");
    decideCase(user, id, decision, note);
  } catch (err) {
    error = message(err);
  }
  redirect(caseUrl(id, error));
}

export async function decideApprovalAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const approvalId = Number(formData.get("approvalId"));
  const decision = formData.get("decision");
  const note = String(formData.get("note") ?? "");
  const user = await getSession();
  let error: string | undefined;
  try {
    if (decision !== "approved" && decision !== "rejected") throw new Error("Invalid decision");
    decideApproval(user, approvalId, decision, note);
  } catch (err) {
    error = message(err);
  }
  redirect(caseUrl(id, error));
}
