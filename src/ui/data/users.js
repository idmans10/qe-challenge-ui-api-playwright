import { env } from '../../config/env.js';

// Public demo accounts listed on the SauceDemo login page; they share one documented password.
export const users = Object.freeze({
  standard: Object.freeze({ username: 'standard_user', password: env.sauce.password }),
});
