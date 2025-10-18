const way = window.way;

way.comp("post", ({ el }) => {
  console.log("post script", el);
  return {};
});
