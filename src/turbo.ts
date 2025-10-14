// window.addEventListener("pageshow", (e) => {
//   console.log("pageshow", e);
// });

// window.addEventListener("pageswap", async (e) => {
//   console.log("swap", e);
//   if (!e.viewTransition) return;
// });

// window.addEventListener("pagereveal", async (e) => {
//   console.log("reveal", e);
//   if (!e.viewTransition) return;
// });

turbolinks();

function turbolinks() {
  const speculationSupported = HTMLScriptElement.supports?.("speculationrules");
  if (speculationSupported) {
    return speculate();
  }

  if (supportsPrefetch()) {
    return prefetch();
  }

  cacheFetch();
}

const prefetched = new Set<string>();

function speculate() {
  console.log("specul!");

  const speclt = document.createElement("script");
  speclt.type = "speculationrules";
  speclt.textContent = JSON.stringify({
    prefetch: [
      {
        where: { href_matches: "/*" },
        eagerness: "moderate",
        // urls: ["/next.html"],
      },
      {
        where: { selector_matches: ".prefetch" },
        eagerness: "eager",
      },
    ],
  });
  document.body.append(speclt);
  return true;
}

function prefetch() {
  console.log(" prefetch");
  document.body.addEventListener("mouseover", (ev) => {
    const target = ev.target as Element;
    const href = getHref(target);
    if (!href) return;
    if (prefetched.has(href)) return;
    prefetched.add(href);
    const link = document.createElement("link");
    link.rel = "prefetch";
    link.href = href;
    document.head.append(link);
  });
}

function cacheFetch() {
  document.body.addEventListener("mouseover", (ev) => {
    const target = ev.target as Element;
    const href = getSameOriginHref(target);
    if (!href) return;
    if (prefetched.has(href)) return;
    prefetched.add(href);
    fetch(href, { priority: "low" }).catch(() => null);
  });
}

const getSameOriginHref = (el: Element) => {
  let anchor;
  if (el.tagName === "A") {
    anchor = el as HTMLAnchorElement;
  } else if (el.parentElement?.tagName === "A") {
    anchor = el.parentElement as HTMLAnchorElement;
  } else if (el.parentElement?.parentElement?.tagName === "A") {
    anchor = el.parentElement.parentElement as HTMLAnchorElement;
  }
  const sameOrigin = anchor && anchor.origin === location.origin;
  if (sameOrigin) {
    return anchor?.href;
  } else {
    return;
  }
};

function supportsPrefetch() {
  const link = document.createElement("link");
  return link.relList?.supports("prefetch");
}
