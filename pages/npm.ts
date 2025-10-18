import way from "wayy";

way.comp("demo", () => {
  const count = way.signal(1);
  const add = () => {
    count.value++;
  };
  return { count, add };
});
