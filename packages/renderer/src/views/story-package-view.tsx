import type { Project, StoryComment } from "@studio/types";
import {
  Check,
  ChevronRight,
  CornerUpRight,
  Expand,
  Pencil,
  Sparkles,
  X
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { makeId } from "@studio/renderer-core/runtime-id";
type StoryDocument = NonNullable<Project["storyDocument"]>;
import { paginateText } from "@studio/renderer-core/text-pagination";

type StorySection = StoryComment["section"];
type StorySelection = {
  section: StorySection;
  start: number;
  end: number;
  quote: string;
  top: number;
  left: number;
};

function annotatedStoryText({ comments, composerOpen, document, endOffset, expanded, section, selection, sourceText, startOffset }: {
  comments: StoryComment[]; composerOpen: boolean; document: StoryDocument; endOffset?: number; expanded: StorySection | null;
  section: StorySection; selection: StorySelection | null; sourceText?: string; startOffset?: number;
}) {
  const text = sourceText ?? document[section];
  const firstOffset = startOffset ?? 0;
  const lastOffset = endOffset ?? text.length;
  const sectionComments = comments
    .filter((item) => item.section === section && item.start >= firstOffset && item.end <= lastOffset)
    .sort((a, b) => a.start - b.start);
  const parts: React.ReactNode[] = [];
  let cursor = firstOffset;
  for (const comment of sectionComments) {
    if (comment.start < cursor) continue;
    parts.push(text.slice(cursor, comment.start));
    parts.push(<mark className="comment-highlight" data-expanded={expanded ? "true" : "false"} key={comment.id}>{text.slice(comment.start, comment.end)}<span className="comment-tooltip">{comment.comment}</span></mark>);
    cursor = comment.end;
  }
  if (composerOpen && selection?.section === section && selection.start >= firstOffset && selection.end <= lastOffset && selection.start >= cursor) {
    parts.push(text.slice(cursor, selection.start));
    parts.push(<mark className="selection-highlight" key="active-selection">{text.slice(selection.start, selection.end)}</mark>);
    cursor = selection.end;
  }
  parts.push(text.slice(cursor, lastOffset));
  return parts;
}

function StoryCommentComposer({ commentDraft, composerOpen, onAdd, section, selection, setCommentDraft, setComposerOpen, setSelection }: {
  commentDraft: string; composerOpen: boolean; onAdd: () => void; section: StorySection; selection: StorySelection | null;
  setCommentDraft: React.Dispatch<React.SetStateAction<string>>; setComposerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSelection: React.Dispatch<React.SetStateAction<StorySelection | null>>;
}) {
  if (selection?.section !== section) return null;
  if (!composerOpen) return <div className="selection-toolbar" style={{ top: selection.top, left: selection.left }}><button type="button" title="Thêm nhận xét" onClick={() => setComposerOpen(true)}>Nhận xét</button></div>;
  return <div className="comment-composer" style={{ top: selection.top, left: selection.left }}>
    <textarea aria-label="Nội dung nhận xét" autoFocus value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} placeholder="Thêm ghi chú chỉnh sửa tập trung…" />
    <div><button type="button" title="Huỷ nhận xét" aria-label="Huỷ nhận xét" onClick={() => { setSelection(null); setComposerOpen(false); }}><X size={13} /></button><button type="button" className="comment-submit" title="Gửi nhận xét" aria-label="Gửi nhận xét" onClick={onAdd}><CornerUpRight size={14} /></button></div>
  </div>;
}

function StoryDocumentPanel({ comments, composer, composerOpen, document, draft, editing, expanded, section, selection, title, captureSelection, saveEditing, setDraft, setExpanded, startEditing }: {
  comments: StoryComment[]; composer: React.ReactNode; composerOpen: boolean; document: StoryDocument; draft: string; editing: StorySection | null;
  expanded: StorySection | null; section: StorySection; selection: StorySelection | null; title: string;
  captureSelection: (section: StorySection, root: HTMLElement, textOffset?: number) => void;
  saveEditing: (section: StorySection) => void; setDraft: React.Dispatch<React.SetStateAction<string>>;
  setExpanded: React.Dispatch<React.SetStateAction<StorySection | null>>; startEditing: (section: StorySection) => void;
}) {
  const isEditing = editing === section;
  const text = annotatedStoryText({ comments, composerOpen, document, expanded, section, selection });
  return <article className="document-panel">
    <header><strong>{title}</strong><div className="document-tools">
      <button type="button" title={isEditing ? "Lưu thay đổi" : `Sửa ${title}`} aria-label={isEditing ? `Lưu ${title}` : `Sửa ${title}`} onClick={() => isEditing ? saveEditing(section) : startEditing(section)}>{isEditing ? <Check size={14} /> : <Pencil size={14} />}</button>
      <button type="button" title={`Mở ${title} trong tài liệu`} aria-label={`Mở ${title} trong tài liệu`} onClick={() => setExpanded(section)}><Expand size={14} /></button>
    </div></header>
    {isEditing ? <div className="document-editor-shell">
      <div className="document-editor-overlay">{annotatedStoryText({ comments, composerOpen, document, endOffset: draft.length, expanded, section, selection, sourceText: draft })}</div>
      <textarea className="document-editor" value={draft} onChange={(event) => setDraft(event.target.value)} onScroll={(event) => { const overlay = event.currentTarget.previousElementSibling as HTMLElement | null; if (overlay) overlay.scrollTop = event.currentTarget.scrollTop; }} />
    </div> : <div className="document-text" onMouseUp={(event) => captureSelection(section, event.currentTarget)}>{text}</div>}
    {composer}
  </article>;
}

