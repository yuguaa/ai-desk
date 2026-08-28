import { useMemo } from "react";
import type { MascotStyle } from "@/lib/app-settings";
import engineerImage from "@/assets/mascot/pico-engineer.png";
import knowledgeImage from "@/assets/mascot/pico-knowledge.png";
import maidWhiteImage from "@/assets/mascot/pico-maid-white.png";
import maidImage from "@/assets/mascot/pico-maid.png";
import matureImage from "@/assets/mascot/pico-mature.png";
import officeImage from "@/assets/mascot/pico-office.png";

const mascotImages: Record<MascotStyle, string> = {
  engineer: engineerImage,
  office: officeImage,
  knowledge: knowledgeImage,
  maid: maidImage,
  maidWhite: maidWhiteImage,
  mature: matureImage,
};

export function mascotImageFor(style: MascotStyle) {
  return mascotImages[style];
}

export function Mascot({ style, enabled = true, motion = true, className }: { style: MascotStyle; enabled?: boolean; motion?: boolean; className?: string }) {
  const image = useMemo(() => mascotImageFor(style), [style]);
  if (!enabled || !image) return null;
  return <img src={image} alt="" aria-hidden="true" className={`mascot-image select-none object-contain ${motion ? "mascot-image--moving" : ""} ${className ?? ""}`} draggable="false" />;
}

export function MascotPreview({ style, motion = true }: { style: MascotStyle; motion?: boolean }) {
  return <div className="flex h-32 items-end justify-center overflow-hidden rounded-[var(--radius-md)] bg-[var(--bg-window)]"><Mascot style={style} motion={motion} className="h-36 w-24" /></div>;
}
