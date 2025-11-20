---
permalink: /assets/js/google-analytics-setup.js
title: google-analytics-setup
---
window.dataLayer = window.dataLayer || [];
function gtag() {
  window.dataLayer.push(arguments);
}
gtag("js", new Date());
gtag("config", "{{ site.google_analytics }}");
