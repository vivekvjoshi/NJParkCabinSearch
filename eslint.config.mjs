import nextVitals from 'eslint-config-next/core-web-vitals';

const eslintConfig = [
  ...nextVitals,
  {
    ignores: ['.next/**', '.netlify/**', 'node_modules/**', 'netlify/functions/**'],
  },
];

export default eslintConfig;

