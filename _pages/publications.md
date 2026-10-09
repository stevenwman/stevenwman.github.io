---
layout: clean-page
permalink: /publications/
title: publications
slug: publications
description:
nav: true
nav_order: 2
---

<!-- _pages/publications.md -->

<div class="publications">

{% comment %} Force sorting by full date (newest first). Some jekyll-scholar setups sort only by year by default; passing explicit options ensures deterministic ordering when multiple items share the same year. {% endcomment %}
{% bibliography --sort date --sort_reverse true %}

</div>