type ExpandedStoryPagesProps = {
  comments: StoryComment[];
  document: StoryDocument;
  draft: string;
  editing: StorySection | null;
  editingCommentDraft: string;
  editingCommentId: string | null;
  section: StorySection;
  captureSelection: (section: StorySection, root: HTMLElement, textOffset?: number) => void;
  commentComposer: (section: StorySection) => React.ReactNode;
  removeComment: (commentId: string) => void;
  renderAnnotatedText: (section: StorySection, startOffset?: number, endOffset?: number, sourceText?: string) => React.ReactNode;
  saveComment: (commentId: string) => void;
  saveEditing: (section: StorySection) => void;
  setDraft: React.Dispatch<React.SetStateAction<string>>;
  setEditingCommentDraft: React.Dispatch<React.SetStateAction<string>>;
  setEditingCommentId: React.Dispatch<React.SetStateAction<string | null>>;
  startEditing: (section: StorySection) => void;
};

function ExpandedStoryPages(props: ExpandedStoryPagesProps) {
  const { comments, document, draft, editing, editingCommentDraft, editingCommentId, section, captureSelection,
    commentComposer, removeComment, renderAnnotatedText, saveComment, saveEditing, setDraft, setEditingCommentDraft,
    setEditingCommentId, startEditing } = props;
  return paginateText(document[section]).map((page, pageIndex) => {
    const pageComments = comments.filter((item) => item.section === section && item.start >= page.start && item.start < page.end);
    return (
      <div className="document-page-row" key={`${section}-${pageIndex}`}>
        <div className="a4-sheet"><article className="document-panel expanded-document">
          <header>
            <strong>{pageIndex === 0 ? (section === "story" ? "Câu chuyện hoàn chỉnh" : "Phân cảnh") : `Trang ${pageIndex + 1}`}</strong>
            {pageIndex === 0 ? <div className="document-tools"><button type="button" title={editing === section ? "Lưu thay đổi" : `Sửa ${section === "story" ? "Câu chuyện hoàn chỉnh" : "Phân cảnh"}`} aria-label={editing === section ? "Lưu thay đổi" : "Chỉnh sửa tài liệu"} onClick={() => editing === section ? saveEditing(section) : startEditing(section)}>{editing === section ? <Check size={14} /> : <Pencil size={14} />}</button></div> : null}
          </header>
          {editing === section && pageIndex === 0 ? (
            <div className="document-editor-shell">
              <div className="document-editor-overlay">{renderAnnotatedText(section, 0, draft.length, draft)}</div>
              <textarea className="document-editor" value={draft} onChange={(event) => setDraft(event.target.value)} onScroll={(event) => {
                const overlay = event.currentTarget.previousElementSibling as HTMLElement | null;
                if (overlay) overlay.scrollTop = event.currentTarget.scrollTop;
              }} />
            </div>
          ) : <div className="document-text" onMouseUp={(event) => captureSelection(section, event.currentTarget, page.start)}>{renderAnnotatedText(section, page.start, page.end)}</div>}
          {commentComposer(section)}
        </article></div>
        <aside className="page-comment-rail">
          {pageComments.map((comment) => {
            const position = Math.max(0, Math.min(0.82, (comment.start - page.start) / Math.max(1, page.end - page.start)));
            return <article key={comment.id} style={{ top: `${70 + position * 900}px` }}>
              {editingCommentId === comment.id ? <textarea aria-label="Chỉnh sửa nhận xét" value={editingCommentDraft} onChange={(event) => setEditingCommentDraft(event.target.value)} /> : <p>{comment.comment}</p>}
              <div><button type="button" title={editingCommentId === comment.id ? "Lưu nhận xét" : "Sửa nhận xét"} aria-label={editingCommentId === comment.id ? "Lưu nhận xét" : "Sửa nhận xét"} onClick={() => {
                if (editingCommentId === comment.id) saveComment(comment.id);
                else { setEditingCommentId(comment.id); setEditingCommentDraft(comment.comment); }
              }}>{editingCommentId === comment.id ? <Check size={13} /> : <Pencil size={13} />}</button><button type="button" title="Đánh dấu đã xử lý" onClick={() => removeComment(comment.id)}>Đã xử lý</button></div>
            </article>;
          })}
        </aside>
      </div>
    );
  });
}

