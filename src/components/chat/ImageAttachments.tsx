import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { X } from "@/components/ui/icons";
import type { ImageAttachment } from "@/lib/image-attachments";
import { Button } from "@/components/ui/button";

export function ImageAttachments({ images, onRemove }: { images: ImageAttachment[]; onRemove?: (id: string) => void }) {
  if (!images.length) return null;

  return <div className="flex min-w-0 flex-wrap gap-2" aria-label="图片附件">
    {images.map((image) => <div key={image.id} className="relative w-20 min-w-0">
      <Dialog>
        <DialogTrigger asChild>
          <Button type="button" variant="ghost" aria-label={`放大预览：${image.name}`} title={image.name} className="block h-auto w-full overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border-subtle)] p-0 text-[var(--text-secondary)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
            <img src={`data:${image.mimeType};base64,${image.data}`} alt={image.name} draggable={false} className="h-16 w-full object-cover" />
            <span className="block truncate px-1 py-1 text-[var(--font-size-10)]">{image.name}</span>
          </Button>
        </DialogTrigger>
          <DialogContent aria-describedby={undefined}>
            <DialogTitle>{image.name}</DialogTitle>
            <img src={`data:${image.mimeType};base64,${image.data}`} alt={image.name} className="min-h-0 w-full flex-1 object-contain" />
            <DialogClose asChild><Button type="button" variant="ghost" size="icon-xs" aria-label="关闭图片预览" title="关闭图片预览" className="absolute right-3 top-3"><X size={14} /></Button></DialogClose>
          </DialogContent>
      </Dialog>
      {onRemove && <Button type="button" variant="secondary" size="icon-xs" aria-label={`移除图片：${image.name}`} title="移除图片" className="absolute right-0 top-0 size-5" onClick={() => onRemove(image.id)}><X size={12} /></Button>}
    </div>)}
  </div>;
}
