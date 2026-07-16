const config = window.NexusvendorEnterprisePortalScoutChatbotConfig;
if (config) {
  const loader = document.createElement("script");
  loader.id = "nv-scout-chatbot-loader";
  loader.src = `${config.scoutUrl.replace(/\/$/, "")}/scout-chatbot.js?v=1.1.0`;
  loader.async = true;
  loader.onload = () => window.ScoutChatbot.install(config);
  loader.onerror = () => console.error("ScoutChatbot could not load. Confirm the Scout host is available.");
  document.head.appendChild(loader);
}
