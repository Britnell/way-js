window.way = window.way || {};
window.way.comp = function (tag, setup) {
  document.addEventListener('way:init', () => {
    window.way.comp(tag, setup);
  });
};
