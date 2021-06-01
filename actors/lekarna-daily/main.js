const Apify = require("apify");
const cheerio = require("cheerio");
const zlib = require("zlib");

const { log, requestAsBrowser } = Apify.utils;
const BF = "BF";
const web = "https://www.lekarna.cz";
const SITEMAP_CATEGORY_URL = "https://www.lekarna.cz/feed/sitemap/category";
let uniqCat = 0;
let copyCat = 0;

async function enqueueRequests(requestQueue, items) {
  log.info(
    `Waiting for ${items.length} categories add to request queue. It will takes some time.`
  );
  for (const item of items) {
    await requestQueue.addRequest(item);
  }
}

async function streamToBuffer(stream) {
  const chunks = [];
  return new Promise((resolve, reject) => {
    stream.on("data", chunk => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

async function enqueueAllCategories(requestQueue) {
  const stream = await requestAsBrowser({
    url: SITEMAP_CATEGORY_URL,
    stream: true
  });
  const buffer = await streamToBuffer(stream);
  const xmlString = zlib.unzipSync(buffer).toString();
  const $ = cheerio.load(xmlString, { xmlMode: true });
  const categoryUrls = [];

  // Pick all urls from sitemap
  $("url").each(function () {
    const url = $(this).find("loc").text().trim();
    categoryUrls.push({
      url,
      userData: {
        label: "SUB_CATEGORY",
        baseUrl: url
      }
    });
  });
  await enqueueRequests(requestQueue, categoryUrls);
  log.info(`Enqueued ${categoryUrls.length} categories`);
}

async function extractItems($, $products, breadCrumbs, requestQueue) {
  const itemsArray = [];
  const productPages = [];
  $products.each(async function () {
    const result = {};
    const $item = $(this);
    const $name = $item.find("h2 > a");
    const itemUrl = $name.attr("href");
    const name = $name
      .text()
      .trim()
      .replace(/(\n|\t)/g, "");

    /*if (!$name.attr("href").includes("produktova-nabidka")) {
      const itemUrl = $name.attr("href");
      const cartBut = $item.find('input[name="productSkuId"]');
      let id;
      if (cartBut.length !== 0) {
        id = cartBut.attr("value");
      } else if ($item.find(".product__name a[data-gtm]").length !== 0) {
        const jsonObject = JSON.parse(
          $item.find(".product__name a[data-gtm]").attr("data-gtm")
        );
        const products =
          jsonObject.ecommerce.click && jsonObject.ecommerce.click.products
            ? jsonObject.ecommerce.click.products
            : [];
        const filtredProducts = products.filter(item =>
          item.variant.indexOf("Dlouhodobě nedostupný")
        );
        id = filtredProducts.length !== 0 ? filtredProducts[0].id : null;
      }
      const name = $name
        .text()
        .trim()
        .replace(/(\n|\t)/g, "");
      const $actualPriceSpan = $item.find("span.product__price__actual");
      const $oldPriceSpan = $item.find("span.product__price__old");
      if ($actualPriceSpan.length > 0) {
        const $itemImgUrl = $item.find(".product__img picture img");
        if ($oldPriceSpan.length > 0) {
          result.originalPrice = parseFloat(
            $oldPriceSpan.text().replace("Kč", "").replace(/\s/g, "").trim()
          );
          result.currentPrice = parseFloat(
            $actualPriceSpan.text().replace("Kč", "").replace(/\s/g, "").trim()
          );
          result.discounted = true;
        } else {
          result.currentPrice = parseFloat(
            $actualPriceSpan.text().replace("Kč", "").replace(/\s/g, "").trim()
          );
          result.originalPrice = null;
          result.discounted = false;
        }
        result.img = `${web}${$itemImgUrl.data("srcset")}`;
        result.itemId = id;
        result.itemUrl = `${web}${itemUrl}`;
        result.itemName = name;
        result.category = breadCrumbs;
        itemsArray.push(result);
      } else {
        log.info(`Skipp non price product [${name}]`);
      }
    }*/
  });
  return itemsArray;
}

async function handleSubCategory($, requestQueue, request) {
  const getSubcategories = $("#snippet--subcategories").find("a");
  if (getSubcategories.length === 0) {
    //This is final category, add as page for page/item scraping
    await requestQueue.addRequest({
      url: `${request.url}?visualPaginator-firstPage=1`,
      userData: {
        label: "PAGE",
        category: request.url
      }
    });
  }
  //Continue, if this isn't last subcategory
}

async function handleProducts($, request, requestQueue) {
  const itemListElements = $('[itemprop="itemListElement"]');
  console.log(itemListElements.length);

  if (itemListElements.length > 0) {
    let breadCrumbs = [];
    try {
      $("div.cat")
        .find("a")
        .each(function () {
          if (
            !$(this).attr("href").includes("#") &&
            $(this).text().trim() !== ""
          ) {
            breadCrumbs.push($(this).text().trim());
          }
        });
      if (breadCrumbs.length > 0) {
        breadCrumbs = breadCrumbs.join(" > ");
      } else {
        breadCrumbs = "";
      }
      const products = await extractItems(
        $,
        itemListElements,
        breadCrumbs,
        requestQueue
      );
      console.log(`Found ${products.length} products`);
      await Apify.pushData(products);
    } catch (e) {
      console.log(`Failed extraction of items. ${request.url}`);
    }
  }
}

Apify.main(async () => {
  const input = await Apify.getInput();
  const {
    development = false,
    debug = false,
    maxRequestRetries = 3,
    maxConcurrency = 10,
    country = "cz",
    proxyGroups = ["CZECH_LUMINATI"],
    type = "FULL"
  } = input ?? {};
  const requestQueue = await Apify.openRequestQueue();
  if (type === BF) {
    await requestQueue.addRequest({
      url: "https://www.lekarna.cz/blackfriday",
      userData: {
        label: "PAGE"
      }
    });
  } else {
    //await enqueueAllCategories(requestQueue);

    await requestQueue.addRequest({
      url: "https://www.lekarna.cz/volne-prodejne-leky-antihistaminika/",
      userData: {
        label: "SUB_CATEGORY"
      }
    });
    /*await requestQueue.addRequest({
      url: web,
      userData: {
        label: "START"
      }
    });*/
    // to test one item/category
    /* await requestQueue.addRequest({
            url: 'https://www.lekarna.cz/glukometry-cholesterolmetry/',
            userData: {
                label: 'PAGE',
                mainCategory: 'test',
                category: 'test',
            },
        }); */
  }

  log.info("ACTOR - setUp crawler");
  /** @type {ProxyConfiguration} */
  const proxyConfiguration = await Apify.createProxyConfiguration({
    groups: proxyGroups,
    useApifyProxy: !development
  });

  // Create crawler.
  const crawler = new Apify.CheerioCrawler({
    requestQueue,
    proxyConfiguration,
    maxRequestRetries,
    maxConcurrency,
    handlePageFunction: async ({ $, request }) => {
      console.log(request.userData.label);
      if (request.userData.label === "START") {
        console.log("START scrapping Lekarna.cz");
        const mainCategories = [];
        $(".menu-items-level-1 > li > a").each(function () {
          if (!$(this).hasClass("menu-item-orange")) {
            const $link = $(this).attr("href");
            let url = `${web}${$(this).attr("href")}`;
            if ($link.includes("https")) {
              url = $link;
            }
            mainCategories.push({
              url,
              userData: {
                label: "MAIN_CATEGORY",
                mainCategory: $(this).text().trim()
              }
            });
          }
        });
        console.log(`Found ${mainCategories.length} mainCategories.`);
        await enqueueRequests(requestQueue, mainCategories);
      } else if (request.userData.label === "MAIN_CATEGORY") {
        console.log(`START with main category ${request.url}`);
        await handleSubCategory($, requestQueue, request);
      } else if (request.userData.label === "SUB_CATEGORY") {
        console.log(`START with sub category ${request.url}`);
        await handleSubCategory($, requestQueue, request);
      } else if (request.userData.label === "PAGE") {
        console.log(`START with page ${request.url}`);
        //Check for pagination pages
        let maxPage = 0;
        $("#snippet--productListing ul.flex.flex-wrap.items-stretch li").each(
          function () {
            //Try parse Number value from paginator
            const liValue = Number($(this).text().trim());
            //Save highest page value
            if (liValue > maxPage) {
              maxPage = liValue;
            }
          }
        );
        await handleProducts($, request, requestQueue);
        //Handle pagination pages
        if (maxPage !== 0) {
          const paginationPage = [];
          for (let i = 2; i <= maxPage; i++) {
            paginationPage.push({
              url: `${request.userData.category}?strana=${i}`,
              userData: {
                label: "PAGI_PAGE",
                category: request.userData.category
              }
            });
          }
          console.log(`Found ${paginationPage.length} pages.`);
          await enqueueRequests(requestQueue, paginationPage);
        }
      } else if (request.userData.label === "PAGI_PAGE") {
        console.log(`START with page ${request.url}`);
        await handleProducts($, request, requestQueue);
      }
    },

    // If request failed 4 times then this function is executed.
    handleFailedRequestFunction: async ({ request }) => {
      console.log(`Request ${request.url} failed 10 times`);
    }
  });
  // Run crawler.
  await crawler.run();

  console.log("crawler finished");

  /*  if (!development) {
    try {
      const env = await Apify.getEnv();
      const run = await Apify.callTask(
        "blackfriday/status-page-store",
        {
          datasetId: env.defaultDatasetId,
          name: type !== "FULL" ? "lekarna-cz-bf" : "lekarna-cz"
        },
        {
          waitSecs: 25
        }
      );
      console.log(`Keboola upload called: ${run.id}`);
    } catch (e) {
      console.log(e);
    }

    try {
      const env = await Apify.getEnv();
      const run = await Apify.call(
        "blackfriday/uploader",
        {
          datasetId: env.defaultDatasetId,
          upload: true,
          actRunId: env.actorRunId,
          blackFriday: type !== "FULL",
          tableName: type !== "FULL" ? "lekarna_bf" : "lekarna_cz"
        },
        {
          waitSecs: 25
        }
      );
      console.log(`Keboola upload called: ${run.id}`);
    } catch (e) {
      console.log(e);
    }
  }*/
  console.log("uniCat: " + uniqCat);
  console.log("copyCat: " + copyCat);
  console.log("Finished.");
});