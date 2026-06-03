"use client";
import { useEffect } from "react";
import type { Gallery, PublicAsset } from "@/lib/api/galleries";
import { cacheGalleryForOffline } from "@/lib/offline/sync";

export function OfflineCacher(props: {
  gallery: Gallery;
  assets: PublicAsset[];
  ws: string | null;
  assetAccessToken: string | null;
}) {
  useEffect(() => {
    void cacheGalleryForOffline(props.gallery, props.assets, props.ws, props.assetAccessToken);
    // intentional: re-run only when the gallery identity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.gallery?.id]);
  return null;
}
