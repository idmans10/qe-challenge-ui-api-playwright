// Loads optional .env (Node >= 21.7) and exposes typed settings with public demo defaults.
try {
  process.loadEnvFile();
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const read = (name, fallback) => {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
};

export const env = Object.freeze({
  uiBaseUrl: read('UI_BASE_URL', 'https://www.saucedemo.com'),
  apiBaseUrl: read('API_BASE_URL', 'https://restful-booker.herokuapp.com'),
  sauce: Object.freeze({
    password: read('SAUCE_PASSWORD', 'secret_sauce'),
  }),
  booker: Object.freeze({
    username: read('BOOKER_USERNAME', 'admin'),
    password: read('BOOKER_PASSWORD', 'password123'),
  }),
});
