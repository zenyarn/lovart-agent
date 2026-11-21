import type { Model, Resolution } from "./models";
export type Settings = {
  model: Model;
  resolution: Resolution;
  ratio: string;
  background?: "auto" | "opaque" | "transparent";
};
export type Asset = {
  id: string;
  url: string;
  width: number;
  height: number;
  mime: string;
  name?: string;
};
export type Project = {
  id: string;
  name: string;
  updated_at: string;
  cover_asset_id: string | null;
  cover?: Asset;
  revision: number;
  viewport: { x: number; y: number; zoom: number };
  model_settings: Record<string, Settings>;
};
export type Generation = {
  id: string;
  project_id: string;
  prompt: string;
  model: Model | "gpt25";
  config: Omit<Settings, "model"> & {referenceAssetIds?:string[];providerModel?:string};
  reference_asset_id: string | null;
  status: string;
  error: string | null;
  created_at: string;
  outputs: { asset_id: string; ordinal: number }[];
};
export type CanvasNode = {
  id: string;
  generation_id: string | null;
  asset_id: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
};
export type ProjectDetail = {
  project: Project;
  generations: Generation[];
  nodes: CanvasNode[];
  assets: Record<string, Asset>;
};
