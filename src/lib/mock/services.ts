import type { LucideIcon } from "lucide-react";
import {
  Wrench,
  Hammer,
  Sparkles,
  Truck,
  Tv,
  Leaf,
  PackageCheck,
  PaintRoller,
} from "lucide-react";

export type ServiceSlug =
  | "handyman"
  | "furniture_assembly"
  | "cleaning"
  | "moving"
  | "tv_mount"
  | "gardening"
  | "delivery"
  | "painting";

export interface ServiceCategory {
  slug: ServiceSlug;
  icon: LucideIcon;
  /** Feature weight — larger tile in the bento grid. */
  featured: boolean;
  /** Typical hourly rate in MXN, used as a placeholder anchor for the tile. */
  startingRateMxn: number;
}

export const SERVICES: ServiceCategory[] = [
  { slug: "handyman", icon: Wrench, featured: true, startingRateMxn: 220 },
  { slug: "furniture_assembly", icon: Hammer, featured: false, startingRateMxn: 180 },
  { slug: "cleaning", icon: Sparkles, featured: false, startingRateMxn: 160 },
  { slug: "moving", icon: Truck, featured: false, startingRateMxn: 250 },
  { slug: "tv_mount", icon: Tv, featured: false, startingRateMxn: 200 },
  { slug: "gardening", icon: Leaf, featured: false, startingRateMxn: 180 },
  { slug: "delivery", icon: PackageCheck, featured: false, startingRateMxn: 140 },
  { slug: "painting", icon: PaintRoller, featured: false, startingRateMxn: 210 },
];

export function getService(slug: ServiceSlug): ServiceCategory | undefined {
  return SERVICES.find((s) => s.slug === slug);
}
