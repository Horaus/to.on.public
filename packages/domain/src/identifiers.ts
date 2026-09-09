export function normalizeSlotName(value: string) { return value.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, ""); }
export function makeId(prefix: string) { return `${prefix}_${crypto.randomUUID().slice(0, 8)}`; }
