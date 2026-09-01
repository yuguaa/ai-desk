import { useMemo } from "react";
import { normalizeMascotImageUrl, type MascotSource, type MascotStyle } from "@/lib/app-settings";
import beachAnimeImage from "@/assets/mascot/pixabay-anime/beach-anime.jpg";
import midnightPoseImage from "@/assets/mascot/pixabay-anime/midnight-pose.jpg";
import scarletPoseImage from "@/assets/mascot/pixabay-anime/scarlet-pose.jpg";
import silverLoungeImage from "@/assets/mascot/user-provided/silver-lounge.jpg";
import silverPoseImage from "@/assets/mascot/pixabay-anime/silver-pose.jpg";
import violetPoseImage from "@/assets/mascot/pixabay-anime/violet-pose.jpg";

const mascotImages: Record<MascotStyle, string> = {
  scarletPose: scarletPoseImage,
  violetPose: violetPoseImage,
  beachAnime: beachAnimeImage,
  midnightPose: midnightPoseImage,
  silverPose: silverPoseImage,
  silverLounge: silverLoungeImage,
};

export function mascotImageFor(style: MascotStyle, source: MascotSource = "builtIn", customUrl = "") {
  return source === "customUrl" ? normalizeMascotImageUrl(customUrl) : mascotImages[style];
}

export function Mascot({ style, source = "builtIn", customUrl = "", enabled = true, motion = true, className }: { style: MascotStyle; source?: MascotSource; customUrl?: string; enabled?: boolean; motion?: boolean; className?: string }) {
  const image = useMemo(() => mascotImageFor(style, source, customUrl), [customUrl, source, style]);
  if (!enabled || !image) return null;
  return <img src={image} alt="" aria-hidden="true" referrerPolicy="no-referrer" className={`mascot-image select-none object-contain ${motion ? "mascot-image--moving" : ""} ${className ?? ""}`} draggable="false" />;
}

export function MascotPreview({ style, source = "builtIn", customUrl = "", motion = true }: { style: MascotStyle; source?: MascotSource; customUrl?: string; motion?: boolean }) {
  return <div className="flex h-32 items-end justify-center overflow-hidden rounded-[var(--radius-md)] bg-[var(--bg-window)]"><Mascot style={style} source={source} customUrl={customUrl} motion={motion} className="h-36 w-24" /></div>;
}
