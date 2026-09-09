# Browser-Native AI Video Studio — Agent Implementation Spec v2

> Mục tiêu của tài liệu này: đưa cho AI coding agent để **thiết kế và triển khai một app desktop-first** kết hợp 2 hướng:
>
> 1. **Toonflow-app**: lấy làm app gốc tham khảo về cấu trúc sản xuất video/short drama đã biên dựng rất tốt.
> 2. **TobyFlow-style Chrome Extension**: lấy làm lớp automation executor thao tác trên các nền tảng AI web như Google Flow, ChatGPT, Grok, Freepik... nhằm tận dụng tài khoản web/free/paid sẵn có, **không dùng API trong MVP**.
>
> Triết lý chính: **App desktop là não sản xuất. Extension/browser automation là tay thao tác.**

---

## 0. Chỉ thị tối quan trọng cho AI Agent

Agent phải hiểu rõ: hệ thống tham khảo đã có hai phần rất quan trọng, không được tự thiết kế lại từ đầu theo cảm tính.

### 0.1. App gốc tham khảo chính

App gốc cần nghiên cứu kỹ:

- **Toonflow-app**
- GitHub: `https://github.com/HBAI-Ltd/Toonflow-app`
- Docs tiếng Anh: `https://github.com/HBAI-Ltd/Toonflow-app/blob/master/docs/README.en.md`
- Repo mô tả: Toonflow là công cụ AI short drama / animated drama, chuyển novel/script thành kịch bản, phân cảnh, ảnh, video.
- Tech stack nhìn từ repo/package: TypeScript, Electron, Node.js, Express, Socket.IO, SQLite/better-sqlite3, Sharp, AI SDK, Vite/Vue frontend liên quan.

Agent phải xem Toonflow là **bản app gốc để học cấu trúc nhiều nhất có thể**:

- Học cách chia module.
- Học cách tổ chức project.
- Học cách tổ chức workflow sản xuất.
- Học cách tổ chức scene/storyboard/asset/video node.
- Học cách tổ chức desktop app cross-platform bằng Electron.
- Học cách lưu local database và asset.
- Học cách biến một ý tưởng/story/script thành sản phẩm video hoàn chỉnh.

**Không được hiểu sai:** trọng tâm không phải là tạo một extension giống TobyFlow. Trọng tâm là tạo một **production studio có cấu trúc giống Toonflow**, sau đó thay Provider API của Toonflow bằng **Browser Automation Provider** chạy qua extension.

### 0.2. Extension tham khảo chính

Extension cần nghiên cứu kỹ:

- **TobyFlow / Toby Flow**
- Website: `https://labs.toby.vn/`
- Guide: `https://labs.toby.vn/guide`
- Workflow templates: `https://labs.toby.vn/workflows`
- Chrome Web Store: `https://chromewebstore.google.com/detail/tobyflow-auto-flow-auto-c/iicjfgdnngmpfocfanpiammedafmomin`

Agent phải tự search/browse thêm nếu cần để lấy nội dung mới nhất từ extension, Chrome Store, docs, guide, screenshots, workflow templates.

TobyFlow hiện có sẵn trên Chrome Extension, nên agent có thể:

- đọc mô tả Chrome Web Store;
- nghiên cứu screenshots/video nếu có;
- đọc guide trên website;
- phân tích workflow templates;
- nếu người dùng cài extension thủ công, có thể quan sát hành vi UI theo ảnh/video do người dùng cung cấp;
- tuyệt đối không cần API của TobyFlow;
- không được cố reverse engineering trái phép extension hoặc bypass bảo vệ.

### 0.3. Nguyên tắc triển khai thay đổi so với Toonflow gốc

Toonflow gốc dùng model vendor/API endpoint cho text/image/video. Dự án này **không dùng API trong MVP**.

Thay vào đó:

```text
Toonflow Provider API
↓ thay bằng
Browser Automation Provider
↓ điều khiển
ChatGPT Web / Google Flow Web / Grok Web / Freepik Web / platform web khác
```

Mục tiêu là tận dụng tài khoản web của người dùng:

