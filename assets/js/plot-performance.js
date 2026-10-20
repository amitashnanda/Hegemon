(() => {
  'use strict';

  const namespace = 'http://www.w3.org/2000/svg';
  const svgLimit = 5000;

  function extent(values, accessor = value => value) {
    let minimum = Infinity;
    let maximum = -Infinity;
    for (const item of values) {
      const value = accessor(item);
      if (!Number.isFinite(value)) continue;
      if (value < minimum) minimum = value;
      if (value > maximum) maximum = value;
    }
    return [minimum, maximum];
  }

  function bounds(samples) {
    const horizontal = extent(samples, sample => sample.x);
    const vertical = extent(samples, sample => sample.y);
    return {x: [horizontal[0] - 0.5, horizontal[1] + 0.5], y: [vertical[0] - 0.5, vertical[1] + 0.5]};
  }

  function decode(response) {
    const columns = response.sampleColumns;
    if (!columns) return response;
    const colors = response.defaultColors.map(population => population.color);
    response.samples = columns.id.map((identifier, index) => ({id: String(identifier), x: columns.x[index],
      y: columns.y[index], hasSurvival: columns.hasSurvival[index], color: colors[columns.hasSurvival[index] ? 0 : 1]}));
    delete response.sampleColumns;
    return response;
  }

  function escapeXml(value) {
    return String(value).replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'}[character]));
  }

  class RasterPlot {
    constructor() {
      this.element = document.createElementNS(namespace, 'foreignObject');
      this.element.setAttribute('x', '0');
      this.element.setAttribute('y', '0');
      this.element.setAttribute('pointer-events', 'none');
      this.element.setAttribute('aria-hidden', 'true');
      this.canvas = document.createElement('canvas');
      this.canvas.style.display = 'block';
      this.element.append(this.canvas);
      this.samples = [];
      this.bucketSize = 12;
    }

    draw(samples, geometry, domain, style) {
      this.samples = samples;
      this.geometry = geometry;
      this.domain = domain;
      this.style = style;
      const ratio = Math.min(3, window.devicePixelRatio || 1);
      const width = Math.round(geometry.width * ratio);
      const height = Math.round(geometry.height * ratio);
      if (this.canvas.width !== width) this.canvas.width = width;
      if (this.canvas.height !== height) this.canvas.height = height;
      this.canvas.style.width = `${geometry.width}px`;
      this.canvas.style.height = `${geometry.height}px`;
      this.element.setAttribute('width', geometry.width);
      this.element.setAttribute('height', geometry.height);
      const context = this.canvas.getContext('2d');
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, geometry.width, geometry.height);
      context.save();
      context.beginPath();
      context.rect(geometry.left, geometry.top, geometry.width - geometry.left - geometry.right,
        geometry.height - geometry.top - geometry.bottom);
      context.clip();
      this.columns = Math.ceil(geometry.width / this.bucketSize) + 1;
      const buckets = this.columns * (Math.ceil(geometry.height / this.bucketSize) + 1);
      if (!this.heads || this.heads.length !== buckets) this.heads = new Int32Array(buckets);
      this.heads.fill(-1);
      if (!this.next || this.next.length !== samples.length) {
        this.next = new Int32Array(samples.length);
        this.horizontal = new Float32Array(samples.length);
        this.vertical = new Float32Array(samples.length);
      }
      this.visibleCount = 0;
      for (let index = 0; index < samples.length; index++) {
        const sample = samples[index];
        if (!this.contains(sample)) continue;
        const horizontal = geometry.left + (sample.x - domain.x[0]) / (domain.x[1] - domain.x[0]) * (geometry.width - geometry.left - geometry.right);
        const vertical = geometry.height - geometry.bottom - (sample.y - domain.y[0]) / (domain.y[1] - domain.y[0]) * (geometry.height - geometry.top - geometry.bottom);
        const appearance = style(sample);
        context.fillStyle = appearance.color;
        context.globalAlpha = appearance.opacity;
        context.beginPath();
        context.arc(horizontal, vertical, appearance.radius, 0, Math.PI * 2);
        context.fill();
        if (appearance.stroke) {
          context.strokeStyle = appearance.stroke;
          context.lineWidth = appearance.strokeWidth || 1;
          context.stroke();
        }
        const bucket = Math.floor(horizontal / this.bucketSize) + Math.floor(vertical / this.bucketSize) * this.columns;
        this.horizontal[index] = horizontal;
        this.vertical[index] = vertical;
        this.next[index] = this.heads[bucket];
        this.heads[bucket] = index;
        this.visibleCount++;
      }
      context.restore();
      this.element.dataset.sampleCount = String(samples.length);
      this.element.dataset.visibleCount = String(this.visibleCount);
    }

    contains(sample) {
      return Number.isFinite(sample.x) && Number.isFinite(sample.y) && sample.x >= this.domain.x[0]
        && sample.x <= this.domain.x[1] && sample.y >= this.domain.y[0] && sample.y <= this.domain.y[1];
    }

    hitTest(horizontal, vertical, radius = 8) {
      if (!this.heads) return null;
      const column = Math.floor(horizontal / this.bucketSize);
      const row = Math.floor(vertical / this.bucketSize);
      let closest = null;
      let distance = radius * radius;
      for (let rowOffset = -1; rowOffset <= 1; rowOffset++) {
        for (let columnOffset = -1; columnOffset <= 1; columnOffset++) {
          const currentColumn = column + columnOffset;
          const currentRow = row + rowOffset;
          if (currentColumn < 0 || currentColumn >= this.columns || currentRow < 0) continue;
          const bucket = currentColumn + currentRow * this.columns;
          if (bucket >= this.heads.length) continue;
          for (let index = this.heads[bucket]; index !== -1; index = this.next[index]) {
            const candidate = (this.horizontal[index] - horizontal) ** 2 + (this.vertical[index] - vertical) ** 2;
            if (candidate > distance) continue;
            distance = candidate;
            closest = this.samples[index];
          }
        }
      }
      return closest;
    }

    vectorMarkup() {
      const geometry = this.geometry;
      const domain = this.domain;
      const circles = [];
      for (const sample of this.samples) {
        if (!this.contains(sample)) continue;
        const horizontal = geometry.left + (sample.x - domain.x[0]) / (domain.x[1] - domain.x[0]) * (geometry.width - geometry.left - geometry.right);
        const vertical = geometry.height - geometry.bottom - (sample.y - domain.y[0]) / (domain.y[1] - domain.y[0]) * (geometry.height - geometry.top - geometry.bottom);
        const appearance = this.style(sample);
        circles.push(`<circle cx="${horizontal}" cy="${vertical}" r="${appearance.radius}" fill="${escapeXml(appearance.color)}" opacity="${appearance.opacity}" stroke="${escapeXml(appearance.stroke || 'none')}" stroke-width="${appearance.strokeWidth || 0}" data-sample-id="${escapeXml(sample.id)}"><title>${escapeXml(sample.id)}: ${sample.x}, ${sample.y}</title></circle>`);
      }
      return circles.join('');
    }
  }

  window.HegemonPlotTools = {extent, bounds, decode, RasterPlot, svgLimit};
})();
