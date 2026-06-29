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
  scoutBaseUrl: "http://localhost:3001",
  targetAppId: "9de764bc-205e-4476-b061-12d101b092da"
};

export function ScoutAdoptionLoader() {
  useEffect(() => {
    window.ScoutAdoptionPlayerConfig = config;

    if (window.ScoutAdoptionPlayer) {
      void window.ScoutAdoptionPlayer.init(config);
      return;
    }

    if (document.querySelector<HTMLScriptElement>('script[src="http://localhost:3001/scout-smart-adoption-player.js"]')) {
      return;
    }

    const script = document.createElement("script");
    script.src = "http://localhost:3001/scout-smart-adoption-player.js";
    script.async = true;
    document.body.appendChild(script);
  }, []);

  return null;
}
