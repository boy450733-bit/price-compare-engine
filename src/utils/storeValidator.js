/**
 * Validates store configuration before it's stored in the database.
 * This runs once at store creation/update, not on every scrape.
 * 
 * Throws descriptive errors if config is invalid, preventing bad data
 * from entering the database and causing silent scrape failures.
 */

export function validateStoreConfig(store) {
  const errors = [];

  // Basic required fields
  if (!store.name || typeof store.name !== 'string' || store.name.trim() === '') {
    errors.push('Store name is required and must be a non-empty string');
  }

  if (!store.base_url || typeof store.base_url !== 'string') {
    errors.push('base_url is required');
  } else if (!isValidUrl(store.base_url)) {
    errors.push(`base_url must be a valid URL, got: ${store.base_url}`);
  }

  // Search URL validation
  if (!store.search_url_template || typeof store.search_url_template !== 'string') {
    errors.push('search_url_template is required');
  } else if (!store.search_url_template.includes('{query}')) {
    errors.push(`search_url_template must contain {query} placeholder, got: ${store.search_url_template}`);
  } else {
    // Test the template with a sample query
    const testUrl = store.search_url_template.replace('{query}', 'test');
    if (!isValidUrl(testUrl)) {
      errors.push(`search_url_template generates invalid URL: ${testUrl}`);
    }
  }

  // Validate selectors (HTML mode)
  if (store.selectors) {
    if (typeof store.selectors === 'string') {
      // If it's a string, try to parse as JSON
      try {
        const parsed = JSON.parse(store.selectors);
        validateSelectors(parsed, errors);
      } catch (e) {
        errors.push(`selectors must be valid JSON: ${e.message}`);
      }
    } else if (typeof store.selectors === 'object') {
      validateSelectors(store.selectors, errors);
    } else {
      errors.push('selectors must be a JSON object or JSON string');
    }
  }

  // Validate parseJson if present (JSON mode)
  if (store.parseJson) {
    if (typeof store.parseJson !== 'string' && typeof store.parseJson !== 'function') {
      errors.push('parseJson must be a function or valid JavaScript code string');
    }
  }

  // If neither selectors nor parseJson, error
  if (!store.selectors && !store.parseJson) {
    errors.push('Store must have either "selectors" (HTML mode) or "parseJson" (JSON API mode)');
  }

  // Validate HTTP method
  if (store.method && !['GET', 'POST', 'PUT', 'DELETE'].includes(store.method.toUpperCase())) {
    errors.push(`method must be GET, POST, PUT, or DELETE, got: ${store.method}`);
  }

  // Validate headers if present
  if (store.headers) {
    if (typeof store.headers !== 'object' || Array.isArray(store.headers)) {
      errors.push('headers must be an object');
    }
  }

  // Validate colors
  if (store.color && !isValidHexColor(store.color)) {
    errors.push(`color must be a valid hex color (e.g. #e2e2e2), got: ${store.color}`);
  }

  // Validate optional numeric fields
  if (store.max_retries !== undefined && (typeof store.max_retries !== 'number' || store.max_retries < 0)) {
    errors.push('max_retries must be a non-negative number');
  }

  if (store.timeout_ms !== undefined && (typeof store.timeout_ms !== 'number' || store.timeout_ms < 100)) {
    errors.push('timeout_ms must be at least 100ms');
  }

  if (store.rate_limit_ms !== undefined && (typeof store.rate_limit_ms !== 'number' || store.rate_limit_ms < 0)) {
    errors.push('rate_limit_ms must be a non-negative number');
  }

  if (store.priority !== undefined && (typeof store.priority !== 'number' || store.priority < 0)) {
    errors.push('priority must be a non-negative number');
  }

  if (store.affiliate_payout_rate !== undefined && (typeof store.affiliate_payout_rate !== 'number' || store.affiliate_payout_rate < 0 || store.affiliate_payout_rate > 100)) {
    errors.push('affiliate_payout_rate must be a number between 0 and 100');
  }

  // Throw all errors at once for better UX
  if (errors.length > 0) {
    throw new StoreValidationError(
      `Invalid store configuration for "${store.name}": ${errors.length} error(s)\n  • ${errors.join('\n  • ')}`
    );
  }

  return true;
}

/**
 * Validate selectors object structure.
 * Must have at least 'container' and 'title' selectors.
 */
function validateSelectors(selectors, errors) {
  if (!selectors.container) {
    errors.push('selectors must have "container" field (CSS selector for product rows)');
  } else if (!isValidCssSelector(selectors.container)) {
    errors.push(`selectors.container is not a valid CSS selector: ${selectors.container}`);
  }

  if (!selectors.title) {
    errors.push('selectors must have "title" field (CSS selector for product title)');
  } else if (!isValidCssSelector(selectors.title)) {
    errors.push(`selectors.title is not a valid CSS selector: ${selectors.title}`);
  }

  // Validate price selector (can be string or array)
  if (!selectors.price) {
    errors.push('selectors must have "price" field (CSS selector for product price)');
  } else {
    const priceList = Array.isArray(selectors.price) ? selectors.price : [selectors.price];
    for (const sel of priceList) {
      if (!isValidCssSelector(sel)) {
        errors.push(`selectors.price contains invalid CSS selector: ${sel}`);
        break;
      }
    }
  }

  // Validate optional selectors
  const optionalSelectors = ['link', 'image', 'originalPrice', 'rating', 'reviewCount', 'outOfStock', 'inStockIndicator'];
  for (const field of optionalSelectors) {
    if (selectors[field]) {
      const selectorList = Array.isArray(selectors[field]) ? selectors[field] : [selectors[field]];
      for (const sel of selectorList) {
        if (!isValidCssSelector(sel)) {
          errors.push(`selectors.${field} contains invalid CSS selector: ${sel}`);
          break;
        }
      }
    }
  }
}

/**
 * Basic CSS selector validation - just checks if it's not empty/weird.
 * Cheerio is very forgiving, so this is mostly a sanity check.
 */
function isValidCssSelector(selector) {
  if (typeof selector !== 'string' || selector.trim() === '') return false;
  
  // Reject obvious junk
  if (selector.includes('undefined') || selector.includes('null')) return false;
  if (selector.includes('\n') || selector.includes('\r')) return false;
  
  return true;
}

/**
 * Basic URL validation.
 */
function isValidUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Hex color validation (#RGB or #RRGGBB).
 */
function isValidHexColor(color) {
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
}

/**
 * Custom error class for store validation failures.
 */
export class StoreValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StoreValidationError';
  }
}