import type { MetadataRoute } from "next";
import { appConfig } from "@/lib/config";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${appConfig.appName} — phone parts compatibility research`,
    short_name: appConfig.appName,
    description:
      "Research phone part compatibility against the live public web. Sources, evidence confidence and honest unknown answers.",
    start_url: "/",
    display: "standalone",
    background_color: "#05070D",
    theme_color: "#05070D",
    orientation: "portrait",
    categories: ["business", "productivity", "utilities"],
  };
}
