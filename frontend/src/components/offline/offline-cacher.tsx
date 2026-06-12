"use client";
import { useEffect } from "react";
import type { Gallery, PublicAsset } from "@/lib/api/galleries";
import { cacheGalleryForOffline } from "@/lib/offline/sync";

const AUTO_OFFLINE_CACHE_ASSET_LIMIT = 240;

export function OfflineCacher(props: {
  gallery: Gallery;
  assets: PublicAsset[];
  totalAssetCount?: number;
  ws: string | null;
  assetAccessToken: string | null;
}) {
  useEffect(() => {
    const totalAssets = props.totalAssetCount ?? props.assets.length;
    if (totalAssets > AUTO_OFFLINE_CACHE_ASSET_LIMIT) return;
    void cacheGalleryForOffline(
      props.gallery,
      props.assets,
      props.ws,
      props.assetAccessToken,
    );
    // intentional: re-run only when the gallery identity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.gallery?.id, props.totalAssetCount]);
  return null;
}
