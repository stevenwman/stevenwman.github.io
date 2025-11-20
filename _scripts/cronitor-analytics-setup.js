---
permalink: /assets/js/cronitor-analytics-setup.js
title: cronitor-analytics-setup
---
window.cronitor =
  window.cronitor ||
  function () {
    (window.cronitor.q = window.cronitor.q || []).push(arguments);
  };
cronitor("config", { clientKey: "{{ site.cronitor_analytics }}" });
