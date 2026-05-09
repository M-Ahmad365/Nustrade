'use strict';

const { query } = require('../../config/postgres');

/** All saved searches for a user, newest first. */
const getSavedSearches = async (userId) => {
  const { rows } = await query(
    'SELECT * FROM saved_searches WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );
  return rows;
};

/** Insert a new saved search record. */
const createSavedSearch = async ({ userId, name, queryText, filtersJson }) => {
  const { rows } = await query(
    `INSERT INTO saved_searches (user_id, name, query_text, filters_json)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [userId, name, queryText ?? null, JSON.stringify(filtersJson ?? {})]
  );
  return rows[0];
};

/** Delete a saved search — only if owned by userId. Returns true if deleted. */
const deleteSavedSearch = async (savedSearchId, userId) => {
  const { rowCount } = await query(
    'DELETE FROM saved_searches WHERE saved_search_id = $1 AND user_id = $2',
    [savedSearchId, userId]
  );
  return rowCount > 0;
};

module.exports = { getSavedSearches, createSavedSearch, deleteSavedSearch };
