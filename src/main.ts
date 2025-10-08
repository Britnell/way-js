import Way from './framework';
import './style.css';
import z from 'zod';

Way.form(
  'login',
  {
    name: z.string().min(1, 'Name is required'),
    password: z
      .string()
      .min(4, 'Password is too short')
      .max(10, 'Password is too long')
      .regex(/\d/, 'Password must include at least one digit'),
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
// document.addEventListener('DOMContentLoaded', async () => {});
