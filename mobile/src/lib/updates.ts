import Constants from "expo-constants";
import { Platform } from "react-native";

const releasesUrl = "https://api.github.com/repos/Markets-Finance/open-cash/releases/latest";

export type AppUpdate = { version: string; notes: string; apkUrl: string; pageUrl: string };

export const installedVersion = Constants.expoConfig?.version ?? "0.0.0";

function parts(version: string): number[] {
  return version.replace(/^v/i, "").split(".").map((part) => Number.parseInt(part, 10) || 0);
}

export function isNewer(candidate: string, current: string): boolean {
  const a = parts(candidate);
  const b = parts(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

export async function checkForUpdate(): Promise<AppUpdate | null> {
  if (Platform.OS !== "android") return null;
  const response = await fetch(releasesUrl, { headers: { Accept: "application/vnd.github+json" } });
  if (!response.ok) return null;
  const release = (await response.json()) as {
    tag_name?: string;
    body?: string | null;
    html_url?: string;
    draft?: boolean;
    prerelease?: boolean;
    assets?: { name: string; browser_download_url: string }[];
  };
  if (!release.tag_name || release.draft || release.prerelease) return null;
  const apk = release.assets?.find((asset) => asset.name.toLowerCase().endsWith(".apk"));
  if (!apk || !isNewer(release.tag_name, installedVersion)) return null;
  return {
    version: release.tag_name.replace(/^v/i, ""),
    notes: (release.body ?? "").trim(),
    apkUrl: apk.browser_download_url,
    pageUrl: release.html_url ?? apk.browser_download_url,
  };
}