- ChatGPT web;
- Google Flow / labs.google/fx;
- Grok web;
- Freepik / Spaces nếu có;
- các nền tảng web AI khác có UI tạo ảnh/video.

App không bypass quota, không bypass captcha, không tạo account hàng loạt, không vượt rào thanh toán. App chỉ tự động hóa thao tác thủ công mà người dùng vốn có quyền thực hiện trên tài khoản của họ.

---

## 1. Định nghĩa sản phẩm

Tên tạm thời: **Browser-Native AI Video Studio**

Mô tả:

> Một app desktop-first cho macOS trước, cross-platform ngay từ đầu nếu khả thi, dùng để sản xuất video AI/story video/short drama theo workflow hoàn chỉnh. App quản lý project, kịch bản, nhân vật, storyboard, prompt, asset, queue, review, export. Phần tạo ảnh/video không gọi API mà điều khiển browser thông qua Chrome extension/local automation để sử dụng các nền tảng AI web có sẵn.

---

## 2. Vấn đề cần giải quyết

### 2.1. Toonflow rất tốt nhưng API cost cao

Toonflow có cấu trúc sản xuất tốt, nhưng yêu cầu cấu hình các model/vendor API cho text/image/video. Khi generate video nhiều, chi phí rất cao.

Dự án này giữ lại tư duy sản xuất của Toonflow nhưng đổi tầng execution:

```text
Thay vì app gọi API trả phí trực tiếp
→ app điều phối extension thao tác trên web AI platform đã đăng nhập sẵn
```

### 2.2. TobyFlow tự động hóa tốt nhưng extension-only không đủ làm production studio

TobyFlow mạnh ở:

- batch prompt;
- visual workflow builder;
- multi-provider chain;
- auto-download;
- smart queue;
- task/template;
- reference image;
- Telegram control;
- tab switching giữa Google Flow, ChatGPT, Grok.

Nhưng nhược điểm nếu dùng extension làm trung tâm:

- UI/đồ họa dễ lag;
- khó quản lý project lớn;
- khó có infinite canvas/storyboard timeline tốt;
- khó lưu asset/video nặng theo cấu trúc sản xuất;
- khó có Character Bible, Style Bible, Scene Bible;
- khó kiểm soát continuity giữa nhiều scene;
- khó làm review/edit/export chuyên nghiệp.

Vì vậy, extension chỉ nên là **executor mỏng**, không phải app chính.

---

## 3. Kiến trúc mục tiêu

```text
Desktop App Core
  ├─ Project Manager
  ├─ Story / Script Manager
  ├─ Character Bible
  ├─ Style Bible
  ├─ Scene & Shot Manager
  ├─ Storyboard Canvas
  ├─ Prompt Builder
  ├─ Workflow Engine
  ├─ Queue / Task State Machine
  ├─ Asset Library
  ├─ Review & Variant Selection
  ├─ Export / Render Layer
  └─ Local Database + Local File Storage

        ↕ Local Bridge

Browser Automation Extension
  ├─ Background Worker
  ├─ Content Script Adapters
  ├─ Tab Controller
  ├─ DOM Interaction Layer
  ├─ Upload/Download Handler
  ├─ Status Observer
  └─ Provider Adapters

        ↕ Browser UI

Supported Web Platforms
  ├─ ChatGPT Web
  ├─ Google Flow / labs.google/fx
  ├─ Grok Web
  ├─ Freepik Web / Spaces
  └─ Future providers
```

---

## 4. Desktop app phải là trung tâm

### 4.1. Desktop app macOS-first, cross-platform nếu khả thi

Ưu tiên:

1. macOS desktop app chạy ổn định trước.
2. Kiến trúc không khóa macOS: dùng Electron hoặc Tauri để sau này build Windows/Linux.
3. Vì Toonflow dùng Electron/TypeScript, hướng an toàn nhất là dùng Electron + TypeScript để dễ học cấu trúc.

Khuyến nghị stack:

```text
Electron + TypeScript
React hoặc Vue tùy agent thấy dễ tận dụng cấu trúc Toonflow
SQLite local database
Local filesystem asset store
WebSocket/native bridge tới extension
FFmpeg/Remotion cho export nếu cần
```

