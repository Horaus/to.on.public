import { useStudioApplicationContext } from "./studio-application-context";
import { SourceLibrary } from "./views/source-library-view";

export function SourceScreen() {
  const { projectAssets, projectScenes, projectShots, state } = useStudioApplicationContext();
  return <section className="view source-view">
    <div className="view-intro compact"><div><span className="eyebrow">Thư viện nguồn</span><h2>Quản lý tư liệu trước khi đưa vào dựng.</h2><p>Nhóm theo cảnh, shot hoặc thứ tự riêng; chọn nhiều tệp để kéo ra dưới dạng liên kết hoặc bản sao.</p></div></div>
    <SourceLibrary assets={projectAssets} scenes={projectScenes} shots={projectShots} jobs={state.jobs} />
  </section>;
}
