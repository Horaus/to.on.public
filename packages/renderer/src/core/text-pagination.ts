export type TextPage = { start: number; end: number; text: string };

export function paginateText(text: string, targetLength = 2600): TextPage[] {
  const paragraphs = text.split(/(\n\s*\n)/);
  const pages: TextPage[] = [];
  let pageText = "";
  let pageStart = 0;
  let cursor = 0;
  for (const paragraph of paragraphs) {
    if (pageText && pageText.length + paragraph.length > targetLength) {
      pages.push({ start: pageStart, end: pageStart + pageText.length, text: pageText });
      pageStart = cursor;
      pageText = "";
    }
    pageText += paragraph;
    cursor += paragraph.length;
  }
  if (pageText || pages.length === 0) pages.push({ start: pageStart, end: pageStart + pageText.length, text: pageText });
  return pages;
}
