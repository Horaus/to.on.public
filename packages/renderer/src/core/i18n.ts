export type UiLanguage = "en" | "vi";

export type LanguageOption = {
  code: string;
  label: string;
  nativeLabel: string;
  promptName: string;
  uiLanguage?: UiLanguage;
  enabled: boolean;
};

export const languageOptions: LanguageOption[] = [
  { code: "vi", label: "Vietnamese", nativeLabel: "Tiếng Việt", promptName: "Vietnamese", uiLanguage: "vi", enabled: true },
  { code: "en", label: "English", nativeLabel: "English", promptName: "English", uiLanguage: "en", enabled: true },
  { code: "ja", label: "Japanese", nativeLabel: "日本語", promptName: "Japanese", enabled: true },
  { code: "ko", label: "Korean", nativeLabel: "한국어", promptName: "Korean", enabled: true },
  { code: "zh", label: "Chinese", nativeLabel: "中文", promptName: "Chinese", enabled: true },
  { code: "th", label: "Thai", nativeLabel: "ไทย", promptName: "Thai", enabled: true },
  { code: "id", label: "Indonesian", nativeLabel: "Bahasa Indonesia", promptName: "Indonesian", enabled: true },
  { code: "es", label: "Spanish", nativeLabel: "Español", promptName: "Spanish", enabled: true },
  { code: "fr", label: "French", nativeLabel: "Français", promptName: "French", enabled: true }
];

const promptNameToCode = new Map(languageOptions.map((option) => [option.promptName, option.code]));
const codeToOption = new Map(languageOptions.map((option) => [option.code, option]));

export function languageCodeFromPromptName(promptName?: string): string {
  return promptNameToCode.get(promptName || "") || "vi";
}

export function promptNameFromLanguageCode(code?: string): string {
  return codeToOption.get(code || "")?.promptName || "Vietnamese";
}

export function uiLanguageFromPromptName(promptName?: string): UiLanguage {
  const code = languageCodeFromPromptName(promptName);
  return codeToOption.get(code)?.uiLanguage || "en";
}

