import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';


export default {
content: [
'./app/**/*.{ts,tsx}',
'./components/**/*.{ts,tsx}'
],
theme: {
extend: {}
},
plugins: [animate]
} satisfies Config;
