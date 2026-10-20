(() => {
  'use strict';

  const search = window.HegemonDatasetSearch;
  const originalTypes = search.studyTypes;
  let catalogue = [];
  let countsLoaded = false;
  const dialog = document.getElementById('dataset-search-dialog');
  const datasetSearch = search.create(dialog, {
    onSelect: (dataset, selection) => { location.href = search.workspaceUrl(dataset, selection); },
    onLinkKey: async key => {
      const studies = await search.loadStudies(key);
      catalogue = [...new Map([...catalogue, ...studies].map(dataset => [dataset.id, dataset])).values()];
      datasetSearch.setDatasets(catalogue);
    }
  });
  datasetSearch.render();
  document.getElementById('find-dataset-button').addEventListener('click', () => {
    dialog.showModal();
    document.getElementById('dataset-search').focus();
  });
  document.getElementById('close-dataset-search').addEventListener('click', () => dialog.close());
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); dialog.close(); }
  });

  const title = document.getElementById('hero-title');
  title.setAttribute('aria-label', title.textContent);
  const letters = [...title.textContent].map((letter, index) => {
    const character = document.createElement('span');
    character.textContent = letter;
    character.className = 'hero-letter';
    character.setAttribute('aria-hidden', 'true');
    character.style.animationDelay = `${0.4 + index * 0.35}s`;
    return character;
  });
  title.replaceChildren(...letters);

  function render() {
    const query = document.getElementById('study-type-search').value.trim().toLowerCase();
    const container = document.getElementById('study-types');
    container.replaceChildren();
    for (const [key, name] of originalTypes) {
      if (!`${name} ${key}`.toLowerCase().includes(query)) continue;
      const studies = catalogue.filter(dataset => dataset.keys.some(category => key.split(':').includes(category)));
      const available = studies.filter(dataset => dataset.available).length;
      const card = document.createElement('article');
      card.className = 'study-type';
      card.dataset.studyKey = key;
      const heading = document.createElement('h3');
      heading.textContent = name;
      const count = document.createElement('p');
      count.className = 'dataset-total';
      const label = document.createElement('span');
      label.textContent = 'Number of Datasets';
      const total = document.createElement('strong');
      total.textContent = countsLoaded ? String(available) : '—';
      count.append(label, total);
      const link = document.createElement('a');
      link.href = `workspace.html?${new URLSearchParams({key, category: name})}`;
      link.setAttribute('aria-label', `View ${name} studies`);
      link.textContent = 'View';
      const arrow = document.createElement('span');
      arrow.textContent = '→';
      arrow.setAttribute('aria-hidden', 'true');
      link.append(arrow);
      card.append(heading, count, link);
      container.append(card);
    }
    container.setAttribute('aria-busy', 'false');
    if (!container.children.length) container.textContent = 'No study types match your search.';
  }

  document.getElementById('study-type-search').addEventListener('input', render);
  render();
  fetch(`api.php?${new URLSearchParams({action: 'studies', key: search.catalogueKey()})}`, {headers: {Accept: 'application/json'}})
    .then(async response => {
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error('The study registry is currently unavailable.');
      catalogue = result.studies;
      datasetSearch.setDatasets(catalogue);
      countsLoaded = true;
      render();
    })
    .catch(() => {
      datasetSearch.setError('The study registry could not be loaded. Refresh to retry, or use Explore All.');
      const status = document.getElementById('landing-status');
      status.textContent = 'Study counts could not be loaded. You can still open a study type or Explore All.';
      status.hidden = false;
    });
})();
