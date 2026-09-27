const relayTheme = new URLSearchParams(location.search).get("theme");
if (relayTheme === "dark" || relayTheme === "light") {
  document.documentElement.dataset.themeDark = String(relayTheme === "dark");
}
