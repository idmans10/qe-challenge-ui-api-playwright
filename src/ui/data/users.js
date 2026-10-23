import { env } from '../../config/env.js';

// Public demo accounts listed on the SauceDemo login page; they share one documented password.
export const users = Object.freeze({
  standard: Object.freeze({ username: 'standard_user', password: env.sauce.password }),
  lockedOut: Object.freeze({ username: 'locked_out_user', password: env.sauce.password }),
  problem: Object.freeze({ username: 'problem_user', password: env.sauce.password }),
  error: Object.freeze({ username: 'error_user', password: env.sauce.password }),
  visual: Object.freeze({ username: 'visual_user', password: env.sauce.password }),
  performanceGlitch: Object.freeze({ username: 'performance_glitch_user', password: env.sauce.password }),
});
