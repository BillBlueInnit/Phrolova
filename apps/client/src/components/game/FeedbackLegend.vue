<template>
  <div class="legend-grid">
    <div class="legend-chip">
      <span class="legend-swatch legend-swatch-match"></span>
      <span>完全一致</span>
    </div>
    <div class="legend-chip">
      <span class="legend-swatch legend-swatch-near"></span>
      <span>相差不大</span>
    </div>
    <div class="legend-chip">
      <span class="legend-swatch legend-swatch-different"></span>
      <span>完全不同</span>
    </div>
    <div class="legend-chip">
      <span class="legend-swatch legend-swatch-partial"></span>
      <span>部分命中</span>
    </div>
  </div>
</template>

<style scoped>
.legend-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.72rem;
}

.legend-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.5rem 0.72rem;
  border: 1px solid var(--line-soft);
  background: color-mix(in oklab, var(--gold) 4%, var(--surface-card));
}

.legend-swatch {
  width: 16px;
  height: 16px;
  border-radius: 3px;
}

.legend-swatch-match {
  background: color-mix(in oklab, var(--color-success) 55%, var(--shell-bg-deep));
  border: 1px solid var(--color-success);
}

.legend-swatch-near {
  background: color-mix(in oklab, var(--color-warning) 55%, var(--shell-bg-deep));
  border: 1px solid var(--color-warning);
}

.legend-swatch-different {
  background: color-mix(in oklab, var(--text-main) 12%, var(--shell-bg-deep));
  border: 1px solid color-mix(in oklab, var(--text-main) 20%, var(--shell-bg-deep));
}

.legend-swatch-partial {
  background: color-mix(in oklab, var(--color-accent) 50%, var(--shell-bg-deep));
  border: 1px solid var(--color-accent);
}
</style>
