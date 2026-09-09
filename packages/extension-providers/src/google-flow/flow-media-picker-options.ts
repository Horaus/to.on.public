import { compactText, isVisible, visibleText } from "./flow-text-utils";

export function mediaPickerReferenceOptions(picker: HTMLElement): HTMLElement[] {
  const pickerRect = picker.getBoundingClientRect();
  const conventionalCandidates = conventionalMediaPickerOptions(picker, pickerRect);
  const structuralFilenameRows = structuralMediaPickerRows(picker, pickerRect);
  return [...conventionalCandidates, ...structuralFilenameRows]
    .filter((element, index, list) => list.indexOf(element) === index)
    .sort(compareMediaPickerOptions);
}

function conventionalMediaPickerOptions(picker: HTMLElement, pickerRect: DOMRect): HTMLElement[] {
  return Array.from(picker.querySelectorAll<HTMLElement>("[data-tile-id], listboxoption, [role='option'], button, [role='button'], img"))
    .map((element) => element.closest<HTMLElement>("[data-tile-id], listboxoption, [role='option']") || element.closest<HTMLElement>("button, [role='button']") || element)
    .filter((element, index, list) => list.indexOf(element) === index)
    .filter((element) => isConventionalMediaOption(element, pickerRect));
}

function isConventionalMediaOption(element: HTMLElement, pickerRect: DOMRect): boolean {
  if (!isVisible(element)) return false;
  const rect = element.getBoundingClientRect();
  if (!mediaOptionGeometryIsValid(rect, pickerRect)) return false;
  const image = element instanceof HTMLImageElement ? element : element.querySelector("img");
  const text = `${visibleText(element)} ${image?.alt || ""}`.trim();
  return !mediaOptionTextIsControl(text) && !mediaOptionTextNeedsImage(text, image)
    // Flow renders an uploaded picker thumbnail as a large image (typically
    // 257x457) and puts the filename in img.alt instead of row text.
    && (/\.(png|jpe?g|webp)|asset_/i.test(text)
      || Boolean(image && rect.height <= Math.max(80, pickerRect.height * 0.9)));
}

function mediaOptionGeometryIsValid(rect: DOMRect, pickerRect: DOMRect): boolean {
  const largePickerImage = rect.width >= 36 && rect.height > 92 && rect.height <= Math.max(120, pickerRect.height * 0.9);
  if (rect.width < 36 || rect.height < 24 || rect.width > 340 || (!largePickerImage && rect.height > 92)) return false;
  return pickerRect.width <= 0 || pickerRect.height <= 0 || (rect.left >= pickerRect.left - 4 && rect.right <= pickerRect.right + 4 && rect.top >= pickerRect.top - 4 && rect.bottom <= pickerRect.bottom + 4);
}

function mediaOptionTextIsControl(text: string): boolean {
  return /arrow_back|quay lại|dashboard|tất cả nội dung|xem hình ảnh|xem video|google flow|cài đặt|settings|help|trash|delete/i.test(text);
}

function mediaOptionTextNeedsImage(text: string, image: Element | null): boolean {
  return /thêm vào câu lệnh|add to prompt|hình ảnh|tệp tải lên|search|gần đây/i.test(text) && !image;
}

function structuralMediaRowMatches(element: HTMLElement, pickerRect: DOMRect): boolean {
  if (!isVisible(element)) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width < 220 || rect.height < 44 || rect.height > 110) return false;
  if (pickerRect.width > 0 && pickerRect.height > 0 && (rect.left < pickerRect.left - 4 || rect.right > pickerRect.right + 4 || rect.top < pickerRect.top - 4 || rect.bottom > pickerRect.bottom + 4)) return false;
  return (compactText(visibleText(element), 240).match(/[a-z0-9_.-]+\.(?:png|jpe?g|webp)/gi) || []).length === 1;
}

function structuralMediaRowIsNested(candidate: HTMLElement, other: HTMLElement): boolean {
  if (other === candidate || !candidate.contains(other)) return false;
  const candidateRect = candidate.getBoundingClientRect();
  const otherRect = other.getBoundingClientRect();
  return otherRect.width * otherRect.height > 0 && otherRect.width * otherRect.height < candidateRect.width * candidateRect.height;
}

function structuralMediaPickerRows(picker: HTMLElement, pickerRect: DOMRect): HTMLElement[] {
  const rows = Array.from(picker.querySelectorAll<HTMLElement>("div"))
    .filter((element) => structuralMediaRowMatches(element, pickerRect));
  return rows.filter((candidate, _index, candidates) => !candidates.some((other) => structuralMediaRowIsNested(candidate, other)));
}

function compareMediaPickerOptions(left: HTMLElement, right: HTMLElement): number {
  const leftNamed = /\.(png|jpe?g|webp)|asset_/i.test(visibleText(left)) ? 0 : 1;
  const rightNamed = /\.(png|jpe?g|webp)|asset_/i.test(visibleText(right)) ? 0 : 1;
  const leftRect = left.getBoundingClientRect();
  const rightRect = right.getBoundingClientRect();
  return leftNamed - rightNamed || leftRect.top - rightRect.top || leftRect.left - rightRect.left;
}

export function compareStartFrameOptions(left: HTMLElement, right: HTMLElement): number {
  const leftRole = left.getAttribute("role") === "option" ? 0 : 1;
  const rightRole = right.getAttribute("role") === "option" ? 0 : 1;
  const leftRect = left.getBoundingClientRect();
  const rightRect = right.getBoundingClientRect();
  return leftRole - rightRole || leftRect.height - rightRect.height || leftRect.top - rightRect.top || leftRect.left - rightRect.left;
}
