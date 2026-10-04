import type { MetadataRoute } from "next";
import { appConfig } from "@/lib/config";

/**
 * Sitemap.
 *
 * Only stable, genuinely useful pages are listed. Research reports and search
 * results are deliberately excluded: they are per-question, cached with a TTL, and
 * mass-generating thin pages from them would be exactly the SEO trap the product
 * is designed to avoid.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const base = appConfig.appUrl.replace(/\/$/, "");

  const entries: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }> = [
    { path: "/", priority: 1, changeFrequency: "weekly" },
    { path: "/search", priority: 0.9, changeFrequency: "weekly" },
    { path: "/search/phone", priority: 0.8, changeFrequency: "monthly" },
    { path: "/search/part", priority: 0.8, changeFrequency: "monthly" },
    { path: "/search/compatibility", priority: 0.8, changeFrequency: "monthly" },
    { path: "/identify", priority: 0.7, changeFrequency: "monthly" },
    { path: "/pricing", priority: 0.6, changeFrequency: "monthly" },
    { path: "/about", priority: 0.6, changeFrequency: "monthly" },
    { path: "/help", priority: 0.6, changeFrequency: "monthly" },
  ];

  return entries.map((entry) => ({
    url: `${base}${entry.path}`,
    lastModified: now,
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
  }));
}
