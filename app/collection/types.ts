// Shared types for the /collection client components. Lives in its own file
// so CollectionList and its sub-components don't form a circular import.

import type { Game } from "@/lib/cards/types";

export type SortKey = "name" | "quantity" | "recent" | "set";
export type SortDir = "asc" | "desc";

export interface CollectionRow {
  id: string;
  quantity: number;
  variant: string;
  created_at: string;
  card: {
    id: string;
    game: Game;
    external_id: string;
    name: string;
    type: string | null;
    image_url: string | null;
    set: string | null;
    description: string | null;
    attribute: string | null;
    race: string | null;
    level: number | null;
    colors: string[];
  } | null;
}

export interface CollectionState {
  query: string;
  gameFilter: Game;
  showAdvanced: boolean;
  typeFilter: string;
  keywordFilter: string;
  variantFilter: string;
  attributeFilter: string;
  raceFilter: string;
  levelFilter: string;
  colorsFilter: string;
  sortKey: SortKey;
  sortDir: SortDir;
  page: number;
}

export type Patch = (p: Partial<CollectionState>) => void;

export interface AdvancedOptions {
  typeOptions: string[];
  variantOptions: string[];
  attributeOptions: string[];
  raceOptions: string[];
  levelOptions: number[];
}
