export const ASSET_TYPES = ["extinguisher", "emergency_light", "exit_sign", "fire_door", "pull_station", "smoke_detector", "sprinkler_riser", "fire_damper", "eyewash", "aed", "other"] as const;
export function assetTypeLabel(type: string) { return type.replaceAll("_", " "); }