Nếu agent chọn Tauri, phải giải thích rõ vì sao Tauri tốt hơn Electron trong trường hợp này. Nhưng ưu tiên ban đầu vẫn là Electron vì Toonflow đã chứng minh hướng Electron cross-platform phù hợp.

### 4.2. Desktop app không phải wrapper web đơn giản

Không được làm kiểu:

```text
1 webview + 1 prompt box + 1 extension panel
```

App phải là production studio:

```text
Project → Script → Scene → Shot → Prompt → Generate → Asset → Review → Edit → Export
```

---

## 5. Những phần phải học/sao chép cấu trúc từ Toonflow

Agent phải nghiên cứu Toonflow repo và tái tạo càng nhiều tư duy cấu trúc càng tốt, nhưng cần tuân thủ license. Nếu dùng code trực tiếp phải kiểm tra license/commercial supplement. Nếu không chắc, chỉ học kiến trúc và viết lại implementation sạch.

### 5.1. Infinite Canvas Production Workbench

Toonflow có ý tưởng infinite canvas để tổ chức script, character, storyboard, asset, video node.

Dự án mới phải có một canvas/workbench tương tự:

- node cho Story;
- node cho Character;
- node cho Scene;
- node cho Shot;
- node cho Image Asset;
- node cho Video Asset;
- node cho Prompt;
- node cho Provider Execution;
- node cho Export.

Điểm cần lấy về:

```text
Không bắt người dùng chạy theo 1 form tuyến tính cứng.
Cho phép kéo thả node, rẽ nhánh, quay lại chỉnh, song song nhiều scene/shot.
```

### 5.2. Closed-loop production workflow

Toonflow xây quanh vòng:

```text
Planning → Scriptwriting → Storyboarding → Final Output
```

Dự án mới giữ vòng này, nhưng đổi phần generation sang browser automation:

```text
Planning
↓
Scriptwriting
↓
Storyboarding
↓
Browser-based generation
↓
Asset review
↓
Final output
```

### 5.3. Agent/role separation

Toonflow có tư duy nhiều lớp agent: decision, execution, supervision.

Dự án mới nên có role nội bộ:

```text
Planner Agent / Planner Module
  - chia story thành scene/shot

Prompt Builder Module
  - tạo prompt theo style/character/scene bible

Execution Manager
  - gửi job qua extension

Supervisor / Review Module
  - kiểm tra asset có đúng scene, đúng nhân vật, đúng style không

Continuity Checker
  - phát hiện shot lệch character/style/object
```

Nếu MVP chưa có AI thật cho các role, vẫn phải thiết kế data model và UI để sau này thêm.

### 5.4. Persistent memory / local semantic memory

Toonflow có ý tưởng memory để giữ continuity qua nhiều vòng sáng tạo.

Dự án mới cần ít nhất có:

- Character Bible;
- Style Bible;
- Scene Bible;
- Project Memory;
- Prompt history;
- Asset dependency graph.

MVP không nhất thiết cần vector memory, nhưng data model phải sẵn sàng.

### 5.5. Skill file / prompt file externalization

Toonflow externalize prompt/skill file bằng Markdown.

Dự án mới cũng phải có:

```text
/skills
  /script-adaptation.md
  /storyboard-prompt.md
  /image-prompt.md
  /video-prompt.md
  /stop-motion-style.md
  /continuity-review.md
```

Người dùng/agent có thể chỉnh skill file mà không phải sửa code.

### 5.6. Provider system

Toonflow có programmable provider system cho vendor/model API. Dự án mới phải có provider system tương tự nhưng loại provider đầu tiên là **Browser Provider**, không phải API Provider.

```ts
interface BrowserProviderAdapter {
  id: string;
  name: string;
  platform: 'chatgpt' | 'google-flow' | 'grok' | 'freepik' | string;
  capabilities: Array<'text' | 'image' | 'video' | 'upscale' | 'prompt-enhance'>;
  openTarget(job): Promise<void>;
  fillInputs(job): Promise<void>;
  submit(job): Promise<void>;
  observe(job): Promise<JobStatus>;
  download(job): Promise<Asset[]>;
}
```

