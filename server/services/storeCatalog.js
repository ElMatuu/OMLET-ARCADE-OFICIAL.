function normalizeStoreCatalogQuery(query = {}) {
  const search = typeof query.q === 'string' ? query.q.trim().slice(0, 80).toLocaleLowerCase() : '';
  const category = typeof query.category === 'string' ? query.category.trim() : '';
  const currency = typeof query.currency === 'string' ? query.currency.trim() : '';
  const rarity = typeof query.rarity === 'string' ? query.rarity.trim() : '';
  const sort = ['recommended', 'price-asc', 'price-desc', 'name'].includes(query.sort) ? query.sort : 'recommended';
  const page = Math.max(1, Math.min(10000, Number.parseInt(query.page, 10) || 1));
  const perPage = Math.max(1, Math.min(100, Number.parseInt(query.perPage, 10) || 60));
  return { search, category, currency, rarity, sort, page, perPage };
}

function buildStoreCatalog(catalog, query = {}) {
  const options = normalizeStoreCatalogQuery(query);
  const categories = [...new Set(catalog.map((item) => item.category))].sort();
  const rarities = [...new Set(catalog.map((item) => item.rarity).filter(Boolean))].sort();
  const currencies = [...new Set(catalog.map((item) => item.priceCurrency || 'gold'))].sort();
  let items = catalog.filter((item) => {
    if (options.category && item.category !== options.category) return false;
    if (options.currency && (item.priceCurrency || 'gold') !== options.currency) return false;
    if (options.rarity && item.rarity !== options.rarity) return false;
    if (options.search) {
      const haystack = [item.name, item.description, item.category, item.id].join(' ').toLocaleLowerCase();
      if (!haystack.includes(options.search)) return false;
    }
    return true;
  });
  if (options.sort === 'price-asc') items = items.slice().sort((a, b) => a.priceTokens - b.priceTokens || a.name.localeCompare(b.name));
  if (options.sort === 'price-desc') items = items.slice().sort((a, b) => b.priceTokens - a.priceTokens || a.name.localeCompare(b.name));
  if (options.sort === 'name') items = items.slice().sort((a, b) => a.name.localeCompare(b.name));
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / options.perPage));
  const page = Math.min(options.page, pages);
  const start = (page - 1) * options.perPage;
  return {
    items: items.slice(start, start + options.perPage),
    pagination: { page, perPage: options.perPage, total, pages, hasNext: page < pages, hasPrevious: page > 1 },
    filters: { categories, rarities, currencies },
    applied: { category: options.category || null, currency: options.currency || null, rarity: options.rarity || null, sort: options.sort, search: options.search || null }
  };
}

module.exports = { normalizeStoreCatalogQuery, buildStoreCatalog };
