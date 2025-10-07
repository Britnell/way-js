// Sync loader - creates window.way.component that queues until way:init
window.way = window.way || {};
window.way.component = function(tag, setup) {
  document.addEventListener('way:init', () => {
    window.way.comp(tag, setup);
  });
};