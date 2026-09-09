/** Renderer-local runtime identifiers; domain logic does not cross the UI boundary. */
export function makeId(prefix: string) { return `${prefix}_${crypto.randomUUID().slice(0, 8)}`; }
