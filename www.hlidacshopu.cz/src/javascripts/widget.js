import { html, render } from "lit-html/lit-html.js";
import { fetchDataSet } from "@hlidac-shopu/lib/remoting.js";
import "@hlidac-shopu/lib/chart.js";
import { widgetTemplate } from "@hlidac-shopu/lib/templates.mjs";
import { createChart, getCanvasContext } from "@hlidac-shopu/lib/chart.js";

const root = document.getElementById("app-root");

addEventListener("DOMContentLoaded", async () => {
  console.group("Hlídačshopů.cz");
  const sharedInfo = getSharedInfo(location);
  console.log("Shared data:", sharedInfo);
  if (sharedInfo) {
    document.body.classList.remove("home-screen");
    await renderResultsModal(sharedInfo.targetURL);
    performance.mark("UI ready");
  }
  console.groupEnd();
});

function getTargetURL(searchParams) {
  const targetURL = searchParams.get("url") || searchParams.get("text");
  return targetURL && targetURL.trim().split(" ").pop();
}

function getShop(targetURL) {
  if (!targetURL) return null;
  const shop = targetURL.split(".");
  shop.pop();
  return shop.pop();
}

function getSharedInfo(location) {
  const { searchParams } = new URL(location);
  const targetURL = getTargetURL(searchParams);
  const title = searchParams.get("title");
  const shop = getShop(targetURL);
  return targetURL && { title, targetURL, shop };
}

async function renderResultsModal(detailUrl) {
  try {
    const res = await fetchDataSet(detailUrl);
    render(
      widgetTemplate(res.data, res.metadata, {
        showFooter: false
      }),
      root
    );
    const ctx = getCanvasContext(root);
    createChart(
      ctx,
      res.data.currentPrice,
      res.data.originalPrice,
      "Uváděná původní cena",
      "Prodejní cena",
      false
    );
  } catch (ex) {
    console.error(ex);
    render(notFoundTemplate(), root);
  }
}

function notFoundTemplate() {
  return html`
    <div
      id="hlidac-shopu-modal__not-found"
      class="hs-result mdc-layout-grid__inner"
    >
      <div class="mdc-layout-grid__cell mdc-layout-grid__cell--span-12">
        <h2>Nenalezeno</h2>
      </div>
      <div
        class="mdc-layout-grid__cell mdc-layout-grid__cell--span-12 box box--purple"
      >
        <p>
          Je nám líto, ale hledaný produkt nebo e-shop nemáme v naší databázi.
        </p>
      </div>
    </div>
  `;
}