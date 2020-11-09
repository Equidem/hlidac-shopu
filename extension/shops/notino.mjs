import { cleanPrice, registerShop } from "../helpers.mjs";
import { Shop } from "./shop.mjs";

export class Notino extends Shop {
  constructor() {
    super();
    this.masterId = null;
    this.lastHref = null;
  }

  scheduleRendering(cb) {
    const elem = document.getElementById("pd-price");
    if (!elem) return false;

    const observer = new MutationObserver( () => {
      if (location.href !== this.lastHref) {
        this.lastHref = location.href;
        cb(true);
      }
    });
    // Observe changes in variant selection by change of price
    observer.observe(document.body, {
      characterData: true,
      subtree: true
    });
    // This page is rendered with React and data are side-loaded from API
    // defer execution to `load` event when all data are loaded and rendered
    addEventListener("load", () => cb());
  }

  waitStateObject() {
    return new Promise((resolve, reject) => {
      const elt = document.createElement("script");
      elt.innerHTML =
        'window.postMessage({ type: "HLIDAC_SHOPU_STATE_OBJECT", state: window.__APOLLO_STATE__ }, "*");';
      document.head.appendChild(elt);
      const timeout = setTimeout(() => reject(new Error("No item id")), 500);
      window.addEventListener(
        "message",
        function (event) {
          // We only accept messages from ourselves
          if (event.source !== window) return;

          if (
            event.data.type &&
            event.data.type === "HLIDAC_SHOPU_STATE_OBJECT"
          ) {
            clearTimeout(timeout);
            return resolve(event.data.state);
          }
        },
        false
      );
    });
  }

  async getMasterId() {
    const apolloState = await this.waitStateObject();
    const [, [masterRes]] = Object.entries(apolloState.ROOT_QUERY).find(([k]) =>
      k.startsWith("productDetailByMasterId")
    );
    const masterId = masterRes.id.replace("Product:", "");
    console.log(`Found master id ${masterId}`); // eslint-disable-line no-console
    return masterId;
  }

  async scrape() {
    const elem = document.getElementById("pdHeader");
    if (!elem) return;
    const title = document.querySelector("h1").textContent.trim();
    const currentPrice = cleanPrice("#pd-price");
    const originalPrice = cleanPrice(
      "[class^='styled__DiscountWrapper'] span[content]"
    );
    const imageUrl = document.querySelector("[class^='styled__ImgWrapper'] img")
      .src;
    let itemId = (() => {
      const match = window.location.pathname.match(/\/p-(\d+)\//);
      return match ? match[1] : null;
    })();

    if (!itemId) {
      itemId = this.masterId || (await this.getMasterId());
      this.masterId = itemId;
    }

    return { itemId, title, currentPrice, originalPrice, imageUrl };
  }

  inject(renderMarkup) {
    const elem = document.querySelector("a[class^='styled__StyledAddToWishlist']");
    if (!elem) throw new Error("Element to add chart not found");
    const markup = renderMarkup();
    elem.insertAdjacentElement("beforebegin", markup);
    return elem;
  }
}

registerShop(new Notino(), "notino", "notino_sk");