#!/usr/bin/env python3
"""Audit sitemap pages without dependencies; optionally verify a published origin.

python3 scripts/check-seo.py
python3 scripts/check-seo.py --root .web-dist
python3 scripts/check-seo.py --live-base https://adriatictrade.rs

The live option is read-only. It does not submit URLs or infer index/rank status.
"""
import argparse
import concurrent.futures
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys
import urllib.parse
import urllib.request
import urllib.robotparser
import xml.etree.ElementTree as ET

ORIGIN = 'https://adriatictrade.rs'
NS = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9'}


class Page(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=True)
        self.title = ''
        self.h1 = ''
        self.meta = {}
        self.canonicals = []
        self.links = []
        self.ids = set()
        self.schemas = []
        self.schema_errors = []
        self.h1_count = 0
        self.title_count = 0
        self.capture = None
        self.json_text = None
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if a.get('id'):
            self.ids.add(a['id'])
        if tag in ('title', 'h1'):
            self.capture = tag
            if tag == 'h1': self.h1_count += 1
            if tag == 'title': self.title_count += 1
        if tag == 'meta':
            self.meta[a.get('name', a.get('property', ''))] = a.get('content', '')
        if tag == 'link' and a.get('rel') == 'canonical':
            self.canonicals.append(a.get('href'))
        if tag == 'a' and a.get('href'):
            self.links.append(a['href'])
        if tag == 'script' and a.get('type') == 'application/ld+json':
            self.json_text = ''

    def handle_data(self, data):
        if self.capture: setattr(self, self.capture, getattr(self, self.capture) + data)
        if self.json_text is not None: self.json_text += data

    def handle_endtag(self, tag):
        if tag == self.capture: self.capture = None
        if tag == 'script' and self.json_text is not None:
            try:
                self.schemas.append(json.loads(self.json_text))
            except json.JSONDecodeError as e:
                self.schema_errors.append(str(e))
            self.json_text = None


def filename(url):
    return urllib.parse.urlsplit(url).path.lstrip('/') or 'index.html'


