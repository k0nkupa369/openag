/** The house curve for WAAPI, read from the --ease-house token in styles.css so CSS and script motion stay one curve. */
export function houseEase(): string {
  return getComputedStyle(document.documentElement).getPropertyValue("--ease-house").trim() || "ease-out";
}
