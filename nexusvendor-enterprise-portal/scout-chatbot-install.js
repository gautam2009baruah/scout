const config = window.CrsScoutChatbotConfig;
if (config) {
  if (config.themeCss) {
    const themeLoader = document.createElement("link");
    themeLoader.id = "nv-scout-chatbot-theme";
    themeLoader.rel = "stylesheet";
    themeLoader.href = config.themeCss;
    document.head.appendChild(themeLoader);
  }
  const loader = document.createElement("script");
  loader.id = "nv-scout-chatbot-loader";
  loader.src = `${config.scoutUrl.replace(/\/$/, "")}/scout-chatbot.js?v=1.1.1`;
  loader.async = true;
  loader.onload = () => window.ScoutChatbot.install(config);
  loader.onerror = () => console.error("ScoutChatbot could not load. Confirm the Scout host is available.");
  document.head.appendChild(loader);
}