def graph_nodes(value):
    if isinstance(value, list):
        for item in value: yield from graph_nodes(item)
    elif isinstance(value, dict):
        yield value
        if '@graph' in value: yield from graph_nodes(value['@graph'])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path('.'))
    parser.add_argument('--live-base', help='Read-only comparison against this published origin')
    args = parser.parse_args()
    root = args.root.resolve()
    urls = [x.text for x in ET.parse(root / 'sitemap.xml').findall('.//s:loc', NS)]
    errors = []
    pages = {}
    if len(set(urls)) != len(urls): errors.append('Duplicate sitemap URL')
    robots = urllib.robotparser.RobotFileParser()
    robots.parse((root / 'robots.txt').read_text().splitlines())
    titles = {}
    descriptions = {}
    for url in urls:
        name = filename(url)
        if not url.startswith(ORIGIN + '/'): errors.append(f'Noncanonical sitemap URL: {url}')
        file = root / name
        if not file.is_file():
            errors.append(f'Missing sitemap file: {name}')
            continue
        page = pages[url] = Page(file.read_text())
        if page.title_count != 1 or not page.title.strip(): errors.append(f'{name}: expected one title')
        if page.h1_count != 1 or not page.h1.strip(): errors.append(f'{name}: expected one H1')
        if page.canonicals != [url]: errors.append(f'{name}: canonical differs from sitemap')
        if not page.meta.get('description'): errors.append(f'{name}: missing description')
        if not robots.can_fetch('Googlebot', url): errors.append(f'{name}: blocked by robots.txt')
        if re.search(r'noindex|none', page.meta.get('robots', ''), re.I): errors.append(f'{name}: noindex')
        for key in ('og:title', 'og:description', 'og:image', 'og:url', 'og:site_name', 'twitter:card'):
            if not page.meta.get(key): errors.append(f'{name}: missing {key}')
        if page.meta.get('og:url') != url: errors.append(f'{name}: og:url differs from canonical')
        if name == 'index.html' and not page.meta.get('google-site-verification'):
            errors.append(f'{name}: missing Google ownership verification tag')
        for key, seen, value in [('title', titles, page.title), ('description', descriptions, page.meta.get('description'))]:
            if value in seen: errors.append(f'{name}: duplicate {key} with {seen[value]}')
            seen[value] = name
        errors.extend(f'{name}: invalid JSON-LD: {e}' for e in page.schema_errors)
        nodes = [n for data in page.schemas for n in graph_nodes(data)]
        if name != 'index.html' and not any(n.get('@type') == 'BreadcrumbList' for n in nodes):
            errors.append(f'{name}: missing breadcrumb schema')
        for node in nodes:
            if node.get('@type') == 'BreadcrumbList':
                items = node['itemListElement']
                if [x['position'] for x in items] != list(range(1, len(items)+1)):
                    errors.append(f'{name}: invalid breadcrumb positions')
                if items[-1]['item'] != url: errors.append(f'{name}: breadcrumb ends on wrong URL')
            if node.get('@type') == 'Product':
                offer = node.get('offers', {})
                if not all(node.get(k) for k in ('name', 'sku', 'image', 'description', 'brand')):
                    errors.append(f'{name}: incomplete Product metadata')
                if offer.get('url') != url or offer.get('priceCurrency') != 'RSD':
                    errors.append(f'{name}: incorrect Offer URL/currency')
                image = root / urllib.parse.urlsplit(node['image']).path.lstrip('/')
                if not image.is_file(): errors.append(f'{name}: missing product image')
                # Check against the same catalogue used by the actual cart, not a test fixture.
                script = root / 'assets/js/main.js'
                match = re.search(r"'" + re.escape(node['sku']) + r"':\{[^\n]*?price:(\d+)", script.read_text())
                if not match or float(offer.get('price', -1)) != float(match[1]):
                    errors.append(f'{name}: Offer price differs from cart catalogue')

    # Every sitemap page needs a crawlable path from home, and internal links must resolve.
    reachable = set()
    pending = [ORIGIN + '/']
    while pending:
        url = pending.pop()
        if url in reachable: continue
        reachable.add(url)
        if url in pages:
            for link in pages[url].links:
                target = urllib.parse.urlsplit(urllib.parse.urljoin(url, link))
                target_url = urllib.parse.urlunsplit((target.scheme, target.netloc, target.path, '', ''))
                if target_url in pages and target_url not in reachable: pending.append(target_url)
    for url, page in pages.items():
        if url not in reachable: errors.append(f'{filename(url)}: orphan sitemap page')
        for link in page.links:
            target = urllib.parse.urlsplit(urllib.parse.urljoin(url, link))
            if target.netloc != urllib.parse.urlsplit(ORIGIN).netloc or target.scheme not in ('https', 'http'): continue
            target_url = urllib.parse.urlunsplit((target.scheme, target.netloc, target.path, '', ''))
            target_file = root / filename(target_url)
            if not target_file.is_file(): errors.append(f'{filename(url)}: broken link {link}')
            elif target.fragment and target_url in pages and target.fragment not in pages[target_url].ids:
                errors.append(f'{filename(url)}: missing anchor {link}')

    if args.live_base:
        def check_live(url):
            local_errors = []
            target = args.live_base.rstrip('/') + urllib.parse.urlsplit(url).path
            try:
                request = urllib.request.Request(target, headers={'User-Agent': 'AdriaticTrade-SEO-Check/1.0'})
                with urllib.request.urlopen(request, timeout=20) as response:
                    if response.status != 200: local_errors.append(f'{target}: HTTP {response.status}')
                    if re.search(r'noindex|none', response.headers.get('X-Robots-Tag', ''), re.I):
                        local_errors.append(f'{target}: X-Robots-Tag prohibits indexing')
                    actual = Page(response.read().decode('utf-8'))
                    expected = pages[url]
                    if actual.title != expected.title or actual.canonicals != expected.canonicals:
                        local_errors.append(f'{target}: published title/canonical differs from checkout')
                    if actual.meta.get('description') != expected.meta.get('description'):
                        local_errors.append(f'{target}: published description differs from checkout')
                    if re.search(r'noindex|none', actual.meta.get('robots', ''), re.I):
                        local_errors.append(f'{target}: published noindex')
                    if actual.schemas != expected.schemas:
                        local_errors.append(f'{target}: published structured data differs from checkout')
            except Exception as e:
                local_errors.append(f'{target}: {e}')
            return local_errors
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
            for result in executor.map(check_live, pages): errors.extend(result)

    if errors:
        print('\n'.join('FAIL: '+e for e in errors), file=sys.stderr)
        return 1
    print(f'PASS: {len(pages)} sitemap pages; unique metadata, canonicals, crawlable links, breadcrumbs and product/cart prices')
    if args.live_base: print('PASS: published pages match this checkout; no index/rank claim is implied')
    return 0


if __name__ == '__main__':
    sys.exit(main())
