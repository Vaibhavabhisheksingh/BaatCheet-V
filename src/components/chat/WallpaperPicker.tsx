import { Check, Image as ImageIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export interface Wallpaper {
  id: string;
  name: string;
  className: string;
}

export const WALLPAPERS: Wallpaper[] = [
  { id: 'default',   name: 'Default',   className: 'wallpaper-default' },
  { id: 'aurora',    name: 'Aurora',    className: 'wallpaper-aurora' },
  { id: 'sunset',    name: 'Sunset',    className: 'wallpaper-sunset' },
  { id: 'forest',    name: 'Forest',    className: 'wallpaper-forest' },
  { id: 'graphite',  name: 'Graphite',  className: 'wallpaper-graphite' },
  { id: 'paper',     name: 'Paper',     className: 'wallpaper-paper' },
  { id: 'grid',      name: 'Grid',      className: 'wallpaper-grid' },
  { id: 'midnight',  name: 'Midnight',  className: 'wallpaper-midnight' },
];

export function getWallpaperClass(id: string | null | undefined): string {
  return WALLPAPERS.find((w) => w.id === id)?.className ?? 'wallpaper-default';
}

interface WallpaperPickerProps {
  open: boolean;
  current: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}

export default function WallpaperPicker({ open, current, onSelect, onClose }: WallpaperPickerProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-primary" />
            Chat wallpaper
          </DialogTitle>
          <DialogDescription>
            Pick a background just for this conversation. Only you will see it.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
          {WALLPAPERS.map((w) => {
            const active = w.id === current;
            return (
              <button
                key={w.id}
                type="button"
                onClick={() => { onSelect(w.id); }}
                className={cn(
                  'group relative aspect-square rounded-lg overflow-hidden border-2 transition-all text-left',
                  active
                    ? 'border-primary ring-2 ring-primary/30'
                    : 'border-border hover:border-primary/60'
                )}
                aria-label={`Select ${w.name} wallpaper`}
              >
                <div className={cn('absolute inset-0', w.className)} />
                {active && (
                  <span className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow">
                    <Check className="w-3.5 h-3.5" />
                  </span>
                )}
                <span className="absolute bottom-0 inset-x-0 bg-background/80 backdrop-blur-sm text-xs font-medium text-foreground px-2 py-1 text-center">
                  {w.name}
                </span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
