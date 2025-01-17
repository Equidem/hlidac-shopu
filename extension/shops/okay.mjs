import { cleanPrice, registerShop } from "../helpers.mjs";
import { Shop } from "./shop.mjs";

export class Okay extends Shop {
  get injectionPoint() {
    return ["afterend", ".product-form-container"];
  }

  async scrape() {
    const elem = document.querySelector("#template-product");
    if (!elem) return;
    const itemId = document.querySelector("div.product-gallery__main").attributes["data-product-id"].textContent;
    const originalPrice = cleanPrice("p.was-price  span.money");
    const currentPrice = cleanPrice("p.current_price span.money");
    const title = elem.querySelector("h1").innerText.trim();
    const imageUrl = document.querySelector(".product-gallery__link").href;
    return { itemId, title, currentPrice, originalPrice, imageUrl };
  }
}

registerShop(new Okay(), "okay_cz", "okay_sk");