---

## 6. Những phần phải học từ TobyFlow

TobyFlow là hệ automation executor đã có sẵn trên Chrome Store. Agent phải nghiên cứu công khai các tính năng và mô phỏng lại bằng implementation riêng.

### 6.1. Các tính năng cần học

Từ mô tả public, TobyFlow hỗ trợ:

- Google Flow/labs.google/fx;
- ChatGPT web;
- Grok web;
- batch prompt;
- visual workflow builder;
- multi-provider pipeline;
- dùng output từ provider này làm input cho provider khác;
- prompt enhancer;
- auto-download;
- auto-retry;
- smart tasks;
- task groups;
- prompt templates;
- album/reference images;
- @mention reference image;
- screen capture references;
- custom filename templates;
- Telegram remote control;
- tự chuyển tab giữa các provider để execute workflow.

### 6.2. Những phần cần lấy về cho extension executor

Extension mới phải có các khối:

```text
Background Service Worker
  - nhận job từ desktop app
  - quản lý tab
  - chuyển tab theo provider
  - gửi lệnh tới content script

Content Script Adapter
  - mỗi platform một adapter riêng
  - tìm đúng input/prompt box
  - upload ảnh/video reference
  - bấm generate
  - quan sát trạng thái
  - phát hiện lỗi/quota/login/captcha/manual-needed

Download Handler
  - phát hiện kết quả tạo xong
  - tải image/video về
  - đặt tên file theo template
  - gửi metadata về desktop app

Bridge Layer
  - WebSocket / Native Messaging / localhost HTTP
  - desktop app gửi job
  - extension trả status/result
```

### 6.3. Cách agent phải nghiên cứu TobyFlow

Agent không được đoán mò. Agent phải:

1. Search Chrome Web Store page của TobyFlow.
2. Đọc website `labs.toby.vn`.
3. Đọc guide `labs.toby.vn/guide`.
4. Đọc workflow templates `labs.toby.vn/workflows`.
5. Nếu cần, yêu cầu người dùng cung cấp screenshot/video thao tác extension đã cài.
6. Ghi lại danh sách selector/UI behavior theo từng platform sau khi quan sát.
7. Không reverse engineer hoặc decompile extension nếu không có quyền rõ ràng.

---

## 7. Không dùng API trong MVP

Đây là constraint bắt buộc.

### 7.1. Bị cấm trong MVP

Không triển khai:

- OpenAI API;
- Gemini API;
- Kling API;
- Veo API;
- Sora API;
- Replicate API;
- Fal API;
- bất kỳ API trả phí nào để generate text/image/video.

### 7.2. Được phép

Được dùng:

- browser automation trên tài khoản web người dùng đã đăng nhập;
- local filesystem;
- local SQLite;
- local FFmpeg/Remotion để ghép/render asset đã tải về;
- local OCR/computer vision nếu cần review, nhưng không bắt buộc;
- local model nhỏ nếu thật sự cần và không phá MVP.

### 7.3. Lý do

Nếu dùng API thì người dùng có thể dùng Toonflow gốc. Giá trị của dự án mới là:

```text
Toonflow-like production structure
+
TobyFlow-like browser automation
+
zero/low API cost workflow
```

---

## 8. Workflow sản phẩm cần hỗ trợ

### 8.1. Workflow cơ bản v1

```text
1. Người dùng tạo Project.
2. Nhập ý tưởng / story / script.
3. App chia thành Scene.
4. Mỗi Scene chia thành Shot.
5. Người dùng tạo Character Bible và Style Bible.
6. App tạo prompt cho từng Shot.
7. Người dùng chọn provider web: ChatGPT / Flow / Grok / Freepik.
8. App gửi job sang extension.
9. Extension mở đúng tab, paste prompt/upload reference, bấm generate.
10. Extension theo dõi kết quả và download asset.
11. App nhận asset, gắn vào Shot.
12. Người dùng review/chọn variant.
13. App ghép/export video cuối.
```

### 8.2. Workflow multi-provider