type ExpandedStoryDocumentModalProps = Omit<ExpandedStoryPagesProps, "section"> & {
  expanded: StorySection | null;
  setExpanded: React.Dispatch<React.SetStateAction<StorySection | null>>;
};

function ExpandedStoryDocumentModal({ expanded, setExpanded, ...pagesProps }: ExpandedStoryDocumentModalProps) {
  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setExpanded(null);
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = document.querySelector<HTMLElement>(".document-modal");
      const focusable = dialog ? Array.from(dialog.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])")) : [];
      if (!focusable.length || !dialog?.contains(document.activeElement)) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expanded, setExpanded]);
  if (!expanded) return null;
  const title = expanded === "story" ? "Câu chuyện hoàn chỉnh" : "Phân cảnh";
  return (
    <div className="document-modal" role="dialog" aria-modal="true" aria-label={`${title} — chế độ xem tài liệu`}>
      <div className="document-modal-bar">
        <div><span className="eyebrow">Xem tài liệu</span><strong>{title}</strong></div>
        <button type="button" autoFocus title="Đóng chế độ xem tài liệu" aria-label="Đóng chế độ xem tài liệu" onClick={() => setExpanded(null)}><X size={18} /></button>
      </div>
      <div className="document-review-layout">
        <ExpandedStoryPages {...pagesProps} section={expanded} />
      </div>
    </div>
  );
}

function StoryArtifactPath({ document }: { document: StoryDocument }) {
  return <div className="story-artifact-path" aria-label="Đường dẫn gói kịch bản">
    <div className="complete"><span>1</span><strong>Ý tưởng / brief</strong><small>Đầu vào ngắn của người dùng</small></div>
    <ChevronRight size={16} />
    <div className={document.story.trim() ? "complete" : ""}><span>2</span><strong>Câu chuyện hoàn chỉnh</strong><small>Câu chuyện tự nhiên, đầy đủ nhân quả</small></div>
    <ChevronRight size={16} />
    <div className={document.sceneBreakdown.trim() ? "complete" : ""}><span>3</span><strong>Phân cảnh</strong><small>Mục tiêu, trở lực và bước ngoặt từng cảnh</small></div>
  </div>;
}

function StorySectionHeading({ document, providerName, rewriteActive, rewriteReady, onRewrite }: {
  document: StoryDocument;
  providerName: string;
  rewriteActive: boolean;
  rewriteReady: boolean;
  onRewrite: () => void;
}) {
  return <div className="section-heading">
    <div><span className="eyebrow">Phát triển câu chuyện</span><h3>{document.logline}</h3></div>
    <button type="button" className="rewrite-button" disabled={!rewriteReady || rewriteActive} onClick={onRewrite}>
      <Sparkles size={14} /> {rewriteActive ? `${providerName} đang chỉnh sửa...` : "Chỉnh sửa bằng AI"}
    </button>
  </div>;
}


