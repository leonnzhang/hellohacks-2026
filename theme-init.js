const relayTheme = new URLSearchParams(location.search).get("theme");
if (relayTheme === "dark" || relayTheme === "light") {
  document.documentElement.dataset.themeDark = String(relayTheme === "dark");
} else document.documentElement.dataset.themeDark = String(matchMedia("(prefers-color-scheme: dark)").matches);
addEventListener("message", (event) => {
  if (event.source === window.parent && event.data?.type === "RELAY_THEME" && typeof event.data.dark === "boolean")
    document.documentElement.dataset.themeDark = String(event.data.dark);
});