```text
Shot prompt
↓
ChatGPT Web tạo keyframe image
↓
App lưu image vào Shot Asset
↓
Google Flow Web dùng image làm reference tạo video
↓
App lưu video vào Shot Asset
↓
Grok/Freepik Web tạo variant nếu cần
↓
App chọn best variant
```

### 8.3. Workflow stop-motion / 10–12fps

Dự án phải ưu tiên style giúp giảm lỗi AI video:

- 10–12fps feeling;
- stop-motion;
- paper cutout;
- storybook illustration;
- comic panel motion;
- claymation;
- ink/watercolor animation;
- low motion;
- shot ngắn 2–4 giây;
- hạn chế realistic human action phức tạp.

Pipeline:

```text
Character sheet
↓
Scene storyboard keyframe
↓
Image-to-video nhẹ
↓
Frame hold / frame repeat
↓
Stop-motion jitter
↓
Subtitle / narration / music
↓
Export 9:16 / 16:9
```

---

## 9. Data model tối thiểu

### 9.1. Project

```ts
type Project = {
  id: string;
  name: string;
  description?: string;
  styleBibleId?: string;
  createdAt: string;
  updatedAt: string;
};
```

### 9.2. Character

```ts
type Character = {
  id: string;
  projectId: string;
  name: string;
  role: string;
  visualDescription: string;
  outfit: string;
  face: string;
  referenceAssetIds: string[];
  negativeTraits?: string;
  consistencyNotes?: string;
};
```

### 9.3. Style Bible

```ts
type StyleBible = {
  id: string;
  projectId: string;
  visualStyle: string;
  colorPalette: string;
  texture: string;
  lighting: string;
  motionRules: string;
  negativeStyle: string;
};
```

### 9.4. Scene

```ts
type Scene = {
  id: string;
  projectId: string;
  title: string;
  summary: string;
  location: string;
  timeOfDay: string;
  emotionalTone: string;
  order: number;
};
```

### 9.5. Shot

```ts
type Shot = {
  id: string;
  sceneId: string;
  order: number;
  description: string;
  camera: string;
  motion: string;
  durationSec: number;
  prompt: string;
  providerId?: string;
  status: 'draft' | 'queued' | 'running' | 'review' | 'approved' | 'failed';
  assetIds: string[];
};
```

### 9.6. Asset

```ts
type Asset = {
  id: string;
  projectId: string;
  type: 'image' | 'video' | 'audio' | 'subtitle' | 'reference';
  filePath: string;
  sourceProvider: string;
  sourceJobId?: string;
  prompt?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};
```

### 9.7. Automation Job

```ts
type AutomationJob = {
  id: string;
  projectId: string;
  shotId?: string;
  providerId: string;
  jobType: 'text' | 'image' | 'video' | 'download' | 'prompt-enhance';
  input: Record<string, unknown>;
  status:
    | 'pending'
    | 'opening_provider'
    | 'waiting_login'
    | 'submitting'
    | 'generating'
    | 'downloading'
    | 'review_required'
    | 'done'
    | 'failed_retryable'
    | 'failed_manual';
  resultAssetIds: string[];
  error?: string;
  createdAt: string;
  updatedAt: string;
};
```

---

## 10. Extension protocol

Desktop app và extension phải giao tiếp qua một protocol rõ ràng.

### 10.1. Request từ desktop app sang extension

```json
{
  "type": "RUN_JOB",
  "jobId": "job_123",
  "provider": "google-flow",
  "task": "image_to_video",
  "prompt": "...",
  "references": [
    {
      "assetId": "asset_001",
      "filePath": "/local/path/ref.png"
    }
  ],
  "settings": {
    "aspectRatio": "9:16",
    "durationSec": 4,
    "quality": "fast"
  },
  "download": {
    "auto": true,
    "targetFolder": "/project/assets/scene-01/shot-02",
    "filenameTemplate": "S01_SH02_[provider]_[index]"
  }
}
```

### 10.2. Status từ extension về desktop app

```json
{
  "type": "JOB_STATUS",
  "jobId": "job_123",
  "status": "generating",
  "message": "Provider is rendering video",
  "progress": 0.45
}
```

### 10.3. Result từ extension về desktop app

