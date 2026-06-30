"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    ScoutAdoptionPlayer?: {
      smartRuntime?: boolean;
      init(config: { scoutBaseUrl?: string; targetAppId: string; autoShowLauncher?: boolean }): Promise<{
        guides: unknown[];
        play(guideId?: string): void;
      }>;
    };
    ScoutAdoptionPlayerConfig?: {
      scoutBaseUrl: string;
      targetAppId: string;
    };
  }
}

const config = {
  scoutBaseUrl: "http://localhost:3000",
  targetAppId: "6141a508-4fea-48c0-a92f-7a7064164209"
};

export function ScoutAdoptionLoader() {
  useEffect(() => {
    window.ScoutAdoptionPlayerConfig = config;

    if (window.ScoutAdoptionPlayer) {
      void window.ScoutAdoptionPlayer.init(config);
      return;
    }

    if (document.querySelector<HTMLScriptElement>('script[src="http://localhost:3000/scout-smart-adoption-player.js"]')) {
      return;
    }

    const script = document.createElement("script");
    script.src = "http://localhost:3000/scout-smart-adoption-player.js";
    script.async = true;
    document.body.appendChild(script);
  }, []);

  return null;
}
