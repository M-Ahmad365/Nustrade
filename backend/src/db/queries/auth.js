'use strict';

const { query } = require('../../config/postgres');

/**
 * Insert a new user and return the created row (without password_hash).
 */
const createUser = async ({ email, passwordHash, fullName, department, semester, residenceType, hostelName, phoneNumber }) => {
  const { rows } = await query(
    `INSERT INTO users
       (email, password_hash, full_name, department, semester, residence_type, hostel_name, phone_number)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING user_id, email, full_name, department, semester, residence_type, hostel_name, role, email_verified, created_at`,
    [email, passwordHash, fullName, department, semester, residenceType, hostelName ?? null, phoneNumber ?? null]
  );
  return rows[0];
};

/**
 * Find a user by email. Returns password_hash so callers can verify it.
 * Never log or return password_hash to the client.
 */
const findUserByEmail = async (email) => {
  const { rows } = await query(
    `SELECT user_id, email, password_hash, full_name, role, email_verified, is_banned, is_active
     FROM users
     WHERE email = $1`,
    [email]
  );
  return rows[0] ?? null;
};

/** Find a user by primary key — used by auth middleware. */
const findUserById = async (userId) => {
  const { rows } = await query(
    `SELECT user_id, email, full_name, role, email_verified, is_banned, is_active
     FROM users
     WHERE user_id = $1`,
    [userId]
  );
  return rows[0] ?? null;
};

/** Mark email as verified. */
const verifyEmail = async (userId) => {
  await query(
    'UPDATE users SET email_verified = TRUE WHERE user_id = $1',
    [userId]
  );
};

/** Replace a user's password hash. */
const updatePassword = async (userId, passwordHash) => {
  await query(
    'UPDATE users SET password_hash = $1 WHERE user_id = $2',
    [passwordHash, userId]
  );
};

module.exports = { createUser, findUserByEmail, findUserById, verifyEmail, updatePassword };
