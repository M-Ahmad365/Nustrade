'use strict';

const bcrypt = require('bcrypt');
const { env } = require('../config/env');

/** Hash a plaintext password. Cost factor from env (default 12). */
const hashPassword = (plain) => bcrypt.hash(plain, env.BCRYPT_ROUNDS);

/** Compare plaintext against a stored hash. Returns boolean. */
const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);

module.exports = { hashPassword, verifyPassword };
