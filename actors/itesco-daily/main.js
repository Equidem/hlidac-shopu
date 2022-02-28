const { CloudFrontClient } = require("@aws-sdk/client-cloudfront");
const { invalidateCDN } = require("@hlidac-shopu/actors-common/product.js");
const rollbar = require("@hlidac-shopu/actors-common/rollbar.js");
const { uploadToKeboola } = require("@hlidac-shopu/actors-common/keboola.js");
const Apify = require("apify");
const _ = require("underscore");
const { COUNTRY, LABELS, STARTURLS } = require("./consts");
const { ExtractItems, findArraysUrl } = require("./tools");
const { s3FileName } = require("@hlidac-shopu/actors-common/product.js");

const stats = {
  offers: 0
};

const uniqueItems = new Set();

const { log } = Apify.utils;

Apify.main(async () => {
  rollbar.init();

  const cloudfront = new CloudFrontClient({ region: "eu-central-1" });

  const input = await Apify.getInput();
  const {
    development = false,
    debugLog = false,
    maxConcurrency = 10,
    maxRequestRetries = 5,
    country = COUNTRY.CZ,
    proxyGroups = ["CZECH_LUMINATI"],
    type = "FULL",
    bfUrl = "https://itesco.cz/akcni-nabidky/seznam-produktu/black-friday/"
  } = input ?? {};

  const requestQueue = await Apify.openRequestQueue();
  const url = 'https://www.tesco.com/groceries/en-GB/shop/?include-children=true';
  if (debugLog) {
    Apify.utils.log.setLevel(Apify.utils.log.LEVELS.DEBUG);
  }
  if (type === "FULL") {
    await requestQueue.addRequest({
      url,
      userData: {
        label: LABELS.START
      }
    });
  } else if (type === "BF") {
    await requestQueue.addRequest({
      url: bfUrl,
      userData: {
        label: LABELS.PAGE_BF
      }
    });
  }

  const persistState = async () => {
    console.log(stats);
  };
  Apify.events.on("persistState", persistState);

  const proxyConfiguration = await Apify.createProxyConfiguration({
    groups: proxyGroups
  });
  const crawler = new Apify.CheerioCrawler({
    requestQueue,
    maxConcurrency,
    maxRequestRetries,
    proxyConfiguration,
    handlePageTimeoutSecs: 60,

    handlePageFunction: async ({ $, request }) => {
      log.info(`Processing ${request.url}, ${request.userData.label}`);
      if (request.userData.label === LABELS.START) {
        const script = $("body").attr("data-redux-state");
        const urlsCatHtml = JSON.parse(script);

        const startUrls = await findArraysUrl(urlsCatHtml, country);
        log.debug(`Found ${startUrls.length} on ${request.userData.label}`);
        for (const item of startUrls) {
          await requestQueue.addRequest({
            url: item.url,
            userData: {
              label: LABELS.PAGE
            }
          });
        }
      } else if (request.userData.label === LABELS.PAGE) {
        try {
          if ($(".pagination--page-selector-wrapper ul li").eq(-2)) {
            const lastPage = $(".pagination--page-selector-wrapper ul li")
              .eq(-2)
              .text();
            const parsedLastPage = parseInt(lastPage);
            if (parsedLastPage > 1 && request.url.indexOf("?page=") === -1) {
              const pagesArr = _.range(2, parsedLastPage + 1);
              for (const page of pagesArr) {
                const nextPageUrl = `${request.url}?page=${page}`;
                await requestQueue.addRequest({
                  url: nextPageUrl,
                  userData: {
                    label: LABELS.PAGINATION
                  }
                });
              }
            }
          }
          const items = await ExtractItems(
            $,
            country,
            uniqueItems,
            stats,
            request
          );
          log.debug(`Found ${items.length} storing them, ${request.url}`);
          await Apify.pushData(items);
        } catch (e) {
          // no items on the page check it out
          log.debug(`Check this url, there are no items ${request.url}`);
          await Apify.pushData({
            status: "Check this url, there are no items",
            url: request.url
          });
        }
      } else if (request.userData.label === LABELS.PAGE_BF) {
        try {
          const paginationBlock = $(".ddl_plp_pagination .page");
          if (paginationBlock) {
            const lastPage = paginationBlock.find("a").last().text().trim();
            const parsedLastPage = parseInt(lastPage);
            if (parsedLastPage > 1 && request.url.indexOf("?page=") === -1) {
              const pagesArr = _.range(2, parsedLastPage + 1);
              for (const page of pagesArr) {
                const nextPageUrl = `${request.url}?page=${page}`;
                console.log(`Added ${nextPageUrl} to queue`);
                await requestQueue.addRequest({
                  url: nextPageUrl,
                  userData: {
                    label: LABELS.PAGE_BF
                  }
                });
              }
            }
          }
          const productBlock = $(".a-productListing__productsGrid__element");
          if (productBlock) {
            productBlock.each(async function () {
              const itemUrl = $(this).find("a.ghs-link").first().attr("href");
              if (itemUrl) {
                const itemId = await s3FileName({ itemUrl });
                const itemName = $(this).find(".product__name").text();
                const originalPrice =
                  parseFloat(
                    $(this)
                      .find(".product__old-price")
                      .text()
                      .trim()
                      .replace(",", "")
                      .replace(/\s+/g, "")
                  ) / 100;
                const currentPrice =
                  parseFloat(
                    $(this)
                      .find(".product__price ")
                      .text()
                      .trim()
                      .replace(/\s+/g, "")
                  ) / 100;
                log.info(`Found  ${itemUrl}`);
                await Apify.pushData({
                  itemId,
                  itemUrl,
                  itemName,
                  originalPrice,
                  currentPrice,
                  discounted: originalPrice
                    ? originalPrice > currentPrice
                    : false
                });
              }
            });
          }
        } catch (e) {
          // no items on the page check it out
          log.debug(`Check this url, there are no items ${request.url}`);
          await Apify.pushData({
            status: "Check this url, there are no items",
            url: request.url
          });
        }
      } else if (request.userData.label === LABELS.PAGINATION) {
        try {
          const items = await ExtractItems(
            $,
            country,
            uniqueItems,
            stats,
            request
          );
          log.debug(`Found ${items.length} storing them, ${request.url}`);
          await Apify.pushData(items);
        } catch (e) {
          // no items on the page check it out
          log.debug(`Check this url, there are no items ${request.url}`);
          await Apify.pushData({
            status: "Check this url, there are no items",
            url: request.url
          });
        }
      }
    },

    handleFailedRequestFunction: async ({ request }) => {
      log.error(`Request ${request.url} failed 4 times`);
    }
  });
  await crawler.run();
  await persistState();
});
