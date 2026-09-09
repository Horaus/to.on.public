import type { VisualReference } from "@studio/types";

export function isQuickSetupReference(reference: VisualReference) {
  return reference.name==="Quick visual reference"||/quick visual reference/i.test(`${reference.sourceDescription||""} ${reference.transformationRequest||""}`);
}
