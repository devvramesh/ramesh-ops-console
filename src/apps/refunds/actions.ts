"use server";

import { redirect } from "next/navigation";
import { getSession } from "@/platform/auth";
import { createRefund, decideRefund, dollarsToCents, payRefund } from "./service";

function text(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

function errorMessage(err: unknown) {
  if (err instanceof Error && err.name === "ZodError") return "Check the form: every field is required and the amount must be between $0.01 and $100,000.00.";
  return err instanceof Error ? err.message : "Something went wrong.";
}

function withError(path: string, error: string) {
  return `${path}?error=${encodeURIComponent(error)}`;
}

export async function createRefundAction(formData: FormData) {
  const user = await getSession();
  const amountCents = dollarsToCents(text(formData, "amount"));
  let target: string;
  try {
    if (amountCents === null) throw new Error("Amount must be dollars and cents, for example 600.00.");
    const refund = createRefund(user, {
      customerRef: text(formData, "customerRef"),
      customerEmail: text(formData, "customerEmail"),
      amountCents,
      currency: "USD",
      reason: text(formData, "reason"),
    });
    target = `/refunds/${refund.id}`;
  } catch (err) {
    target = withError("/refunds/new", errorMessage(err));
  }
  redirect(target);
}

export async function decideRefundAction(formData: FormData) {
  const user = await getSession();
  const refundId = text(formData, "refundId");
  const approvalId = Number(text(formData, "approvalId"));
  const decision = text(formData, "decision");
  let target = `/refunds/${refundId}`;
  try {
    if (decision !== "approved" && decision !== "rejected") throw new Error("Invalid decision");
    decideRefund(user, approvalId, decision, text(formData, "note"));
  } catch (err) {
    target = withError(target, errorMessage(err));
  }
  redirect(target);
}

export async function payRefundAction(formData: FormData) {
  const user = await getSession();
  const refundId = text(formData, "refundId");
  let target = `/refunds/${refundId}`;
  try {
    await payRefund(user, refundId);
  } catch (err) {
    target = withError(target, errorMessage(err));
  }
  redirect(target);
}
