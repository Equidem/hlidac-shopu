const LABELS = {
  START: "START",
  PRODUCTS: "PRODUCTS",
  BF: "BF"
};

const SCRIPT_WITH_JSON = {
  PREFIX: "window.__INITIAL_STATE__=",
  POSTFIX:
    ";(function(){var s;(s=document.currentScript||document.scripts[document.scripts.length-1]).parentNode.removeChild(s);}());",
  UNDEFINED: "undefined"
};

const PRODUCTS_PER_PAGE = 56;
const PRODUCTS_BASE_URL = "https://www.prozdravi.cz";
const PRODUCTS_URLS = {
  PRODUCTS_PAGE: [
    "https://www.prozdravi.cz/casti-tela/",
    "https://www.prozdravi.cz/eko-domacnost/",
    "https://www.prozdravi.cz/ekologicka-pece-o-telo/",
    "https://www.prozdravi.cz/ekologicka-ustni-hygiena/",
    "https://www.prozdravi.cz/maminka-a-dite/",
    "https://www.prozdravi.cz/prirodni-kosmetika/",
    "https://www.prozdravi.cz/pristroje-a-pomucky/",
    "https://www.prozdravi.cz/problematiky/",
    "https://www.prozdravi.cz/zdrava-vyziva/"
  ],
  BF_PRODUCTS_PAGE: "https://www.prozdravi.cz/green-friday-produkty/",
  ITEM_PREFIX: "https://www.prozdravi.cz"
};
module.exports = {
  LABELS,
  SCRIPT_WITH_JSON,
  PRODUCTS_PER_PAGE,
  PRODUCTS_BASE_URL,
  PRODUCTS_URLS
};
