(() => {
  'use strict';

  if (!document.body.classList.contains('embedded-analysis')) return;
  const results = document.getElementById('results');
  const cards = new Set();
  const queue = [];
  const namespace = 'http://www.w3.org/2000/svg';
  const plotTools = window.HegemonPlotTools;
  let active = 0;
  let sequence = 0;

  function node(tag, className = '', text = '') {
    const item = document.createElement(tag);
    item.className = className;
    item.textContent = text;
    return item;
  }

  function svgNode(tag, attributes = {}, text = '') {
    const item = document.createElementNS(namespace, tag);
    for (const [name, value] of Object.entries(attributes)) item.setAttribute(name, String(value));
    item.textContent = text;
    return item;
  }

  function schedule(operation) {
    return new Promise((resolve, reject) => {
      queue.push({operation, resolve, reject});
      drain();
    });
  }

  function drain() {
    while (active < 2 && queue.length) {
      const job = queue.shift();
      active++;
      Promise.resolve().then(job.operation).then(job.resolve, job.reject).finally(() => {
        active--;
        drain();
      });
    }
  }

  function parameters(record) {
    const key = new URLSearchParams(location.search).get('key');
    return {id: record.id, geneA: record.probeA, geneB: record.probeB, ...(key ? {key} : {})};
  }

  async function successful(response) {
    if (response.ok) return response;
    let message = `The data service returned ${response.status}.`;
    try { message = (await response.json()).error?.message || message; } catch {}
    throw new Error(message);
  }

  async function figureBlob(card, format) {
    const payload = {action: 'render', type: 'figure', format, ...parameters(card.record),
      thresholds: card.thresholds.checked, statistics: card.statistics,
      sthr: card.record.sthr || '3', pthr: card.record.pthr || '0.1'};
    if (card.domain) payload.bounds = [...card.domain.x, ...card.domain.y];
    const response = await successful(await fetch('api.php', {method: 'POST',
      headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload), signal: card.controller.signal}));
    return response.blob();
  }

  function button(label, action) {
    const control = node('button', '', label);
    control.type = 'button';
    control.addEventListener('click', action);
    return control;
  }

  function failure(card, error) {
    if (error.name === 'AbortError' || !card.host.isConnected) return;
    card.status.textContent = error.message || 'Unable to load this figure.';
    card.status.classList.add('scientific-error');
  }

  function makeCard(record, interactive, statistics) {
    const host = node('section', 'scientific-figure');
    host.dataset.probeA = record.probeA;
    host.dataset.probeB = record.probeB;
    const title = node('h3', '', `${record.nameA || record.probeA} × ${record.nameB || record.probeB}`);
    const identifiers = node('p', 'scientific-identifiers', `${record.probeA} · ${record.probeB}`);
    const toolbar = node('div', 'scientific-figure-toolbar');
    const thresholds = node('input');
    thresholds.type = 'checkbox';
    thresholds.checked = interactive;
    const card = {host, record, statistics, thresholds, domain: null, controller: new AbortController(), urls: new Set()};
    cards.add(card);
    const format = node('select');
    format.setAttribute('aria-label', 'Figure download format');
    for (const [value, label] of [['png', 'PNG · high resolution'], ['jpg', 'JPG · high resolution'], ['pdf', 'PDF · vector'], ['svg', 'SVG · vector']]) {
      const option = node('option', '', label);
      option.value = value;
      format.append(option);
    }
    const download = button('Download figure', async () => {
      const selectedFormat = format.value;
      download.disabled = true;
      format.disabled = true;
      card.status.textContent = `Preparing ${selectedFormat.toUpperCase()}…`;
      card.status.classList.remove('scientific-error');
      try {
        const blob = await schedule(() => figureBlob(card, selectedFormat));
        if (!host.isConnected) return;
        const url = URL.createObjectURL(blob);
        const anchor = node('a');
        anchor.href = url;
        anchor.download = `${record.id}-${record.probeA}-${record.probeB}.${selectedFormat}`.replace(/[^a-z0-9_.-]/gi, '_');
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        card.status.textContent = 'Figure downloaded. SVG and PDF preserve vector graphics; PNG and JPG are 1920 × 1440 pixels.';
      } catch (error) { failure(card, error); }
      finally { download.disabled = false; format.disabled = false; }
    });
    download.disabled = true;
    card.download = download;
    toolbar.append(format, download, button('Use in Explore', () => {
      if (typeof window.updateTextBox === 'function') window.updateTextBox(record.probeA, record.nameA, record.probeB, record.nameB);
    }));
    const plot = node('div', 'scientific-plot');
    const status = node('p', 'scientific-figure-note', 'Loading the processed expression measurements…');
    status.setAttribute('role', 'status');
    card.plot = plot;
    card.status = status;
    card.toolbar = toolbar;
    host.append(title, identifiers, toolbar, plot, status);
    return card;
  }

  async function loadStatic(card) {
    try {
      const blob = await schedule(() => figureBlob(card, 'png'));
      if (!card.host.isConnected) return;
      const url = URL.createObjectURL(blob);
      card.urls.add(url);
      const image = node('img', 'scientific-static-plot');
      image.alt = `${card.record.nameA} versus ${card.record.nameB}, full sample population`;
      image.src = url;
      image.tabIndex = 0;
      image.setAttribute('role', 'button');
      image.setAttribute('aria-label', 'Use this probe pair in the interactive expression workspace');
      const explore = () => window.updateTextBox?.(card.record.probeA, card.record.nameA, card.record.probeB, card.record.nameB);
      image.addEventListener('click', explore);
      image.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); explore(); }
      });
      card.plot.append(image);
      card.download.disabled = false;
      card.status.textContent = 'High-resolution static plot. Click the plot or Use in Explore to work interactively with this pair.';
    } catch (error) { failure(card, error); }
  }

  function renderInteractive(card, response) {
    const geometry = {width: 900, height: 620, left: 76, right: 20, top: 24, bottom: 66};
    const samples = response.samples.filter(sample => Number.isFinite(sample.x) && Number.isFinite(sample.y));
    if (!samples.length) throw new Error('These probes have no paired numeric expression measurements.');
    card.record.nameA = response.genes.x.name;
    card.record.nameB = response.genes.y.name;
    card.host.querySelector('h3').textContent = `${card.record.nameA} × ${card.record.nameB}`;
    const full = plotTools.bounds(samples);
    const raster = samples.length > plotTools.svgLimit ? new plotTools.RasterPlot() : null;
    let drawFrame = null;
    card.domain = {x: [...full.x], y: [...full.y]};
    const chart = svgNode('svg', {class: 'scientific-svg', viewBox: `0 0 ${geometry.width} ${geometry.height}`, role: 'img', tabindex: '0',
      'aria-label': `Interactive plot of ${card.record.probeA} versus ${card.record.probeB}`});
    chart.append(svgNode('title', {}, `${card.record.nameA} versus ${card.record.nameB}`));
    chart.append(svgNode('desc', {}, 'Hover over points for sample identity and expression. Scroll or pinch to zoom at the pointer, or drag a rectangle to zoom. Use plus or minus to zoom; Escape, zero, or Home resets the plot.'));
    const clipId = `scientific-clip-${++sequence}`;
    const definitions = svgNode('defs');
    const clip = svgNode('clipPath', {id: clipId});
    const clipRectangle = svgNode('rect', {x: geometry.left, y: geometry.top, width: geometry.width - geometry.left - geometry.right, height: geometry.height - geometry.top - geometry.bottom});
    clip.append(clipRectangle);
    definitions.append(clip);
    chart.append(definitions);
    const drawing = svgNode('g');
    const brush = svgNode('rect', {class: 'scientific-zoom-brush', hidden: ''});
    chart.append(drawing, brush);
    card.plot.append(chart);
    const thresholdLabel = node('label', 'scientific-threshold-label');
    thresholdLabel.append(card.thresholds, document.createTextNode(' StepMiner thresholds'));
    const zoomIn = button('+', () => zoom(0.7));
    const zoomOut = button('−', () => zoom(1.4));
    zoomIn.setAttribute('aria-label', 'Zoom in');
    zoomOut.setAttribute('aria-label', 'Zoom out');
    card.toolbar.prepend(zoomIn, zoomOut, button('Reset plot', reset), thresholdLabel);
    const hint = `${samples.length} paired samples. Hover for values; scroll or pinch to zoom at the pointer; drag to zoom into a region. + / − zoom; 0 / Home or Reset plot fits all samples. Statistics always describe the full population, not the zoomed region.`;
    const legend = node('p', 'scientific-color-legend', 'Blue: survival time/status available · Green: missing survival time/status');
    card.host.append(legend);
    card.status.textContent = hint;

    function project(axis, value) {
      const fraction = (value - card.domain[axis][0]) / (card.domain[axis][1] - card.domain[axis][0]);
      return axis === 'x' ? geometry.left + fraction * (geometry.width - geometry.left - geometry.right) :
        geometry.height - geometry.bottom - fraction * (geometry.height - geometry.top - geometry.bottom);
    }

    function unproject(axis, value) {
      const fraction = axis === 'x' ? (value - geometry.left) / (geometry.width - geometry.left - geometry.right) :
        (geometry.height - geometry.bottom - value) / (geometry.height - geometry.top - geometry.bottom);
      return card.domain[axis][0] + fraction * (card.domain[axis][1] - card.domain[axis][0]);
    }

    function draw() {
      if (!raster) { drawNow(); return; }
      if (drawFrame === null) drawFrame = requestAnimationFrame(() => {
        drawFrame = null;
        if (card.host.isConnected) drawNow();
      });
    }

    function drawNow() {
      drawing.replaceChildren();
      chart.dataset.bounds = JSON.stringify(card.domain);
      chart.dataset.renderer = raster ? 'canvas' : 'svg';
      chart.dataset.sampleCount = String(samples.length);
      const marks = svgNode('g', {'clip-path': `url(#${clipId})`});
      for (const axis of ['x', 'y']) {
        for (let index = 0; index <= 5; index++) {
          const value = card.domain[axis][0] + index / 5 * (card.domain[axis][1] - card.domain[axis][0]);
          const position = project(axis, value);
          drawing.append(svgNode('line', {x1: axis === 'x' ? position : geometry.left, y1: axis === 'x' ? geometry.top : position,
            x2: axis === 'x' ? position : geometry.width - geometry.right, y2: axis === 'x' ? geometry.height - geometry.bottom : position, stroke: '#e3eaee'}));
          drawing.append(svgNode('text', {x: axis === 'x' ? position : geometry.left - 12, y: axis === 'x' ? geometry.height - geometry.bottom + 25 : position + 5,
            'text-anchor': axis === 'x' ? 'middle' : 'end', 'font-size': 12, fill: '#657a80'}, Number(value.toFixed(3)).toString()));
        }
        if (card.thresholds.checked) {
          const threshold = Number(card.record[axis === 'x' ? 'thresholdA' : 'thresholdB'] ?? response.genes[axis].threshold);
          for (const offset of [-0.5, 0, 0.5]) {
            const position = project(axis, threshold + offset);
            marks.append(svgNode('line', {x1: axis === 'x' ? position : geometry.left, y1: axis === 'x' ? geometry.top : position,
              x2: axis === 'x' ? position : geometry.width - geometry.right, y2: axis === 'x' ? geometry.height - geometry.bottom : position,
              stroke: '#087f8c', 'stroke-dasharray': offset === 0 ? '7 5' : '2 5', opacity: offset === 0 ? 0.8 : 0.4}));
          }
        }
      }
      if (raster) {
        marks.append(raster.element);
        raster.draw(samples, geometry, card.domain, sample => ({color: sample.color || '#0000FF', radius: 3.5, opacity: 1}));
      } else for (const sample of samples) {
        const point = svgNode('circle', {class: 'scientific-point', cx: project('x', sample.x), cy: project('y', sample.y), r: 3.5,
          fill: sample.color || '#0000FF', 'data-sample-id': sample.id, 'data-x': sample.x, 'data-y': sample.y});
        const description = `${sample.id} · ${response.genes.x.id}: ${sample.x} · ${response.genes.y.id}: ${sample.y}`;
        point.append(svgNode('title', {}, description));
        point.addEventListener('pointerenter', () => { card.status.textContent = description; });
        point.addEventListener('pointerleave', () => { card.status.textContent = hint; });
        marks.append(point);
      }
      drawing.append(marks);
      drawing.append(svgNode('line', {x1: geometry.left, y1: geometry.height - geometry.bottom, x2: geometry.width - geometry.right, y2: geometry.height - geometry.bottom, stroke: '#93a8ac'}));
      drawing.append(svgNode('line', {x1: geometry.left, y1: geometry.top, x2: geometry.left, y2: geometry.height - geometry.bottom, stroke: '#93a8ac'}));
      const labelSize = geometry.width < 400 ? 11 : 13;
      drawing.append(svgNode('text', {x: (geometry.left + geometry.width - geometry.right) / 2, y: geometry.height - 18, 'text-anchor': 'middle', 'font-size': labelSize, fill: '#18343c'}, `${response.genes.x.name} · ${response.genes.x.id}`));
      drawing.append(svgNode('text', {transform: `translate(17 ${(geometry.top + geometry.height - geometry.bottom) / 2}) rotate(-90)`, 'text-anchor': 'middle', 'font-size': labelSize, fill: '#18343c'}, `${response.genes.y.name} · ${response.genes.y.id}`));
    }

    function setDomain(bounds) {
      const domain = {};
      for (const axis of ['x', 'y']) {
        const requested = bounds[axis];
        if (!requested?.every(Number.isFinite) || requested[1] <= requested[0]) return;
        const fullSpan = full[axis][1] - full[axis][0];
        const requestedSpan = requested[1] - requested[0];
        const span = Math.max(fullSpan / 1000, Math.min(fullSpan, requestedSpan));
        const lower = Math.max(full[axis][0], Math.min(full[axis][1] - span, requested[0] + (requestedSpan - span) / 2));
        domain[axis] = span === fullSpan ? [...full[axis]] : [lower, lower + span];
      }
      card.domain = domain;
      draw();
    }

    function zoom(factor, pointer = null) {
      if (!Number.isFinite(factor) || factor <= 0) return;
      cancelDrag();
      const bounds = {};
      for (const axis of ['x', 'y']) {
        const current = card.domain[axis];
        const anchor = pointer ? unproject(axis, pointer[axis]) : (current[0] + current[1]) / 2;
        bounds[axis] = current.map(value => anchor + (value - anchor) * factor);
      }
      setDomain(bounds);
    }

    function reset() { cancelDrag(); card.domain = {x: [...full.x], y: [...full.y]}; draw(); card.status.textContent = hint; }
    function position(event) {
      const bounds = chart.getBoundingClientRect();
      const horizontal = (event.clientX - bounds.left) * geometry.width / bounds.width;
      const vertical = (event.clientY - bounds.top) * geometry.height / bounds.height;
      return {x: Math.max(geometry.left, Math.min(geometry.width - geometry.right, horizontal)),
        y: Math.max(geometry.top, Math.min(geometry.height - geometry.bottom, vertical)),
        inside: horizontal >= geometry.left && horizontal <= geometry.width - geometry.right && vertical >= geometry.top && vertical <= geometry.height - geometry.bottom};
    }
    let start = null;
    let pointerId = null;
    function cancelDrag() {
      start = null;
      brush.setAttribute('hidden', '');
      if (pointerId !== null && chart.hasPointerCapture(pointerId)) chart.releasePointerCapture(pointerId);
      pointerId = null;
    }
    chart.addEventListener('pointerdown', event => {
      const current = position(event);
      if (event.button !== 0 || !current.inside) return;
      cancelDrag();
      chart.focus({preventScroll: true});
      start = current;
      pointerId = event.pointerId;
      chart.setPointerCapture(event.pointerId);
    });
    chart.addEventListener('pointermove', event => {
      const current = position(event);
      if (!start) {
        if (raster) {
          const sample = current.inside ? raster.hitTest(current.x, current.y) : null;
          card.status.textContent = sample ? `${sample.id} · ${response.genes.x.id}: ${sample.x} · ${response.genes.y.id}: ${sample.y}` : hint;
        }
        return;
      }
      for (const [name, value] of Object.entries({x: Math.min(start.x, current.x), y: Math.min(start.y, current.y), width: Math.abs(current.x - start.x), height: Math.abs(current.y - start.y)})) brush.setAttribute(name, value);
      brush.removeAttribute('hidden');
    });
    chart.addEventListener('pointerup', event => {
      if (!start) return;
      const current = position(event);
      if (Math.abs(current.x - start.x) > 8 && Math.abs(current.y - start.y) > 8) {
        const boundsX = [unproject('x', start.x), unproject('x', current.x)].sort((left, right) => left - right);
        const boundsY = [unproject('y', start.y), unproject('y', current.y)].sort((left, right) => left - right);
        setDomain({x: boundsX, y: boundsY});
      }
      cancelDrag();
    });
    chart.addEventListener('pointercancel', cancelDrag);
    chart.addEventListener('lostpointercapture', cancelDrag);
    chart.addEventListener('pointerleave', () => { card.status.textContent = hint; });
    chart.addEventListener('wheel', event => {
      const pointer = position(event);
      if (!pointer.inside || !Number.isFinite(event.deltaY) || !event.deltaY) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? geometry.height - geometry.top - geometry.bottom : 1;
      const delta = Math.max(-1000, Math.min(1000, event.deltaY * unit));
      zoom(Math.exp(delta * 0.0015), pointer);
    }, {passive: false});
    chart.addEventListener('keydown', event => {
      const zoomIn = ['+', '='].includes(event.key) || event.code === 'NumpadAdd';
      const zoomOut = ['-', '−'].includes(event.key) || event.code === 'NumpadSubtract';
      const fit = ['Escape', '0', 'Home'].includes(event.key) || event.code === 'Numpad0';
      if (!zoomIn && !zoomOut && !fit) return;
      event.preventDefault();
      if (fit) reset(); else zoom(zoomOut ? 1.4 : 0.7);
    });
    card.thresholds.addEventListener('change', draw);
    function layout() {
      const width = Math.max(260, Math.round(card.plot.getBoundingClientRect().width));
      if (width === geometry.width) return;
      geometry.width = width;
      geometry.height = Math.round(Math.max(280, Math.min(620, width * 0.72)));
      geometry.left = width < 400 ? 60 : 76;
      chart.setAttribute('viewBox', `0 0 ${geometry.width} ${geometry.height}`);
      for (const [name, value] of Object.entries({x: geometry.left, y: geometry.top, width: geometry.width - geometry.left - geometry.right, height: geometry.height - geometry.top - geometry.bottom})) clipRectangle.setAttribute(name, value);
      draw();
    }
    card.resize = new ResizeObserver(layout);
    card.resize.observe(card.plot);
    layout();
    draw();
    card.download.disabled = false;
  }

  async function loadInteractive(card) {
    try {
      const response = await schedule(async () => {
        const query = new URLSearchParams({action: 'plot', compact: '1', ...parameters(card.record)});
        return plotTools.decode(await (await successful(await fetch(`api.php?${query}`, {signal: card.controller.signal}))).json());
      });
      if (card.host.isConnected) renderInteractive(card, response);
    } catch (error) { failure(card, error); }
  }

  function enhanceStatistics() {
    for (const row of results.querySelectorAll('.scientific-pair:not([data-enhanced])')) {
      const values = row.querySelector('.scientific-values');
      if (!values) continue;
      row.dataset.enhanced = 'true';
      const record = {id: document.getElementById('dataset').value, probeA: row.dataset.probeA, probeB: row.dataset.probeB,
        ...values.dataset};
      const cell = row.querySelector('.scientific-plot-cell');
      const card = makeCard(record, true, true);
      cell.replaceChildren(card.host);
      row.closest('table').classList.add('scientific-pair-table');
      loadInteractive(card);
    }
  }

  function showPlots(records) {
    results.replaceChildren();
    results.classList.add('scientific-plots-list');
    for (const values of records) {
      const card = makeCard({id: document.getElementById('dataset').value, probeA: values[0], nameA: values[1], probeB: values[2], nameB: values[3]}, false, false);
      results.append(card.host);
      loadStatic(card);
    }
    if (!records.length) results.append(node('p', '', 'No matching probe pairs were found. Check the gene symbols or probe IDs.'));
  }

  function cleanup() {
    for (const card of cards) {
      if (card.host.isConnected) continue;
      card.controller.abort();
      card.resize?.disconnect();
      for (const url of card.urls) URL.revokeObjectURL(url);
      cards.delete(card);
    }
  }

  function enhanceRelationships(settings = {}) {
    const command = new URLSearchParams(location.search).get('cmd');
    if (!['MiDReG', 'getCorr'].includes(command)) return;
    const correlation = command === 'getCorr';
    const countTable = results.querySelector('a[onclick^="updateRel("]')?.closest('table');
    if (!countTable || countTable.rows.length < 2) return;
    const labels = [...countTable.rows[0].cells].map(cell => cell.textContent.trim());
    const counts = [...countTable.rows[1].cells].map(cell => Number(cell.textContent.trim()));
    const single = labels.join('|') === 'norel|lohi|lolo|hihi|hilo|eqv|opo';
    const titles = ['No detected relationship', 'Low → High', 'Low → Low', 'High → High', 'High → Low', 'Equivalent', 'Opposite'];
    const queryTable = results.querySelector('table');
    const queries = queryTable === countTable ? [] : [...queryTable.rows].filter(row => row.cells.length >= 3);
    const best = queries.filter(row => row.cells[2].textContent.includes('Best ID'));
    const queryProbes = best.map(row => ({id: row.cells[0].textContent.trim(), name: row.cells[1].textContent.trim()}));
    if (!queryProbes.length) for (const axis of ['A', 'B']) {
      const id = countTable.dataset[`queryProbe${axis}`];
      if (id) queryProbes.push({id, name: countTable.dataset[`queryName${axis}`] || id});
    }
    const names = queryProbes.map(probe => probe.name || probe.id);
    const summary = node('section', 'scientific-relation-summary');
    summary.append(node('h3', '', `${correlation ? 'Correlation matches' : 'Boolean relationships'}${names.length ? ` for ${names.join(' + ')}` : ''}`));
    summary.append(node('p', 'scientific-query-ids', queryProbes.map(probe => probe.id).join(' · ')));
    const sthr = settings.sthr ?? countTable.dataset.sthr ?? document.getElementById('sthr').value;
    const pthr = settings.pthr ?? countTable.dataset.pthr ?? document.getElementById('pthr').value;
    summary.append(node('p', 'scientific-scan-settings', correlation ? `Pearson correlation scan · Pair-statistics settings: SThr ${sthr} · PThr ${pthr}` : `${single ? 'Single-gene' : 'Two-gene'} scan · SThr ${sthr} · PThr ${pthr}`));
    summary.append(node('p', 'scientific-relation-guide', correlation ? 'Open a correlation bin, filter its matching probes, then choose a probe for its plot and Boolean/correlation statistics. Bins use Pearson correlation, not Boolean-implication classes. Counts are returned probe IDs, not unique genes; legacy bins return at most 1,000 probes each.' : single ? 'Query gene → matching probe. Counts are probe IDs, not unique genes. Open a category, then choose a probe for its plot and statistics.' : 'Legacy two-gene categories and counts are preserved. Open a category, then choose a probe for its plots and statistics. Counts are probe IDs, not unique genes.'));
    countTable.before(summary);
    if (queries.length) {
      const details = node('details', 'scientific-query-details');
      details.append(node('summary', '', `Resolved query probes (${queries.length})`));
      queryTable.classList.add('scientific-query-probes');
      details.append(queryTable);
      summary.append(details);
    } else if (queryProbes.length) {
      const details = node('details', 'scientific-query-details');
      details.append(node('summary', '', `Resolved query probes (${queryProbes.length})`));
      const table = node('table', 'scientific-query-probes');
      const body = node('tbody');
      for (const probe of queryProbes) {
        const row = node('tr');
        row.append(node('td', '', probe.id), node('td', '', probe.name), node('td', '', 'Best ID for correlation'));
        body.append(row);
      }
      table.append(body);
      details.append(table);
      summary.append(details);
    }
    const grid = node('div', 'scientific-relation-grid');
    grid.setAttribute('aria-label', correlation ? 'Correlation coefficient bins' : 'Boolean relationship categories');
    let browsable = 0;
    for (const [index, label] of labels.entries()) {
      const panel = document.getElementById(`rel${index}`);
      const table = panel?.querySelector(':scope > table');
      if (!panel || !table) continue;
      const probes = [];
      for (const row of table.rows) {
        for (let column = 0; column + 1 < row.cells.length; column += 2) {
          const identifier = row.cells[column].querySelector('a')?.textContent.trim();
          if (identifier) probes.push({id: identifier, name: row.cells[column + 1].textContent.trim()});
        }
      }
      const control = button('', () => {
        window.updateRel(index);
        control.setAttribute('aria-expanded', String(getComputedStyle(panel).display !== 'none'));
        panel.querySelectorAll('.scientific-gene-button').forEach(candidate => candidate.setAttribute('aria-pressed', 'false'));
      });
      control.className = 'scientific-relation-card';
      control.dataset.category = String(index);
      control.dataset.legacyLabel = label;
      control.setAttribute('aria-controls', panel.id);
      control.setAttribute('aria-expanded', 'false');
      const title = correlation ? `Correlation ${label}` : single ? titles[index] : label;
      control.append(node('strong', 'scientific-relation-title', title));
      const count = node('span', 'scientific-relation-count', counts[index].toLocaleString());
      count.dataset.count = String(counts[index]);
      control.append(count, node('span', 'scientific-relation-code', `${correlation ? 'Legacy bin' : 'Legacy'}: ${label}`), node('span', 'scientific-relation-unit', 'probes'));
      control.disabled = !probes.length;
      if (!probes.length) control.title = counts[index] ? 'The legacy scan counts these probes but does not return a browsable list for this category.' : 'No probes matched this category at the selected thresholds.';
      grid.append(control);
      panel.classList.add('scientific-relation-panel');
      panel.setAttribute('aria-label', title);
      const header = node('div', 'scientific-gene-heading');
      header.append(node('h4', '', title));
      const shown = node('span', 'scientific-gene-count');
      shown.setAttribute('aria-live', 'polite');
      header.append(shown);
      const tools = node('div', 'scientific-gene-tools');
      const filterLabel = node('label', 'scientific-gene-filter');
      filterLabel.append(node('span', '', 'Filter matching probes'));
      const filter = node('input');
      filter.type = 'search';
      filter.placeholder = 'Gene symbol or probe ID';
      filterLabel.append(filter);
      const copyField = node('textarea', 'scientific-copy-probes');
      copyField.readOnly = true;
      copyField.rows = 3;
      copyField.hidden = true;
      copyField.setAttribute('aria-label', 'Matching probe IDs for copying');
      const note = node('p', 'scientific-copy-note');
      note.setAttribute('role', 'status');
      const list = node('div', 'scientific-related-grid');
      const candidates = probes.map(probe => {
        const candidate = button('', () => {
          list.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === candidate)));
          window.updateResult(index, probe.id);
        });
        candidate.className = 'scientific-gene-button';
        candidate.dataset.probeId = probe.id;
        candidate.setAttribute('aria-pressed', 'false');
        candidate.append(node('strong', '', probe.name || 'Unannotated probe'), node('span', '', probe.id));
        list.append(candidate);
        return {probe, candidate};
      });
      const visible = () => candidates.filter(item => !item.candidate.hidden);
      const copy = button('Copy probe IDs', async () => {
        const selected = visible().map(item => item.probe.id);
        const text = selected.join(' ');
        try {
          await navigator.clipboard.writeText(text);
          note.textContent = `${selected.length} probe IDs copied. Paste them into Gene B to investigate the list.`;
          copyField.hidden = true;
        } catch {
          copyField.value = text;
          copyField.hidden = false;
          copyField.focus();
          copyField.select();
          note.textContent = 'Copy the selected IDs with Ctrl+C or ⌘C, then paste them into Gene B.';
        }
      });
      const empty = node('p', 'scientific-empty-probes', 'No probes match this filter. Try another gene symbol or ID.');
      const update = () => {
        const query = filter.value.trim().toLowerCase();
        for (const item of candidates) item.candidate.hidden = !`${item.probe.id} ${item.probe.name}`.toLowerCase().includes(query);
        const count = visible().length;
        shown.textContent = `${count} of ${probes.length} probes`;
        copy.disabled = !count;
        empty.hidden = count > 0;
        copyField.hidden = true;
        note.textContent = '';
      };
      filter.addEventListener('input', update);
      tools.append(filterLabel, copy);
      table.replaceWith(header, tools, note, copyField, list, empty);
      update();
      browsable += probes.length;
    }
    countTable.replaceWith(grid);
    if (single && counts[0]) summary.append(node('p', 'scientific-relation-note', 'No detected relationship is a count-only legacy category; its probe list is not returned.'));
    if (!browsable) grid.after(node('p', 'scientific-empty-probes', correlation ? 'No browsable correlation matches were returned. Check the query gene or choose another dataset.' : 'No browsable relationships were returned at these thresholds. For a one-gene scan, leave Gene B empty. You can inspect the query probes or adjust SThr/PThr in Analysis settings.'));
  }

  const observer = new MutationObserver(() => { cleanup(); enhanceRelationships(); enhanceStatistics(); });
  observer.observe(results, {childList: true, subtree: true});
  const resize = new ResizeObserver(() => {
    if (window.parent === window) return;
    window.parent.postMessage({type: 'hegemon:result-height', datasetId: document.getElementById('dataset').value,
      height: Math.ceil(document.querySelector('.content').getBoundingClientRect().height) + 20}, location.origin);
  });
  resize.observe(document.querySelector('.content'));
  window.addEventListener('pagehide', () => {
    observer.disconnect();
    resize.disconnect();
    for (const card of cards) {
      card.controller.abort();
      card.resize?.disconnect();
      for (const url of card.urls) URL.revokeObjectURL(url);
    }
  });
  window.HegemonScientificResults = {showPlots, enhanceRelationships};
  enhanceRelationships();
  enhanceStatistics();
})();
