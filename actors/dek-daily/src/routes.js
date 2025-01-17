const Apify = require("apify");
const { LABELS, COUNTRY } = require("./const");
const tools = require("./tools");
const {
  uploadToS3,
  s3FileName,
  toProduct
} = require("@hlidac-shopu/actors-common/product.js");

const {
  utils: { log }
} = Apify;

// Create router
const createRouter = globalContext => {
  return async function (routeName, requestContext) {
    const route = module.exports[routeName];
    if (!route) throw new Error(`No route for name: ${routeName}`);
    log.debug(`Invoking route: ${routeName}`);
    return route(requestContext, globalContext);
  };
};

const START = async ({ $, crawler }) => {
  for (const script of $("script")) {
    if ($(script).html().includes("JSON.parse")) {
      const start =
        $(script).html().indexOf('JSON.parse("') + 'JSON.parse("'.length;
      const end = $(script).html().indexOf('"));');
      const rawJson = $(script)
        .html()
        .substring(start, end)
        .trim()
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "");
      const json = JSON.parse(rawJson);
      const cats = tools.enqueueCategories(Object.values(json));
      for (const cat of cats) {
        await crawler.requestQueue.addRequest({
          url: `${tools.getRootUrl()}${cat}`,
          userData: {
            label: LABELS.CATEGORY,
            page: 1
          }
        });
      }
    }
  }
};

const CATEGORY = async ({ $, request, crawler }) => {
  const { country = COUNTRY.CZ } = global.userInput;
  const { page } = request.userData;
  const subCategories = $(".comd-menu-menu-image__link").toArray();
  if (subCategories.length > 0) {
    for (const sc of subCategories) {
      await crawler.requestQueue.addRequest({
        url: `${tools.getRootUrl()}${$(sc).attr("href")}`,
        userData: {
          label: LABELS.CATEGORY,
          page: 1
        }
      });
    }
    return;
  }
  if (page === 1) {
    const pages = $(".com-pagination > a:not(.active)").toArray();
    if (pages.length > 0) {
      const lastPage = $(pages[pages.length - 1])
        .text()
        .trim();
      for (let i = 2; i <= parseInt(lastPage, 10); i++) {
        await crawler.requestQueue.addRequest(
          {
            url: `${request.url}?page=${i}`,
            userData: {
              label: LABELS.CATEGORY,
              page: i
            }
          },
          { forefront: true }
        );
      }
    }
  }
  const requests = [];
  const category = $(".comd-menu-breadcrumbs > a > span")
    .toArray()
    .map(c => {
      return $(c).text().trim();
    });
  for (const product of $(".com-product-preview")) {
    const url = $(product)
      .find(".com-product-preview__image-main")
      .attr("href");
    const title = $(product).find(".com-product-preview__title").text().trim();
    const currentPriceRaw = $(product)
      .find(".com-price-product-eshop__price-vat--highlight")
      .text()
      .trim();
    const currentPrice = tools.parsePrice(currentPriceRaw);
    const originalPriceRaw = $(product)
      .find(".com-price-product-eshop > strike")
      ?.text()
      ?.trim();
    const originalPrice = tools.parsePrice(originalPriceRaw);
    const img = $(product).find("picture > img").attr("src");
    const inStock = $(product).find(
      ".com-add-to-cart-eshop__availability--green"
    );

    const result = {
      itemId: url.match(/\/(\d+)-/)?.[1],
      itemUrl: `${tools.getRootUrl()}${url}`,
      itemName: title,
      category: category.join(" > "),
      currency: country === COUNTRY.CZ ? "CZK" : "EUR",
      currentPrice,
      originalPrice,
      discounted: !!originalPrice,
      img,
      inStock: !!(inStock && inStock.length > 0)
    };
    requests.push(
      Apify.pushData(result),
      !global.userInput.development
        ? uploadToS3(
            s3,
            `dek.${country.toLowerCase()}`,
            await s3FileName(result),
            "jsonld",
            toProduct(result, { priceCurrency: result.currency })
          )
        : null
    );
  }
  await Promise.allSettled(requests);
};

module.exports = {
  createRouter,
  START,
  CATEGORY
};
