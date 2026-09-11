import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FileText, X } from "@/components/ui/icons";
import { isImageAttachment, type Attachment } from "@/lib/attachments";
import { Button } from "@/components/ui/button";

export function Attachments({ attachments, onRemove }: { attachments: Attachment[]; onRemove?: (id: string) => void }) {
  if (!attachments.length) return null;

  return <div className="flex min-w-0 flex-wrap gap-2" aria-label="附件">
    {attachments.map((attachment) => <div key={attachment.id} className="relative min-w-0">
      {isImageAttachment(attachment)
        ? <ImageThumbnail image={attachment} />
        : <FileChip file={attachment} />}
      {onRemove && <Button type="button" variant="secondary" size="icon-xs" aria-label={`移除附件：${attachment.name}`} title="移除附件" className="absolute right-0 top-0 size-5" onClick={() => onRemove(attachment.id)}><X size={12} /></Button>}
    </div>)}
  </div>;
}

function ImageThumbnail({ image }: { image: Extract<Attachment, { type: "image" }> }) {
  return <Dialog>
    <DialogTrigger asChild>
      <Button type="button" variant="ghost" aria-label={`放大预览：${image.name}`} title={image.name} className="block h-auto w-20 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border-subtle)] p-0 text-[var(--text-secondary)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
        <img src={`data:${image.mimeType};base64,${image.data}`} alt={image.name} draggable={false} className="h-16 w-full object-cover" />
        <span className="block truncate px-1 py-1 text-[var(--font-size-10)]">{image.name}</span>
      </Button>
    </DialogTrigger>
    <DialogContent aria-describedby={undefined}>
      <DialogTitle>{image.name}</DialogTitle>
      <img src={`data:${image.mimeType};base64,${image.data}`} alt={image.name} className="min-h-0 w-full flex-1 object-contain" />
      <DialogClose asChild><Button type="button" variant="ghost" size="icon-xs" aria-label="关闭图片预览" title="关闭图片预览" className="absolute right-3 top-3"><X size={14} /></Button></DialogClose>
    </DialogContent>
  </Dialog>;
}

function FileChip({ file }: { file: Extract<Attachment, { type: "file" }> }) {
  return <span className="flex h-16 w-36 items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2" title={file.name}>
    <FileText size={14} className="shrink-0 text-[var(--text-tertiary)]" />
    <span className="min-w-0 flex-1 truncate text-left text-[var(--font-size-10)] text-[var(--text-secondary)]">{file.name}</span>
  </span>;
}
