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
    const data = way.signal(null);
    const name = way.signal("");

    return {
      name,
      data,
      onsubmit: (ev: CustomEvent) => {
        console.log(ev.detail);
        data.value = ev.detail;
      },
    };
  }
);

way.store("theme", () => {
  const color = way.signal("red");
  return { color };
});
