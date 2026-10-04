import type { MetadataRoute } from "next";
import { appConfig } from "@/lib/config";

export default function robots(): MetadataRoute.Robots {
  const base = appConfig.appUrl.replace(/\/$/, "");
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin",
          "/profile",
          "/history",
          "/saved",
          "/login",
          "/register",
          // Reports are per-question and expire; they are not indexable content.
          "/results/",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
