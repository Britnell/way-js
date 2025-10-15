import way from "../src/way";
import * as v from "valibot";
import "../src/turbo";

way.form(
  "login",
  {
    name: v.pipe(v.string(), v.minLength(1, "Name is required")),
    password: v.pipe(
      v.string(),
      v.minLength(4, "Password is too short"),
      v.maxLength(10, "Password is too long"),
      v.regex(/\d/, "Password must include at least one digit")
    ),
  },
  () => {
    const name = way.signal("foo");
    const onsubmit = (ev: CustomEvent) => {
      console.log("Form :", ev, ev.detail);
    };
    return { name, onsubmit };
  }
);

way.store("theme", () => {
  const color = way.signal("red");
  return { color };
});

way.render(document.body, window.pageprops);
