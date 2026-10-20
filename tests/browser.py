import argparse
import os
import urllib.parse
from playwright.sync_api import sync_playwright


parser = argparse.ArgumentParser()
parser.add_argument('--base-url', required=True)
parser.add_argument('--dataset', default='B2.1')
parser.add_argument('--gene-a', default='TYROBP')
parser.add_argument('--gene-b', default='FCER1G')
parser.add_argument('--key', default='')
arguments = parser.parse_args()
base = arguments.base_url.rstrip('/') + '/'
errors = []
with sync_playwright() as playwright:
    settings = {'headless': True, 'args': ['--disable-dev-shm-usage', '--disable-gpu']}
    if os.environ.get('HEGEMON_CHROMIUM'):
        settings['executable_path'] = os.environ['HEGEMON_CHROMIUM']
    browser = playwright.chromium.launch(**settings)
    page = browser.new_page(viewport={'width': 1440, 'height': 1050})
    page.set_default_timeout(120000)
    page.on('pageerror', lambda error: errors.append(str(error)))
    query = urllib.parse.urlencode({'id': arguments.dataset, 'A': arguments.gene_a, 'B': arguments.gene_b, 'key': arguments.key})
    page.goto(base + 'workspace.html?' + query)
    page.wait_for_function('!document.querySelector("#plot-button").disabled')
    assert page.evaluate('HegemonWorkspace.getState().plot === null')
    page.locator('#plot-button').click()
    page.wait_for_function('HegemonWorkspace.getState().plot?.samples.length > 0 && document.querySelector("#chart-container").getAttribute("aria-busy") === "false"')
    original = page.evaluate('HegemonWorkspace.getState().domain')
    count = page.evaluate('HegemonWorkspace.getState().plot.samples.length')
    page.locator('#zoom-in').click()
    page.wait_for_function('original => HegemonWorkspace.getState().domain.x[1]-HegemonWorkspace.getState().domain.x[0] < original.x[1]-original.x[0]', arg=original)
    page.locator('#reset-zoom').click()
    page.wait_for_function('original => ["x","y"].every(axis => HegemonWorkspace.getState().domain[axis].every((value,index) => Math.abs(value-original[axis][index]) < 1e-10))', arg=original)
    assert page.evaluate('HegemonWorkspace.getState().plot.samples.length') == count
    assert not errors, errors
    browser.close()
print('PASS explicit Explore, full sample population, zoom/reset and no JavaScript errors')
