(() => {
  'use strict';

  const studyTypes = [
    ['bladder', 'Bladder cancer'], ['colon', 'Colon cancer'], ['gastric', 'Gastric cancer'],
    ['ovary', 'Ovarian cancer'], ['gbm', 'Glioblastoma'], ['medullo', 'Medulloblastoma'],
    ['leukemia:lymphoma', 'Leukemia and Lymphoma'], ['lung', 'Lung cancer'], ['kidney', 'Kidney cancer'],
    ['hn', 'Head and Neck cancer'], ['prostate', 'Prostate cancer'], ['breast', 'Breast cancer'],
    ['panc', 'Pancreatic cancer'], ['melanoma', 'Melanoma'], ['mm', 'Multiple Myeloma'],
    ['ips', 'Pluripotency'], ['global', 'Global'], ['cardiac:heart', 'Cardiac'], ['bot', 'Botryllus'],
    ['brain:ad', 'Brain'], ['plant', 'Plant'], ['nb', 'Neuroblastoma'], ['athsc', 'Atherosclerosis'],
    ['liver', 'Liver'], ['cervical', 'Cervical'], ['polyps', 'Polyps'],
    ['organoid', 'Organoids and Single Cell'], ['mac:macv', 'Macrophage'], ['covid', 'Covid-19'],
    ['imt', 'Immunotherapy'], ['sperm', 'Sperm'], ['muscle', 'Muscle, Fitness and Performance']
  ];

  function keys(dataset) {
    return Array.isArray(dataset.keys) ? dataset.keys : String(dataset.keys || '').split(':').filter(Boolean);
  }

  function available(dataset) {
    return dataset.available !== false && dataset.capabilities?.expression !== false && dataset.capabilities?.plot !== false;
  }

  function categoryLabel(key) {
    if (!key) return 'Explore All';
    const known = studyTypes.find(category => category[0] === key);
    return known ? known[1] : key.split(':').map(part => studyTypes.find(category => category[0].split(':').includes(part))?.[1] || part).join(' / ');
  }

  function contextKey(dataset, preferred = '') {
    return preferred && preferred.split(':').some(key => keys(dataset).includes(key)) ? preferred : keys(dataset)[0] || '';
  }

  function catalogueKey() {
    return [...new Set(studyTypes.flatMap(category => category[0].split(':'))), ''].join(':');
  }

  function sourceText(value) {
    return new DOMParser().parseFromString(String(value || ''), 'text/html').body.textContent.trim();
  }

  function parseQuery(input) {
    const text = input.trim();
    if (text.length > 2048) return {error: 'Use a shorter search or Hegemon link (maximum 2,048 characters).'};
    const link = /^(?:[a-z][a-z\d+.-]*:\/\/|javascript:|data:|\?|(?:key|id|A|B)=)|(?:explore\.php|workspace\.html)\?/i.test(text);
    if (!link) return {text: text.toLowerCase()};
    try {
      const url = new URL(/^(?:key|id|A|B)=/.test(text) ? `?${text}` : text, location.href);
      if (!['http:', 'https:'].includes(url.protocol) || !/(?:\/explore\.php|\/workspace\.html)$/.test(url.pathname) && !text.startsWith('?') && !/^(?:key|id|A|B)=/.test(text)) {
        return {error: 'Paste a Hegemon explore.php or workspace.html link, or search by dataset name, ID, accession, or category.'};
      }
      const query = {link: true, id: url.searchParams.get('id')?.trim() || '', key: url.searchParams.get('key')?.trim() || '', genes: {}};
      for (const name of ['A', 'B']) if (url.searchParams.has(name)) query.genes[name] = url.searchParams.get(name).trim();
      if (![query.id, query.key, ...Object.values(query.genes)].every(value => value.length <= 256 && !/[\u0000-\u001f\u007f]/.test(value))) return {error: 'Dataset IDs, categories, and genes must be printable text of at most 256 characters.'};
      if (!query.id && !query.key) return {error: 'The Hegemon link must specify a dataset ID or study category.'};
      return query;
    } catch {
      return {error: 'This link could not be read. Try a dataset ID, name, accession, or category instead.'};
    }
  }

  function matches(dataset, query, category = '', onlyAvailable = true) {
    if (query.error || onlyAvailable && !available(dataset)) return false;
    const filter = query.link && query.key ? query.key : category;
    if (filter && !filter.split(':').some(key => keys(dataset).includes(key))) return false;
    if (query.link) return !query.id || dataset.id === query.id;
    const categories = keys(dataset).map(categoryLabel).join(' ');
    return `${dataset.id} ${dataset.name} ${sourceText(dataset.source)} ${dataset.source || ''} ${keys(dataset).join(' ')} ${categories}`.toLowerCase().includes(query.text);
  }

  function workspaceUrl(dataset, {key = '', genes = {}} = {}) {
    const url = new URL('workspace.html', location.href);
    const selectedKey = contextKey(dataset, key);
    if (selectedKey) url.searchParams.set('key', selectedKey);
    url.searchParams.set('category', categoryLabel(selectedKey));
    url.searchParams.set('id', dataset.id);
    for (const name of ['A', 'B']) if (Object.hasOwn(genes, name)) url.searchParams.set(name, genes[name]);
    return url.href;
  }

  async function loadStudies(key = '') {
    const query = new URLSearchParams({action: 'studies', key});
    const response = await fetch(`api.php?${query}`, {headers: {Accept: 'application/json'}});
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error?.message || 'The study registry could not be loaded.');
    return result.studies || [];
  }

  function create(root, {category = '', onSelect, onFilter = () => {}, onLinkKey = async () => {}}) {
    const input = root.querySelector('#dataset-search');
    const select = root.querySelector('#category-filter');
    const availability = root.querySelector('#available-filter');
    const list = root.querySelector('#study-list');
    const status = root.querySelector('#dataset-search-status');
    let datasets = [];
    let selectedId = '';
    let ready = false;
    let loadError = '';

    function render() {
      const query = parseQuery(input.value);
      if (query.link && query.key && [...select.options].some(option => option.value === query.key)) select.value = query.key;
      const filtered = datasets.filter(dataset => matches(dataset, query, select.value, availability.checked));
      root.querySelector('#study-count').textContent = filtered.length;
      list.replaceChildren();
      list.setAttribute('aria-busy', String(!ready));
      status.textContent = query.error || loadError || (query.link ? 'This link opens a registered dataset on this server and prefills any supplied genes. Click Explore expression to plot.' : '');
      status.hidden = !status.textContent;
      for (const dataset of filtered) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'study-card';
        button.dataset.datasetId = dataset.id;
        button.classList.toggle('selected', dataset.id === selectedId);
        button.setAttribute('aria-pressed', String(dataset.id === selectedId));
        button.disabled = !available(dataset);
        const top = document.createElement('span');
        top.className = 'study-card-top';
        const identifier = document.createElement('span');
        identifier.className = 'study-identifier';
        identifier.textContent = dataset.id;
        const count = document.createElement('span');
        count.textContent = dataset.sampleCount == null ? available(dataset) ? 'Data available' : 'Data unavailable' : `${dataset.sampleCount} samples`;
        top.append(identifier, count);
        const name = document.createElement('strong');
        name.textContent = dataset.name;
        const source = document.createElement('small');
        source.textContent = sourceText(dataset.source) || categoryLabel(keys(dataset).join(':'));
        button.append(top, name, source);
        button.addEventListener('click', async () => {
          try { await onSelect(dataset, {key: query.key || select.value, genes: query.genes || {}}); }
          catch (error) { if (error.name !== 'AbortError') { status.textContent = error.message || 'The dataset could not be opened.'; status.hidden = false; } }
        });
        list.append(button);
      }
      if (!filtered.length) {
        const empty = document.createElement('p');
        empty.className = 'muted';
        empty.textContent = !ready ? 'Loading this server’s study library…' : query.link ? 'No registered dataset matches this link on this server. Check its ID and category, or search all studies.' : 'No datasets match. Try another ID, accession, name, category, or search all studies.';
        list.append(empty);
      }
      onFilter(filtered);
    }

    input.addEventListener('input', render);
    for (const control of [select, availability]) control.addEventListener('change', render);
    root.querySelector('form').addEventListener('submit', async event => {
      event.preventDefault();
      const query = parseQuery(input.value);
      if (query.link && query.key) {
        try { await onLinkKey(query.key); }
        catch (error) { loadError = error.message || 'The study category could not be loaded.'; }
      }
      render();
    });
    return {
      render,
      setSelected(id) { selectedId = id; render(); },
      setDatasets(values) {
        datasets = values;
        ready = true;
        loadError = '';
        const previous = select.value || category;
        select.replaceChildren(new Option('All categories', ''));
        const categories = new Set(datasets.flatMap(keys));
        if (category) categories.add(category);
        for (const key of [...categories].sort((left, right) => categoryLabel(left).localeCompare(categoryLabel(right)))) select.append(new Option(categoryLabel(key), key));
        select.value = [...select.options].some(option => option.value === previous) ? previous : '';
        category = '';
        render();
      },
      setError(message) { ready = true; loadError = message; render(); }
    };
  }

  window.HegemonDatasetSearch = {studyTypes, keys, available, categoryLabel, catalogueKey, contextKey, parseQuery, matches, workspaceUrl, loadStudies, create};
})();
