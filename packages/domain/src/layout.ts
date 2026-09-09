export function frameOrientation(aspectRatio: string) {
  if (aspectRatio === "16:9") return "horizontal";
  if (aspectRatio === "1:1") return "square";
  return "vertical";
}
