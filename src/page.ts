import way from "./framework";
import * as v from "valibot";

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
    const sub = (ev: CustomEvent) => {
      ev.preventDefault();
      console.log("Form submitted:", ev.detail);
    };

    return { name, sub };
  }
);

way.store("theme", () => {
  const color = way.signal("red");
  return { color };
});

way.render(document.body, window.pageprops);
