import Way from './framework';
import './style.css';
import * as v from 'valibot';

Way.form(
  'login',
  {
    name: v.pipe(v.string(), v.minLength(1, 'Name is required')),
    password: v.pipe(
      v.string(),
      v.minLength(4, 'Password is too short'),
      v.maxLength(10, 'Password is too long'),
      v.regex(/\d/, 'Password must include at least one digit')
    ),
  },
  (ev, values) => {
    ev.preventDefault();
    console.log('submit', values);
  },
);

Way.store('theme', () => {
  const color = Way.signal('red');
  return { color };
});

Way.render(document.body, window.pageprops);
