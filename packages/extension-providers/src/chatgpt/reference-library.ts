type Reference = { assetId: string; filename?: string; base64?: string; filePath?: string; mimeType?: string };
type RegistryEntry = { filename?: string } | undefined;
type FindLauncher = () => HTMLElement | null;
type FindTile = (filename: string) => HTMLElement | null;
type VisibleRoots = () => HTMLElement[];
type Pause = (ms: number) => Promise<void>;
type Click = (element: Element) => void;
type ReferenceLibraryDeps = {
  findLauncher: FindLauncher;
  findTile: FindTile;
  visibleRoots: VisibleRoots;
  closePicker: () => Promise<void>;
  composerHasFilename: (filename: string) => boolean;
  attachmentCount: (references: Reference[]) => number;
  waitForUpload: (jobId: string, references: Reference[], beforeCount: number) => Promise<void>;
  registeredReference: (reference: Reference) => RegistryEntry;
  confirmReference: (reference: Reference) => void;
  simulateClick: Click;
  sleep: Pause;
  reportStatus: (jobId: string, status: string, message: string) => void;
};

async function openLibrary(deps: ReferenceLibraryDeps): Promise<boolean> {
    let launcher = deps.findLauncher();
    if (!launcher) {
      const menuButton = Array.from(document.querySelectorAll<HTMLElement>("button")).find((element) => {
        const label = `${element.getAttribute("aria-label") || ""} ${element.textContent || ""}`.toLowerCase();
        return element.getBoundingClientRect().width > 0 && /attach|add files|thêm tệp|đính kèm|thêm tệp và nhiều nội dung khác/.test(label);
      });
      if (!menuButton) return false;
      deps.simulateClick(menuButton);
      await deps.sleep(450);
      launcher = deps.findLauncher();
    }
    if (!launcher) return false;
    deps.simulateClick(launcher);
    await deps.sleep(650);
    return true;
}
async function searchLibrary(deps: ReferenceLibraryDeps, filename: string): Promise<HTMLElement | null> {
    const roots = deps.visibleRoots();
    const searchInput = roots.flatMap((root) => Array.from(root.querySelectorAll<HTMLInputElement>('input[type="search"], input[placeholder*="search" i], input[placeholder*="tìm" i]'))).find((input) => !input.disabled);
    if (searchInput) {
      searchInput.focus(); searchInput.value = filename;
      searchInput.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      searchInput.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      await deps.sleep(500);
    }
    return deps.findTile(filename);
}
function createReuseReference(deps: ReferenceLibraryDeps) {
  return async function reuseReference(reference: Reference, jobId: string): Promise<boolean> {
    const registryEntry = deps.registeredReference(reference);
    const filename = reference.filename || registryEntry?.filename || `${reference.assetId}.png`;
    if (!registryEntry || registryEntry.filename !== filename) return false;
    if (deps.composerHasFilename(filename)) {
      deps.reportStatus(jobId, "submitting", `Reusing already attached ChatGPT reference ${filename}.`);
      return true;
    }
    if (!await openLibrary(deps)) { await deps.closePicker(); return false; }
    const exactTile = await searchLibrary(deps, filename);
    if (!exactTile) { await deps.closePicker(); return false; }
    const beforeCount = deps.attachmentCount([reference]);
    deps.simulateClick(exactTile);
    try {
      await deps.waitForUpload(jobId, [reference], beforeCount);
      deps.reportStatus(jobId, "submitting", `Reused verified ChatGPT library reference ${filename}.`);
      deps.confirmReference(reference);
      return true;
    } catch {
      await deps.closePicker();
      return false;
    }
  };
}

export function createChatGptReferenceLibrary(deps: ReferenceLibraryDeps) {
  return { reuseReference: createReuseReference(deps) };
}