export function StoryPackageEditor({
  document,
  providerName,
  rewriteActive,
  onChange,
  onRewrite
}: {
  document: StoryDocument;
  providerName: string;
  rewriteActive: boolean;
  onChange: (document: StoryDocument) => void;
  onRewrite: () => void;
}) {
  const [editing, setEditing] = useState<"story" | "sceneBreakdown" | null>(null);
  const [expanded, setExpanded] = useState<"story" | "sceneBreakdown" | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [selection, setSelection] = useState<StorySelection | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentDraft, setEditingCommentDraft] = useState("");
  const comments = document.comments ?? [];
  const rewriteReady = comments.length > 0 || Boolean(document.manuallyEdited);

  useEffect(() => {
    function openCommentComposer(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.altKey && event.key.toLowerCase() === "m" && selection) {
        event.preventDefault();
        setComposerOpen(true);
      }
    }
    window.addEventListener("keydown", openCommentComposer);
    return () => window.removeEventListener("keydown", openCommentComposer);
  }, [selection]);

  useEffect(() => {
    function clearUnconfirmedSelection(event: PointerEvent) {
      if (!selection || composerOpen) return;
      const target = event.target as HTMLElement;
      if (target.closest(".selection-toolbar")) return;
      setSelection(null);
      window.getSelection()?.removeAllRanges();
    }
    window.addEventListener("pointerdown", clearUnconfirmedSelection);
    return () => window.removeEventListener("pointerdown", clearUnconfirmedSelection);
  }, [selection, composerOpen]);

  function startEditing(section: StoryComment["section"]) {
    setEditing(section);
    setDraft(document[section]);
  }

  function saveEditing(section: StoryComment["section"]) {
    onChange({ ...document, [section]: draft, manuallyEdited: true });
    setEditing(null);
  }

  function captureSelection(section: StoryComment["section"], root: HTMLElement, textOffset = 0) {
    const selected = window.getSelection();
    if (!selected || selected.isCollapsed || !selected.rangeCount) return;
    const range = selected.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return;
    const prefix = range.cloneRange();
    prefix.selectNodeContents(root);
    prefix.setEnd(range.startContainer, range.startOffset);
    const start = textOffset + prefix.toString().length;
    const quote = range.toString().trim();
    if (!quote) return;
    const rangeRect = range.getBoundingClientRect();
    const panelRect = root.closest(".document-panel")?.getBoundingClientRect() ?? root.getBoundingClientRect();
    setSelection({
      section,
      start,
      end: start + range.toString().length,
      quote,
      top: rangeRect.bottom - panelRect.top + 7,
      left: Math.max(8, Math.min(rangeRect.left - panelRect.left, panelRect.width - 248))
    });
    setCommentDraft("");
    setComposerOpen(false);
  }

  function addComment() {
    if (!selection || !commentDraft.trim()) return;
    const comment: StoryComment = {
      id: makeId("comment"),
      ...selection,
      comment: commentDraft.trim(),
      createdAt: new Date().toISOString()
    };
    onChange({ ...document, comments: [...comments, comment] });
    setSelection(null);
    setComposerOpen(false);
    setCommentDraft("");
    window.getSelection()?.removeAllRanges();
  }

  function removeComment(commentId: string) {
    onChange({ ...document, comments: comments.filter((item) => item.id !== commentId) });
  }

  function saveComment(commentId: string) {
    if (!editingCommentDraft.trim()) return;
    onChange({
      ...document,
      comments: comments.map((item) => item.id === commentId ? { ...item, comment: editingCommentDraft.trim() } : item)
    });
    setEditingCommentId(null);
    setEditingCommentDraft("");
  }

  function renderAnnotatedText(
    section: StoryComment["section"],
    startOffset = 0,
    endOffset = document[section].length,
    sourceText = document[section]
  ) {
    return annotatedStoryText({ comments, composerOpen, document, endOffset, expanded, section, selection, sourceText, startOffset });
  }

  const commentComposer = (section: StorySection) => <StoryCommentComposer commentDraft={commentDraft} composerOpen={composerOpen} onAdd={addComment} section={section} selection={selection} setCommentDraft={setCommentDraft} setComposerOpen={setComposerOpen} setSelection={setSelection} />;

  return (
    <>
      <div className="story-document" data-testid="story-document">
        {document.revisionNote ? <div className="revision-impact-banner" role="status"><Sparkles size={15} /><span>{document.revisionNote}</span></div> : null}
        <StoryArtifactPath document={document} />
        <StorySectionHeading document={document} providerName={providerName} rewriteActive={rewriteActive} rewriteReady={rewriteReady} onRewrite={onRewrite} />
        <div className="document-columns">
          <StoryDocumentPanel comments={comments} composer={commentComposer("story")} composerOpen={composerOpen} document={document} draft={draft} editing={editing} expanded={expanded} section="story" selection={selection} title="Câu chuyện hoàn chỉnh" captureSelection={captureSelection} saveEditing={saveEditing} setDraft={setDraft} setExpanded={setExpanded} startEditing={startEditing} />
          <StoryDocumentPanel comments={comments} composer={commentComposer("sceneBreakdown")} composerOpen={composerOpen} document={document} draft={draft} editing={editing} expanded={expanded} section="sceneBreakdown" selection={selection} title="Phân cảnh" captureSelection={captureSelection} saveEditing={saveEditing} setDraft={setDraft} setExpanded={setExpanded} startEditing={startEditing} />
        </div>
      </div>
      <ExpandedStoryDocumentModal
        expanded={expanded} setExpanded={setExpanded}
        comments={comments} document={document} draft={draft} editing={editing} editingCommentDraft={editingCommentDraft}
        editingCommentId={editingCommentId} captureSelection={captureSelection} commentComposer={commentComposer}
        removeComment={removeComment} renderAnnotatedText={renderAnnotatedText} saveComment={saveComment} saveEditing={saveEditing}
        setDraft={setDraft} setEditingCommentDraft={setEditingCommentDraft} setEditingCommentId={setEditingCommentId} startEditing={startEditing}
      />
    </>
  );
}

type StudioView = "overview" | "flow" | "story" | "assets" | "storyboard" | "generate" | "review" | "source";