```json
{
  "type": "JOB_RESULT",
  "jobId": "job_123",
  "status": "done",
  "assets": [
    {
      "type": "video",
      "filePath": "/project/assets/scene-01/shot-02/result.mp4",
      "provider": "google-flow",
      "metadata": {
        "durationSec": 4,
        "resolution": "1080x1920"
      }
    }
  ]
}
```

---

## 11. Provider adapters cần làm trong MVP

### 11.1. ChatGPT Web Adapter

Mục tiêu:

- dùng ChatGPT web để tạo ảnh hoặc enhance prompt;
- upload reference nếu UI hỗ trợ;
- nhận/download ảnh kết quả;
- nhận text prompt nâng cấp.

Không dùng OpenAI API.

### 11.2. Google Flow Adapter

Mục tiêu:

- dùng labs.google/fx / Flow để tạo video;
- nhận prompt từ desktop app;
- upload reference frame nếu có;
- chờ render;
- download video;
- trả asset về desktop.

### 11.3. Grok Adapter

Mục tiêu:

- tạo ảnh/video variant nếu account hỗ trợ;
- fallback khi ChatGPT/Flow lỗi hoặc hết quota.

### 11.4. Freepik/Spaces Adapter

Tùy khả năng UI thực tế:

- dùng làm nơi tạo ảnh/style/reference;
- hoặc dùng như task executor mở rộng sau MVP.

---

## 12. UI/UX yêu cầu

### 12.1. Layout chính

```text
Left Sidebar
  - Projects
  - Characters
  - Scenes
  - Assets
  - Workflows
  - Providers
  - Settings

Center
  - Infinite Canvas / Storyboard Board
  - Scene/Shot timeline
  - Node graph

Right Inspector
  - selected node details
  - prompt editor
  - provider settings
  - job status
  - asset preview

Bottom Queue Panel
  - running jobs
  - provider tabs
  - errors/manual actions
```

### 12.2. Màn hình Project

Phải có:

- project overview;
- story/script input;
- scene list;
- shot list;
- character list;
- style bible;
- generation queue;
- output status.

### 12.3. Màn hình Shot Review

Phải có:

- prompt gốc;
- provider dùng;
- variant image/video;
- nút approve/retry/regenerate;
- ghi chú continuity;
- assign vào timeline.

---

## 13. Continuity system

Đây là điểm sống còn để sản phẩm hơn extension automation thường.

Mỗi prompt gửi đi phải được build từ:

```text
Project Style Bible
+
Character Bible
+
Scene Bible
+
Shot Description
+
Provider-specific syntax
+
Negative prompt / constraints
```

Ví dụ prompt builder phải tạo được:

```text
[STYLE]
Paper cutout stop-motion, storybook illustration, warm muted palette, handmade texture.

[CHARACTER]
Male detective, black coat, short black hair, pale skin, sharp face, same outfit as reference.

[SCENE]
Old train station at dusk, foggy background, quiet tension.

[SHOT]
Medium shot, character turns head slightly toward the sound, minimal motion, 4 seconds.

[MOTION RULE]
Low-motion, stop-motion feeling, 10-12fps aesthetic, no realistic fast hand movement.

[NEGATIVE]
No extra fingers, no changing clothes, no new character, no distorted face, no photorealistic skin.
```

---

## 14. Queue/state machine

Automation job không được chỉ là `running/done`. Phải có state rõ:

```text
PENDING
OPENING_PROVIDER
WAITING_LOGIN
WAITING_MANUAL_ACTION
SUBMITTING
GENERATING
DOWNLOADING
REVIEW_REQUIRED
APPROVED
FAILED_RETRYABLE
FAILED_MANUAL
DONE
```

Nếu platform yêu cầu login/captcha/quota/manual confirmation, extension không được cố bypass. Nó phải báo:

```text
WAITING_MANUAL_ACTION
```

và desktop app hiển thị hướng dẫn.

---

## 15. MVP phạm vi triển khai

### 15.1. MVP 1 — Foundation

Làm trước:

