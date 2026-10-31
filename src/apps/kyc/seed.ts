import type { Tx } from "@/platform/db/client";
import { kycCases, type RiskTier } from "./schema";

const CASES: ReadonlyArray<[string, string, string, RiskTier]> = [
  ["SUBJ-1001", "Alex Rivera", "P12345671", "low"],
  ["SUBJ-1002", "Bailey Chen", "P12345672", "low"],
  ["SUBJ-1003", "Cameron Okafor", "P12345673", "medium"],
  ["SUBJ-1004", "Dakota Nguyen", "P12345674", "high"],
  ["SUBJ-1005", "Emerson Patel", "P12345675", "low"],
  ["SUBJ-1006", "Finley Johansson", "P12345676", "high"],
  ["SUBJ-1007", "Harper Mensah", "P12345677", "medium"],
  ["SUBJ-1008", "Indigo Rossi", "P12345678", "low"],
  ["SUBJ-1009", "Jesse Kowalski", "P12345679", "high"],
  ["SUBJ-1010", "Kai Yamamoto", "P12345680", "low"],
  ["SUBJ-1011", "Logan Haddad", "P12345681", "medium"],
  ["SUBJ-1012", "Marlow Dubois", "P12345682", "high"],
  ["SUBJ-1013", "Noor Abdullah", "P12345683", "low"],
  ["SUBJ-1014", "Parker Silva", "P12345684", "medium"],
  ["SUBJ-1015", "Quincy Ibarra", "P12345685", "low"],
];

/** Every seeded case starts as `new` and unassigned. All values are synthetic. */
export function seedKyc(tx: Tx) {
  const base = Date.UTC(2026, 9, 1);
  CASES.forEach(([subjectRef, fullName, documentNumber, riskTier], i) => {
    const ts = new Date(base + i * 3_600_000).toISOString();
    tx.insert(kycCases)
      .values({
        id: `kyc_${String(i + 1).padStart(3, "0")}`,
        subjectRef,
        fullName,
        documentNumber,
        riskTier,
        status: "new",
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
  });
}
