const DEFAULT_COMMUNITY_URL = "https://fenlanddavid.github.io/fossilmapped/";

function getCommunityBaseUrl(): string {
  const configured = import.meta.env.VITE_COMMUNITY_URL?.trim();
  return configured || DEFAULT_COMMUNITY_URL;
}

export function getCommunityUrl(findId?: string): string {
  const base = getCommunityBaseUrl();
  const url = new URL(base.endsWith("/") ? base : `${base}/`, window.location.origin);
  if (findId) url.searchParams.set("find", findId);
  return url.toString();
}
