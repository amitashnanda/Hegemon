(() => {
  'use strict';

  const element = id => document.getElementById(id);
  const search = window.HegemonDatasetSearch;
  const defaultGenes = {a: 'TYROBP', b: 'FCER1G'};
  const palette = ['#6c5ce7', '#149d91', '#e58137', '#d3588e', '#447ed1', '#729d35', '#9b6bca', '#bf5b45'];
  const groupPalette = ['#d55e00', '#b5179e', '#007f8c', '#cc4263', '#665191', '#8c6d00', '#4c6a92', '#975a16'];
  const geometry = {width: 760, height: 520, left: 76, right: 28, top: 28, bottom: 65};
  const state = {datasets: [], dataset: null, plot: null, probes: {a: [], b: []}, groups: [], clinical: new Map(), clinicalField: '', clinicalColors: new Map(), clinicalSelection: '', clinicalRange: null, clinicalExtent: null, tableSelection: new Set(), domain: null, fullDomain: null, mode: 'brush', tab: 'scatter', controllers: new Map(), generation: 0, nextGroup: 1, advancedContext: '', scientificTool: 'topGenes', groupTool: '', key: new URLSearchParams(location.search).get('key') || '', analysisUrl: ''};
  const scientificCommands = {topGenes: 'callTopGenes', getIDs: 'callGetIDs', getPlots: 'callGetPlots', getStats: 'callGetStats', MiDReG: 'callMiDReG', getCorr: 'callCorr', getInfo: 'callInfo'};
  const scientificDescriptions = {
    topGenes: 'Legacy ranking selects variable probes using dynamic range and standard deviation. Set Number of genes in Analysis settings (default 10).',
    getIDs: 'Resolve symbols or space-separated gene/ID lists to probes and aliases. The legacy best probe is shown in bold.',
    getPlots: 'Large static plots for every matching probe pair. Download PNG, JPG, PDF, or SVG, or choose a pair for interactive exploration.',
    getStats: 'Interactive expression plots alongside unchanged legacy Boolean and correlation statistics. SThr and PThr come from Analysis settings.',
    MiDReG: 'Start with Gene A only and leave Gene B empty for a one-gene scan. Open a Boolean category, then click a gene for its interactive plot and statistics.',
    getCorr: 'Find genes binned by correlation to your input gene. Open a coefficient bin, then click a gene for its interactive plot and statistics.',
    getInfo: 'The legacy getinfo tool: dynamic range, minimum, mean, StepMiner threshold, maximum, and standard deviation for your probes.'
  };
  const svgNamespace = 'http://www.w3.org/2000/svg';
  let drag = null;
  let datasetSearch = null;
  let searchLibraryLoaded = false;

  function announce(message, error = false) {
    const status = element('app-status');
    status.textContent = message;
    status.classList.toggle('error', error);
    status.hidden = !message;
  }

  function report(error) {
    if (error && error.name !== 'AbortError') announce(error.message || String(error), true);
  }

  async function request(channel, action, parameters = {}) {
    state.controllers.get(channel)?.abort();
    const controller = new AbortController();
    state.controllers.set(channel, controller);
    const query = new URLSearchParams({action, ...(state.key ? {key: state.key} : {}), ...parameters});
    try {
      const response = await fetch(`api.php?${query}`, {signal: controller.signal, headers: {Accept: 'application/json'}});
      let data;
      try { data = await response.json(); } catch { throw new Error('The data service returned an unreadable response. Check the server logs or try again.'); }
      if (!response.ok || data.ok === false || data.error) throw new Error(typeof data.error === 'string' ? data.error : data.error?.message || data.message || `Request failed (${response.status}).`);
      return data;
    } finally {
      if (state.controllers.get(channel) === controller) state.controllers.delete(channel);
    }
  }

  function option(select, value, label, selected = false) {
    const item = document.createElement('option');
    item.value = value;
    item.textContent = label;
    item.selected = selected;
    select.append(item);
  }

  function setOptions(select, placeholder) {
    select.replaceChildren();
    option(select, '', placeholder);
  }

  function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
  function numeric(value) { return finite(value) ? new Intl.NumberFormat('en', {maximumFractionDigits: 3}).format(value) : '—'; }
  function datasetKeys(dataset) { return search.keys(dataset); }
  function available(dataset) { return search.available(dataset); }

  function parseDatasetSource(value) {
    const source = new DOMParser().parseFromString(String(value || ''), 'text/html');
    const text = source.body.textContent.trim();
    const links = new Map();
    function add(label, href) {
      try {
        const url = new URL(href);
        if (!['http:', 'https:'].includes(url.protocol)) return;
        if (!links.has(url.href)) links.set(url.href, {label: label || url.hostname, href: url.href});
      } catch {}
    }
    for (const accession of text.match(/\bGSE\d+\b/gi) || []) {
      const identifier = accession.toUpperCase();
      add(identifier, `https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=${identifier}`);
    }
    for (const anchor of source.querySelectorAll('a[href]')) add(anchor.textContent.trim(), anchor.getAttribute('href'));
    for (const href of text.match(/https?:\/\/[^\s<>"']+/gi) || []) add('', href.replace(/[),.;]+$/, ''));
    return {text, links: [...links.values()]};
  }

  function renderDatasetInformation(dataset, fields = null) {
    const source = parseDatasetSource(dataset.source);
    const container = element('dataset-source');
    container.replaceChildren();
    if (source.links.length) {
      const label = document.createElement('span');
      label.textContent = 'Source:';
      container.append(label);
      for (const link of source.links) {
        const anchor = document.createElement('a');
        anchor.className = 'dataset-source-link';
        anchor.textContent = `${link.label} ↗`;
        anchor.href = link.href;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        anchor.setAttribute('aria-label', `Open dataset source ${link.label} in a new tab`);
        container.append(anchor);
      }
    } else container.textContent = source.text || 'Source information is not available for this study.';
    element('dataset-information').hidden = false;
    element('dataset-information-name').textContent = dataset.name;
    element('dataset-information-id').textContent = dataset.id;
    element('dataset-information-categories').textContent = datasetKeys(dataset).join(', ') || 'Not specified';
    element('dataset-information-clinical').textContent = fields === null ? 'Loading fields…' : `${fields.length} fields · ${dataset.sampleCount ?? '—'} samples`;
    element('dataset-information-source').textContent = source.text || 'Not specified';
    element('dataset-samples').textContent = `${dataset.sampleCount ?? '—'} samples`;
  }

  function renderCatalogue() {
    datasetSearch.setDatasets(state.datasets);
    datasetSearch.setSelected(state.dataset?.id || '');
  }

  function renderDatasetOptions(matches) {
    setOptions(element('dataset-select'), matches.length ? 'Select a dataset to begin' : 'No datasets available for this study type');
    for (const dataset of matches) {
      option(element('dataset-select'), dataset.id, `${dataset.name}${dataset.sampleCount == null ? '' : ` (n = ${dataset.sampleCount})`}`, state.dataset?.id === dataset.id);
      element('dataset-select').lastElementChild.disabled = !available(dataset);
    }
  }

  async function loadSearchLibrary(key = '') {
    if (!key && searchLibraryLoaded) return;
    try {
      const response = await request('search-catalogue', 'studies', {key: key || search.catalogueKey()});
      state.datasets = [...new Map([...(response.studies || []), ...state.datasets].map(dataset => [dataset.id, dataset])).values()];
      if (!key) searchLibraryLoaded = true;
      renderCatalogue();
    } catch (error) {
      if (error.name !== 'AbortError') datasetSearch.setError(error.message || 'The study registry could not be loaded. Close and reopen search to retry.');
      throw error;
    }
  }

  async function copyAnalysisLink() {
    if (!state.dataset) return;
    const genes = {};
    for (const axis of ['a', 'b']) genes[axis.toUpperCase()] = element(`probe-${axis}`).value || element(`gene-${axis}`).value.trim();
    const url = search.workspaceUrl(state.dataset, {key: state.key, genes});
    element('analysis-link-value').value = url;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(url);
      element('analysis-link-field').hidden = true;
      announce('Dataset and gene link copied. Open it, then click Explore expression. Groups, patient highlights, and zoom are not saved.');
    } catch {
      element('analysis-link-field').hidden = false;
      element('analysis-link-value').focus();
      element('analysis-link-value').select();
      announce('Copy the selected dataset and gene link with Command+C or Ctrl+C. Open it, then click Explore expression.');
    }
  }

  function updateContext() {
    if (!state.dataset) return;
    const probeA = state.plot?.genes?.x?.id || element('probe-a').value || element('gene-a').value;
    const probeB = state.plot?.genes?.y?.id || element('probe-b').value || element('gene-b').value;
    const browserParameters = new URLSearchParams(location.search);
    if (state.key) browserParameters.set('key', state.key);
    else browserParameters.delete('key');
    browserParameters.set('id', state.dataset.id);
    browserParameters.set('A', probeA);
    browserParameters.set('B', probeB);
    history.replaceState(null, '', `${location.pathname}?${browserParameters}${location.hash}`);
    if (state.tab === 'advanced') loadAdvanced();
  }

  function groupSnapshot() {
    return state.groups.map(group => ({name: group.name, samples: [...group.samples], color: group.color, checked: group.checked}));
  }

  function syncAdvanced() {
    const frame = element('advanced-frame');
    if (frame.getAttribute('src') && state.dataset) frame.contentWindow.postMessage({type: 'hegemon:groups', datasetId: state.dataset.id, groups: groupSnapshot()}, location.origin);
  }

  function loadAdvanced() {
    if (!state.dataset) return;
    const plottedPair = state.scientificTool === 'groups' ? state.plot?.genes : null;
    const parameters = new URLSearchParams({id: state.dataset.id,
      A: plottedPair?.x.id || element('probe-a').value || element('gene-a').value,
      B: plottedPair?.y.id || element('probe-b').value || element('gene-b').value,
      cmd: state.scientificTool === 'groups' ? 'explore' : state.scientificTool,
      embed: '1', ...(state.key ? {key: state.key} : {}),
      ...(state.scientificTool === 'groups' ? {groupTool: state.groupTool} : {})});
    const url = new URL(`explore.php?${parameters}`, location.href).href;
    const frame = element('advanced-frame');
    if (state.advancedContext !== url) {
      frame.src = url;
      frame.hidden = false;
      state.advancedContext = url;
    } else {
      syncAdvanced();
      executeScientificTool();
    }
  }

  function executeScientificTool() {
    const frame = element('advanced-frame');
    const page = frame.contentWindow;
    const document = frame.contentDocument;
    if (!document?.getElementById('Ab')) return;
    const plottedPair = state.scientificTool === 'groups' ? state.plot?.genes : null;
    document.getElementById('Ab').value = plottedPair?.x.id || (['getIDs', 'getPlots'].includes(state.scientificTool) ? element('gene-a').value : element('probe-a').value || element('gene-a').value);
    document.getElementById('Bb').value = plottedPair?.y.id || (['getIDs', 'getPlots'].includes(state.scientificTool) ? element('gene-b').value : element('probe-b').value || element('gene-b').value);
    for (const [target, source] of [['arg1', 'number-genes'], ['sthr', 'scientific-sthr'], ['pthr', 'scientific-pthr'], ['CT', 'scientific-ct']]) document.getElementById(target).value = element(source).value;
    if (document.getElementById('clinical0')) document.getElementById('clinical0').value = element('clinical-field').value;
    if (state.scientificTool === 'groups') return;
    page.updateTextBox = async (probeA, nameA, probeB, nameB) => {
      element('gene-a').value = probeA;
      element('gene-b').value = probeB;
      try {
        await Promise.all([lookupGene('a'), lookupGene('b')]);
        switchTab('scatter');
        markScientificTool('Explore');
        await loadPlot();
      } catch (error) { report(error); }
    };
    const command = scientificCommands[state.scientificTool];
    if (command && typeof page[command] === 'function') page[command]();
  }

  function markScientificTool(tool) {
    document.querySelectorAll('[data-scientific-tool]').forEach(button => {
      if (button.dataset.scientificTool === tool) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
  }

  function cancelChartDrag() {
    const chart = element('scatter-chart');
    const pointerId = drag?.pointerId;
    drag = null;
    element('chart-brush').setAttribute('hidden', '');
    chart.classList.remove('is-panning');
    if (pointerId !== undefined && chart.hasPointerCapture(pointerId)) chart.releasePointerCapture(pointerId);
  }

  function resetGeneInputs() {
    state.probes = {a: [], b: []};
    for (const [axis, gene] of Object.entries(defaultGenes)) {
      element(`gene-${axis}`).value = gene;
      setOptions(element(`probe-${axis}`), state.dataset ? 'Finding default probes…' : 'Choose a study first');
    }
    updatePlotButton();
  }

  async function openScientificTool(tool) {
    if (tool === 'Clear') {
      const dataset = state.dataset;
      for (const controller of state.controllers.values()) controller.abort();
      state.controllers.clear();
      cancelChartDrag();
      resetGeneInputs();
      state.groups = [];
      state.nextGroup = 1;
      state.advancedContext = '';
      state.scientificTool = 'topGenes';
      state.groupTool = '';
      element('advanced-frame').removeAttribute('src');
      element('advanced-frame').hidden = true;
      element('sample-search').value = '';
      element('threshold-toggle').checked = true;
      element('clinical-field').value = '';
      await loadClinical();
      element('clinical-range').closest('.clinical-range').hidden = true;
      clearPlot();
      refreshGroups();
      switchTab('scatter');
      element('brush-mode').click();
      markScientificTool('Explore');
      const parameters = new URLSearchParams(location.search);
      parameters.delete('tool');
      parameters.set('A', defaultGenes.a);
      parameters.set('B', defaultGenes.b);
      history.replaceState(null, '', `${location.pathname}?${parameters}${location.hash}`);
      if (dataset) {
        const generation = state.generation + 1;
        await chooseDataset(dataset);
        if (generation !== state.generation) return;
      } else state.generation++;
      announce('Results and groups cleared. Gene A is TYROBP and Gene B is FCER1G. Click Explore expression to plot them.');
      return;
    }
    if (!state.dataset) { announce('Select a dataset first.'); return; }
    markScientificTool(tool);
    if (tool === 'Explore') {
      switchTab('scatter');
      if (!element('probe-a').value || !element('probe-b').value) await Promise.all([lookupGene('a'), lookupGene('b')]);
      await loadPlot();
      return;
    }
    state.scientificTool = tool;
    element('scientific-result-title').textContent = [...document.querySelectorAll('[data-scientific-tool]')].find(button => button.dataset.scientificTool === tool)?.textContent || 'Analysis results';
    element('scientific-result-description').textContent = scientificDescriptions[tool] || 'Results use the selected dataset, probes, and analysis settings. All tools stay in this workspace.';
    switchTab('advanced');
  }

  function clearPlot() {
    state.plot = null;
    state.domain = null;
    state.fullDomain = null;
    state.tableSelection.clear();
    for (const identifier of ['chart-grid', 'chart-thresholds', 'chart-points', 'chart-axes']) element(identifier).replaceChildren();
    element('plot-heading').textContent = 'Gene expression';
    element('chart-title').textContent = 'Gene expression scatterplot';
    element('scatter-chart').setAttribute('hidden', '');
    element('chart-empty').hidden = false;
    element('summary-metrics').hidden = true;
    element('server-plot-link').hidden = true;
    element('download-plot').disabled = true;
    element('export-samples').disabled = true;
    element('sample-table-body').replaceChildren();
    element('select-all-samples').checked = false;
    element('table-group-button').disabled = true;
    element('sample-table-context').textContent = 'Load expression data to inspect the samples.';
    element('sample-tooltip').hidden = true;
    element('plot-legend').hidden = true;
    element('selection-summary').hidden = true;
    element('analysis-results').hidden = true;
    if (state.analysisUrl) URL.revokeObjectURL(state.analysisUrl);
    state.analysisUrl = '';
  }

  async function chooseDataset(dataset, selection = {}) {
    if (!available(dataset)) { announce('This dataset’s processed files are unavailable on this server.', true); return; }
    const generation = ++state.generation;
    cancelChartDrag();
    for (const controller of state.controllers.values()) controller.abort();
    state.controllers.clear();
    state.key = search.contextKey(dataset, selection.key || state.key);
    const parameters = new URLSearchParams(location.search);
    if (state.key) parameters.set('key', state.key);
    else parameters.delete('key');
    parameters.set('category', search.categoryLabel(state.key));
    parameters.set('id', dataset.id);
    if (selection.genes) {
      parameters.delete('tool');
      for (const axis of ['a', 'b']) if (Object.hasOwn(selection.genes, axis.toUpperCase())) element(`gene-${axis}`).value = selection.genes[axis.toUpperCase()];
    }
    history.replaceState(null, '', `${location.pathname}?${parameters}${location.hash}`);
    element('workspace-category').textContent = search.categoryLabel(state.key);
    state.dataset = dataset;
    element('copy-analysis-link').disabled = true;
    element('analysis-link-field').hidden = true;
    document.body.classList.add('has-dataset');
    state.groups = [];
    state.nextGroup = 1;
    state.clinical = new Map();
    state.clinicalField = '';
    state.clinicalColors = new Map();
    state.clinicalSelection = '';
    state.clinicalRange = null;
    state.clinicalExtent = null;
    element('clinical-legend').hidden = true;
    state.probes = {a: [], b: []};
    for (const axis of ['a', 'b']) {
      setOptions(element(`probe-${axis}`), 'Loading probes…');
      element(`probe-${axis}`).disabled = true;
    }
    state.advancedContext = '';
    state.scientificTool = 'topGenes';
    state.groupTool = '';
    markScientificTool('Explore');
    switchTab('scatter');
    element('advanced-frame').removeAttribute('src');
    element('advanced-frame').hidden = true;
    clearPlot();
    element('sample-search').value = '';
    element('plot-button').textContent = 'Explore expression →';
    element('chart-container').setAttribute('aria-busy', 'false');
    renderGroups();
    renderCatalogue();
    element('dataset-id').textContent = dataset.id;
    element('dataset-name').textContent = dataset.name;
    element('dataset-information').open = false;
    document.querySelector('.dataset-browser').open = false;
    renderDatasetInformation(dataset);
    element('clinical-field').disabled = true;
    element('clinical-value').disabled = true;
    element('clinical-group-button').disabled = true;
    element('clinical-range').disabled = true;
    element('clinical-range-button').disabled = true;
    element('clinical-range').value = '';
    element('clinical-range').closest('.clinical-range').hidden = true;
    element('plot-button').disabled = true;
    setOptions(element('clinical-field'), 'Loading clinical fields…');
    setOptions(element('clinical-value'), 'Choose a field');
    announce(`Loading ${dataset.name}…`);
    const details = await request('dataset', 'dataset', {id: dataset.id});
    if (generation !== state.generation) return;
    state.dataset = {...dataset, ...details.dataset};
    state.datasets = state.datasets.map(candidate => candidate.id === dataset.id ? state.dataset : candidate);
    element('copy-analysis-link').disabled = false;
    const fields = details.clinicalFields || [];
    renderDatasetInformation(state.dataset, fields);
    setOptions(element('clinical-field'), fields.length ? 'Choose clinical information' : 'No clinical metadata');
    for (const field of fields) option(element('clinical-field'), String(field.id), field.name);
    element('clinical-field').disabled = fields.length === 0;
    element('clinical-note').textContent = fields.length ? 'Choose patient information to color the plot. Select a value to highlight its samples.' : 'Clinical metadata is unavailable for this study.';
    await Promise.all([lookupGene('a'), lookupGene('b')]);
    if (generation !== state.generation) return;
    updateContext();
    announce(element('probe-a').value && element('probe-b').value ? 'Dataset information loaded. Click Explore expression to plot the selected probes.' : 'Dataset information loaded. Find a matching probe for each gene, then click Explore expression.');
    const initialTool = new URLSearchParams(location.search).get('tool');
    if (scientificCommands[initialTool]) await openScientificTool(initialTool);
  }

  function updatePlotButton() {
    element('plot-button').disabled = !state.dataset || !element('probe-a').value || !element('probe-b').value;
    element('probe-context').textContent = `${state.probes.a.length} probe${state.probes.a.length === 1 ? '' : 's'} for A · ${state.probes.b.length} probe${state.probes.b.length === 1 ? '' : 's'} for B. Choose the measurements to compare.`;
  }

  async function lookupGene(axis) {
    if (!state.dataset) return;
    const query = element(`gene-${axis}`).value.trim();
    const select = element(`probe-${axis}`);
    const generation = state.generation;
    state.probes[axis] = [];
    setOptions(select, query ? 'Finding probes…' : 'Enter a gene symbol or probe ID');
    select.disabled = true;
    updatePlotButton();
    if (!query) return;
    const button = element(`lookup-${axis}`);
    button.disabled = true;
    try {
      const response = await request(`gene-${axis}`, 'genes', {id: state.dataset.id, q: query});
      if (generation !== state.generation || element(`gene-${axis}`).value.trim() !== query) return;
      state.probes[axis] = response.genes || [];
      setOptions(select, state.probes[axis].length ? 'Choose a probe' : `No probes match “${query}”`);
      state.probes[axis].forEach((probe, index) => option(select, probe.id, `${probe.id} · ${probe.name || query}${probe.description ? ` — ${probe.description}` : ''}`, index === 0));
      select.disabled = !state.probes[axis].length;
      if (!state.probes[axis].length) announce(`No probes match Gene ${axis.toUpperCase()} “${query}”. Try a different symbol or an exact probe ID.`, true);
    } finally {
      button.disabled = false;
      updatePlotButton();
    }
  }

  async function loadPlot() {
    if (!state.dataset || !element('probe-a').value || !element('probe-b').value) return;
    switchTab('scatter');
    markScientificTool('Explore');
    const generation = state.generation;
    const button = element('plot-button');
    button.disabled = true;
    button.textContent = 'Loading expression…';
    element('chart-container').setAttribute('aria-busy', 'true');
    announce('Reading the selected expression rows…');
    try {
      const response = await request('plot', 'plot', {id: state.dataset.id, geneA: element('probe-a').value, geneB: element('probe-b').value});
      if (generation !== state.generation) return;
      state.plot = response;
      state.plot.samples = (response.samples || []).map(sample => ({id: String(sample.id), x: sample.x, y: sample.y, color: sample.color, hasSurvival: sample.hasSurvival}));
      const paired = state.plot.samples.filter(sample => finite(sample.x) && finite(sample.y));
      state.tableSelection.clear();
      if (!paired.length) {
        clearPlot();
        announce('These probes have no paired numeric measurements. Choose another probe pair.', true);
        return;
      }
      const valuesX = paired.map(sample => sample.x);
      const valuesY = paired.map(sample => sample.y);
      state.fullDomain = {x: [Math.min(...valuesX) - 0.5, Math.max(...valuesX) + 0.5], y: [Math.min(...valuesY) - 0.5, Math.max(...valuesY) + 0.5]};
      state.domain = {x: [...state.fullDomain.x], y: [...state.fullDomain.y]};
      element('chart-empty').hidden = true;
      element('scatter-chart').removeAttribute('hidden');
      element('download-plot').disabled = false;
      element('export-samples').disabled = false;
      element('summary-metrics').hidden = false;
      element('plot-heading').textContent = `${response.genes.x.name || response.genes.x.id} × ${response.genes.y.name || response.genes.y.id}`;
      element('chart-title').textContent = `${state.dataset.name}: ${response.genes.x.id} versus ${response.genes.y.id}`;
      element('metric-paired').textContent = paired.length;
      element('metric-correlation').textContent = numeric(correlation(paired));
      element('metric-threshold-a').textContent = numeric(response.genes.x.threshold);
      element('metric-threshold-b').textContent = numeric(response.genes.y.threshold);
      element('server-plot-link').hidden = !response.plotUrl;
      if (response.plotUrl) element('server-plot-link').href = response.plotUrl;
      renderChart();
      renderSampleTable();
      renderGroups();
      element('clinical-group-button').disabled = !state.clinicalSelection;
      element('clinical-range-button').disabled = element('clinical-range').disabled;
      updateContext();
      announce(`${paired.length} paired samples loaded${paired.length !== state.plot.samples.length ? `; ${state.plot.samples.length - paired.length} samples have missing measurements` : ''}. Drag a rectangle to create a group.`);
    } finally {
      if (generation === state.generation) {
        button.textContent = 'Explore expression →';
        updatePlotButton();
        element('chart-container').setAttribute('aria-busy', 'false');
      }
    }
  }

  function correlation(samples) {
    const meanX = samples.reduce((sum, sample) => sum + sample.x, 0) / samples.length;
    const meanY = samples.reduce((sum, sample) => sum + sample.y, 0) / samples.length;
    let covariance = 0;
    let varianceX = 0;
    let varianceY = 0;
    for (const sample of samples) {
      covariance += (sample.x - meanX) * (sample.y - meanY);
      varianceX += (sample.x - meanX) ** 2;
      varianceY += (sample.y - meanY) ** 2;
    }
    return varianceX && varianceY ? covariance / Math.sqrt(varianceX * varianceY) : null;
  }

  function svgNode(tag, attributes = {}, text = '') {
    const node = document.createElementNS(svgNamespace, tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
    if (text) node.textContent = text;
    return node;
  }

  function scaleX(value) { return geometry.left + (value - state.domain.x[0]) / (state.domain.x[1] - state.domain.x[0]) * (geometry.width - geometry.left - geometry.right); }
  function scaleY(value) { return geometry.height - geometry.bottom - (value - state.domain.y[0]) / (state.domain.y[1] - state.domain.y[0]) * (geometry.height - geometry.top - geometry.bottom); }
  function invertX(value) { return state.domain.x[0] + (value - geometry.left) / (geometry.width - geometry.left - geometry.right) * (state.domain.x[1] - state.domain.x[0]); }
  function invertY(value) { return state.domain.y[0] + (geometry.height - geometry.bottom - value) / (geometry.height - geometry.top - geometry.bottom) * (state.domain.y[1] - state.domain.y[0]); }

  function renderChart() {
    if (!state.plot || !state.domain) return;
    const grid = element('chart-grid');
    const axes = element('chart-axes');
    const points = element('chart-points');
    const thresholds = element('chart-thresholds');
    grid.replaceChildren();
    axes.replaceChildren();
    points.replaceChildren();
    thresholds.replaceChildren();
    const plotRight = geometry.width - geometry.right;
    const plotBottom = geometry.height - geometry.bottom;
    for (let tick = 0; tick <= 5; tick++) {
      const valueX = state.domain.x[0] + (state.domain.x[1] - state.domain.x[0]) * tick / 5;
      const valueY = state.domain.y[0] + (state.domain.y[1] - state.domain.y[0]) * tick / 5;
      const coordinateX = scaleX(valueX);
      const coordinateY = scaleY(valueY);
      grid.append(svgNode('line', {x1: coordinateX, y1: geometry.top, x2: coordinateX, y2: plotBottom, class: 'grid-line'}), svgNode('line', {x1: geometry.left, y1: coordinateY, x2: plotRight, y2: coordinateY, class: 'grid-line'}));
      axes.append(svgNode('text', {x: coordinateX, y: plotBottom + 23, 'text-anchor': 'middle', class: 'tick-label'}, numeric(valueX)), svgNode('text', {x: geometry.left - 12, y: coordinateY + 4, 'text-anchor': 'end', class: 'tick-label'}, numeric(valueY)));
    }
    axes.append(svgNode('line', {x1: geometry.left, y1: plotBottom, x2: plotRight, y2: plotBottom, class: 'axis-line'}), svgNode('line', {x1: geometry.left, y1: geometry.top, x2: geometry.left, y2: plotBottom, class: 'axis-line'}));
    axes.append(svgNode('text', {x: (geometry.left + plotRight) / 2, y: geometry.height - 13, 'text-anchor': 'middle', class: 'axis-title'}, `${state.plot.genes.x.name || state.plot.genes.x.id} · ${state.plot.genes.x.id}`));
    axes.append(svgNode('text', {transform: `translate(19 ${(geometry.top + plotBottom) / 2}) rotate(-90)`, 'text-anchor': 'middle', class: 'axis-title'}, `${state.plot.genes.y.name || state.plot.genes.y.id} · ${state.plot.genes.y.id}`));
    if (element('threshold-toggle').checked) {
      for (const [axis, gene] of [['x', state.plot.genes.x], ['y', state.plot.genes.y]]) {
        for (const [kind, value] of [['threshold', gene.threshold], ['bound', gene.low], ['bound', gene.high]]) {
          if (!finite(value) || value < state.domain[axis][0] || value > state.domain[axis][1]) continue;
          thresholds.append(svgNode('line', axis === 'x' ? {x1: scaleX(value), x2: scaleX(value), y1: geometry.top, y2: plotBottom, class: `threshold-line ${kind}`} : {x1: geometry.left, x2: plotRight, y1: scaleY(value), y2: scaleY(value), class: `threshold-line ${kind}`}));
        }
      }
    }
    const colors = new Map();
    for (const group of state.groups.filter(group => group.checked)) for (const sampleId of group.samples) colors.set(sampleId, group.color);
    const clinicalActive = state.clinicalField && state.clinical.size > 0;
    const clinicalFiltered = clinicalActive && (state.clinicalSelection !== '' || state.clinicalRange !== null);
    const groupFocus = colors.size > 0;
    const fragment = document.createDocumentFragment();
    for (const sample of state.plot.samples) {
      if (!finite(sample.x) || !finite(sample.y) || sample.x < state.domain.x[0] || sample.x > state.domain.x[1] || sample.y < state.domain.y[0] || sample.y > state.domain.y[1]) continue;
      const selected = colors.has(sample.id);
      const value = state.clinical.get(sample.id) || '';
      const highlighted = clinicalActive && matchesClinical(value);
      const color = groupFocus && !selected ? '#b8c2c7' : clinicalActive ? state.clinicalColors.get(value) || '#a5b1b9' : colors.get(sample.id) || sample.color;
      const opacity = groupFocus ? selected ? clinicalFiltered && !highlighted ? 0.42 : 1 : 0.2 : clinicalFiltered ? highlighted ? 1 : 0.13 : 0.78;
      const circle = svgNode('circle', {cx: scaleX(sample.x), cy: scaleY(sample.y), r: groupFocus ? selected ? 5.2 : 2.8 : clinicalFiltered && highlighted ? 4.4 : 3.4, fill: color, opacity, stroke: groupFocus && selected ? '#18343c' : 'none', 'stroke-width': groupFocus && selected ? 1.2 : 0, 'data-sample-id': sample.id, 'data-group-selected': String(selected), 'data-clinical-highlight': String(Boolean(clinicalFiltered && highlighted)), class: 'sample-point'});
      circle.append(svgNode('title', {}, `${sample.id}: ${numeric(sample.x)}, ${numeric(sample.y)}`));
      fragment.append(circle);
    }
    points.append(fragment);
    const focusSummary = element('selection-summary');
    focusSummary.hidden = !groupFocus;
    focusSummary.textContent = groupFocus ? `${colors.size} sample IDs in checked groups · selected points are larger and outlined; other points are faded gray. Uncheck all groups to restore population colors.` : '';
    const legend = element('plot-legend');
    legend.replaceChildren();
    legend.hidden = Boolean(clinicalActive || colors.size);
    for (const population of state.plot.defaultColors || []) {
      const count = state.plot.samples.filter(sample => sample.color === population.color && finite(sample.x) && finite(sample.y)).length;
      const label = document.createElement('span');
      const swatch = document.createElement('span');
      swatch.className = 'clinical-swatch';
      swatch.style.backgroundColor = population.color;
      label.append(swatch, document.createTextNode(`${population.label} · ${count}`));
      legend.append(label);
    }
  }

  function chartPosition(event) {
    const rectangle = element('scatter-chart').getBoundingClientRect();
    const horizontal = (event.clientX - rectangle.left) / rectangle.width * geometry.width;
    const vertical = (event.clientY - rectangle.top) / rectangle.height * geometry.height;
    return {x: Math.max(geometry.left, Math.min(geometry.width - geometry.right, horizontal)), y: Math.max(geometry.top, Math.min(geometry.height - geometry.bottom, vertical)), inside: horizontal >= geometry.left - 0.01 && horizontal <= geometry.width - geometry.right + 0.01 && vertical >= geometry.top - 0.01 && vertical <= geometry.height - geometry.bottom + 0.01};
  }

  function brushSamples(samples, bounds) {
    return samples.filter(sample => finite(sample.x) && finite(sample.y) && sample.x >= bounds.x[0] && sample.x <= bounds.x[1] && sample.y >= bounds.y[0] && sample.y <= bounds.y[1]).map(sample => sample.id);
  }

  function setChartDomain(bounds) {
    if (!state.fullDomain) return;
    const domain = {};
    for (const axis of ['x', 'y']) {
      const requested = bounds[axis];
      if (!requested?.every(finite) || requested[1] <= requested[0]) return;
      const full = state.fullDomain[axis];
      const fullSpan = full[1] - full[0];
      const requestedSpan = requested[1] - requested[0];
      const span = Math.max(fullSpan / 1000, Math.min(fullSpan, requestedSpan));
      const lower = Math.max(full[0], Math.min(full[1] - span, requested[0] + (requestedSpan - span) / 2));
      domain[axis] = [lower, lower + span];
    }
    state.domain = domain;
    element('sample-tooltip').hidden = true;
    renderChart();
  }

  function zoom(factor, position = null) {
    if (!state.domain || !finite(factor) || factor <= 0) return;
    const bounds = {};
    for (const axis of ['x', 'y']) {
      const current = state.domain[axis];
      const anchor = position ? axis === 'x' ? invertX(position.x) : invertY(position.y) : (current[0] + current[1]) / 2;
      bounds[axis] = [anchor + (current[0] - anchor) * factor, anchor + (current[1] - anchor) * factor];
    }
    setChartDomain(bounds);
  }

  function pan(horizontal, vertical) {
    if (!state.domain) return;
    const bounds = {};
    for (const [axis, fraction] of [['x', horizontal], ['y', vertical]]) {
      const offset = (state.domain[axis][1] - state.domain[axis][0]) * fraction;
      bounds[axis] = state.domain[axis].map(value => value + offset);
    }
    setChartDomain(bounds);
  }

  function addGroup(name, samples, color = null, checked = true) {
    const known = new Set(state.plot?.samples.map(sample => sample.id) || []);
    const identifiers = [...new Set(samples)].filter(identifier => known.has(identifier));
    if (!identifiers.length) { announce('This selection contains no samples from the current study.', true); return false; }
    state.groups.push({id: `group-${state.nextGroup++}`, name, samples: new Set(identifiers), color: color && /^#[0-9a-f]{6}$/i.test(color) ? color : groupPalette[state.groups.length % groupPalette.length], checked});
    renderGroups();
    renderChart();
    renderSampleTable();
    syncAdvanced();
    announce(`${name}: ${identifiers.length} samples added.`);
    return true;
  }

  function renderGroups() {
    invalidateAnalysis();
    const list = element('group-list');
    list.replaceChildren();
    element('group-count').textContent = state.groups.length;
    element('group-count').dataset.groupCount = state.groups.length;
    if (!state.groups.length) {
      const empty = document.createElement('div');
      empty.className = 'group-empty';
      empty.textContent = 'Draw a selection or choose clinical information to create your first group.';
      list.append(empty);
    }
    for (const group of state.groups) {
      const row = document.createElement('div');
      row.className = 'group-row';
      row.dataset.groupId = group.id;
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = group.checked;
      checkbox.className = 'group-checked';
      checkbox.setAttribute('aria-label', `Include ${group.name}`);
      checkbox.addEventListener('change', () => { group.checked = checkbox.checked; refreshGroups(); });
      const color = document.createElement('input');
      color.type = 'color';
      color.value = group.color;
      color.className = 'group-color';
      color.setAttribute('aria-label', `Color for ${group.name}`);
      color.addEventListener('input', () => { group.color = color.value; invalidateAnalysis(); renderChart(); syncAdvanced(); });
      const details = document.createElement('div');
      details.className = 'group-details';
      const name = document.createElement('input');
      name.value = group.name;
      name.className = 'group-name';
      name.maxLength = 120;
      name.setAttribute('aria-label', 'Group name');
      name.addEventListener('change', () => { group.name = name.value.trim() || 'Unnamed group'; name.value = group.name; invalidateAnalysis(); syncAdvanced(); });
      const count = document.createElement('small');
      count.textContent = `${group.samples.size} samples`;
      details.append(name, count);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'remove-group';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Remove ${group.name}`);
      remove.addEventListener('click', () => { state.groups = state.groups.filter(candidate => candidate.id !== group.id); refreshGroups(); });
      row.append(checkbox, color, details, remove);
      list.append(row);
    }
    const selected = state.groups.filter(group => group.checked).length;
    document.querySelectorAll('[data-group-operation]').forEach(button => { button.disabled = selected === 0; });
    element('export-groups').disabled = selected === 0;
    element('clear-groups').disabled = state.groups.length === 0;
    element('import-groups').disabled = !state.plot;
    updateAnalysisControls();
  }

  function updateAnalysisControls() {
    const kind = element('analysis-kind').value;
    const capabilities = state.dataset?.capabilities || {};
    const supported = kind === 'survival' ? capabilities.survival !== false && capabilities.survivalPlot !== false : capabilities[kind] !== false;
    element('render-analysis').disabled = !state.plot || !supported || (kind !== 'png' && !state.groups.some(group => group.checked));
    element('download-pdf').disabled = !state.plot || capabilities.pdf === false;
    element('group-summary-button').disabled = !state.plot || !state.groups.some(group => group.checked);
    element('remove-checked-groups').disabled = !state.groups.some(group => group.checked);
    document.querySelectorAll('[data-legacy-group-tool]').forEach(button => {
      const tool = button.dataset.legacyGroupTool;
      const selected = state.groups.filter(group => group.checked).length;
      button.disabled = !state.plot || tool === 'ShowIm' || (['Scr', 'Show'].includes(tool) && !selected) || (tool === 'Diff' && selected < 2) || (tool === 'Scr' && capabilities.survival === false);
    });
    element('censor-time').disabled = kind !== 'survival';
    element('analysis-note').textContent = supported ? 'Distribution plots use Gene B. Publication labels normalize reserved punctuation; sample IDs stay unchanged.' : 'This analysis is unavailable for this study or server runtime. Choose another analysis.';
  }

  function invalidateAnalysis() {
    state.controllers.get('analysis')?.abort();
    element('analysis-results').hidden = true;
    element('analysis-image').hidden = true;
    element('analysis-download').hidden = true;
    element('group-summary').hidden = true;
    if (state.analysisUrl) URL.revokeObjectURL(state.analysisUrl);
    state.analysisUrl = '';
  }

  function analysisPayload(action, type) {
    return {action, type, key: state.key, id: state.dataset.id, geneA: state.plot.genes.x.id, geneB: state.plot.genes.y.id, ct: element('censor-time').value.trim(), groups: state.groups.filter(group => group.checked).map(group => ({name: group.name, color: group.color, samples: [...group.samples]}))};
  }

  async function runAnalysis(type = element('analysis-kind').value) {
    if (!state.plot) return;
    const generation = state.generation;
    const payload = analysisPayload('render', type);
    const signature = JSON.stringify(payload);
    state.controllers.get('analysis')?.abort();
    const controller = new AbortController();
    state.controllers.set('analysis', controller);
    element('render-analysis').disabled = true;
    element('analysis-results').setAttribute('aria-busy', 'true');
    announce(`Generating ${type === 'pdf' ? 'publication PDF' : type} analysis for the checked populations…`);
    try {
      const response = await fetch('api.php', {method: 'POST', signal: controller.signal, headers: {'Content-Type': 'application/json'}, body: signature});
      if (!response.ok || response.headers.get('content-type')?.includes('application/json')) {
        const failure = await response.json();
        throw new Error(failure.error?.message || failure.error || failure.message || 'The server could not generate this analysis.');
      }
      const blob = await response.blob();
      if (generation !== state.generation || !state.plot || signature !== JSON.stringify(analysisPayload('render', type))) return;
      if (type === 'pdf') {
        download(blob, `${state.dataset.id}-analysis.pdf`, 'application/pdf');
      } else {
        if (state.analysisUrl) URL.revokeObjectURL(state.analysisUrl);
        state.analysisUrl = URL.createObjectURL(blob);
        element('analysis-image').src = state.analysisUrl;
        element('analysis-image').alt = `${type} for ${state.dataset.name}, ${state.plot.genes.y.id}, checked sample populations`;
        element('analysis-image').hidden = false;
        element('analysis-download').href = state.analysisUrl;
        element('analysis-download').download = `${state.dataset.id}-${type}.png`;
        element('analysis-download').hidden = false;
        element('analysis-results').hidden = false;
      }
      announce(`${type === 'pdf' ? 'PDF exported' : 'Analysis ready'}. Results use the checked sample populations.`);
    } finally {
      if (state.controllers.get('analysis') === controller) state.controllers.delete('analysis');
      element('analysis-results').setAttribute('aria-busy', 'false');
      updateAnalysisControls();
    }
  }

  async function groupSummaries() {
    if (!state.plot) return;
    const generation = state.generation;
    const signature = JSON.stringify(analysisPayload('analysis'));
    const response = await fetch('api.php', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: signature});
    const result = await response.json();
    if (!response.ok || result.ok === false) throw new Error(result.error?.message || result.error || 'Unable to calculate group summaries.');
    if (generation !== state.generation || !state.plot || signature !== JSON.stringify(analysisPayload('analysis'))) return;
    const table = document.createElement('table');
    table.className = 'sample-table';
    const heading = document.createElement('tr');
    for (const label of ['Group', 'Samples', 'A mean', 'A median', 'B mean', 'B median']) {
      const cell = document.createElement('th');
      cell.textContent = label;
      heading.append(cell);
    }
    const head = document.createElement('thead');
    head.append(heading);
    table.append(head);
    const body = document.createElement('tbody');
    for (const group of result.groups || []) {
      const row = document.createElement('tr');
      for (const value of [group.name, group.sampleCount, numeric(group.x?.mean), numeric(group.x?.median), numeric(group.y?.mean), numeric(group.y?.median)]) {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.append(cell);
      }
      body.append(row);
    }
    table.append(body);
    element('group-summary').replaceChildren(table);
    element('group-summary').hidden = false;
    element('analysis-results').hidden = false;
    announce('Group expression summaries calculated from the server data.');
  }

  function refreshGroups() {
    renderGroups();
    renderChart();
    renderSampleTable();
    syncAdvanced();
  }

  function combineGroups(groups, operation) {
    if (!groups.length) return [];
    if (operation === 'reverse-difference') return combineGroups([...groups].reverse(), 'difference');
    if (operation === 'union') return [...new Set(groups.flatMap(group => [...group.samples]))];
    return [...groups[0].samples].filter(identifier => operation === 'intersection' ? groups.every(group => group.samples.has(identifier)) : groups.slice(1).every(group => !group.samples.has(identifier)));
  }

  function selectedUnion() {
    return new Set(state.groups.filter(group => group.checked).flatMap(group => [...group.samples]));
  }

  function visibleSamples() {
    const query = element('sample-search').value.trim().toLowerCase();
    const union = selectedUnion();
    return (state.plot?.samples || []).filter(sample => (!union.size || union.has(sample.id)) && `${sample.id} ${state.clinical.get(sample.id) || ''}`.toLowerCase().includes(query));
  }

  function renderSampleTable() {
    const body = element('sample-table-body');
    body.replaceChildren();
    if (!state.plot) return;
    const samples = visibleSamples();
    const fragment = document.createDocumentFragment();
    for (const sample of samples) {
      const row = document.createElement('tr');
      const checkCell = document.createElement('td');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = state.tableSelection.has(sample.id);
      checkbox.setAttribute('aria-label', `Select sample ${sample.id}`);
      checkbox.addEventListener('change', () => { if (checkbox.checked) state.tableSelection.add(sample.id); else state.tableSelection.delete(sample.id); element('table-group-button').disabled = !state.tableSelection.size; });
      checkCell.append(checkbox);
      row.append(checkCell);
      for (const value of [sample.id, numeric(sample.x), numeric(sample.y), state.clinical.get(sample.id) || '—']) {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.append(cell);
      }
      fragment.append(row);
    }
    body.append(fragment);
    element('sample-table-context').textContent = `${samples.length} samples shown${selectedUnion().size ? ' from the checked groups’ union' : ' from the study'}. ${state.tableSelection.size} individually checked.`;
    element('table-group-button').disabled = !state.tableSelection.size;
    element('select-all-samples').checked = samples.length > 0 && samples.every(sample => state.tableSelection.has(sample.id));
  }

  async function loadClinical() {
    const field = element('clinical-field').value;
    state.clinicalField = field;
    state.clinical = new Map();
    state.clinicalColors = new Map();
    state.clinicalSelection = '';
    state.clinicalRange = null;
    state.clinicalExtent = null;
    element('clinical-legend').hidden = true;
    setOptions(element('clinical-value'), field ? 'Loading values…' : 'Choose a field');
    element('clinical-value').disabled = true;
    element('clinical-group-button').disabled = true;
    element('clinical-range').disabled = true;
    element('clinical-range-button').disabled = true;
    element('clinical-range').value = '';
    renderChart();
    if (!field || !state.dataset) { renderSampleTable(); return; }
    const generation = state.generation;
    const response = await request('clinical', 'clinical', {id: state.dataset.id, field});
    if (generation !== state.generation || state.clinicalField !== field) return;
    state.clinical = new Map((response.values || []).map(sample => [String(sample.id), String(sample.value ?? '')]));
    const counts = new Map();
    for (const value of state.clinical.values()) counts.set(value, (counts.get(value) || 0) + 1);
    setOptions(element('clinical-value'), 'Choose a clinical value');
    for (const [value, count] of [...counts].sort((left, right) => left[0].localeCompare(right[0], undefined, {numeric: true}))) option(element('clinical-value'), value === '' ? '__HEGEMON_MISSING__' : value, `${value || '(missing)'} · ${count} samples`);
    element('clinical-value').disabled = !counts.size;
    const numericValues = [...state.clinical.values()].some(value => value.trim() !== '' && Number.isFinite(Number(value)));
    const name = element('clinical-field').selectedOptions[0].textContent;
    const continuous = numericValues && !/^c\s/i.test(name) && (counts.size > 12 || /^n\s/i.test(name) || name === 'time');
    if (continuous) {
      const numbers = [...counts.keys()].filter(value => value.trim() !== '' && Number.isFinite(Number(value))).map(Number);
      state.clinicalExtent = [Math.min(...numbers), Math.max(...numbers)];
    }
    [...counts.keys()].sort((left, right) => left.localeCompare(right, undefined, {numeric: true})).forEach((value, index) => {
      const fraction = state.clinicalExtent && value.trim() !== '' && Number.isFinite(Number(value)) ? (Number(value) - state.clinicalExtent[0]) / (state.clinicalExtent[1] - state.clinicalExtent[0] || 1) : null;
      state.clinicalColors.set(value, value === '' ? '#a5b1b9' : fraction === null ? palette[index % palette.length] : `rgb(${Math.round(85 - 69 * fraction)}, ${Math.round(114 + 51 * fraction)}, ${Math.round(208 - 60 * fraction)})`);
    });
    element('clinical-range').disabled = !continuous;
    element('clinical-range-button').disabled = !continuous || !state.plot;
    element('clinical-range').closest('.clinical-range').hidden = !continuous;
    renderClinicalLegend(counts);
    renderChart();
    renderSampleTable();
    element('clinical-note').textContent = `${name} colors the plot. Select a value${continuous ? ' or enter a range' : ''} to highlight samples; save only the groups you need.`;
  }

  function matchesClinical(value) {
    if (state.clinicalRange) return value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= state.clinicalRange[0] && Number(value) <= state.clinicalRange[1];
    if (!state.clinicalSelection) return true;
    return value === (state.clinicalSelection === '__HEGEMON_MISSING__' ? '' : state.clinicalSelection);
  }

  function renderClinicalLegend(counts) {
    const legend = element('clinical-legend');
    legend.replaceChildren();
    legend.hidden = false;
    if (state.clinicalExtent) {
      const scale = document.createElement('div');
      scale.className = 'numeric-legend';
      const gradient = document.createElement('div');
      gradient.className = 'numeric-gradient';
      const extents = document.createElement('div');
      extents.className = 'numeric-extents';
      for (const value of state.clinicalExtent) {
        const label = document.createElement('span');
        label.textContent = numeric(value);
        extents.append(label);
      }
      scale.append(gradient, extents);
      legend.append(scale);
      return;
    }
    for (const [value, count] of counts) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.clinicalValue = value === '' ? '__HEGEMON_MISSING__' : value;
      button.setAttribute('aria-pressed', 'false');
      const swatch = document.createElement('span');
      swatch.className = 'clinical-swatch';
      swatch.style.background = state.clinicalColors.get(value);
      button.append(swatch, document.createTextNode(`${value || '(missing)'} · ${count}`));
      button.addEventListener('click', () => {
        element('clinical-value').value = state.clinicalSelection === button.dataset.clinicalValue ? '' : button.dataset.clinicalValue;
        previewClinicalValue();
      });
      legend.append(button);
    }
  }

  function previewClinicalValue() {
    state.clinicalSelection = element('clinical-value').value;
    state.clinicalRange = null;
    element('clinical-range').value = '';
    element('clinical-group-button').disabled = !state.clinicalSelection || !state.plot;
    for (const button of element('clinical-legend').querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.clinicalValue === state.clinicalSelection));
    renderChart();
    if (state.clinicalSelection) announce(`${[...state.clinical.values()].filter(matchesClinical).length} samples highlighted. Save the highlighted group to include it in analyses.`);
  }

  function previewClinicalRange() {
    const value = element('clinical-range').value.trim();
    const bounds = value.match(/^(-?(?:\d+(?:\.\d*)?|\.\d+))\s*:\s*(-?(?:\d+(?:\.\d*)?|\.\d+))$/);
    state.clinicalRange = bounds && Number(bounds[1]) <= Number(bounds[2]) ? [Number(bounds[1]), Number(bounds[2])] : null;
    if (state.clinicalRange) {
      state.clinicalSelection = '';
      element('clinical-value').value = '';
      element('clinical-group-button').disabled = true;
      announce(`${[...state.clinical.values()].filter(matchesClinical).length} samples highlighted in ${value}.`);
    }
    renderChart();
  }

  function csvSerialize(rows) {
    return rows.map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n') + '\r\n';
  }

  function csvParse(text) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    const source = text.replace(/^\uFEFF/, '');
    for (let index = 0; index < source.length; index++) {
      const character = source[index];
      if (character === '"') {
        if (quoted && source[index + 1] === '"') { field += '"'; index++; }
        else quoted = !quoted;
      } else if (character === ',' && !quoted) { row.push(field); field = ''; }
      else if ((character === '\n' || character === '\r') && !quoted) {
        if (character === '\r' && source[index + 1] === '\n') index++;
        row.push(field);
        if (row.some(value => value !== '')) rows.push(row);
        row = [];
        field = '';
      } else field += character;
    }
    if (quoted) throw new Error('The CSV has an unclosed quoted field. Check the file and try again.');
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  function download(content, filename, type) {
    const url = URL.createObjectURL(new Blob([content], {type}));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportGroups(union = false) {
    if (!state.plot) return;
    const byId = new Map(state.plot.samples.map(sample => [sample.id, sample]));
    let groups = state.groups.filter(group => group.checked);
    if (union || !groups.length) groups = [{name: selectedUnion().size ? 'Selected union' : 'All samples', samples: selectedUnion().size ? selectedUnion() : new Set(byId.keys()), color: palette[0]}];
    const rows = [['Dataset', 'Group', 'Sample ID', 'Gene A', 'Expression A', 'Gene B', 'Expression B', 'Clinical field', 'Clinical value', 'Color']];
    const clinicalName = element('clinical-field').selectedOptions[0]?.textContent || '';
    for (const group of groups) for (const identifier of group.samples) {
      const sample = byId.get(identifier);
      if (sample) rows.push([state.dataset.id, group.name, sample.id, state.plot.genes.x.id, sample.x, state.plot.genes.y.id, sample.y, state.clinicalField ? clinicalName : '', state.clinical.get(sample.id) || '', group.color]);
    }
    download(csvSerialize(rows), `${state.dataset.id}-${union ? 'samples' : 'groups'}.csv`, 'text/csv;charset=utf-8');
    announce(`${rows.length - 1} sample rows exported${union ? ' as one union' : ' with group membership preserved'}.`);
  }

  async function importGroups(file) {
    if (!file || !state.plot) return;
    const generation = state.generation;
    const rows = csvParse(await file.text());
    if (generation !== state.generation) return;
    if (rows.length < 2) throw new Error('The CSV must contain a header and at least one sample.');
    const header = rows.shift().map(value => value.trim().toLowerCase().replace(/[\s_-]/g, ''));
    const sampleIndex = header.findIndex(value => ['sampleid', 'arrayid', 'sample'].includes(value));
    const groupIndex = header.indexOf('group');
    const colorIndex = header.indexOf('color');
    const datasetIndex = header.indexOf('dataset');
    if (sampleIndex < 0) throw new Error('CSV requires a “Sample ID” or “ArrayID” column. Export a group for a ready-to-edit template.');
    const known = new Set(state.plot.samples.map(sample => sample.id));
    const imported = new Map();
    let skipped = 0;
    for (const row of rows) {
      if (datasetIndex >= 0 && row[datasetIndex] && row[datasetIndex] !== state.dataset.id) throw new Error(`This CSV belongs to study ${row[datasetIndex]}. Select that study before importing.`);
      const identifier = String(row[sampleIndex] || '').trim();
      if (!known.has(identifier)) { skipped++; continue; }
      const name = groupIndex >= 0 ? row[groupIndex]?.trim() || 'Imported group' : file.name.replace(/\.csv$/i, '');
      if (!imported.has(name)) imported.set(name, {samples: [], color: colorIndex >= 0 ? row[colorIndex] : null});
      imported.get(name).samples.push(identifier);
    }
    if (!imported.size) throw new Error('No CSV sample IDs match the current study. Check the study and sample identifier column.');
    for (const [name, group] of imported) addGroup(name, group.samples, group.color);
    announce(`${imported.size} groups imported${skipped ? `; ${skipped} unknown sample rows skipped` : ''}.`);
    element('import-groups').value = '';
  }

  function switchTab(tab) {
    state.tab = tab;
    for (const name of ['scatter', 'samples', 'advanced']) {
      element(`view-${name}`).hidden = name !== tab;
      element(`tab-${name}`).setAttribute('aria-selected', String(name === tab));
      element(`tab-${name}`).tabIndex = name === tab ? 0 : -1;
    }
    if (tab === 'advanced') loadAdvanced();
    if (tab === 'samples') renderSampleTable();
  }

  function bindEvents() {
    element('dataset-select').addEventListener('change', () => {
      const dataset = state.datasets.find(candidate => candidate.id === element('dataset-select').value);
      const query = search.parseQuery(element('dataset-search').value);
      if (dataset) chooseDataset(dataset, {key: query.key || element('category-filter').value, ...(query.link ? {genes: query.genes} : {})}).catch(report);
    });
    document.querySelectorAll('[data-scientific-tool]').forEach(button => button.addEventListener('click', () => openScientificTool(button.dataset.scientificTool).catch(report)));
    document.querySelectorAll('[data-legacy-group-tool]').forEach(button => button.addEventListener('click', () => {
      const tool = button.dataset.legacyGroupTool;
      if (!state.plot) { announce('Load an expression plot first.'); return; }
      if (tool === 'Show') { element('sample-search').value = ''; switchTab('samples'); return; }
      state.scientificTool = 'groups';
      state.groupTool = tool;
      state.advancedContext = '';
      markScientificTool('groups');
      element('scientific-result-title').textContent = {Scr: 'Survival R script', Rect1: 'Numeric rectangle selection', Thr: 'Threshold preview', Stats: 'Probe-pair statistics', Corr: 'Group correlation', Diff: 'Differential expression', Search: 'Search and export sample groups'}[tool] || tool;
      element('scientific-result-description').textContent = {Scr: 'The original survival-analysis R script uses checked groups and CT from Analysis settings.', Rect1: 'Enter Gene A minimum:maximum, Gene B minimum:maximum to create an inclusive rectangle group. Leave either range empty to leave that axis unrestricted.', Stats: 'Original legacy thresholds and pairwise statistics for the full dataset, not group expression summaries.', Corr: 'Rank probes by correlation to Gene A and Gene B over the checked groups’ union, or the full dataset when no groups are checked.', Diff: 'Legacy differential expression compares the first two checked populations. D-AB and D-BA instead subtract sample memberships.', Search: 'Enter sample IDs, search followed by sample-ID fragments, or a Boolean query. Leave the text empty to export the checked union with expression and selected patient information.'}[tool] || 'This analysis uses the selected dataset, probe pair, and checked sample groups. Results stay on this page.';
      switchTab('advanced');
      const frame = element('advanced-frame');
      if (tool === 'Scr') element('scientific-result-description').textContent += ' This is R code, not the curve. View the curve through Population analysis & exports → Kaplan–Meier survival → Run analysis. One group has no between-group p-value (NA).';
      const context = state.advancedContext;
      const commands = {Scr: 'callScr', Rect1: 'callRect', Thr: 'callThr', Stats: 'callStats', Corr: 'callGCorr', Diff: 'callGDiff', Search: 'callSearch'};
      const invoke = () => {
        const page = frame.contentWindow;
        if (page.location.href !== context || !page.document.getElementById('group_display')) return false;
        page.document.body.classList.add('embedded-group-analysis');
        page.document.body.dataset.groupTool = tool;
        page.changeImage = () => {};
        executeScientificTool();
        if (tool === 'Search') page.searchGroup = 0;
        page.hegemonPendingGroups = {datasetId: state.dataset.id, groups: groupSnapshot()};
        page.hegemonApplyPendingGroups();
        page[commands[tool]]?.();
        return true;
      };
      if (!invoke()) {
        const generation = state.generation;
        let attempts = 0;
        const waiting = setInterval(() => {
          if (generation !== state.generation || context !== state.advancedContext) { clearInterval(waiting); return; }
          if (invoke()) clearInterval(waiting);
          else if (++attempts > 100) { clearInterval(waiting); announce('The analysis did not become ready. Please choose the tool again.', true); }
        }, 100);
      }
    }));
    element('remove-checked-groups').addEventListener('click', () => { state.groups = state.groups.filter(group => !group.checked); refreshGroups(); });
    document.querySelector('.dataset-browser').addEventListener('toggle', () => {
      if (document.querySelector('.dataset-browser').open) loadSearchLibrary().catch(report);
    });
    element('copy-analysis-link').addEventListener('click', () => copyAnalysisLink().catch(report));
    for (const axis of ['a', 'b']) {
      element(`lookup-${axis}`).addEventListener('click', () => lookupGene(axis).catch(report));
      element(`gene-${axis}`).addEventListener('input', () => {
        state.controllers.get(`gene-${axis}`)?.abort();
        state.probes[axis] = [];
        setOptions(element(`probe-${axis}`), 'Find probes for this gene');
        updatePlotButton();
      });
      element(`probe-${axis}`).addEventListener('change', updatePlotButton);
    }
    element('gene-form').addEventListener('submit', event => { event.preventDefault(); loadPlot().catch(report); });
    document.querySelectorAll('[data-tab]').forEach(button => {
      button.addEventListener('click', () => {
        if (button.dataset.tab === 'scatter') markScientificTool('Explore');
        switchTab(button.dataset.tab);
      });
      button.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const tabs = ['scatter', 'samples', 'advanced'];
        const index = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (tabs.indexOf(state.tab) + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
        switchTab(tabs[index]);
        element(`tab-${tabs[index]}`).focus();
      });
    });
    element('threshold-toggle').addEventListener('change', renderChart);
    element('zoom-in').addEventListener('click', () => zoom(0.75));
    element('zoom-out').addEventListener('click', () => zoom(1 / 0.75));
    element('reset-zoom').addEventListener('click', async () => {
      if (!state.fullDomain) return;
      state.controllers.get('clinical')?.abort();
      state.groups = [];
      state.nextGroup = 1;
      state.tableSelection.clear();
      cancelChartDrag();
      state.domain = {x: [...state.fullDomain.x], y: [...state.fullDomain.y]};
      state.advancedContext = '';
      state.scientificTool = 'topGenes';
      state.groupTool = '';
      element('advanced-frame').removeAttribute('src');
      element('advanced-frame').hidden = true;
      element('clinical-field').value = '';
      element('sample-search').value = '';
      element('sample-tooltip').hidden = true;
      element('chart-brush').setAttribute('hidden', '');
      element('threshold-toggle').checked = true;
      element('brush-mode').click();
      await loadClinical();
      element('clinical-range').closest('.clinical-range').hidden = true;
      refreshGroups();
      markScientificTool('Explore');
      announce('View reset. All samples and default legacy colors restored; selections, highlights, groups, and zoom cleared.');
    });
    for (const mode of ['brush', 'zoom']) element(`${mode}-mode`).addEventListener('click', () => {
      state.mode = mode;
      element('brush-mode').setAttribute('aria-pressed', String(mode === 'brush'));
      element('zoom-mode').setAttribute('aria-pressed', String(mode === 'zoom'));
      element('chart-hint').textContent = mode === 'brush' ? 'Scroll or pinch to zoom. Drag to select samples; Shift-drag to zoom. Click the plot for + / − keys (0 fits all).' : 'Scroll or pinch to zoom. Drag a region to zoom; Alt-drag to pan. Click the plot for + / − keys (0 fits all).';
    });
    const chart = element('scatter-chart');
    chart.addEventListener('wheel', event => {
      if (!state.domain || !event.deltaY) return;
      const position = chartPosition(event);
      if (!position.inside) return;
      event.preventDefault();
      if (drag) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? geometry.height - geometry.top - geometry.bottom : 1;
      const distance = Math.max(-240, Math.min(240, event.deltaY * unit));
      zoom(Math.exp(distance * 0.0025), position);
    }, {passive: false});
    chart.addEventListener('keydown', event => {
      if (!state.domain || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === 'Escape' && drag) {
        event.preventDefault();
        cancelChartDrag();
        return;
      }
      if (drag) return;
      if (['+', '='].includes(event.key) || event.code === 'NumpadAdd') {
        event.preventDefault();
        zoom(0.75);
      } else if (['-', '−'].includes(event.key) || event.code === 'NumpadSubtract') {
        event.preventDefault();
        zoom(1 / 0.75);
      } else if (event.key === '0' || event.key === 'Home' || event.code === 'Numpad0') {
        event.preventDefault();
        setChartDomain(state.fullDomain);
        announce('Zoom reset to all samples. Groups and patient highlights are unchanged.');
      } else {
        const directions = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1]};
        if (!directions[event.key]) return;
        event.preventDefault();
        const step = event.shiftKey ? 0.25 : 0.1;
        pan(...directions[event.key].map(direction => direction * step));
      }
    });
    chart.addEventListener('pointerdown', event => {
      if (!state.plot || event.button !== 0 || drag) return;
      const position = chartPosition(event);
      if (!position.inside) return;
      const mode = event.altKey ? 'pan' : event.shiftKey ? 'zoom' : state.mode;
      drag = {start: position, current: position, mode, pointerId: event.pointerId, domain: {x: [...state.domain.x], y: [...state.domain.y]}};
      chart.focus({preventScroll: true});
      chart.setPointerCapture(event.pointerId);
      chart.classList.toggle('is-panning', mode === 'pan');
      element('sample-tooltip').hidden = true;
      event.preventDefault();
    });
    chart.addEventListener('pointermove', event => {
      if (!state.plot) return;
      if (drag) {
        drag.current = chartPosition(event);
        if (drag.mode === 'pan') {
          const horizontal = (drag.start.x - drag.current.x) / (geometry.width - geometry.left - geometry.right);
          const vertical = (drag.current.y - drag.start.y) / (geometry.height - geometry.top - geometry.bottom);
          setChartDomain({x: drag.domain.x.map(value => value + horizontal * (drag.domain.x[1] - drag.domain.x[0])), y: drag.domain.y.map(value => value + vertical * (drag.domain.y[1] - drag.domain.y[0]))});
          return;
        }
        const brush = element('chart-brush');
        brush.removeAttribute('hidden');
        for (const [name, value] of Object.entries({x: Math.min(drag.start.x, drag.current.x), y: Math.min(drag.start.y, drag.current.y), width: Math.abs(drag.current.x - drag.start.x), height: Math.abs(drag.current.y - drag.start.y)})) brush.setAttribute(name, value);
      } else {
        const identifier = event.target.dataset?.sampleId;
        const tooltip = element('sample-tooltip');
        tooltip.hidden = !identifier;
        if (!identifier) return;
        const sample = state.plot.samples.find(candidate => candidate.id === identifier);
        const rectangle = element('chart-container').getBoundingClientRect();
        tooltip.textContent = `${sample.id} · A: ${numeric(sample.x)} · B: ${numeric(sample.y)}${state.clinical.has(sample.id) ? ` · ${state.clinical.get(sample.id) || '(missing)'}` : ''}`;
        tooltip.style.left = `${Math.max(8, Math.min(event.clientX - rectangle.left + 12, rectangle.width - 240))}px`;
        tooltip.style.top = `${Math.max(8, event.clientY - rectangle.top - 48)}px`;
      }
    });
    chart.addEventListener('pointerup', event => {
      if (!drag) return;
      if (!state.plot || !state.domain) { cancelChartDrag(); return; }
      drag.current = chartPosition(event);
      const completed = drag;
      cancelChartDrag();
      if (completed.mode === 'pan') return;
      if (Math.abs(completed.current.x - completed.start.x) < 4 || Math.abs(completed.current.y - completed.start.y) < 4) return;
      const bounds = {x: [invertX(Math.min(completed.start.x, completed.current.x)), invertX(Math.max(completed.start.x, completed.current.x))], y: [invertY(Math.max(completed.start.y, completed.current.y)), invertY(Math.min(completed.start.y, completed.current.y))]};
      if (completed.mode === 'zoom') setChartDomain(bounds);
      else addGroup(`Selection ${state.nextGroup}`, brushSamples(state.plot.samples, bounds));
    });
    chart.addEventListener('pointercancel', cancelChartDrag);
    chart.addEventListener('lostpointercapture', cancelChartDrag);
    chart.addEventListener('pointerleave', () => { element('sample-tooltip').hidden = true; });
    document.querySelectorAll('[data-group-operation]').forEach(button => button.addEventListener('click', () => {
      const selected = state.groups.filter(group => group.checked);
      const operation = button.dataset.groupOperation;
      if (selected.length) addGroup(operation === 'difference' ? `${selected[0].name} − rest` : operation === 'reverse-difference' ? `${selected.at(-1).name} − rest` : `${operation === 'union' ? 'Union' : 'Intersection'} ${state.nextGroup}`, combineGroups(selected, operation));
    }));
    element('clear-groups').addEventListener('click', () => { state.groups = []; refreshGroups(); announce('All sample groups cleared.'); });
    element('clinical-field').addEventListener('change', () => loadClinical().catch(report));
    element('clinical-value').addEventListener('change', previewClinicalValue);
    element('clinical-range').addEventListener('input', previewClinicalRange);
    element('clinical-group-button').addEventListener('click', () => {
      const selected = element('clinical-value').value;
      if (!selected || !state.plot) return;
      const value = selected === '__HEGEMON_MISSING__' ? '' : selected;
      const name = element('clinical-field').selectedOptions[0].textContent;
      addGroup(`${name}: ${value || '(missing)'}`, [...state.clinical].filter(([, candidate]) => candidate === value).map(([identifier]) => identifier));
    });
    element('sample-search').addEventListener('input', renderSampleTable);
    element('clinical-range-button').addEventListener('click', () => {
      const range = element('clinical-range').value.trim();
      const bounds = range.match(/^(-?(?:\d+(?:\.\d*)?|\.\d+))\s*:\s*(-?(?:\d+(?:\.\d*)?|\.\d+))$/);
      if (!bounds || Number(bounds[1]) > Number(bounds[2])) { announce('Enter an inclusive numeric range such as 0:200, with the lower value first.', true); return; }
      const name = element('clinical-field').selectedOptions[0].textContent;
      const identifiers = [...state.clinical].filter(([, value]) => value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= Number(bounds[1]) && Number(value) <= Number(bounds[2])).map(([identifier]) => identifier);
      addGroup(`${name}: ${range}`, identifiers);
    });
    element('select-all-samples').addEventListener('change', event => { for (const sample of visibleSamples()) { if (event.target.checked) state.tableSelection.add(sample.id); else state.tableSelection.delete(sample.id); } renderSampleTable(); });
    element('table-group-button').addEventListener('click', () => { addGroup(`Table selection ${state.nextGroup}`, [...state.tableSelection]); state.tableSelection.clear(); renderSampleTable(); });
    element('export-groups').addEventListener('click', () => exportGroups());
    element('export-samples').addEventListener('click', () => exportGroups(true));
    element('import-groups').addEventListener('change', event => importGroups(event.target.files[0]).catch(report));
    element('download-plot').addEventListener('click', () => {
      if (!state.plot) return;
      const copy = chart.cloneNode(true);
      copy.setAttribute('xmlns', svgNamespace);
      copy.removeAttribute('hidden');
      copy.setAttribute('width', geometry.width);
      copy.setAttribute('height', geometry.height);
      const style = svgNode('style');
      style.textContent = '.grid-line{stroke:#e8edf4;stroke-width:1}.axis-line{stroke:#96a4b7}.tick-label{font:12px sans-serif;fill:#65748b}.axis-title{font:13px sans-serif;fill:#27364d}.threshold-line{stroke:#149d91;stroke-width:1.5;stroke-dasharray:6 4}.threshold-line.bound{stroke-width:1;opacity:.4;stroke-dasharray:2 4}.chart-brush{display:none}';
      copy.prepend(style);
      download(new XMLSerializer().serializeToString(copy), `${state.dataset.id}-${state.plot.genes.x.id}-${state.plot.genes.y.id}.svg`, 'image/svg+xml');
    });
    element('advanced-frame').addEventListener('load', () => {
      const page = element('advanced-frame').contentWindow;
      if (state.scientificTool === 'groups' && page.document.body) {
        page.document.body.classList.add('embedded-group-analysis');
        page.document.body.dataset.groupTool = state.groupTool;
        page.changeImage = () => {};
      }
      syncAdvanced();
      executeScientificTool();
    });
    element('analysis-kind').addEventListener('change', updateAnalysisControls);
    for (const [source, target] of [['scientific-ct', 'censor-time'], ['censor-time', 'scientific-ct']]) {
      element(source).addEventListener('input', () => { element(target).value = element(source).value; invalidateAnalysis(); });
    }
    element('render-analysis').addEventListener('click', () => runAnalysis().catch(report));
    element('download-pdf').addEventListener('click', () => runAnalysis('pdf').catch(report));
    element('group-summary-button').addEventListener('click', () => groupSummaries().catch(report));
    window.addEventListener('message', event => {
      if (event.origin === location.origin && event.source === element('advanced-frame').contentWindow && event.data?.type === 'hegemon:result-height' && event.data.datasetId === state.dataset?.id) {
        if (Number.isFinite(event.data.height)) element('advanced-frame').style.height = `${Math.max(480, Math.min(2400, event.data.height))}px`;
        return;
      }
      if (event.origin !== location.origin || event.source !== element('advanced-frame').contentWindow || event.data?.type !== 'hegemon:legacy-groups' || event.data.datasetId !== state.dataset?.id || !state.plot) return;
      const known = new Set(state.plot.samples.map(sample => sample.id));
      state.groups = (event.data.groups || []).map((group, index) => ({id: `group-${state.nextGroup++}`, name: String(group.name || `Group ${index + 1}`), samples: new Set((group.samples || []).filter(identifier => known.has(identifier))), color: /^#[0-9a-f]{6}$/i.test(group.color || '') ? group.color : palette[index % palette.length], checked: group.checked !== false})).filter(group => group.samples.size);
      renderGroups();
      renderChart();
      renderSampleTable();
    });
  }

  async function initialize() {
    datasetSearch = search.create(document.querySelector('.dataset-search-panel'), {
      category: state.key,
      onSelect: (dataset, selection) => chooseDataset(dataset, selection),
      onFilter: renderDatasetOptions,
      onLinkKey: loadSearchLibrary
    });
    bindEvents();
    resetGeneInputs();
    const parameters = new URLSearchParams(location.search);
    element('workspace-category').textContent = parameters.get('category') || (state.key ? state.key.split(':').join(' / ') : 'Explore All');
    if (performance.getEntriesByType('navigation')[0]?.type !== 'reload') {
      if (parameters.has('A')) element('gene-a').value = parameters.get('A');
      if (parameters.has('B')) element('gene-b').value = parameters.get('B');
    }
    const response = await request('catalogue', 'datasets', {key: state.key || search.catalogueKey()});
    state.datasets = response.datasets || [];
    const inaccessible = response.meta?.unavailableCount || 0;
    element('catalogue-count').textContent = response.meta?.totalCount ?? state.datasets.length + inaccessible;
    element('available-count').textContent = `${state.datasets.filter(available).length} available here${inaccessible ? ` · ${inaccessible} awaiting data access` : ''}`;
    renderCatalogue();
    const selected = state.datasets.find(dataset => dataset.id === parameters.get('id'));
    if (selected) await chooseDataset(selected);
    else if (!state.datasets.length) announce('No datasets in this study type have readable processed files here yet. Choose Explore All to see the available datasets. The lab registry is unchanged.');
    else announce('Select a dataset, then choose your genes to begin.');
  }

  for (const button of document.querySelectorAll('[data-scientific-tool]')) {
    if (scientificDescriptions[button.dataset.scientificTool]) button.title = scientificDescriptions[button.dataset.scientificTool];
  }
  window.HegemonWorkspace = {csvParse, csvSerialize, brushSamples, combineGroups, parseDatasetSource, getState: () => state};
  initialize().catch(report);
})();
