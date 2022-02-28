const {
  toProduct,
  uploadToS3,
  s3FileName
} = require("@hlidac-shopu/actors-common/product.js");
const Apify = require("apify");
const { log } = Apify.utils;
const { COUNTRY } = require("./consts");

function flat(array) {
  let result = [];
  array.forEach(a => {
    result.push(a);
    if (Array.isArray(a.children)) {
      result = result.concat(flat(a.children));
    }
  });
  return result;
}
const findArraysUrl = async (urlsCatHtml, country) => {
  const resultArrUrls = [];
  const { navList } = urlsCatHtml.taxonomy;
  const childrenArr = [];
  flat(navList).map(item => {
    if (item.children) {
      for (const url of item.children) {
        childrenArr.push(url);
      }
    }
  });
  let arr = [].concat(childrenArr);
  arr = arr.map(item => {
    if (item.url.includes("/all")) {
      return item.url;
    } else {
      return item.allUrl;
    }
  });

  const url = "https://www.tesco.com/groceries/en-GB/shop";
  arr.map(item => {
    resultArrUrls.push({
      url: `${url}${item}`
    });
  });
  return resultArrUrls;
};

const formatPrice = string => {
  return parseFloat(string.replace(/,/, "."));
};

/**
 * @param {int} productId
 * @param {Object} reduxResults
 */
const getProductRedux = (productId, reduxResults) => {
  try {
    const objReduxResults = Object.fromEntries(reduxResults);
    if (objReduxResults[productId.toString()]) {
      const { product } = objReduxResults[productId.toString()];
      if (product) {
        return product;
      }
    }
    return null;
  } catch (e) {
    log.info(e.message);
    return null;
  }
};

/**
 * @param {CheerioSelector} $
 * @param {COUNTRY.CZ|COUNTRY.SK} country
 * @returns {Promise<[]>}
 * @constructor
 */
async function ExtractItems($, country, uniqueItems, stats, request) {
  const itemsArray = [];
  const rootUrl = 'https://www.tesco.com/groceries/en-GB/';
  const category = [];
  if ($(".breadcrumbs ol li")) {
    $(".breadcrumbs ol li").each(function () {
      if ($(this).text() !== "") {
        category.push($(this).text());
      }
    });
  }

  const body = $("body");
  const reduxData = JSON.parse(body.attr("data-redux-state"));
  let resultsData = null;
  if (reduxData) {
    try {
      const { results } = reduxData;
      stats.offers += results.count;
      const { pages } = reduxData.results;
      //Use filter on paginated pages that includes null elements in pages array
      const filteredPages = pages.filter(Boolean);
      const [result] = filteredPages;
      const { serializedData } = result;
      resultsData = serializedData;
    } catch (e) {
      log.error(e);
    }
  }

  if ($(".product-list--list-item")) {
    $(".product-list--list-item").each(async function () {
      const result = {
        currency: country === COUNTRY.CZ ? "CZK" : "EUR"
      };
      result.category = category;
      /* results.categories = category; */
      if (parseInt($(this).find(".tile-content"))) {
        result.itemId = parseInt(
          $(this).find(".tile-content").attr("data-auto-id")
        );
      } else if ($(this).find("a.product-image-wrapper")) {
        result.itemId = parseInt(
          $(this)
            .find("a.product-image-wrapper")
            .attr("href")
            .replace(/^.+products\//, "")
        );
      }
      if ($(this).find(".product-image-wrapper")) {
        result.itemUrl = `${rootUrl}${$(this)
          .find(".product-image-wrapper")
          .attr("href")}`;
      }

      const productRedux = getProductRedux(result.itemId, resultsData);
      result.itemName = productRedux.title;

      result.img = productRedux.defaultImageUrl;
      result.inStock = productRedux.status === "AvailableForSale";

      if ($(this).find(".weightedProduct-text").length !== 0) {
        const unitOfMeasure = $(this)
          .find(".weightedProduct-text")
          .text()
          .trim();
        if (unitOfMeasure === "0.1kg" && result.discounted) {
          result.currentPrice /= 10;
          result.originalPrice /= 10;
        }
        result.unitOfMeasure = unitOfMeasure;
      }

    });
  }

  log.info(`Storing ${itemsArray.length} for ${request.url}`);
  return itemsArray;
}

module.exports = {
  flat,
  ExtractItems,
  findArraysUrl,
  formatPrice,
  getProductRedux
};