const dictionaries = {
  en: {
    "nav.overview": "Overview",
    "nav.flow": "Flow map",
    "nav.projects": "Projects",
    "nav.story": "Story",
    "nav.assets": "Characters & Style",
    "nav.storyboard": "Storyboard",
    "nav.generate": "Activity",
    "nav.review": "Edit",
    "nav.source": "Source",
    "nav.export": "Export",
    "common.language": "Language",
    "common.continue": "Continue",
    "common.generate": "Generate",
    "common.generateWithAi": "Generate with AI",
    "common.translate": "Translate",
    "common.buildPrompt": "Prepare video instructions",
    "common.continueToGenerate": "Continue to Generate",
    "common.reviewGeneratedAssets": "Inspect generated media (optional)",
    "story.phase": "Phase 1",
    "story.title": "Define the source and intended production.",
    "story.subtitle": "Clear source, duration, distribution and AI routing produce cleaner adaptation guidance.",
    "story.createLocal": "Create draft locally",
    "story.sourceContent": "Source content",
    "story.storyIdea": "Story idea / brief",
    "story.inputType": "Input type",
    "story.productionFormat": "Production format",
    "story.targetRuntime": "Target runtime",
    "story.audience": "Audience",
    "story.distribution": "Distribution",
    "assets.phase": "Phase 2",
    "assets.title": "Lock the visual rules that every shot must follow.",
    "assets.subtitle": "These references are injected into prompts and checked again during continuity review.",
    "storyboard.phase": "Phase 3",
    "storyboard.title": "Turn scenes into keyframes and video-ready shot directions.",
    "storyboard.board": "Storyboard board",
    "storyboard.controls": "Storyboard controls",
    "storyboard.script": "Storyboard script",
    "storyboard.sceneScript": "Scene-by-scene script",
    "storyboard.syncScenes": "Sync scene structure",
    "storyboard.generateBrief": "Generate brief",
    "storyboard.translateContext": "Translate current script context",
    "storyboard.translatePending": "Content language differs from the selected production language.",
    "storyboard.sceneBreakdown": "Scene breakdown",
    "storyboard.scenePurpose": "Scene purpose",
    "storyboard.shotsInScene": "Shots in this scene",
    "storyboard.selectedShot": "Selected shot",
    "storyboard.visualFrame": "Visual frame",
    "storyboard.dialogue": "Dialogue / voiceover",
    "storyboard.camera": "Camera",
    "storyboard.sec": "Sec",
    "storyboard.motion": "Motion",
    "sidebar.productionGuide": "Production guide",
    "sidebar.videoFrame": "Video frame",
    "sidebar.aiRouting": "Định tuyến AI",
    "sidebar.text": "Text",
    "sidebar.image": "Image",
    "sidebar.video": "Video",
    "sidebar.testTextAi": "Test text AI",
    "phase.planStory": "Plan the story",
    "phase.planStoryDetail": "Scenes and dramatic beats",
    "phase.lockIdentity": "Lock visual identity",
    "phase.lockIdentityDetail": "Character and style bible",
    "phase.directStoryboard": "Direct the storyboard",
    "phase.directStoryboardDetail": "Shots, motion and directions",
    "phase.generateBrowser": "Generation activity",
    "phase.generateBrowserDetail": "Generation status and assets",
    "phase.reviewContinuity": "Edit and review",
    "phase.reviewContinuityDetail": "Preview, compare, approve"
  },
  vi: {
    "nav.overview": "Tổng quan",
    "nav.flow": "Sơ đồ luồng",
    "nav.projects": "Dự án",
    "nav.story": "Kịch bản",
    "nav.assets": "Nhân vật & Phong cách",
    "nav.storyboard": "Storyboard",
    "nav.generate": "Thông báo",
    "nav.review": "Dựng phim",
    "nav.source": "Thư viện nguồn",
    "nav.export": "Xuất bản",
    "common.language": "Ngôn ngữ",
    "common.continue": "Tiếp tục",
    "common.generate": "Tạo",
    "common.generateWithAi": "Tạo bằng AI",
    "common.translate": "Dịch",
    "common.buildPrompt": "Chuẩn bị chỉ dẫn video",
    "common.continueToGenerate": "Sang bước tạo",
    "common.reviewGeneratedAssets": "Kiểm tra media đã tạo (tuỳ chọn)",
    "story.phase": "Giai đoạn 1",
    "story.title": "Xác định nguồn nội dung và mục tiêu sản xuất.",
    "story.subtitle": "Nguồn, thời lượng, nền tảng và định tuyến AI rõ ràng sẽ tạo hướng dẫn chuyển thể mạch lạc hơn.",
    "story.createLocal": "Tạo nháp trong app",
    "story.sourceContent": "Nội dung nguồn",
    "story.storyIdea": "Ý tưởng / brief",
    "story.inputType": "Loại đầu vào",
    "story.productionFormat": "Định dạng sản xuất",
    "story.targetRuntime": "Thời lượng mục tiêu",
    "story.audience": "Người xem",
    "story.distribution": "Nền tảng phát hành",
    "assets.phase": "Giai đoạn 2",
    "assets.title": "Khoá quy tắc hình ảnh cho mọi cảnh quay.",
    "assets.subtitle": "Các ảnh tham chiếu này được đưa vào nội dung và kiểm tra lại ở bước rà soát liên tục.",
    "storyboard.phase": "Giai đoạn 3",
    "storyboard.title": "Biến cảnh thành khung hình và chỉ dẫn video sẵn sàng.",
    "storyboard.board": "Bảng storyboard",
    "storyboard.controls": "Điều khiển bảng phân cảnh",
    "storyboard.script": "Kịch bản bảng phân cảnh",
    "storyboard.sceneScript": "Kịch bản theo cảnh",
    "storyboard.syncScenes": "Đồng bộ cấu trúc cảnh",
    "storyboard.generateBrief": "Tạo brief",
    "storyboard.translateContext": "Dịch ngữ cảnh kịch bản",
    "storyboard.translatePending": "Ngôn ngữ nội dung đang khác ngôn ngữ sản xuất đã chọn.",
    "storyboard.sceneBreakdown": "Phân cảnh",
    "storyboard.scenePurpose": "Mục tiêu cảnh",
    "storyboard.shotsInScene": "Shot trong cảnh",
    "storyboard.selectedShot": "Shot đang chọn",
    "storyboard.visualFrame": "Khung hình",
    "storyboard.dialogue": "Lời thoại / thuyết minh",
    "storyboard.camera": "Góc máy",
    "storyboard.sec": "Giây",
    "storyboard.motion": "Chuyển động",
    "sidebar.productionGuide": "Quy trình sản xuất",
    "sidebar.videoFrame": "Khung video",
    "sidebar.aiRouting": "Định tuyến AI",
    "sidebar.text": "Văn bản",
    "sidebar.image": "Ảnh",
    "sidebar.video": "Video",
    "sidebar.testTextAi": "Thử text AI",
    "phase.planStory": "Lên kịch bản",
    "phase.planStoryDetail": "Cảnh và nhịp kể",
    "phase.lockIdentity": "Khoá nhận diện",
    "phase.lockIdentityDetail": "Nhân vật và style bible",
    "phase.directStoryboard": "Dựng storyboard",
    "phase.directStoryboardDetail": "Shot, chuyển động và chỉ dẫn",
    "phase.generateBrowser": "Tiến độ tạo",
    "phase.generateBrowserDetail": "Trạng thái tạo và tài nguyên",
    "phase.reviewContinuity": "Dựng và rà soát",
    "phase.reviewContinuityDetail": "Xem trước, so sánh, duyệt"
  }
} satisfies Record<UiLanguage, Record<string, string>>;

export type I18nKey = keyof typeof dictionaries.en;

export function createTranslator(language: UiLanguage) {
  return (key: I18nKey): string => dictionaries[language][key] || dictionaries.en[key] || key;
}
