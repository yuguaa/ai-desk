import { useMemo } from "react";
import { selectedMascotImageUrl, type MascotSource, type MascotStyle } from "@/lib/app-settings";
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

export function mascotImageFor(style: MascotStyle, source: MascotSource = "builtIn", customUrls: readonly string[] = [], customUrlIndex = 0) {
  return source === "customUrl" ? selectedMascotImageUrl(customUrls, customUrlIndex) : mascotImages[style];
}

export function Mascot({ style, source = "builtIn", customUrls = [], customUrlIndex = 0, enabled = true, motion = true, className }: { style: MascotStyle; source?: MascotSource; customUrls?: readonly string[]; customUrlIndex?: number; enabled?: boolean; motion?: boolean; className?: string }) {
  const image = useMemo(() => mascotImageFor(style, source, customUrls, customUrlIndex), [customUrlIndex, customUrls, source, style]);
  if (!enabled || !image) return null;
  return <img src={image} alt="" aria-hidden="true" referrerPolicy="no-referrer" className={`mascot-image select-none object-contain ${motion ? "mascot-image--moving" : ""} ${className ?? ""}`} draggable="false" />;
}

export function MascotPreview({ style, source = "builtIn", customUrls = [], customUrlIndex = 0, motion = true }: { style: MascotStyle; source?: MascotSource; customUrls?: readonly string[]; customUrlIndex?: number; motion?: boolean }) {
  return <div className="flex h-32 items-end justify-center overflow-hidden rounded-[var(--radius-md)] bg-[var(--bg-window)]"><Mascot style={style} source={source} customUrls={customUrls} customUrlIndex={customUrlIndex} motion={motion} className="h-36 w-24" /></div>;
}