- Electron desktop shell;
- SQLite database;
- Project/Scene/Shot/Asset data model;
- Local asset folder;
- Basic UI: project + shot board + queue;
- Extension bridge;
- Chrome extension skeleton;
- 1 provider adapter: ChatGPT Web hoặc Google Flow;
- auto-submit prompt;
- auto-detect result thủ công/tối thiểu;
- auto-download nếu khả thi.

### 15.2. MVP 2 — Story production

Thêm:

- Character Bible;
- Style Bible;
- Prompt Builder;
- Scene/Shot breakdown;
- Review/variant selection;
- Google Flow adapter;
- ChatGPT image adapter;
- asset dependency graph.

### 15.3. MVP 3 — Video assembly

Thêm:

- timeline;
- FFmpeg/Remotion export;
- subtitles;
- voice/narration import;
- 10–12fps stop-motion export preset;
- batch jobs.

### 15.4. MVP 4 — Multi-provider workflow

Thêm:

- visual workflow node editor;
- output provider A → input provider B;
- workflow templates;
- prompt templates;
- task groups;
- team/share sau này.

---

## 16. Cấu trúc thư mục đề xuất

```text
/apps
  /desktop
    /src
      /main
      /renderer
      /shared
      /db
      /assets
      /workflow
      /providers
      /prompt-builder
      /export

  /extension
    /src
      /background
      /content
        /chatgpt
        /google-flow
        /grok
        /freepik
      /bridge
      /downloads
      /providers
      /shared

/packages
  /protocol
  /types
  /skills
  /ui
  /utils

/data
  /projects
  /settings
  /logs
```

---

## 17. Security / compliance constraints

Agent phải tuân thủ:

- Không lưu password người dùng.
- Không tự động tạo account hàng loạt.
- Không bypass captcha.
- Không bypass quota/payment.
- Không dùng API private không được phép.
- Không reverse engineering proprietary extension trừ khi người dùng có quyền hợp pháp.
- Không gửi ảnh/video người dùng về server bên thứ ba ngoài các web platform mà người dùng chủ động dùng.
- Mặc định dữ liệu lưu local.

---

## 18. Điều agent cần làm ngay khi bắt đầu

Agent phải thực hiện theo thứ tự:

1. Clone hoặc đọc kỹ Toonflow-app.
2. Lập bảng module hiện có của Toonflow:
   - desktop shell;
   - backend server;
   - database;
   - canvas/workbench;
   - agents;
   - providers;
   - skill files;
   - asset/video pipeline.
3. Lập bảng: module nào copy kiến trúc, module nào viết lại.
4. Search và đọc TobyFlow Chrome Store + labs.toby.vn + guide + workflow templates.
5. Lập bảng tính năng TobyFlow:
   - batch;
   - workflow;
   - provider switching;
   - auto download;
   - task/template;
   - reference image;
   - Telegram;
   - tab switching.
6. Thiết kế bridge protocol giữa desktop app và extension.
7. Tạo MVP skeleton.
8. Tích hợp provider đầu tiên.
9. Test 1 flow end-to-end:

```text
Project → Shot → Prompt → Extension → Web Provider → Download → Asset Library
```

---

## 19. Tiêu chí thành công

MVP chỉ được coi là thành công khi chạy được end-to-end:

```text
Người dùng tạo 1 project
↓
Tạo 1 scene + 1 shot
↓
App sinh prompt từ style/shot
↓
App gửi job cho extension
↓
Extension thao tác trên ChatGPT/Flow web
↓
Kết quả được download
↓
App nhận và gắn asset vào shot
↓
Người dùng approve asset
```

Không cần nhiều provider ở MVP. Cần đúng kiến trúc.

---

## 20. Tóm tắt một câu cho agent

> Hãy xây một app desktop-first giống cấu trúc sản xuất của Toonflow, nhưng thay toàn bộ model/API provider bằng browser automation extension kiểu TobyFlow. Toonflow là não/cấu trúc sản xuất cần học và sao chép tư duy nhiều nhất; TobyFlow là executor/browser automation cần học hành vi và thay thế bằng implementation riêng. Trọng tâm là kết nối đúng các phần để tạo ra sản phẩm video/story hoàn chỉnh với chi phí API gần bằng 0 trong MVP.
