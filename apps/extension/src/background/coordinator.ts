import type { ProviderJob } from "./adapters/types";
import coordinator from "./coordinator.cjs";

export type ProviderAdmission =
  | { action: "accept" }
  | { action: "duplicate" | "reject_serial"; activeJobId: string }
  | { action: "reject_unknown" };

export const planProviderAdmission = coordinator.planProviderAdmission as (
  job: ProviderJob,
  activeJobs: ProviderJob[],
  hasAdapter: boolean
) => ProviderAdmission;
