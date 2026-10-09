// Lets the visitor switch between the serif (Libron, default) and sans-serif (Roboto) body font.
// Loaded in <head> so the saved choice is applied before the page is painted.

let setFontSetting = (fontSetting) => {
  localStorage.setItem("font", fontSetting);
  document.documentElement.setAttribute("data-font", fontSetting);
};

let determineFontSetting = () => {
  let fontSetting = localStorage.getItem("font");
  return fontSetting === "sans" ? "sans" : "serif";
};

let toggleFontSetting = () => {
  setFontSetting(determineFontSetting() === "serif" ? "sans" : "serif");
};

let initFont = () => {
  setFontSetting(determineFontSetting());

  document.addEventListener("DOMContentLoaded", function () {
    const font_toggle = document.getElementById("font-toggle");

    if (font_toggle) {
      font_toggle.addEventListener("click", function () {
        toggleFontSetting();
      });
    }
  });
};

initFont();
